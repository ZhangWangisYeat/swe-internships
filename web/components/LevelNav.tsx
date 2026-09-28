'use client';

import Link from 'next/link';
import type { DegreeLevel } from '@/lib/types';
import { LEVELS } from '@/lib/levels';

interface Props {
  current: DegreeLevel;
  // how many roles are on each page. one jobs.json covers all three, so we can show
  // the other tabs' counts without loading anything extra.
  counts: Record<DegreeLevel, number> | null;
}

// tabs across the top for undergrad / masters / phd.
//
// these are real links to separate routes rather than client-side tab state, so you
// can bookmark a level and the back button does what you'd expect.
export function LevelNav({ current, counts }: Props) {
  return (
    <nav aria-label="Degree level" className="flex items-center gap-1 border-b border-border-base">
      {LEVELS.map((level) => {
        const active = level.id === current;
        const count = counts?.[level.id];
        return (
          <Link
            key={level.id}
            href={level.href}
            aria-current={active ? 'page' : undefined}
            className={`-mb-px border-b-2 px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.14em] transition-colors ${
              active
                ? 'border-accent text-text'
                : 'border-transparent text-text-muted hover:border-border-strong hover:text-text'
            }`}
          >
            {level.label}
            {count !== undefined && (
              <span className="tnum ml-1.5 text-[10px] font-normal opacity-60">{count}</span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
