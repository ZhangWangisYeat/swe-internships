import fs from 'node:fs';
import path from 'node:path';
import type { DegreeLevel, Job, JobsPayload } from './types';

// this file reads from disk, so it's for server components and build time only.
// importing it into anything marked 'use client' would break the build.
//
// it reads web/public/data (the copy sync-data.mjs makes right before every build)
// and not ../data, so the html is built from exactly the same file the page then
// serves as /data/jobs.json and the two can't disagree.
const DATA_DIR = path.join(process.cwd(), 'public', 'data');

interface MetaFile {
  generatedAt?: string;
  sourceRepo?: string;
}

function readJson<T>(file: string): T | null {
  try {
    return JSON.parse(fs.readFileSync(path.join(DATA_DIR, file), 'utf8')) as T;
  } catch {
    // no data yet (fresh clone that never ran the pipeline). the page still builds
    // and the client shows the "run npm run refresh" message like before.
    return null;
  }
}

// cached per build, every page asks for this and it's a ~1MB parse
let payloadCache: JobsPayload | null = null;
function payload(): JobsPayload {
  payloadCache ??= readJson<JobsPayload>('jobs.json') ?? {
    generatedAt: new Date(0).toISOString(),
    count: 0,
    jobs: [],
  };
  return payloadCache;
}

export function jobsForLevel(level: DegreeLevel): Job[] {
  return payload().jobs.filter((j) => j.levels.includes(level));
}

export function levelCounts(): Record<DegreeLevel, number> {
  const jobs = payload().jobs;
  return {
    undergrad: jobs.filter((j) => j.levels.includes('undergrad')).length,
    masters: jobs.filter((j) => j.levels.includes('masters')).length,
    phd: jobs.filter((j) => j.levels.includes('phd')).length,
  };
}

export function generatedAt(): string {
  return payload().generatedAt;
}

// the headline season, eg. "Summer 2027", taken from the upstream repo name
// (Summer2027-Internships). the pipeline already follows that repo when it rolls
// over each year, so the titles follow along too and nobody has to remember to
// bump a year by hand. null if it ever stops looking like that.
export function season(): string | null {
  const repo = readJson<MetaFile>('meta.json')?.sourceRepo ?? '';
  const m = /(Summer|Fall|Winter|Spring)(\d{4})/.exec(repo);
  return m ? `${m[1]} ${m[2]}` : null;
}
