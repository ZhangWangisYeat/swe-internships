import { STRIKES_TO_CLOSE, VERIFY_TTL_HOURS } from '../config.js';
import { globalLimit } from '../http.js';
import type { PersistedState, TierCounts, VerifyVerdict } from '../types.js';
import { ashbyAdapter } from './ashby.js';
import { genericAdapter } from './generic.js';
import { greenhouseAdapter } from './greenhouse.js';
import { leverAdapter } from './lever.js';
import { smartRecruitersAdapter } from './smartrecruiters.js';
import type { Adapter, JobRef, Tier } from './types.js';
import { workdayAdapter } from './workday.js';

// the order matters here. generic has to be last because it matches everything.
export const ADAPTERS: Adapter[] = [
  greenhouseAdapter,
  ashbyAdapter,
  leverAdapter,
  smartRecruitersAdapter,
  workdayAdapter,
  genericAdapter,
];

export function pickAdapter(rawUrl: string): Adapter {
  let url: URL | undefined;
  try {
    url = new URL(rawUrl);
  } catch {
    return genericAdapter;
  }
  for (const adapter of ADAPTERS) {
    if (adapter.match(url)) return adapter;
  }
  return genericAdapter;
}

export function tierOf(rawUrl: string): Tier {
  return pickAdapter(rawUrl).tier;
}

export interface AdapterStat {
  open: number;
  closed: number;
  unknown: number;
}

export interface VerifyReport {
  verdicts: Map<string, VerifyVerdict>;
  tiers: TierCounts;
  byAdapter: Record<string, AdapterStat>;
  attempted: number;
  skippedFresh: number;
  durationMs: number;
}

function bump(stats: Record<string, AdapterStat>, name: string, status: VerifyVerdict['status']) {
  const stat = (stats[name] ??= { open: 0, closed: 0, unknown: 0 });
  if (status === 'open') stat.open++;
  else if (status === 'closed') stat.closed++;
  else stat.unknown++;
}

// check a whole batch of jobs.
//
// two things happen in here that are worth knowing about:
//  - where a job board lets us ask about a whole company at once, we do that
//    instead of one request per role
//  - anything we already checked in the last VERIFY_TTL_HOURS just reuses its old
//    answer, so running this repeatedly doesn't spam anyone
export async function verifyAll(
  jobs: JobRef[],
  state: PersistedState,
  opts: { now?: Date; force?: boolean } = {},
): Promise<VerifyReport> {
  const now = opts.now ?? new Date();
  const started = Date.now();
  const verdicts = new Map<string, VerifyVerdict>();
  const byAdapter: Record<string, AdapterStat> = {};
  const tiers: TierCounts = { T1: 0, T2: 0, T3: 0 };

  const ttlMs = VERIFY_TTL_HOURS * 3_600_000;
  const pending: JobRef[] = [];
  let skippedFresh = 0;

  for (const job of jobs) {
    tiers[tierOf(job.url)]++;

    const prior = state.jobs[job.id];
    const lastAt = prior?.lastVerifiedAt ? Date.parse(prior.lastVerifiedAt) : NaN;
    // the cache only ever applies to roles we confirmed were open.
    //
    // this matters: if we cached a "closed" answer then one single check would
    // count as both strikes, which defeats the entire point of needing two. the
    // second strike has to be an actual independent check. we always retry
    // "unverified" ones too, since whatever was blocking us might have cleared up.
    const fresh =
      !opts.force &&
      !Number.isNaN(lastAt) &&
      now.getTime() - lastAt < ttlMs &&
      prior?.lastStatus === 'open';

    if (fresh && prior) {
      const cached: VerifyVerdict = { status: 'open', by: 'cache', reason: 'within TTL' };
      // bring the real posting date along with the cached answer, otherwise the
      // date quietly falls back to the less accurate one on every cached run
      if (prior.publishedAt) cached.publishedAt = prior.publishedAt;
      verdicts.set(job.id, cached);
      skippedFresh++;
      continue;
    }
    pending.push(job);
  }

  // sort the roles into ones we can check a whole company at a time and ones we
  // have to do individually
  const boardGroups = new Map<string, { adapter: Adapter; board: string; jobs: JobRef[] }>();
  const singles: Array<{ adapter: Adapter; job: JobRef }> = [];

  for (const job of pending) {
    const adapter = pickAdapter(job.url);
    let board: string | undefined;
    if (adapter.boardKey && adapter.verifyBoard) {
      try {
        board = adapter.boardKey(new URL(job.url));
      } catch {
        board = undefined;
      }
    }

    if (board && adapter.verifyBoard) {
      const key = `${adapter.name}::${board}`;
      const group = boardGroups.get(key) ?? { adapter, board, jobs: [] };
      group.jobs.push(job);
      boardGroups.set(key, group);
    } else if (adapter.verifyOne) {
      singles.push({ adapter, job });
    } else {
      verdicts.set(job.id, { status: 'unverified', by: adapter.name, reason: 'no verifier' });
    }
  }

  const tasks: Array<Promise<void>> = [];

  for (const group of boardGroups.values()) {
    tasks.push(
      globalLimit(async () => {
        try {
          const result = await group.adapter.verifyBoard!(group.board, group.jobs);
          for (const job of group.jobs) {
            const verdict =
              result.get(job.id) ??
              ({ status: 'unverified', by: group.adapter.name, reason: 'no verdict returned' } satisfies VerifyVerdict);
            verdicts.set(job.id, verdict);
          }
        } catch (err) {
          // if an adapter blows up we must not let that turn into marking a whole
          // company's roles as closed
          for (const job of group.jobs) {
            verdicts.set(job.id, {
              status: 'unverified',
              by: group.adapter.name,
              reason: `adapter threw: ${err instanceof Error ? err.message : String(err)}`,
            });
          }
        }
      }),
    );
  }

  for (const { adapter, job } of singles) {
    tasks.push(
      globalLimit(async () => {
        try {
          verdicts.set(job.id, await adapter.verifyOne!(job));
        } catch (err) {
          verdicts.set(job.id, {
            status: 'unverified',
            by: adapter.name,
            reason: `adapter threw: ${err instanceof Error ? err.message : String(err)}`,
          });
        }
      }),
    );
  }

  await Promise.all(tasks);

  for (const [, verdict] of verdicts) bump(byAdapter, verdict.by, verdict.status);

  return {
    verdicts,
    tiers,
    byAdapter,
    attempted: pending.length,
    skippedFresh,
    durationMs: Date.now() - started,
  };
}

// one bad check never deletes a role.
//
// if it did, a network blip or a rate limit or a bug in one of my adapters could
// quietly wipe out the whole list. a role only gets dropped once it's looked closed
// on STRIKES_TO_CLOSE runs in a row. this returns what we're going with for each
// job and updates the strike counts in state as it goes.
export function applyStrikes(
  jobs: JobRef[],
  verdicts: Map<string, VerifyVerdict>,
  state: PersistedState,
  now: Date,
): { effective: Map<string, VerifyVerdict>; removedIds: string[] } {
  const effective = new Map<string, VerifyVerdict>();
  const removedIds: string[] = [];
  const nowIso = now.toISOString();

  for (const job of jobs) {
    const verdict = verdicts.get(job.id);
    const entry = (state.jobs[job.id] ??= { firstSeenAt: nowIso, strikes: 0 });

    if (!verdict) {
      effective.set(job.id, { status: 'unverified', by: 'none', reason: 'not attempted' });
      continue;
    }

    if (verdict.status === 'closed') {
      entry.strikes += 1;
      if (entry.strikes >= STRIKES_TO_CLOSE) {
        removedIds.push(job.id);
        effective.set(job.id, verdict);
      } else {
        // looked closed once. keep showing it until a second run agrees.
        effective.set(job.id, {
          status: 'unverified',
          by: verdict.by,
          reason: `closed once (strike ${entry.strikes}/${STRIKES_TO_CLOSE}), holding`,
        });
      }
    } else {
      entry.strikes = 0;
      effective.set(job.id, verdict);
    }

    if (verdict.by !== 'cache') {
      entry.lastVerifiedAt = nowIso;
      entry.lastStatus = verdict.status;
      // save the real posting date so cached runs later on still have it
      if (verdict.publishedAt) entry.publishedAt = verdict.publishedAt;
    }
  }

  return { effective, removedIds };
}

export type { JobRef };
