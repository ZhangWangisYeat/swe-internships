import fs from 'node:fs/promises';
import path from 'node:path';
import { CACHE_DIR, UPSTREAM_BRANCH, UPSTREAM_FILE, UPSTREAM_OWNER } from '../config.js';
import { politeGet } from '../http.js';
import { RawListingsSchema, type RawListing } from '../types.js';

const CACHE_TTL_MS = 60 * 60 * 1000;

function rawUrl(repo: string, file: string): string {
  return `https://raw.githubusercontent.com/${UPSTREAM_OWNER}/${repo}/${UPSTREAM_BRANCH}/${file}`;
}

// their repo gets renamed every year (Summer2027 then Summer2028 etc), so we look
// for the newest one first and this keeps working without me touching the code.
// we probe the README because it's tiny, not the 13MB listings file.
export async function resolveSourceRepo(now = new Date()): Promise<string> {
  const override = process.env.SOURCE_REPO;
  if (override) return override;

  const year = now.getUTCFullYear();
  const candidates = [`Summer${year + 2}-Internships`, `Summer${year + 1}-Internships`, `Summer${year}-Internships`];

  for (const repo of candidates) {
    const res = await politeGet(rawUrl(repo, 'README.md'), { wantBody: false });
    if (res.ok) return repo;
  }
  // nothing worked, so return the most likely name anyway just so the error
  // message that follows actually tells you which repo we couldn't find
  return `Summer${year + 1}-Internships`;
}

async function readCache(repo: string): Promise<string | undefined> {
  const file = path.join(CACHE_DIR, `${repo}.json`);
  try {
    const stat = await fs.stat(file);
    if (Date.now() - stat.mtimeMs > CACHE_TTL_MS) return undefined;
    return await fs.readFile(file, 'utf8');
  } catch {
    return undefined;
  }
}

async function writeCache(repo: string, body: string): Promise<void> {
  try {
    await fs.mkdir(CACHE_DIR, { recursive: true });
    await fs.writeFile(path.join(CACHE_DIR, `${repo}.json`), body, 'utf8');
  } catch {
    // the cache is just a nice-to-have for local dev, so if we can't write it
    // that's fine, don't kill the whole run over it
  }
}

export interface SourceResult {
  repo: string;
  listings: RawListing[];
  fromCache: boolean;
}

// download the listings and check they look how we expect. the validation is
// strict on purpose: if they change the format and we just shrug it off, we end up
// with a list that looks totally normal but is filtered wrong, which is much worse
// than the run just failing and telling me about it.
export async function fetchListings(opts: { useCache?: boolean } = {}): Promise<SourceResult> {
  const repo = await resolveSourceRepo();

  let body: string | undefined;
  let fromCache = false;

  if (opts.useCache) {
    body = await readCache(repo);
    fromCache = body !== undefined;
  }

  if (body === undefined) {
    const res = await politeGet(rawUrl(repo, UPSTREAM_FILE));
    if (!res.ok) {
      throw new Error(
        `Upstream fetch failed for ${repo}: HTTP ${res.status}${res.error ? ` (${res.error})` : ''}`,
      );
    }
    body = res.body;
    await writeCache(repo, body);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch (err) {
    throw new Error(`Upstream listings.json is not valid JSON: ${(err as Error).message}`);
  }

  const result = RawListingsSchema.safeParse(parsed);
  if (!result.success) {
    const issues = result.error.issues
      .slice(0, 5)
      .map((i) => `  ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new Error(
      `Upstream schema validation failed (${result.error.issues.length} issues). ` +
        `The feed shape changed — review before trusting output.\n${issues}`,
    );
  }

  return { repo, listings: result.data, fromCache };
}
