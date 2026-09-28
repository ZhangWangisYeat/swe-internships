import { getJson } from '../http.js';
import { closed, open, unknown, type Adapter } from './types.js';

const NAME = 'workday';

interface WorkdayResponse {
  jobPostingInfo?: {
    title?: string;
    location?: string;
    postedOn?: string;
    startDate?: string;
    jobReqId?: string;
    // already in the response we were fetching anyway, so the keywords for the
    // ~380 workday roles cost us nothing extra
    jobDescription?: string;
    // workday actually tells us straight up whether it's posted and whether you
    // can apply, which is nicer than everyone else
    posted?: boolean;
    canApply?: boolean;
    includeAllLocations?: boolean;
  };
}

const LOCALE_RE = /^[a-z]{2}(-[A-Z]{2})?$/;

// turn a normal workday job link into the JSON endpoint behind it. you basically
// just inject /wday/cxs/{tenant} in the middle:
//
//   https://{tenant}.wd12.myworkdayjobs.com/[{locale}/]{site}/job/{loc}/{title}_{req}
//   becomes
//   https://{tenant}.wd12.myworkdayjobs.com/wday/cxs/{tenant}/{site}/job/{loc}/{title}_{req}
//
// worth getting right because workday alone is about 35% of all the roles, which is
// more than every other job board put together.
export function cxsUrl(raw: string): string | undefined {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return undefined;
  }

  const tenant = url.hostname.split('.')[0];
  if (!tenant) return undefined;

  const segments = url.pathname.split('/').filter(Boolean);
  // some companies have a locale like /en-US/ in the path and some don't, so drop
  // it if it's there
  if (segments[0] && LOCALE_RE.test(segments[0])) segments.shift();

  const site = segments.shift();
  if (!site) return undefined;

  const jobIdx = segments.indexOf('job');
  if (jobIdx === -1) return undefined;

  const rest = segments.slice(jobIdx).join('/');
  if (!rest) return undefined;

  return `https://${url.hostname}/wday/cxs/${tenant}/${site}/${rest}`;
}

function toIso(startDate: string | undefined): string | undefined {
  if (!startDate) return undefined;
  const parsed = Date.parse(startDate);
  if (Number.isNaN(parsed)) return undefined;
  return new Date(parsed).toISOString();
}

export const workdayAdapter: Adapter = {
  name: NAME,
  tier: 'T2',

  match(url) {
    return url.hostname.endsWith('myworkdayjobs.com');
  },

  // there's no cheap way to list a whole company here that maps back to these
  // URLs, so we check one role at a time. the per-site request cap keeps it polite.
  async verifyOne(job) {
    const endpoint = cxsUrl(job.url);
    if (!endpoint) return unknown(NAME, 'could not derive CXS endpoint');

    const { data, res } = await getJson<WorkdayResponse>(endpoint);

    if (res.status === 404) return closed(NAME, 'CXS endpoint returned 404');
    if (!data) return unknown(NAME, `CXS fetch failed (HTTP ${res.status})`);

    const info = data.jobPostingInfo;
    if (!info) return closed(NAME, 'response contained no jobPostingInfo');

    if (info.posted === false) return closed(NAME, 'jobPostingInfo.posted=false');
    if (info.canApply === false) return closed(NAME, 'jobPostingInfo.canApply=false');

    return open(NAME, {
      publishedAt: toIso(info.startDate),
      description: info.jobDescription,
    });
  },
};
