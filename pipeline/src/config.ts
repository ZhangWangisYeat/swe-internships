import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

// repo root, ie. up two levels from pipeline/src
export const ROOT = path.resolve(here, '..', '..');
export const DATA_DIR = path.join(ROOT, 'data');
export const CACHE_DIR = path.join(ROOT, 'pipeline', '.cache');

export const JOBS_PATH = path.join(DATA_DIR, 'jobs.json');
export const META_PATH = path.join(DATA_DIR, 'meta.json');
export const STATE_PATH = path.join(DATA_DIR, 'state.json');

// the repo name changes every year (Summer2027 becomes Summer2028 and so on), so
// we check for the newest one first instead of hardcoding it. otherwise this app
// just stops working at some point next year. see sources/simplify.ts.
export const UPSTREAM_OWNER = 'SimplifyJobs';
export const UPSTREAM_BRANCH = 'dev';
export const UPSTREAM_FILE = '.github/scripts/listings.json';

// what counts as SWE/SDE. we're sticking to software only for now.
export const SOFTWARE_CATEGORIES = new Set(['Software', 'Software Engineering']);

// which upstream degree values map to which page. a role can land on more than one:
// ["Bachelor's","Master's"] genuinely accepts both, so it shows up on both.
export const UNDERGRAD_DEGREES = new Set(["Bachelor's", "Associate's"]);
// MBA counts as masters-level. it's rare in software roles but it's the right bucket.
export const MASTERS_DEGREES = new Set(["Master's", 'MBA']);
export const PHD_DEGREES = new Set(['PhD']);

// used only when a listing has no degree info at all, so we guess from the title.
// if it actually says Bachelor's then that beats anything we'd guess.
export const PHD_TITLE_RE = /\b(ph\.?\s?d|doctoral|post-?doc)\b/i;
export const MASTERS_TITLE_RE = /\b(m\.?b\.?a|master'?s?|masters|m\.?s\.?c?)\b/i;

// some listings just say "N/A" instead of a season. we keep those but only if
// they were posted recently, otherwise old junk hangs around forever.
export const NA_TERM_MAX_AGE_DAYS = 90;

// how far back a season can start and still count as the current cycle
export const CYCLE_GRACE_DAYS = 45;

// don't re-check a role we already checked this recently
export const VERIFY_TTL_HOURS = 12;

// if the company's own date is this much older than when the role got listed,
// it's one of those postings they opened once and never closed, they just keep
// reusing it every year. Palantir is the obvious one, they have a req created in
// 2021 that's currently tagged Summer 2028.
//
// for those the company's date is answering "when did we create this req", not
// "when could i actually start applying", so showing it is misleading and sorting
// by it buries the role. anything under this gap we still trust the company's
// date, since it's more accurate than the aggregator's.
export const EVERGREEN_GAP_DAYS = 365;

// how many times in a row a role has to look closed before we actually drop it
export const STRIKES_TO_CLOSE = 2;

export const HTTP = {
  concurrency: 8,
  perHostConcurrency: 2,
  timeoutMs: 15_000,
  retries: 2,
  userAgent:
    'undergrad-internship-tracker/1.0 (+https://github.com/ZhangWangisYeat; polite read-only availability checks)',
} as const;

// if the number of open roles suddenly falls off a cliff then something broke
// upstream, not 60% of internships closing overnight. in that case fail the run
// and keep the old data, because a stale list is way better than an empty one.
export const SANITY_MAX_DROP_RATIO = 0.4;
// with fewer rows than this to compare against the check is meaningless anyway
// (ie. the first couple of runs)
export const SANITY_MIN_BASELINE = 50;
