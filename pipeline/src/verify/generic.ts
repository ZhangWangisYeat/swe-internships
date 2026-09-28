import { politeGet } from '../http.js';
import { closed, open, unknown, type Adapter } from './types.js';

const NAME = 'generic';

// phrases that actually mean you can't apply anymore. these are specific on
// purpose: if you just matched the word "closed" you'd catch stuff like "closed
// captions" or "we closed our Series B" and start deleting perfectly live roles.
const CLOSED_PHRASES: RegExp[] = [
  /no longer accepting applications/i,
  /this (job|position|posting|requisition) is no longer available/i,
  /(job|position|posting) (has been|is) (closed|filled)/i,
  /position has been filled/i,
  /(job|requisition) (posting )?has expired/i,
  /applications? (are|is) (now )?closed/i,
  /we are no longer accepting/i,
  /this posting has been removed/i,
  /the job you (are looking for|requested) (is no longer|cannot be found|does not exist)/i,
  /job not found/i,
];

// find something in the URL that identifies this specific job: a uuid if there is
// one, otherwise the longest run of 4+ digits, otherwise just the last bit of the
// path. we use it to tell "we're still on the job page" apart from "we got bounced
// to the generic careers page".
export function extractIdentifier(url: URL): string | undefined {
  const uuid = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.exec(url.pathname);
  if (uuid?.[0]) return uuid[0].toLowerCase();

  const digitRuns = url.pathname.match(/\d{4,}/g);
  if (digitRuns && digitRuns.length > 0) {
    return digitRuns.reduce((a, b) => (b.length >= a.length ? b : a));
  }

  const qId = url.searchParams.get('jobId') ?? url.searchParams.get('gh_jid');
  if (qId) return qId;

  const segments = url.pathname.split('/').filter(Boolean);
  const last = segments.at(-1);
  return last && last.length > 2 ? last.toLowerCase() : undefined;
}

// did we actually end up on this job's page, or somewhere else?
//
// this is the most important check in the whole file. a closed greenhouse posting
// returns 200 and quietly redirects you to the company's job list, so if you only
// look at the status code it looks wide open. if the job's id isn't in the final URL
// anymore then we clearly got bounced off the posting.
export function stillOnPosting(requested: URL, finalUrl: string): boolean {
  let final: URL;
  try {
    final = new URL(finalUrl);
  } catch {
    return true; // couldn't parse where we ended up, so don't call it closed off that
  }

  const id = extractIdentifier(requested);
  if (!id) return true; // nothing to match on, so we can't say either way

  const haystack = `${final.pathname}${final.search}`.toLowerCase();
  if (haystack.includes(id)) return true;

  // we're on some short generic path now with nothing job-specific in it, which
  // usually means a careers landing page
  const depth = final.pathname.split('/').filter(Boolean).length;
  return depth > 2;
}

// the fallback for everything else. that's the ~22% of roles on companies' own
// career sites, plus job boards we haven't written a proper adapter for yet
// (iCIMS, Oracle, SuccessFactors, Taleo). when in doubt this says "unverified"
// rather than "closed", because hiding a real open internship is worse than
// showing one that might be stale.
export const genericAdapter: Adapter = {
  name: NAME,
  tier: 'T3',

  match() {
    return true; // this one's registered last so it picks up whatever's left
  },

  async verifyOne(job) {
    let requested: URL;
    try {
      requested = new URL(job.url);
    } catch {
      return unknown(NAME, 'unparseable apply URL');
    }

    const res = await politeGet(job.url);

    if (res.status === 404 || res.status === 410) {
      return closed(NAME, `HTTP ${res.status}`);
    }
    // 403 usually means they're blocking bots, and 0/429/5xx are just temporary.
    // none of those tell us anything about whether the job is open.
    if (!res.ok) {
      return unknown(NAME, `HTTP ${res.status}${res.error ? ` (${res.error})` : ''}`);
    }

    if (!stillOnPosting(requested, res.finalUrl)) {
      return closed(NAME, `redirected off posting to ${res.finalUrl}`);
    }

    const phrase = CLOSED_PHRASES.find((re) => re.test(res.body));
    if (phrase) {
      return closed(NAME, `page matched closure phrase ${phrase}`);
    }

    // we got to the actual page and there's nothing saying it's closed, so call it
    // open. it's tagged as coming from this adapter though, so you can tell it apart
    // from one a real API confirmed. we already have the whole page here so we pass
    // it along for keyword extraction too.
    return open(NAME, { description: res.body, reason: 'reachable, no closure signal' });
  },
};

export const __test = { CLOSED_PHRASES };
