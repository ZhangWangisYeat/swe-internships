'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Job, JobsPayload } from './types';

// this has to be root-relative, not relative. a plain 'data/jobs.json' resolves
// against the current path, so it works on / but asks for /masters/data/jobs.json
// on the masters page and 404s.
//
// if you ever set basePath in next.config.ts (eg. for GitHub Pages under a repo
// subpath) then set NEXT_PUBLIC_BASE_PATH to the same value or this breaks again.
const DATA_URL = `${process.env.NEXT_PUBLIC_BASE_PATH ?? ''}/data/jobs.json`;
const POLL_MS = 30 * 60 * 1000; // 30 minutes

// what the last check turned up. background checks only ever produce 'updated'
// (you don't want a popup every time you alt-tab back), but a click on the refresh
// button always gets an answer, because before this a click that found nothing new
// did literally nothing and the button looked fake.
export type JobsNotice =
  | { kind: 'updated'; added: number; removed: number; generatedAt: string }
  | { kind: 'current'; generatedAt: string }
  | { kind: 'failed'; message: string };

export interface JobsState {
  jobs: Job[];
  generatedAt: string | null;
  loading: boolean;
  error: string | null;
  // true while a check you asked for is running, so the button can spin
  checking: boolean;
  notice: JobsNotice | null;
  refresh: () => void;
  dismissNotice: () => void;
}

// load the jobs file and then keep it up to date.
//
// we re-check it when the page loads, whenever you come back to the tab, and every
// 30 minutes otherwise. we compare generatedAt so we can tell you what actually
// changed. this is how the list updates both on refresh and on its own without
// needing a server: the scheduled job rewrites the file and the page notices.
//
// so the refresh button fetches the newest published list, it doesn't re-scrape
// anything. the scraping needs node and ~90s of hitting job boards, which a static
// page can't do (and browsers would block most of those requests anyway).
export function useJobs(): JobsState {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [generatedAt, setGeneratedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [notice, setNotice] = useState<JobsNotice | null>(null);

  // these are refs and not state on purpose, so the fetch function never changes
  // identity and the effect below doesn't re-run in a loop
  const idsRef = useRef<Set<string>>(new Set());
  const generatedRef = useRef<string | null>(null);
  const inFlight = useRef<Promise<void> | null>(null);

  const load = useCallback(async (mode: 'initial' | 'background' | 'manual') => {
    // if a background check is already going when you click, wait on that one
    // instead of dropping the click. dropping it meant no spinner and no answer.
    if (inFlight.current) {
      if (mode !== 'manual') return;
      await inFlight.current;
    }

    const run = (async () => {
      try {
        // no-store because otherwise hitting refresh can just hand you the browser's
        // or the CDN's old copy, which defeats the point
        const res = await fetch(DATA_URL, { cache: 'no-store' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const payload = (await res.json()) as JobsPayload;
        if (!Array.isArray(payload.jobs)) throw new Error('malformed payload');

        const nextIds = new Set(payload.jobs.map((j) => j.id));
        const isNewer = generatedRef.current !== null && payload.generatedAt !== generatedRef.current;

        if (mode !== 'initial' && isNewer) {
          let added = 0;
          for (const id of nextIds) if (!idsRef.current.has(id)) added++;
          let removed = 0;
          for (const id of idsRef.current) if (!nextIds.has(id)) removed++;
          // a rebuild where nothing opened or closed still counts when you asked,
          // otherwise you'd click and get "up to date" while the timestamp jumps
          if (added > 0 || removed > 0 || mode === 'manual') {
            setNotice({ kind: 'updated', added, removed, generatedAt: payload.generatedAt });
          }
        } else if (mode === 'manual' && generatedRef.current !== null) {
          // (the null check is for "try again" after the first load failed. getting
          // the list at all is the answer there, "you're up to date" would be weird)
          setNotice({ kind: 'current', generatedAt: payload.generatedAt });
        }

        idsRef.current = nextIds;
        generatedRef.current = payload.generatedAt;
        setJobs(payload.jobs);
        setGeneratedAt(payload.generatedAt);
        setError(null);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to load listings';
        // if a background refresh fails, leave what's already on screen alone.
        // only show an error page if we never managed to load anything in the first
        // place, and only pop a notice if you actually clicked.
        if (mode === 'initial') setError(message);
        else if (mode === 'manual') setNotice({ kind: 'failed', message });
      }
    })();

    inFlight.current = run;
    try {
      await run;
    } finally {
      inFlight.current = null;
      if (mode === 'initial') setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load('initial');

    const onFocus = () => void load('background');
    const onVisible = () => {
      if (document.visibilityState === 'visible') void load('background');
    };
    const timer = window.setInterval(() => void load('background'), POLL_MS);

    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [load]);

  const refresh = useCallback(() => {
    setChecking(true);
    setNotice(null);
    void load('manual').finally(() => setChecking(false));
  }, [load]);
  const dismissNotice = useCallback(() => setNotice(null), []);

  return { jobs, generatedAt, loading, error, checking, notice, refresh, dismissNotice };
}
