import { EVERGREEN_GAP_DAYS } from './config.js';
import { isRemote } from './filter.js';
import { DICTIONARY_VERSION } from './keywords/dictionary.js';
import { extractSkills } from './keywords/extract.js';
import {
  SPONSORSHIP_VALUES,
  type DateSource,
  type DegreeConfidence,
  type DegreeLevel,
  type Job,
  type PersistedState,
  type RawListing,
  type Sponsorship,
  type VerifyVerdict,
} from './types.js';

function normalizeSponsorship(value: string): Sponsorship {
  return (SPONSORSHIP_VALUES as readonly string[]).includes(value)
    ? (value as Sponsorship)
    : 'Other';
}

// tidy up the apply link before we put it in front of someone.
//
// a handful of the listings come through as plain http://. these are application
// forms where you type your name, email and upload a resume, so sending someone
// there unencrypted isn't ok. all of those sites support https anyway, so just
// bump the scheme.
//
// also strips embed=true, which makes some job boards render as a cramped little
// iframe widget instead of the actual full posting.
export function normalizeApplyUrl(raw: string): string {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return raw; // not a real URL, leave it alone and let validation complain about it
  }

  if (url.protocol === 'http:') url.protocol = 'https:';
  if (url.searchParams.get('embed') === 'true') url.searchParams.delete('embed');


  return url.toString();
}

const DAY_MS = 86_400_000;

export interface ResolvedDate {
  dateOpened: string;
  dateOpenedSource: DateSource;
  originalPostedAt?: string;
}

// work out which date to actually show in the Date Opened column.
//
// normally the company's own date wins, because the aggregator's date_posted is
// just when someone added the role to their list and that can be weeks late.
//
// the exception is postings a company opens once and never closes. Palantir is the
// clearest example: Lever says one of their intern reqs was created in 2021 and
// it's currently tagged Summer 2028, and Lever doesn't give us an "updated" date at
// all. showing 2021 looks like a bug, and since the table sorts on this column it
// also shoved a bunch of live Palantir roles below a thousand other rows. so if the
// company's date is more than EVERGREEN_GAP_DAYS older than the listing date we
// show the listing date instead, but we hang onto the original rather than binning it.
export function resolveDateOpened(listedAtMs: number, atsDate: string | undefined): ResolvedDate {
  const listedIso = new Date(listedAtMs).toISOString();

  if (!atsDate) return { dateOpened: listedIso, dateOpenedSource: 'list' };

  const atsMs = Date.parse(atsDate);
  if (Number.isNaN(atsMs)) return { dateOpened: listedIso, dateOpenedSource: 'list' };

  const gapDays = (listedAtMs - atsMs) / DAY_MS;
  if (gapDays > EVERGREEN_GAP_DAYS) {
    return {
      dateOpened: listedIso,
      dateOpenedSource: 'list',
      originalPostedAt: new Date(atsMs).toISOString(),
    };
  }

  return { dateOpened: new Date(atsMs).toISOString(), dateOpenedSource: 'ats' };
}

// work out the resume keywords for a role.
//
// we only get a description when we actually downloaded the posting this run, so on
// a cached run there's nothing to read. in that case reuse whatever we found last
// time, otherwise the skills would empty themselves out every second run (which is
// the exact bug the publishedAt field had).
function resolveSkills(
  listing: RawListing,
  verdict: VerifyVerdict | undefined,
  state: PersistedState,
): { skills: string[]; softSkills: string[] } {
  if (verdict?.description) {
    const { hard, soft } = extractSkills(listing.title, verdict.description);
    // only take the new result if we actually found something. a page that turned
    // out to be a login wall shouldn't wipe good keywords we already had.
    if (hard.length > 0 || soft.length > 0) return { skills: hard, softSkills: soft };
  }

  // nothing to read this run, so fall back to what we found last time. but only if
  // it came from the current dictionary, otherwise we'd keep serving keywords that a
  // later fix was supposed to get rid of.
  const remembered = state.jobs[listing.id];
  if (!remembered || remembered.skillsVersion !== DICTIONARY_VERSION) {
    return { skills: [], softSkills: [] };
  }
  return {
    skills: remembered.skills ?? [],
    softSkills: remembered.softSkills ?? [],
  };
}

// build the record the website actually reads
export function toJob(
  listing: RawListing,
  levels: DegreeLevel[],
  degreeConfidence: DegreeConfidence,
  verdict: VerifyVerdict | undefined,
  state: PersistedState,
  now: Date,
): Job {
  const nowIso = now.toISOString();
  const firstSeenAt = state.jobs[listing.id]?.firstSeenAt ?? nowIso;

  const resolved = resolveDateOpened(listing.date_posted * 1000, verdict?.publishedAt);
  const { skills, softSkills } = resolveSkills(listing, verdict, state);

  const job: Job = {
    id: listing.id,
    company: listing.company_name,
    title: listing.title,
    locations: listing.locations ?? [],
    remote: isRemote(listing.locations ?? []),
    dateOpened: resolved.dateOpened,
    dateOpenedSource: resolved.dateOpenedSource,
    url: normalizeApplyUrl(listing.url),
    terms: listing.terms ?? [],
    degrees: listing.degrees ?? [],
    levels,
    degreeConfidence,
    sponsorship: normalizeSponsorship(listing.sponsorship),
    skills,
    softSkills,
    status: verdict?.status === 'open' ? 'open' : 'unverified',
    firstSeenAt,
  };

  if (resolved.originalPostedAt) job.originalPostedAt = resolved.originalPostedAt;
  if (listing.company_url) job.companyUrl = listing.company_url;
  if (verdict) {
    job.verifiedAt = nowIso;
    job.verifiedBy = verdict.by;
  }

  return job;
}
