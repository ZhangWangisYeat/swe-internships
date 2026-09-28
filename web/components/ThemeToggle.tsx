'use client';

import { useEffect, useState } from 'react';
import { readTheme, writeTheme, type ThemeChoice } from '@/lib/tracker';

const ORDER: ThemeChoice[] = ['system', 'light', 'dark'];

const LABEL: Record<ThemeChoice, string> = {
  system: 'System theme',
  light: 'Light theme',
  dark: 'Dark theme',
};

function apply(choice: ThemeChoice) {
  const root = document.documentElement;
  if (choice === 'system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', choice);
}

export function ThemeToggle() {
  // start on 'system' for both the server and the first render in the browser, then
  // switch to your saved choice once mounted. if we read localStorage straight away
  // the two wouldn't match and react would complain about hydration.
  const [choice, setChoice] = useState<ThemeChoice>('system');
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setChoice(readTheme());
    setMounted(true);
  }, []);

  const cycle = () => {
    const next = ORDER[(ORDER.indexOf(choice) + 1) % ORDER.length] ?? 'system';
    setChoice(next);
    writeTheme(next);
    apply(next);
  };

  return (
    <button
      type="button"
      onClick={cycle}
      title={mounted ? LABEL[choice] : 'Theme'}
      aria-label={mounted ? `${LABEL[choice]} — click to change` : 'Change theme'}
      className="grid h-8 w-8 place-items-center rounded-[var(--radius)] border border-border-base bg-surface text-text-muted transition-colors hover:border-border-strong hover:text-text"
    >
      {choice === 'dark' ? (
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor" aria-hidden="true">
          <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" />
        </svg>
      ) : choice === 'light' ? (
        <svg
          viewBox="0 0 24 24"
          className="h-4 w-4"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          aria-hidden="true"
        >
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2m0 16v2M2 12h2m16 0h2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M19.1 4.9l-1.4 1.4M6.3 17.7l-1.4 1.4" />
        </svg>
      ) : (
        <svg
          viewBox="0 0 24 24"
          className="h-4 w-4"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          aria-hidden="true"
        >
          <rect x="2" y="4" width="20" height="14" rx="2" />
          <path d="M8 21h8" />
        </svg>
      )}
    </button>
  );
}
