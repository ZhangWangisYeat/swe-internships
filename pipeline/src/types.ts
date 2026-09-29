import { z } from 'zod';

// this is the shape of listings.json from the SimplifyJobs repo.
//
// heads up: their CONTRIBUTING.md is out of date and doesn't mention degrees,
// category or sponsorship, but the real file definitely has all three (checked
// against 17k listings). degrees is the whole reason we can filter undergrad
// roles properly instead of guessing from the title, so it's required here. if
// they ever remove it i'd rather the run blow up than quietly give me a wrong list.
export const RawListingSchema = z.object({
  id: z.string(),
  company_name: z.string(),
  company_url: z.string().default(''),
  title: z.string(),
  category: z.string(),
  degrees: z.array(z.string()),
  terms: z.array(z.string()),
  locations: z.array(z.string()),
  url: z.string(),
  active: z.boolean(),
  is_visible: z.boolean(),
  sponsorship: z.string().default('Other'),
  source: z.string().default(''),
  date_posted: z.number(),
  date_updated: z.number(),
});

export type RawListing = z.infer<typeof RawListingSchema>;

export const RawListingsSchema = z.array(RawListingSchema);

// the only sponsorship values i've actually seen upstream. anything new turns into 'Other'.
export const SPONSORSHIP_VALUES = [
  'Other',
  'Does Not Offer Sponsorship',
  'U.S. Citizenship is Required',
  'Offers Sponsorship',
] as const;

export type Sponsorship = (typeof SPONSORSHIP_VALUES)[number];

// which page (or pages) a role belongs on. a role open to Bachelor's and Master's
// shows up on both, which is correct, it really does accept both.
export type DegreeLevel = 'undergrad' | 'masters' | 'phd';

// how sure we are about the level.
// explicit = the listing spelled out which degrees it takes.
// inferred = there was no degree info so we went off the title instead.
export type DegreeConfidence = 'explicit' | 'inferred';

// where the date came from. 'ats' means the company's own job board told us, which
// is the real posting date. 'list' means we fell back to the aggregator's date.
export type DateSource = 'ats' | 'list';

// what we concluded after checking the posting.
// open = we actually confirmed it's still live.
// unverified = we couldn't tell either way, so we still show it but with a badge.
// closed = confirmed gone, and these never make it into the site at all.
export type JobStatus = 'open' | 'unverified' | 'closed';

// this is what the website actually reads. there's a copy of it in
// web/lib/types.ts, so if you change one remember to change the other.
export interface Job {
  id: string;
  company: string;
  companyUrl?: string;
  title: string;
  locations: string[];
  remote: boolean;
  // the date we show in the table and sort by, ie. when this role opened up this cycle
  dateOpened: string;
  dateOpenedSource: DateSource;
  // only set when the company's own date was way older than dateOpened, which
  // means it's one of those postings they never close and just keep reusing.
  // this is what the "open since 2021" note in the table comes from, so we don't
  // lose the real date but the row also doesn't get buried at the bottom.
  originalPostedAt?: string;
  url: string;
  terms: string[];
  degrees: string[];
  // the pages this role appears on. never empty, or we'd have dropped the row.
  levels: DegreeLevel[];
  degreeConfidence: DegreeConfidence;
  sponsorship: Sponsorship;
  // the keywords worth putting on your resume for this role, best match first.
  // hard skills (languages, frameworks, tools, concepts) and soft skills separately,
  // since you'd use them in different parts of a resume.
  skills: string[];
  softSkills: string[];
  status: Exclude<JobStatus, 'closed'>;
  verifiedAt?: string;
  verifiedBy?: string;
  firstSeenAt: string;
}

export interface TierCounts {
  T1: number;
  T2: number;
  T3: number;
}

export interface Meta {
  generatedAt: string;
  sourceRepo: string;
  counts: {
    upstreamTotal: number;
    afterActive: number;
    afterDegree: number;
    afterCategory: number;
    afterCycle: number;
    verifiedOpen: number;
    unverified: number;
    closedRemoved: number;
    emitted: number;
    // how many roles we managed to pull resume keywords out of
    withSkills: number;
  };
  // rows on each page. these overlap: a role open to Bachelor's and Master's counts
  // under both, so they add up to more than `emitted`.
  byLevel: Record<DegreeLevel, number>;
  tiers: TierCounts;
  verification: {
    attempted: number;
    byAdapter: Record<string, { open: number; closed: number; unknown: number }>;
    durationMs: number;
    skippedFresh: number;
  };
  diff: {
    newIds: string[];
    // closed by our own verification (two strikes)
    closedIds: string[];
    // everything else that left since last run, split by reason (see diff.ts)
    closedUpstreamIds: string[];
    pastTermIds: string[];
    otherRemovedIds: string[];
  };
  cycleTerms: string[];
  warnings: string[];
}

// saved between runs. we need this for two things we can't work out from a single
// snapshot: when we first saw a role, and how many times it's looked closed.
export interface PersistedState {
  version: 1;
  jobs: Record<
    string,
    {
      firstSeenAt: string;
      strikes: number;
      lastVerifiedAt?: string;
      lastStatus?: JobStatus;
      // the real date from the company's job board. we remember it because
      // otherwise a cache hit throws it away and the date quietly goes back to
      // the less accurate aggregator one.
      publishedAt?: string;
      // same deal for the extracted keywords. a cached run never re-downloads the
      // description, so if we didn't save these the skills column would empty
      // itself out on the very next run.
      skills?: string[];
      softSkills?: string[];
      // which version of the dictionary produced them. if it doesn't match the
      // current one we ignore what's saved and work them out again, otherwise a bad
      // extraction would stay cached forever even after the bug was fixed.
      skillsVersion?: number;
    }
  >;
}

export interface VerifyVerdict {
  status: JobStatus;
  // which checker gave us this answer, so the per-adapter stats make sense
  by: string;
  // the real posting date, if this particular job board gives us one
  publishedAt?: string;
  // the job description, when the board handed it to us as part of the check we
  // were already making. this is what the keyword extraction reads.
  description?: string;
  // plain english reason, only used for logs when something looks off
  reason?: string;
}
