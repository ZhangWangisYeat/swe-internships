import pLimit from 'p-limit';
import { HTTP } from './config.js';

export interface FetchResult {
  ok: boolean;
  status: number;
  // where we ended up after following redirects. this is the important one,
  // it's how we catch a page that returns 200 but actually bounced us somewhere else.
  finalUrl: string;
  body: string;
  error?: string;
}

const hostLimiters = new Map<string, ReturnType<typeof pLimit>>();

function hostLimiter(url: string) {
  let host: string;
  try {
    host = new URL(url).host;
  } catch {
    host = 'invalid';
  }
  let limiter = hostLimiters.get(host);
  if (!limiter) {
    limiter = pLimit(HTTP.perHostConcurrency);
    hostLimiters.set(host, limiter);
  }
  return limiter;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// wait longer after each failure, plus a bit of randomness so we don't retry
// everything at the exact same moment and hammer a site that's already struggling
function backoff(attempt: number): number {
  const base = 400 * 2 ** attempt;
  return base + Math.random() * base * 0.5;
}

async function once(url: string, init: RequestInit, wantBody: boolean): Promise<FetchResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), HTTP.timeoutMs);
  try {
    const res = await fetch(url, {
      ...init,
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        'user-agent': HTTP.userAgent,
        accept: 'application/json, text/html;q=0.9, */*;q=0.8',
        'accept-language': 'en-US,en;q=0.9',
        ...(init.headers ?? {}),
      },
    });
    // only download the body if we're actually going to read it
    const body = wantBody ? await res.text() : '';
    return { ok: res.ok, status: res.status, finalUrl: res.url || url, body };
  } finally {
    clearTimeout(timer);
  }
}

// a GET that tries not to be annoying: only a couple of requests per site at a
// time, a timeout, and retries with backoff. a 429 or a 500 means "slow down",
// never "this job is closed". this never throws, you always get a result back.
export async function politeGet(
  url: string,
  opts: { wantBody?: boolean; headers?: Record<string, string> } = {},
): Promise<FetchResult> {
  const wantBody = opts.wantBody ?? true;
  const init: RequestInit = opts.headers ? { headers: opts.headers } : {};

  return hostLimiter(url)(async () => {
    let last: FetchResult | undefined;
    for (let attempt = 0; attempt <= HTTP.retries; attempt++) {
      try {
        const res = await once(url, init, wantBody);
        // these are temporary, so retry. definitely don't treat them as closed.
        if (res.status === 429 || res.status >= 500) {
          last = res;
          if (attempt < HTTP.retries) {
            await sleep(backoff(attempt));
            continue;
          }
        }
        return res;
      } catch (err) {
        // network died or we hit the timeout. status 0 means "no idea what happened"
        last = {
          ok: false,
          status: 0,
          finalUrl: url,
          body: '',
          error: err instanceof Error ? err.message : String(err),
        };
        if (attempt < HTTP.retries) await sleep(backoff(attempt));
      }
    }
    return last ?? { ok: false, status: 0, finalUrl: url, body: '', error: 'unknown' };
  });
}

// grab JSON, and just give back undefined if anything goes wrong (bad status,
// broken JSON, whatever). the caller decides what that means.
export async function getJson<T = unknown>(
  url: string,
  headers?: Record<string, string>,
): Promise<{ data?: T; res: FetchResult }> {
  const res = await politeGet(url, {
    headers: { accept: 'application/json', ...(headers ?? {}) },
  });
  if (!res.ok) return { res };
  try {
    return { data: JSON.parse(res.body) as T, res };
  } catch {
    return { res };
  }
}

// overall cap on how many checks run at once, shared by every adapter
export const globalLimit = pLimit(HTTP.concurrency);
