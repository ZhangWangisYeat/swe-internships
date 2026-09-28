'use client';

import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type SortingState,
} from '@tanstack/react-table';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useMemo, useRef, useState } from 'react';
import { formatDate, formatLocations, relativeAge } from '@/lib/format';
import type { Job, TrackState } from '@/lib/types';
import {
  InferredBadge,
  NewBadge,
  RemoteBadge,
  SponsorshipBadge,
  UnverifiedBadge,
} from './Badges';
import { CopyKeywords } from './CopyKeywords';
import { TrackerCell } from './TrackerCell';

export interface JobRow extends Job {
  isNew: boolean;
  track: TrackState;
}

interface Props {
  rows: JobRow[];
  onTrackChange: (id: string, next: TrackState) => void;
}

// tall enough for the title, the badges and the keyword line. kept fixed rather than
// measured per row so the table stays even and the virtualiser can do simple maths.
const ROW_HEIGHT = 74;

export function JobTable({ rows, onTrackChange }: Props) {
  const [sorting, setSorting] = useState<SortingState>([{ id: 'dateOpened', desc: true }]);

  const columns = useMemo<ColumnDef<JobRow>[]>(
    () => [
      {
        id: 'company',
        accessorKey: 'company',
        header: 'Company',
        cell: ({ row }) => {
          const job = row.original;
          return (
            <div className="flex min-w-0 flex-col">
              <span
                className="truncate text-[13px] font-semibold uppercase tracking-[0.06em] text-text"
                title={job.company}
              >
                {job.company}
              </span>
              {job.terms.length > 0 && (
                <span className="truncate text-[11px] text-text-faint" title={job.terms.join(', ')}>
                  {job.terms[0]}
                </span>
              )}
            </div>
          );
        },
      },
      {
        id: 'title',
        accessorKey: 'title',
        header: 'Role Name',
        enableSorting: false,
        cell: ({ row }) => {
          const job = row.original;
          const all = [...job.skills, ...job.softSkills];
          return (
            <div className="flex min-w-0 flex-col gap-0.5">
              <span className="truncate text-text" title={job.title}>
                {job.title}
              </span>

              <div className="flex flex-wrap items-center gap-1">
                {job.isNew && <NewBadge />}
                {job.status === 'unverified' && <UnverifiedBadge job={job} />}
                {job.degreeConfidence === 'inferred' && <InferredBadge />}
                <SponsorshipBadge sponsorship={job.sponsorship} />
              </div>

              {/* the resume keywords. hard skills read normally and soft ones sit
                  after a dot separator, since you'd use them in different places on
                  a resume. the copy button grabs the full list, not the truncated one. */}
              {all.length > 0 && (
                <div className="flex min-w-0 items-center gap-1">
                  <span
                    className="min-w-0 truncate text-[11px] text-text-faint"
                    title={
                      `Keywords worth putting on your resume for this role.\n\n` +
                      (job.skills.length > 0 ? `Technical: ${job.skills.join(', ')}` : '') +
                      (job.softSkills.length > 0 ? `\nSoft: ${job.softSkills.join(', ')}` : '')
                    }
                  >
                    {job.skills.join(', ')}
                    {job.skills.length > 0 && job.softSkills.length > 0 && (
                      <span className="text-text-faint/60"> · </span>
                    )}
                    <span className="italic">{job.softSkills.join(', ')}</span>
                  </span>
                  <CopyKeywords keywords={all} label={`${job.title} at ${job.company}`} />
                </div>
              )}
            </div>
          );
        },
      },
      {
        id: 'location',
        header: 'Location',
        enableSorting: false,
        accessorFn: (row) => row.locations.join(', '),
        cell: ({ row }) => {
          const job = row.original;
          const { text, extra, full } = formatLocations(job.locations);
          return (
            <div className="flex min-w-0 items-center gap-1.5" title={full}>
              <span className="truncate text-text-muted">{text}</span>
              {extra > 0 && (
                <span className="tnum shrink-0 rounded bg-bg-subtle px-1 text-[10px] text-text-faint">
                  +{extra}
                </span>
              )}
              {job.remote && <RemoteBadge />}
            </div>
          );
        },
      },
      {
        id: 'dateOpened',
        header: 'Date Opened',
        accessorFn: (row) => Date.parse(row.dateOpened) || 0,
        sortingFn: 'basic',
        cell: ({ row }) => {
          const job = row.original;
          const originalYear = job.originalPostedAt
            ? new Date(job.originalPostedAt).getUTCFullYear()
            : null;
          return (
            <div className="flex flex-col">
              <span className="tnum whitespace-nowrap text-text-muted">
                {formatDate(job.dateOpened)}
              </span>
              {originalYear !== null ? (
                // one of those postings the company opened years ago and never
                // closed. we show when it came round this cycle but still tell you
                // how long it's really been sitting there.
                <span
                  className="tnum whitespace-nowrap text-[11px] text-text-faint underline decoration-dotted underline-offset-2"
                  title={
                    `The employer’s job board reports this requisition was created on ` +
                    `${formatDate(job.originalPostedAt!)} and has never been closed — a long-running ` +
                    `posting recycled across terms. The date above is when it entered the current cycle.`
                  }
                >
                  open since {originalYear}
                </span>
              ) : (
                <span
                  className="tnum text-[11px] text-text-faint"
                  title={
                    job.dateOpenedSource === 'ats'
                      ? 'Publish date reported by the employer’s job board'
                      : 'Date the role was added to the source list (the employer’s own date was unavailable)'
                  }
                >
                  {relativeAge(job.dateOpened)}
                  {job.dateOpenedSource === 'list' && ' ·approx'}
                </span>
              )}
            </div>
          );
        },
      },
      {
        id: 'track',
        header: 'Track',
        enableSorting: false,
        cell: ({ row }) => (
          <TrackerCell id={row.original.id} state={row.original.track} onChange={onTrackChange} />
        ),
      },
      {
        id: 'apply',
        header: 'Apply',
        enableSorting: false,
        cell: ({ row }) => (
          <a
            href={row.original.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 rounded-[var(--radius)] bg-accent px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-accent-fg transition-colors hover:bg-accent-hover"
            aria-label={`Apply to ${row.original.title} at ${row.original.company} (opens in a new tab)`}
          >
            Apply
            <svg
              viewBox="0 0 24 24"
              className="h-3 w-3"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M7 17 17 7M9 7h8v8" />
            </svg>
          </a>
        ),
      },
    ],
    [onTrackChange],
  );

  const table = useReactTable({
    data: rows,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  const scrollRef = useRef<HTMLDivElement>(null);
  const tableRows = table.getRowModel().rows;

  const virtualizer = useVirtualizer({
    count: tableRows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 12,
  });

  const virtualRows = virtualizer.getVirtualItems();
  const totalSize = virtualizer.getTotalSize();

  // only the rows you can actually see get rendered, and these two empty spacer
  // rows take up the height of everything above and below. doing it this way means
  // it's still a real <table>, which you'd have to give up (along with the built in
  // keyboard and screen reader behaviour) if you built it out of divs instead.
  const paddingTop = virtualRows.length > 0 ? (virtualRows[0]?.start ?? 0) : 0;
  const paddingBottom =
    virtualRows.length > 0 ? totalSize - (virtualRows[virtualRows.length - 1]?.end ?? 0) : 0;

  if (rows.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 rounded-[var(--radius)] border border-border-base bg-surface px-6 py-20 text-center">
        <svg
          viewBox="0 0 24 24"
          className="h-8 w-8 text-text-faint"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          aria-hidden="true"
        >
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-3.5-3.5" />
        </svg>
        <p className="font-medium text-text">No roles match these filters</p>
        <p className="max-w-sm text-sm text-text-muted">
          Try clearing a filter or widening your search.
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-[var(--radius)] border border-border-base bg-surface shadow-[var(--shadow-sm)]">
      <div ref={scrollRef} className="max-h-[calc(100dvh-19rem)] min-h-[20rem] overflow-auto">
        <table className="w-full table-fixed border-collapse text-sm">
          <colgroup>
            <col className="w-[19%]" />
            <col className="w-[32%]" />
            <col className="w-[21%]" />
            <col className="w-[12%]" />
            <col className="w-[8%]" />
            <col className="w-[8%]" />
          </colgroup>

          <thead className="sticky top-0 z-10 bg-bg-subtle/95 backdrop-blur">
            {table.getHeaderGroups().map((group) => (
              <tr key={group.id}>
                {group.headers.map((header) => {
                  const canSort = header.column.getCanSort();
                  const dir = header.column.getIsSorted();
                  return (
                    <th
                      key={header.id}
                      scope="col"
                      aria-sort={dir === 'asc' ? 'ascending' : dir === 'desc' ? 'descending' : 'none'}
                      // tracked-out uppercase, same treatment the resume site gives
                      // its table headers
                      className="border-b border-border-base px-3 py-3 text-left text-[10px] font-semibold uppercase tracking-[0.18em] text-text-muted"
                    >
                      {canSort ? (
                        <button
                          type="button"
                          onClick={header.column.getToggleSortingHandler()}
                          // uppercase again because tailwind's reset turns text-transform
                          // off on buttons, so the two sortable headers were coming out in
                          // mixed case next to the rest
                          className="inline-flex items-center gap-1 uppercase hover:text-text"
                        >
                          {flexRender(header.column.columnDef.header, header.getContext())}
                          <span aria-hidden="true" className="text-[9px]">
                            {dir === 'asc' ? '▲' : dir === 'desc' ? '▼' : '↕'}
                          </span>
                        </button>
                      ) : (
                        flexRender(header.column.columnDef.header, header.getContext())
                      )}
                    </th>
                  );
                })}
              </tr>
            ))}
          </thead>

          <tbody>
            {paddingTop > 0 && (
              <tr aria-hidden="true">
                <td colSpan={6} style={{ height: paddingTop }} />
              </tr>
            )}

            {virtualRows.map((virtualRow) => {
              const row = tableRows[virtualRow.index];
              if (!row) return null;
              const job = row.original;
              return (
                <tr
                  key={row.id}
                  style={{ height: ROW_HEIGHT }}
                  className={`border-b border-border-base transition-colors last:border-0 hover:bg-surface-hover ${
                    job.track === 'applied' ? 'opacity-60' : ''
                  }`}
                >
                  {row.getVisibleCells().map((cell) => (
                    <td key={cell.id} className="px-3 py-2 align-middle">
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              );
            })}

            {paddingBottom > 0 && (
              <tr aria-hidden="true">
                <td colSpan={6} style={{ height: paddingBottom }} />
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
