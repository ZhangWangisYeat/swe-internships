import { getJson } from '../http.js';
import type { VerifyVerdict } from '../types.js';
import { closed, open, unknown, type Adapter } from './types.js';

const NAME = 'smartrecruiters';
const PAGE_SIZE = 100;
const MAX_PAGES = 5;

interface SrPosting {
  id: string;
  name?: string;
  releasedDate?: string;
}

interface SrPage {
  totalFound?: number;
  content?: SrPosting[];
}

// links look like jobs.smartrecruiters.com/{Company}/{postingId}-{some-slug}
function companyFrom(url: URL): string | undefined {
  return url.pathname.split('/').filter(Boolean)[0];
}

function postingIdFrom(url: URL): string | undefined {
  const segments = url.pathname.split('/').filter(Boolean);
  const last = segments[1];
  if (!last) return undefined;
  // the id is the long run of digits at the start, before the slug
  const m = /^(\d{6,})/.exec(last);
  return m?.[1];
}

export const smartRecruitersAdapter: Adapter = {
  name: NAME,
  tier: 'T1',

  match(url) {
    return url.hostname.endsWith('smartrecruiters.com');
  },

  boardKey(url) {
    return companyFrom(url);
  },

  async verifyBoard(company, jobs) {
    const out = new Map<string, VerifyVerdict>();
    const live = new Map<string, SrPosting>();
    let reachable = false;
    let lastStatus = 0;

    for (let page = 0; page < MAX_PAGES; page++) {
      const { data, res } = await getJson<SrPage>(
        `https://api.smartrecruiters.com/v1/companies/${encodeURIComponent(company)}/postings` +
          `?limit=${PAGE_SIZE}&offset=${page * PAGE_SIZE}`,
      );
      lastStatus = res.status;
      if (!data || !Array.isArray(data.content)) break;
      reachable = true;
      for (const p of data.content) live.set(p.id, p);
      if (data.content.length < PAGE_SIZE) break;
    }

    if (!reachable) {
      const verdict =
        lastStatus === 404
          ? closed(NAME, `company ${company} returned 404`)
          : unknown(NAME, `postings fetch failed (HTTP ${lastStatus})`);
      for (const job of jobs) out.set(job.id, verdict);
      return out;
    }

    for (const job of jobs) {
      const id = postingIdFrom(new URL(job.url));
      if (!id) {
        out.set(job.id, unknown(NAME, 'could not parse smartrecruiters posting id'));
        continue;
      }
      const hit = live.get(id);
      if (!hit) {
        out.set(job.id, closed(NAME, `posting ${id} absent from live postings for ${company}`));
        continue;
      }
      // no description in the list response, and fetching each posting separately
      // just for keywords isn't worth an extra request per role. these few end up
      // without skills, which the UI handles fine.
      out.set(job.id, open(NAME, { publishedAt: hit.releasedDate }));
    }

    return out;
  },
};

export const __test = { companyFrom, postingIdFrom };
