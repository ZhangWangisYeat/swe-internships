import { getJson } from '../http.js';
import type { VerifyVerdict } from '../types.js';
import { closed, open, unknown, type Adapter, type JobRef } from './types.js';

const NAME = 'greenhouse';

interface GhJob {
  id: number;
  title: string;
  absolute_url: string;
  first_published?: string;
  updated_at?: string;
  application_deadline?: string | null;
  // only present because we ask for content=true, see the fetch below
  content?: string;
}

interface GhBoard {
  jobs: GhJob[];
  meta?: { total?: number };
}

// greenhouse's board API gives us every live posting for a company in one request,
// and it includes first_published which is the actual date the role opened.
//
// why the board list instead of checking each job's page: a closed greenhouse job
// still returns HTTP 200 and quietly redirects you to the company's job list, so
// the status code straight up lies to you. a job missing from the live board list
// is the signal you can actually trust. (their per-job API does 404 properly, but
// that's one request per role instead of one per company.)
function boardFrom(url: URL): string | undefined {
  // links look like job-boards.greenhouse.io/{company}/jobs/{id}
  // or the older boards.greenhouse.io/{company}/jobs/{id}
  const segments = url.pathname.split('/').filter(Boolean);
  if (segments.length === 0) return undefined;
  const board = segments[0];
  if (!board || board === 'embed') return undefined;
  return board;
}

function jobIdFrom(url: URL): string | undefined {
  const m = /\/jobs\/(\d+)/.exec(url.pathname);
  return m?.[1] ?? url.searchParams.get('gh_jid') ?? undefined;
}

export const greenhouseAdapter: Adapter = {
  name: NAME,
  tier: 'T1',

  match(url) {
    return url.hostname.endsWith('greenhouse.io');
  },

  boardKey(url) {
    return boardFrom(url);
  },

  async verifyBoard(board, jobs) {
    const out = new Map<string, VerifyVerdict>();
    // content=true makes this response about 10x bigger but it includes every job's
    // full description, which is what we pull resume keywords out of. still one
    // request per company either way, so it's worth it.
    const { data, res } = await getJson<GhBoard>(
      `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(board)}/jobs?content=true`,
    );

    // if the whole company's board is a 404 then all their roles are gone. but if
    // we just couldn't reach it for some other reason, we don't know anything, so
    // don't call those closed.
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

    const live = new Map<string, GhJob>();
    for (const j of data.jobs) live.set(String(j.id), j);

    for (const job of jobs) {
      const id = jobIdFrom(new URL(job.url));
      if (!id) {
        out.set(job.id, unknown(NAME, 'could not parse greenhouse job id'));
        continue;
      }
      const hit = live.get(id);
      if (!hit) {
        out.set(job.id, closed(NAME, `job ${id} absent from live board ${board}`));
        continue;
      }
      // sometimes a role is still listed but the deadline has already passed, which
      // means you can't actually apply anymore
      if (hit.application_deadline) {
        const deadline = Date.parse(hit.application_deadline);
        if (!Number.isNaN(deadline) && deadline < Date.now()) {
          out.set(job.id, closed(NAME, `application_deadline ${hit.application_deadline} has passed`));
          continue;
        }
      }
      out.set(
        job.id,
        open(NAME, { publishedAt: hit.first_published, description: hit.content }),
      );
    }

    return out;
  },
};

export const __test = { boardFrom, jobIdFrom };
export type { JobRef };
