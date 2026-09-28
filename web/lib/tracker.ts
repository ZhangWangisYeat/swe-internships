'use client';

import { useCallback, useSyncExternalStore } from 'react';
import type { TrackState } from './types';

// saves your saved/applied marks, your last visit and your theme choice.
//
// every read and write is wrapped in try/catch because localStorage doesn't just
// return null when it's unavailable, it actually throws (safari private mode,
// browsers set to block site data, preview iframes). this is a convenience feature
// so it should never be able to take the whole page down with it.

const TRACK_KEY = 'internship-tracker:v1:states';
const VISIT_KEY = 'internship-tracker:v1:lastVisit';
const THEME_KEY = 'internship-tracker:v1:theme';

type TrackMap = Record<string, Exclude<TrackState, 'none'>>;

function safeRead(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeWrite(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // storage is blocked or full. your marks still work for this session, they
    // just won't survive a reload.
  }
}

let cache: TrackMap | null = null;
const listeners = new Set<() => void>();

function readStates(): TrackMap {
  if (cache) return cache;
  const raw = safeRead(TRACK_KEY);
  if (!raw) {
    cache = {};
    return cache;
  }
  try {
    const parsed = JSON.parse(raw) as unknown;
    cache =
      parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as TrackMap) : {};
  } catch {
    cache = {};
  }
  return cache;
}

function emit() {
  for (const l of listeners) l();
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

const EMPTY: TrackMap = {};

// this has to return the exact same object every time or react will loop forever
function getServerSnapshot(): TrackMap {
  return EMPTY;
}

export function useTrackStates(): {
  states: TrackMap;
  setState: (id: string, next: TrackState) => void;
  clearAll: () => void;
} {
  const states = useSyncExternalStore(subscribe, readStates, getServerSnapshot);

  const setState = useCallback((id: string, next: TrackState) => {
    const current = { ...readStates() };
    if (next === 'none') delete current[id];
    else current[id] = next;
    cache = current;
    safeWrite(TRACK_KEY, JSON.stringify(current));
    emit();
  }, []);

  const clearAll = useCallback(() => {
    cache = {};
    safeWrite(TRACK_KEY, '{}');
    emit();
  }, []);

  return { states, setState, clearAll };
}

// read when you were last here, then write down that you're here now.
//
// the order matters and it only runs once when the page loads. if you wrote first
// then read, "new since last visit" would always be empty because your last visit
// would be a second ago.
//
// 'first' means you've never been here (or storage is blocked). that used to come
// back as 0, which made every role on the site "new since your last visit" and
// stuck a NEW badge on all ~1,000 rows for anyone arriving from google.
export function readAndStampLastVisit(): number | 'first' {
  const raw = safeRead(VISIT_KEY);
  const previous = raw ? Number(raw) : Number.NaN;
  safeWrite(VISIT_KEY, String(Date.now()));
  return Number.isFinite(previous) ? previous : 'first';
}

export type ThemeChoice = 'system' | 'light' | 'dark';

export function readTheme(): ThemeChoice {
  const raw = safeRead(THEME_KEY);
  return raw === 'light' || raw === 'dark' || raw === 'system' ? raw : 'system';
}

export function writeTheme(choice: ThemeChoice): void {
  safeWrite(THEME_KEY, choice);
}

export { THEME_KEY };
