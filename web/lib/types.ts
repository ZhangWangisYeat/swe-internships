// this is a copy of the Job type from pipeline/src/types.ts, which is the real
// source of truth. i duplicated it instead of importing across workspaces because
// that needs extra build config and it isn't worth it for one interface. if you
// change the pipeline one, change this too.

// which page a role shows up on. a role open to Bachelor's and Master's is on both.
export type DegreeLevel = 'undergrad' | 'masters' | 'phd';

export type DegreeConfidence = 'explicit' | 'inferred';
export type DateSource = 'ats' | 'list';
export type JobStatus = 'open' | 'unverified';

export type Sponsorship =
  | 'Other'
  | 'Does Not Offer Sponsorship'
  | 'U.S. Citizenship is Required'
  | 'Offers Sponsorship';

export interface Job {
  id: string;
  company: string;
  companyUrl?: string;
  title: string;
  locations: string[];
  remote: boolean;
  // the date we show and sort by, ie. when this opened up this cycle
  dateOpened: string;
  dateOpenedSource: DateSource;
  // only there for postings a company never closes and keeps reusing. this is what
  // the "open since 2021" note in the table comes from.
  originalPostedAt?: string;
  url: string;
  terms: string[];
  degrees: string[];
  // never empty. one jobs.json holds every level and each page filters on this.
  levels: DegreeLevel[];
  degreeConfidence: DegreeConfidence;
  sponsorship: Sponsorship;
  // the resume keywords pulled out of the posting, best match first. hard skills and
  // soft skills are separate because you'd put them in different bits of a resume.
  skills: string[];
  softSkills: string[];
  status: JobStatus;
  verifiedAt?: string;
  verifiedBy?: string;
  firstSeenAt: string;
}

export interface JobsPayload {
  generatedAt: string;
  count: number;
  jobs: Job[];
}

// whether you've saved or applied to a role. lives in your browser only.
export type TrackState = 'none' | 'saved' | 'applied';
