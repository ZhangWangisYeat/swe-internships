import fs from 'node:fs/promises';
import path from 'node:path';
import { STATE_PATH } from './config.js';
import type { PersistedState } from './types.js';

const EMPTY: PersistedState = { version: 1, jobs: {} };

// two things we can't figure out from just looking at today's data: when we first
// saw a role (that's what "new since last visit" uses) and how many times in a row
// it's looked closed (so one bad network request can't delete it).
export async function loadState(): Promise<PersistedState> {
  try {
    const raw = await fs.readFile(STATE_PATH, 'utf8');
    const parsed = JSON.parse(raw) as PersistedState;
    if (parsed?.version !== 1 || typeof parsed.jobs !== 'object' || parsed.jobs === null) {
      return { ...EMPTY };
    }
    return parsed;
  } catch {
    return { ...EMPTY };
  }
}

export async function saveState(state: PersistedState): Promise<void> {
  await fs.mkdir(path.dirname(STATE_PATH), { recursive: true });
  await fs.writeFile(STATE_PATH, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
}

// forget about roles we haven't seen in ages, otherwise this file just grows
// forever as cycles come and go
export function pruneState(state: PersistedState, seenIds: Set<string>, keepDays = 120): void {
  const cutoff = Date.now() - keepDays * 86_400_000;
  for (const [id, entry] of Object.entries(state.jobs)) {
    if (seenIds.has(id)) continue;
    const last = Date.parse(entry.lastVerifiedAt ?? entry.firstSeenAt);
    if (Number.isNaN(last) || last < cutoff) delete state.jobs[id];
  }
}
