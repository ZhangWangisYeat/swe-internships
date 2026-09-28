'use client';

import { useEffect } from 'react';
import { formatDateTime, relativeAgeLong } from '@/lib/format';
import type { JobsNotice } from '@/lib/useJobs';

interface Props {
  notice: JobsNotice;
  onDismiss: () => void;
}

// "nothing new" and "couldn't reach it" are just answers to a click, so they go
// away by themselves. "updated" sticks around until you close it, because that one
// can show up in the background while you're not looking.
const AUTO_DISMISS_MS = 5000;

// pops up after a check. it doesn't block anything and you can dismiss it, the
// table has already updated behind it anyway.
export function UpdateToast({ notice, onDismiss }: Props) {
  useEffect(() => {
    if (notice.kind === 'updated') return;
    const timer = window.setTimeout(onDismiss, AUTO_DISMISS_MS);
    return () => window.clearTimeout(timer);
  }, [notice, onDismiss]);

  let text: string;
  if (notice.kind === 'updated') {
    const parts: string[] = [];
    if (notice.added > 0) parts.push(`${notice.added} new role${notice.added === 1 ? '' : 's'}`);
    if (notice.removed > 0) parts.push(`${notice.removed} closed`);
    text = parts.length > 0 ? `List updated: ${parts.join(', ')}` : 'List updated, no roles opened or closed';
  } else if (notice.kind === 'current') {
    // say when the list was built, because "up to date" on its own reads like the
    // button checked the job boards just now, and it didn't
    text = `Up to date. Newest list is from ${relativeAgeLong(notice.generatedAt).toLowerCase()} (${formatDateTime(notice.generatedAt)})`;
  } else {
    text = `Couldn't check for updates (${notice.message})`;
  }

  const ok = notice.kind !== 'failed';

  return (
    <div
      role="status"
      aria-live="polite"
      className="animate-slide-up fixed bottom-4 left-1/2 z-50 flex max-w-[calc(100vw-2rem)] -translate-x-1/2 items-center gap-3 rounded-[var(--radius)] border border-border-base bg-surface px-4 py-2.5 shadow-[var(--shadow-md)]"
    >
      <span
        className={`grid h-5 w-5 shrink-0 place-items-center rounded-full ${ok ? 'bg-success-subtle' : 'bg-danger-subtle'}`}
      >
        <svg
          viewBox="0 0 24 24"
          className={`h-3 w-3 ${ok ? 'text-success' : 'text-danger'}`}
          fill="none"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d={ok ? 'M20 6 9 17l-5-5' : 'M12 7v6M12 17h.01'} />
        </svg>
      </span>
      <span className="text-sm text-text">{text}</span>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss update notice"
        className="text-text-faint transition-colors hover:text-text"
      >
        <svg
          viewBox="0 0 24 24"
          className="h-4 w-4"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          aria-hidden="true"
        >
          <path d="M18 6 6 18M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
}
