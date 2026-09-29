'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

export type TrackFilter = 'all' | 'saved' | 'applied' | 'untracked';

export interface FilterValue {
  query: string;
  locations: string[];
  remoteOnly: boolean;
  hideNoSponsorship: boolean;
  track: TrackFilter;
}

export const EMPTY_FILTERS: FilterValue = {
  query: '',
  locations: [],
  remoteOnly: false,
  hideNoSponsorship: false,
  track: 'all',
};

interface Props {
  value: FilterValue;
  onChange: (next: FilterValue) => void;
  locationOptions: Array<{ label: string; count: number }>;
  savedCount: number;
  appliedCount: number;
  resultCount: number;
  totalCount: number;
}

const chip =
  'inline-flex items-center gap-1.5 rounded-[var(--radius)] border px-3 py-1.5 text-[11px] font-medium uppercase tracking-[0.1em] transition-colors';
const chipOff =
  'border-border-base bg-surface text-text-muted hover:border-border-strong hover:text-text';
const chipOn = 'border-accent bg-accent text-accent-fg';

export function Filters({
  value,
  onChange,
  locationOptions,
  savedCount,
  appliedCount,
  resultCount,
  totalCount,
}: Props) {
  const set = <K extends keyof FilterValue>(key: K, next: FilterValue[K]) =>
    onChange({ ...value, [key]: next });

  const [locOpen, setLocOpen] = useState(false);
  const [locQuery, setLocQuery] = useState('');
  const locRef = useRef<HTMLDivElement>(null);

  // close the location dropdown if you click somewhere else or hit escape
  useEffect(() => {
    if (!locOpen) return;
    const onDown = (e: MouseEvent) => {
      if (locRef.current && !locRef.current.contains(e.target as Node)) setLocOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setLocOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [locOpen]);

  const visibleLocations = useMemo(() => {
    const q = locQuery.trim().toLowerCase();
    const list = q
      ? locationOptions.filter((o) => o.label.toLowerCase().includes(q))
      : locationOptions;
    return list.slice(0, 60);
  }, [locationOptions, locQuery]);

  const toggleLocation = (label: string) => {
    const next = value.locations.includes(label)
      ? value.locations.filter((l) => l !== label)
      : [...value.locations, label];
    set('locations', next);
  };

  const isFiltered =
    value.query !== '' ||
    value.locations.length > 0 ||
    value.remoteOnly ||
    value.hideNoSponsorship ||
    value.track !== 'all';

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        {/* search box, matches company, role and location all at once */}
        <div className="relative min-w-0 flex-1 sm:max-w-md">
          <svg
            viewBox="0 0 24 24"
            className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-text-faint"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            aria-hidden="true"
          >
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" />
          </svg>
          <input
            type="search"
            value={value.query}
            onChange={(e) => set('query', e.target.value)}
            placeholder="Search company, role, location, or skill…"
            aria-label="Search listings"
            className="w-full rounded-[var(--radius)] border border-border-base bg-surface py-2 pr-3 pl-9 text-sm text-text placeholder:text-text-faint focus:border-accent focus:outline-none"
          />
        </div>

        {/* location dropdown. there are hundreds of locations so it has its own
            little search box inside it and only renders the first 60 matches. */}
        <div className="relative" ref={locRef}>
          <button
            type="button"
            onClick={() => setLocOpen((o) => !o)}
            aria-expanded={locOpen}
            aria-haspopup="true"
            className={value.locations.length > 0 ? `${chip} ${chipOn}` : `${chip} ${chipOff}`}
          >
            Location
            {value.locations.length > 0 && (
              <span className="tnum rounded-full bg-accent-fg/20 px-1.5 text-[10px]">
                {value.locations.length}
              </span>
            )}
            <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
              <path d="m6 9 6 6 6-6" />
            </svg>
          </button>

          {locOpen && (
            <div className="animate-slide-up absolute top-full right-0 z-30 mt-2 w-72 rounded-[var(--radius)] border border-border-base bg-surface p-2 shadow-[var(--shadow-md)]">
              <input
                type="search"
                autoFocus
                value={locQuery}
                onChange={(e) => setLocQuery(e.target.value)}
                placeholder="Filter locations…"
                aria-label="Filter location list"
                className="mb-2 w-full rounded-[2px] border border-border-base bg-bg px-2.5 py-1.5 text-xs text-text placeholder:text-text-faint focus:border-accent focus:outline-none"
              />
              <div className="max-h-64 overflow-y-auto">
                {visibleLocations.length === 0 && (
                  <p className="px-2 py-3 text-xs text-text-faint">No matching locations.</p>
                )}
                {visibleLocations.map((opt) => (
                  <label
                    key={opt.label}
                    className="flex cursor-pointer items-center gap-2 rounded-[2px] px-2 py-1.5 text-xs hover:bg-surface-hover"
                  >
                    <input
                      type="checkbox"
                      checked={value.locations.includes(opt.label)}
                      onChange={() => toggleLocation(opt.label)}
                      className="h-3.5 w-3.5 accent-[var(--accent)]"
                    />
                    <span className="min-w-0 flex-1 truncate text-text">{opt.label}</span>
                    <span className="tnum text-text-faint">{opt.count}</span>
                  </label>
                ))}
              </div>
              {value.locations.length > 0 && (
                <button
                  type="button"
                  onClick={() => set('locations', [])}
                  className="mt-1 w-full rounded-[2px] px-2 py-1.5 text-xs font-medium text-accent hover:bg-surface-hover"
                >
                  Clear {value.locations.length} selected
                </button>
              )}
            </div>
          )}
        </div>

        <button
          type="button"
          aria-pressed={value.remoteOnly}
          onClick={() => set('remoteOnly', !value.remoteOnly)}
          className={value.remoteOnly ? `${chip} ${chipOn}` : `${chip} ${chipOff}`}
        >
          Remote
        </button>

        <button
          type="button"
          aria-pressed={value.hideNoSponsorship}
          onClick={() => set('hideNoSponsorship', !value.hideNoSponsorship)}
          title="Hide roles that explicitly do not sponsor or require U.S. citizenship"
          className={value.hideNoSponsorship ? `${chip} ${chipOn}` : `${chip} ${chipOff}`}
        >
          Sponsors only
        </button>

        {/* all / saved / applied toggle */}
        <div
          className="flex items-center gap-0.5 rounded-[var(--radius)] border border-border-base bg-bg-subtle p-0.5"
          role="group"
          aria-label="Filter by tracker state"
        >
          {(
            [
              ['all', 'All', totalCount],
              ['saved', 'Saved', savedCount],
              ['applied', 'Applied', appliedCount],
            ] as Array<[TrackFilter, string, number]>
          ).map(([key, label, count]) => (
            <button
              key={key}
              type="button"
              aria-pressed={value.track === key}
              onClick={() => set('track', key)}
              className={`rounded-[2px] px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.1em] transition-colors ${
                value.track === key
                  ? 'bg-surface text-text shadow-[var(--shadow-sm)]'
                  : 'text-text-muted hover:text-text'
              }`}
            >
              {label}
              {count > 0 && <span className="tnum ml-1 opacity-60">{count}</span>}
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-3 text-xs text-text-muted">
        <span className="tnum">
          <strong className="text-text">{resultCount.toLocaleString()}</strong>
          {resultCount !== totalCount && ` of ${totalCount.toLocaleString()}`} roles
        </span>
        {isFiltered && (
          <button
            type="button"
            onClick={() => onChange(EMPTY_FILTERS)}
            className="font-medium text-accent hover:underline"
          >
            Clear filters
          </button>
        )}
      </div>
    </div>
  );
}
