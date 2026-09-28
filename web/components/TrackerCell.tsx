'use client';

import type { TrackState } from '@/lib/types';

interface Props {
  id: string;
  state: TrackState;
  onChange: (id: string, next: TrackState) => void;
}

// two little buttons on each row, save and applied.
//
// clicking an active one turns it back off, so you can undo it without needing a
// separate clear button.
export function TrackerCell({ id, state, onChange }: Props) {
  const button =
    'grid h-7 w-7 place-items-center rounded-[2px] border text-[11px] font-semibold transition-colors';

  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        aria-pressed={state === 'saved'}
        aria-label={state === 'saved' ? 'Remove from saved' : 'Save this role'}
        title={state === 'saved' ? 'Saved — click to unsave' : 'Save'}
        onClick={() => onChange(id, state === 'saved' ? 'none' : 'saved')}
        className={
          state === 'saved'
            ? `${button} border-accent bg-accent text-accent-fg`
            : `${button} border-border-base bg-surface text-text-faint hover:border-border-strong hover:text-text-muted`
        }
      >
        <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="currentColor" aria-hidden="true">
          <path d="M6 2h12a1 1 0 0 1 1 1v18.2a.8.8 0 0 1-1.25.67L12 18.2l-5.75 3.67A.8.8 0 0 1 5 21.2V3a1 1 0 0 1 1-1Z" />
        </svg>
      </button>

      <button
        type="button"
        aria-pressed={state === 'applied'}
        aria-label={state === 'applied' ? 'Mark as not applied' : 'Mark as applied'}
        title={state === 'applied' ? 'Applied — click to undo' : 'Mark applied'}
        onClick={() => onChange(id, state === 'applied' ? 'none' : 'applied')}
        className={
          state === 'applied'
            ? `${button} border-success bg-success-subtle text-success`
            : `${button} border-border-base bg-surface text-text-faint hover:border-border-strong hover:text-text-muted`
        }
      >
        <svg
          viewBox="0 0 24 24"
          className="h-3.5 w-3.5"
          fill="none"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M20 6 9 17l-5-5" />
        </svg>
      </button>
    </div>
  );
}
