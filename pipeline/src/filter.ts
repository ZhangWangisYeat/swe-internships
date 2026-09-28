import {
  CYCLE_GRACE_DAYS,
  MASTERS_DEGREES,
  MASTERS_TITLE_RE,
  NA_TERM_MAX_AGE_DAYS,
  PHD_DEGREES,
  PHD_TITLE_RE,
  SOFTWARE_CATEGORIES,
  UNDERGRAD_DEGREES,
} from './config.js';
import type { DegreeConfidence, DegreeLevel, RawListing } from './types.js';

const DAY_MS = 86_400_000;

export interface LevelMatch {
  levels: DegreeLevel[];
  confidence: DegreeConfidence;
}

// work out which of the three pages a role belongs on.
//
// a role can land on several, and that's the point: ["Bachelor's","Master's"] really
// does accept both, so it shows up under undergrad AND masters. this is also the bit
// that's easy to get wrong in the other direction — if you treated any mention of
// Master's as "not for undergrads" you'd lose a huge chunk of perfectly fine roles,
// since most listings that mention Master's list Bachelor's right next to it.
//
// returns null when we can't place it anywhere, so the caller drops it.
export function degreeLevels(listing: RawListing): LevelMatch | null {
  const degrees = listing.degrees ?? [];

  if (degrees.length > 0) {
    const levels: DegreeLevel[] = [];
    if (degrees.some((d) => UNDERGRAD_DEGREES.has(d))) levels.push('undergrad');
    if (degrees.some((d) => MASTERS_DEGREES.has(d))) levels.push('masters');
    if (degrees.some((d) => PHD_DEGREES.has(d))) levels.push('phd');
    // listings that only want a JD or an MD have nowhere to go here
    return levels.length > 0 ? { levels, confidence: 'explicit' } : null;
  }

  // no degree info at all, so guess from the title. marked as inferred so the site
  // can badge it rather than pretending we knew.
  const isPhd = PHD_TITLE_RE.test(listing.title);
  const isMasters = MASTERS_TITLE_RE.test(listing.title);

  const levels: DegreeLevel[] = [];
  if (isMasters) levels.push('masters');
  if (isPhd) levels.push('phd');
  // a title like "SWE Intern - MS/PhD" names grad levels, so it isn't an undergrad
  // role. anything that names neither we treat as undergrad, which is the common case.
  if (levels.length === 0) levels.push('undergrad');

  return { levels, confidence: 'inferred' };
}

export type Season = 'Spring' | 'Summer' | 'Fall' | 'Winter';

const SEASON_START: Record<Season, { monthOffset: number; month: number; day: number }> = {
  // monthOffset is there because "Winter 2027" actually starts in Dec 2026
  Spring: { monthOffset: 0, month: 0, day: 1 },
  Summer: { monthOffset: 0, month: 4, day: 15 },
  Fall: { monthOffset: 0, month: 7, day: 15 },
  Winter: { monthOffset: -1, month: 11, day: 1 },
};

// turn something like "Summer 2027" into roughly when that term starts
export function termStart(term: string): Date | null {
  const m = /^(Spring|Summer|Fall|Winter)\s+(\d{4})$/.exec(term.trim());
  if (!m) return null;
  const season = m[1] as Season;
  const year = Number(m[2]);
  const spec = SEASON_START[season];
  return new Date(Date.UTC(year + spec.monthOffset, spec.month, spec.day));
}

// which of this listing's terms are actually part of the current cycle?
//
// we work this out from today's date instead of hardcoding a list of terms,
// otherwise the app silently goes stale once the season rolls over. we return the
// terms that matched rather than a plain true/false, because something tagged
// ["Summer 2026","Summer 2027"] only gets kept because of Summer 2027, and that's
// the one we should report as in-cycle.
export function matchingCycleTerms(listing: RawListing, now: Date): string[] {
  const cutoff = now.getTime() - CYCLE_GRACE_DAYS * DAY_MS;
  const terms = listing.terms ?? [];

  const matched = terms.filter((t) => {
    const start = termStart(t);
    return start !== null && start.getTime() >= cutoff;
  });
  if (matched.length > 0) return matched;

  // if it had real seasons and none of them matched, it's just old, drop it.
  // only fall through to the freshness check when there was no season at all (eg "N/A").
  const hasParseable = terms.some((t) => termStart(t) !== null);
  if (hasParseable) return [];

  const ageDays = (now.getTime() - listing.date_posted * 1000) / DAY_MS;
  return ageDays <= NA_TERM_MAX_AGE_DAYS ? (terms.length > 0 ? terms : ['N/A']) : [];
}

export function isCurrentCycle(listing: RawListing, now: Date): boolean {
  return matchingCycleTerms(listing, now).length > 0;
}

export function isSoftware(listing: RawListing): boolean {
  return SOFTWARE_CATEGORIES.has(listing.category);
}

export function isRemote(locations: string[]): boolean {
  return locations.some((l) => /\bremote\b/i.test(l));
}

export interface FilterCounts {
  upstreamTotal: number;
  afterActive: number;
  afterDegree: number;
  afterCategory: number;
  afterCycle: number;
}

export interface FilterResult {
  kept: Array<{ listing: RawListing; levels: DegreeLevel[]; degreeConfidence: DegreeConfidence }>;
  counts: FilterCounts;
  cycleTerms: string[];
  // how many ended up on each page. they overlap, since a role open to Bachelor's and
  // Master's is counted under both.
  byLevel: Record<DegreeLevel, number>;
}

// run everything through the filters, counting how many survive each step. the
// per-step counts matter a lot: if the total suddenly drops you can see exactly
// which filter ate everything instead of just guessing.
export function filterListings(listings: RawListing[], now = new Date()): FilterResult {
  const counts: FilterCounts = {
    upstreamTotal: listings.length,
    afterActive: 0,
    afterDegree: 0,
    afterCategory: 0,
    afterCycle: 0,
  };

  const kept: FilterResult['kept'] = [];
  const cycleTerms = new Set<string>();
  const byLevel: Record<DegreeLevel, number> = { undergrad: 0, masters: 0, phd: 0 };

  for (const listing of listings) {
    if (!listing.active || !listing.is_visible) continue;
    counts.afterActive++;

    const match = degreeLevels(listing);
    if (match === null) continue;
    counts.afterDegree++;

    if (!isSoftware(listing)) continue;
    counts.afterCategory++;

    const matched = matchingCycleTerms(listing, now);
    if (matched.length === 0) continue;
    counts.afterCycle++;

    for (const t of matched) cycleTerms.add(t);
    for (const level of match.levels) byLevel[level]++;
    kept.push({ listing, levels: match.levels, degreeConfidence: match.confidence });
  }

  return { kept, counts, cycleTerms: [...cycleTerms].sort(), byLevel };
}
