import { getJson } from '../http.js';
import type { VerifyVerdict } from '../types.js';
import { closed, open, unknown, type Adapter } from './types.js';

const NAME = 'ashby';

interface AshbyJob {
  id: string;
  title: string;
  isListed?: boolean;
  publishedAt?: string;
  jobUrl?: string;
  applyUrl?: string;
  // ashby hands us the description already, so keyword extraction is free here
  descriptionPlain?: string;
}

interface AshbyBoard {
  jobs: AshbyJob[];
}

// links look like jobs.ashbyhq.com/{company}/{uuid} with an optional /application on the end
function boardFrom(url: URL): string | undefined {
  const segments = url.pathname.split('/').filter(Boolean);
  return segments[0];
}

const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

function jobIdFrom(url: URL): string | undefined {
  return UUID_RE.exec(url.pathname)?.[0]?.toLowerCase();
}

// ashby gives us a company's whole live list in one request, and each posting has
// isListed and publishedAt on it. if the id isn't there at all, or it's there with
// isListed set to false, then you can't apply to it anymore either way.
export const ashbyAdapter: Adapter = {
  name: NAME,
  tier: 'T1',

  match(url) {
    return url.hostname.endsWith('ashbyhq.com');
  },

  boardKey(url) {
    return boardFrom(url);
  },

  async verifyBoard(board, jobs) {
    const out = new Map<string, VerifyVerdict>();
    const { data, res } = await getJson<AshbyBoard>(
      `https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(board)}`,
    );

    if (!data || !Array.isArray(data.jobs)) {
      if (res.status === 404) {
        for (const job of jobs) out.set(job.id, closed(NAME, `board ${board} returned 404`));
      } else {
        for (const job of jobs) {
          out.set(job.id, unknown(NAME, `board fetch failed (HTTP ${res.status})`));
        }
      }
      return out;
    }

    const live = new Map<string, AshbyJob>();
    for (const j of data.jobs) live.set(j.id.toLowerCase(), j);

    for (const job of jobs) {
      const id = jobIdFrom(new URL(job.url));
      if (!id) {
        out.set(job.id, unknown(NAME, 'could not parse ashby posting id'));
        continue;
      }
      const hit = live.get(id);
      if (!hit) {
        out.set(job.id, closed(NAME, `posting ${id} absent from live board ${board}`));
        continue;
      }
      if (hit.isListed === false) {
        out.set(job.id, closed(NAME, `posting ${id} has isListed=false`));
        continue;
      }
      out.set(
        job.id,
        open(NAME, { publishedAt: hit.publishedAt, description: hit.descriptionPlain }),
      );
    }

    return out;
  },
};

export const __test = { boardFrom, jobIdFrom };
