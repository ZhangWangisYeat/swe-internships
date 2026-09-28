import type { FilterValue } from '@/components/Filters';
import type { Job, TrackState } from './types';

// a job plus the two bits that only exist in your browser: whether it's new to you
// and whether you've saved or applied to it
export interface DecoratedJob extends Job {
  isNew: boolean;
  track: TrackState;
}

// on a first visit there's no "since last time", so new just means the posting
// opened in the last few days. that's what someone landing here for the first time
// actually wants flagged.
export const FIRST_VISIT_NEW_DAYS = 3;

export function decorateJobs(
  jobs: Job[],
  states: Record<string, Exclude<TrackState, 'none'>>,
  lastVisit: number | 'first' | null,
  now: number = Date.now(),
): DecoratedJob[] {
  const firstVisitCutoff = now - FIRST_VISIT_NEW_DAYS * 86_400_000;
  return jobs.map((job) => {
    let isNew: boolean;
    if (lastVisit === null) {
      // until we've read your last visit time, treat nothing as new. otherwise every
      // row flashes a "New" badge for a moment and then most of them turn off, which
      // looks broken.
      isNew = false;
    } else if (lastVisit === 'first') {
      // this uses dateOpened and not firstSeenAt because firstSeenAt is when the
      // pipeline first saw a role, and on a fresh install that's the same day for
      // every single one of them
      isNew = Date.parse(job.dateOpened) > firstVisitCutoff;
    } else {
      isNew = Date.parse(job.firstSeenAt) > lastVisit;
    }
    return { ...job, isNew, track: states[job.id] ?? 'none' };
  });
}

const BLOCKED_SPONSORSHIP = new Set<Job['sponsorship']>([
  'Does Not Offer Sponsorship',
  'U.S. Citizenship is Required',
]);

// this decides what actually shows up in the table, so it lives out here on its own
// where it can be tested properly instead of being buried inside the component
export function matchesFilters(row: DecoratedJob, filters: FilterValue, locSet: Set<string>): boolean {
  const q = filters.query.trim().toLowerCase();
  if (q) {
    // skills are in here too, so searching "kubernetes" finds every role that wants
    // it even when the title says nothing about it
    const haystack = `${row.company} ${row.title} ${row.locations.join(' ')} ${row.skills.join(
      ' ',
    )} ${row.softSkills.join(' ')}`.toLowerCase();
    if (!haystack.includes(q)) return false;
  }

  if (locSet.size > 0 && !row.locations.some((l) => locSet.has(l))) return false;
  if (filters.remoteOnly && !row.remote) return false;
  if (filters.hideNoSponsorship && BLOCKED_SPONSORSHIP.has(row.sponsorship)) return false;
  if (filters.newOnly && !row.isNew) return false;

  if (filters.track === 'saved' && row.track !== 'saved') return false;
  if (filters.track === 'applied' && row.track !== 'applied') return false;
  if (filters.track === 'untracked' && row.track !== 'none') return false;

  return true;
}

export function filterJobs(rows: DecoratedJob[], filters: FilterValue): DecoratedJob[] {
  const locSet = new Set(filters.locations);
  return rows.filter((row) => matchesFilters(row, filters, locSet));
}

// every location with how many roles are in it, most common first, for the dropdown
export function locationOptions(jobs: Job[]): Array<{ label: string; count: number }> {
  const counts = new Map<string, number>();
  for (const job of jobs) {
    for (const loc of job.locations) counts.set(loc, (counts.get(loc) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}
