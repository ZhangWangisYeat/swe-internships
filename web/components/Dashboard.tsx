'use client';

import { useEffect, useMemo, useState } from 'react';
import { decorateJobs, filterJobs, locationOptions } from '@/lib/filterJobs';
import { formatDateTime, relativeAgeLong } from '@/lib/format';
import { levelConfig } from '@/lib/levels';
import { readAndStampLastVisit, useTrackStates } from '@/lib/tracker';
import type { DegreeLevel } from '@/lib/types';
import { useJobs } from '@/lib/useJobs';
import { EMPTY_FILTERS, Filters, type FilterValue } from './Filters';
import { JobTable, type JobRow } from './JobTable';
import { LevelNav } from './LevelNav';
import { ThemeToggle } from './ThemeToggle';
import { UpdateToast } from './UpdateToast';

interface Props {
  level: DegreeLevel;
  // per-level counts worked out at build time, so the tabs show numbers straight
  // away instead of popping in after jobs.json loads
  initialCounts?: Record<DegreeLevel, number>;
  // server-rendered sections that go under the table (see LevelPage)
  children?: React.ReactNode;
}

export function Dashboard({ level, initialCounts, children }: Props) {
  const { jobs: allJobs, generatedAt, loading, error, checking, notice, refresh, dismissNotice } =
    useJobs();
  const { states, setState } = useTrackStates();
  const [filters, setFilters] = useState<FilterValue>(EMPTY_FILTERS);
  const config = levelConfig(level);

  // one jobs.json holds every level, so each page just narrows to its own.
  const jobs = useMemo(() => allJobs.filter((j) => j.levels.includes(level)), [allJobs, level]);

  // counts for all three tabs, taken from the same payload
  const levelCounts = useMemo<Record<DegreeLevel, number> | null>(() => {
    if (allJobs.length === 0) return initialCounts ?? null;
    return {
      undergrad: allJobs.filter((j) => j.levels.includes('undergrad')).length,
      masters: allJobs.filter((j) => j.levels.includes('masters')).length,
      phd: allJobs.filter((j) => j.levels.includes('phd')).length,
    };
  }, [allJobs, initialCounts]);

  // only read this once when the page loads. if you read it again later it'd say
  // you were just here, and then nothing would ever count as new.
  const [lastVisit, setLastVisit] = useState<number | 'first' | null>(null);
  useEffect(() => {
    setLastVisit(readAndStampLastVisit());
  }, []);

  const rows = useMemo<JobRow[]>(() => decorateJobs(jobs, states, lastVisit), [
    jobs,
    states,
    lastVisit,
  ]);

  const locations = useMemo(() => locationOptions(jobs), [jobs]);

  const savedCount = useMemo(() => rows.filter((r) => r.track === 'saved').length, [rows]);
  const appliedCount = useMemo(() => rows.filter((r) => r.track === 'applied').length, [rows]);

  const filtered = useMemo(() => filterJobs(rows, filters), [rows, filters]);

  const verifiedCount = useMemo(() => jobs.filter((j) => j.status === 'open').length, [jobs]);

  return (
    <div className="mx-auto flex min-h-dvh max-w-[1400px] flex-col gap-5 px-4 py-6 sm:px-6 lg:px-8">
      <header className="flex flex-wrap items-end justify-between gap-4 border-b border-border-base pb-5">
        <div className="min-w-0">
          <span className="eyebrow">{config.eyebrow}</span>
          <h1 className="mt-2 text-[clamp(2.2rem,5.5vw,4.25rem)] text-text">{config.heading}</h1>
          <p className="mt-2 max-w-xl text-sm text-text-muted">{config.blurb}</p>
        </div>

        <div className="flex items-center gap-2">
          <div className="hidden text-right sm:block">
            {generatedAt && (
              <>
                <span className="eyebrow block">Last Updated</span>
                {/* just how long ago. the exact timestamp is still on the hover title
                    so it's there if you want it, it's only off the face of the page. */}
                <p
                  className="mt-1 text-xs text-text"
                  title={`Last updated ${formatDateTime(generatedAt)}`}
                >
                  {relativeAgeLong(generatedAt)}
                </p>
              </>
            )}
          </div>
          {/* this pulls the newest published list, it can't re-scrape the job boards
              itself (see useJobs). the label says so, so it doesn't overpromise. */}
          <button
            type="button"
            onClick={refresh}
            disabled={checking}
            className="grid h-8 w-8 place-items-center rounded-[var(--radius)] border border-border-base bg-surface text-text-muted transition-colors hover:border-border-strong hover:text-text disabled:cursor-wait"
            aria-label="Check for a newer list"
            title="Check for a newer list"
            aria-busy={checking}
          >
            <svg
              viewBox="0 0 24 24"
              className={`h-4 w-4 ${checking ? 'animate-spin' : ''}`}
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              aria-hidden="true"
            >
              <path d="M21 12a9 9 0 1 1-3-6.7M21 3v6h-6" />
            </svg>
          </button>
          <ThemeToggle />
        </div>
      </header>

      <LevelNav current={level} counts={levelCounts} />

      {!loading && !error && jobs.length > 0 && (
        <Filters
          value={filters}
          onChange={setFilters}
          locationOptions={locations}
          savedCount={savedCount}
          appliedCount={appliedCount}
          resultCount={filtered.length}
          totalCount={rows.length}
        />
      )}

      <main className="flex-1">
        {loading && <TableSkeleton />}

        {!loading && error && (
          <div className="flex flex-col items-center gap-3 rounded-[var(--radius)] border border-border-base bg-surface px-6 py-16 text-center">
            <p className="font-semibold text-text">Could not load listings</p>
            <p className="max-w-md text-sm text-text-muted">
              {error}. The data file may not have been generated yet — run{' '}
              <code className="rounded bg-bg-subtle px-1.5 py-0.5 text-xs">npm run refresh</code> to
              build it.
            </p>
            <button
              type="button"
              onClick={refresh}
              className="rounded-[var(--radius)] bg-accent px-4 py-2 text-sm font-semibold text-accent-fg hover:bg-accent-hover"
            >
              Try again
            </button>
          </div>
        )}

        {/* nothing generated at all yet */}
        {!loading && !error && allJobs.length === 0 && (
          <div className="flex flex-col items-center gap-2 rounded-[var(--radius)] border border-border-base bg-surface px-6 py-16 text-center">
            <p className="font-semibold text-text">No listings yet</p>
            <p className="max-w-md text-sm text-text-muted">
              Run <code className="rounded bg-bg-subtle px-1.5 py-0.5 text-xs">npm run refresh</code>{' '}
              to fetch and verify the current internship list.
            </p>
          </div>
        )}

        {/* we have data, there just isn't anything at this level right now. different
            problem from having no data at all, so it gets its own message. */}
        {!loading && !error && allJobs.length > 0 && jobs.length === 0 && (
          <div className="flex flex-col items-center gap-2 rounded-[var(--radius)] border border-border-base bg-surface px-6 py-16 text-center">
            <p className="font-semibold text-text">No {config.label} roles open right now</p>
            <p className="max-w-md text-sm text-text-muted">
              Nothing in the current cycle is open at this level. Try another tab above — there are{' '}
              {allJobs.length.toLocaleString()} roles in total.
            </p>
          </div>
        )}

        {!loading && !error && jobs.length > 0 && (
          <JobTable rows={filtered} onTrackChange={setState} />
        )}
      </main>

      {children}

      <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-border-base pt-4 text-[11px] text-text-faint">
        <p>
          Data from the community-maintained{' '}
          <a
            href="https://github.com/SimplifyJobs/Summer2027-Internships"
            target="_blank"
            rel="noopener noreferrer"
            className="text-accent hover:underline"
          >
            SimplifyJobs / Pitt CSC
          </a>{' '}
          list, re-verified against employer job boards.
        </p>
        {jobs.length > 0 && (
          <p className="tnum">
            {verifiedCount.toLocaleString()} of {jobs.length.toLocaleString()} confirmed open
          </p>
        )}
      </footer>

      {notice && <UpdateToast notice={notice} onDismiss={dismissNotice} />}
    </div>
  );
}

function TableSkeleton() {
  return (
    <div className="overflow-hidden rounded-[var(--radius)] border border-border-base bg-surface">
      <div className="skeleton h-10 border-b border-border-base" />
      {Array.from({ length: 10 }, (_, i) => (
        <div key={i} className="flex items-center gap-4 border-b border-border-base px-3 py-4 last:border-0">
          <div className="skeleton h-4 w-[16%] rounded" />
          <div className="skeleton h-4 w-[30%] rounded" />
          <div className="skeleton h-4 w-[18%] rounded" />
          <div className="skeleton h-4 w-[10%] rounded" />
          <div className="skeleton ml-auto h-7 w-16 rounded-[var(--radius)]" />
        </div>
      ))}
    </div>
  );
}
