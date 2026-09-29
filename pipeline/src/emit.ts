import fs from 'node:fs/promises';
import path from 'node:path';
import {
  DATA_DIR,
  JOBS_PATH,
  META_PATH,
  SANITY_MAX_DROP_RATIO,
  SANITY_MIN_BASELINE,
} from './config.js';
import type { Job, Meta } from './types.js';

export interface SanityCheck {
  ok: boolean;
  previousCount: number;
  nextCount: number;
  message?: string;
}

export async function readPreviousJobs(): Promise<Job[] | undefined> {
  try {
    const raw = await fs.readFile(JOBS_PATH, 'utf8');
    const parsed = JSON.parse(raw) as { jobs?: Job[] } | Job[];
    if (Array.isArray(parsed)) return parsed;
    return parsed.jobs;
  } catch {
    return undefined;
  }
}

// probably the most useful safety check in here. if the number of open roles
// suddenly collapses, the realistic explanation is that the format changed
// upstream or the network fell over and we read that as everything being closed.
// not writing anything leaves the site slightly out of date instead of empty,
// which is the better of the two.
export function checkSanity(previous: Job[] | undefined, next: Job[]): SanityCheck {
  const previousCount = previous?.length ?? 0;
  const nextCount = next.length;

  if (previousCount < SANITY_MIN_BASELINE) {
    return { ok: true, previousCount, nextCount };
  }

  const drop = (previousCount - nextCount) / previousCount;
  if (drop > SANITY_MAX_DROP_RATIO) {
    return {
      ok: false,
      previousCount,
      nextCount,
      message:
        `Refusing to write: open count fell ${(drop * 100).toFixed(0)}% ` +
        `(${previousCount} -> ${nextCount}), above the ${(SANITY_MAX_DROP_RATIO * 100).toFixed(0)}% guard. ` +
        `Previous data left in place. Re-run, or set ALLOW_LARGE_DROP=1 if this drop is real.`,
    };
  }

  return { ok: true, previousCount, nextCount };
}

export interface EmitResult {
  wrote: boolean;
  sanity: SanityCheck;
}

export interface EmitOptions {
  // skip the drop check. used for --limit runs where of course there's fewer rows,
  // that's the whole point, it doesn't mean anything broke.
  allowDrop?: boolean;
}

// either both files get written or neither does. meta only gets written after
// jobs.json worked, so we never end up with the two disagreeing.
export async function emit(jobs: Job[], meta: Meta, opts: EmitOptions = {}): Promise<EmitResult> {
  const previous = await readPreviousJobs();
  const sanity = checkSanity(previous, jobs);

  const bypass = opts.allowDrop === true || process.env.ALLOW_LARGE_DROP === '1';
  if (!sanity.ok && !bypass) {
    return { wrote: false, sanity };
  }

  await fs.mkdir(DATA_DIR, { recursive: true });

  // always sort the same way (newest first, then company, then id) so the git diff
  // between runs only shows roles that actually changed, not rows shuffling around
  const sorted = [...jobs].sort(
    (a, b) =>
      b.dateOpened.localeCompare(a.dateOpened) ||
      a.company.localeCompare(b.company) ||
      a.id.localeCompare(b.id),
  );

  const payload = {
    generatedAt: meta.generatedAt,
    count: sorted.length,
    jobs: sorted,
  };

  const tmp = path.join(DATA_DIR, 'jobs.json.tmp');
  await fs.writeFile(tmp, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  await fs.rename(tmp, JOBS_PATH);
  await fs.writeFile(META_PATH, `${JSON.stringify(meta, null, 2)}\n`, 'utf8');

  return { wrote: true, sanity };
}
