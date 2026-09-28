import { getJson } from '../http.js';
import type { VerifyVerdict } from '../types.js';
import { closed, open, unknown, type Adapter } from './types.js';

const NAME = 'lever';

interface LeverPosting {
  id: string;
  text?: string;
  createdAt?: number;
  hostedUrl?: string;
  applyUrl?: string;
  // lever splits a posting across several fields and which ones are filled in varies
  // by company, so we take all of them. descriptionBodyPlain is usually where the
  // real requirements are, and openingPlain/additionalPlain catch the rest.
  descriptionPlain?: string;
  descriptionBodyPlain?: string;
  openingPlain?: string;
  additionalPlain?: string;
}

// links look like jobs.lever.co/{company}/{uuid} with an optional /apply on the end
function companyFrom(url: URL): string | undefined {
  const segments = url.pathname.split('/').filter(Boolean);
  return segments[0];
}

const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

function jobIdFrom(url: URL): string | undefined {
  return UUID_RE.exec(url.pathname)?.[0]?.toLowerCase();
}

// lever's API only ever returns postings that are currently live, so if an id
// isn't in the list it's closed. this is the adapter that caught the multiplylabs
// roles the source list still had marked as active even though lever had no intern
// postings at all anymore.
export const leverAdapter: Adapter = {
  name: NAME,
  tier: 'T1',

  match(url) {
    return url.hostname.endsWith('lever.co');
  },

  boardKey(url) {
    return companyFrom(url);
  },

  async verifyBoard(company, jobs) {
    const out = new Map<string, VerifyVerdict>();
    const { data, res } = await getJson<LeverPosting[]>(
      `https://api.lever.co/v0/postings/${encodeURIComponent(company)}?mode=json`,
    );

    if (!Array.isArray(data)) {
      if (res.status === 404) {
        for (const job of jobs) out.set(job.id, closed(NAME, `company ${company} returned 404`));
      } else {
        for (const job of jobs) {
          out.set(job.id, unknown(NAME, `postings fetch failed (HTTP ${res.status})`));
        }
      }
      return out;
    }

    const live = new Map<string, LeverPosting>();
    for (const p of data) live.set(p.id.toLowerCase(), p);

    for (const job of jobs) {
      const id = jobIdFrom(new URL(job.url));
      if (!id) {
        out.set(job.id, unknown(NAME, 'could not parse lever posting id'));
        continue;
      }
      const hit = live.get(id);
      if (!hit) {
        out.set(job.id, closed(NAME, `posting ${id} absent from live postings for ${company}`));
        continue;
      }
      const published =
        typeof hit.createdAt === 'number' ? new Date(hit.createdAt).toISOString() : undefined;
      const description = [
        hit.descriptionPlain,
        hit.descriptionBodyPlain,
        hit.openingPlain,
        hit.additionalPlain,
      ]
        .filter(Boolean)
        .join('\n\n');
      out.set(job.id, open(NAME, { publishedAt: published, description }));
    }

    return out;
  },
};

export const __test = { companyFrom, jobIdFrom };
