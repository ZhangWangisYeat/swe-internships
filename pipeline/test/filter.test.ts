import { describe, expect, it } from 'vitest';
import {
  degreeLevels,
  filterListings,
  isCurrentCycle,
  isRemote,
  matchingCycleTerms,
  termStart,
} from '../src/filter.js';
import type { RawListing } from '../src/types.js';

function listing(overrides: Partial<RawListing> = {}): RawListing {
  return {
    id: 'id-1',
    company_name: 'Acme',
    company_url: '',
    title: 'Software Engineer Intern',
    category: 'Software',
    degrees: ["Bachelor's"],
    terms: ['Summer 2027'],
    locations: ['San Francisco, CA'],
    url: 'https://example.com/jobs/1',
    active: true,
    is_visible: true,
    sponsorship: 'Other',
    source: 'Simplify',
    date_posted: Math.floor(Date.UTC(2026, 8, 1) / 1000),
    date_updated: Math.floor(Date.UTC(2026, 8, 1) / 1000),
    ...overrides,
  };
}

const NOW = new Date(Date.UTC(2026, 8, 26)); // 2026-09-26

describe('degreeLevels', () => {
  it("puts a Bachelor's-only role on the undergrad page", () => {
    expect(degreeLevels(listing({ degrees: ["Bachelor's"] }))).toEqual({
      levels: ['undergrad'],
      confidence: 'explicit',
    });
  });

  it("puts Bachelor's + Master's on BOTH pages", () => {
    // the one that's easy to get wrong in either direction. it genuinely accepts both,
    // so it belongs on both. filtering it out of undergrad because it mentions
    // Master's would lose loads of roles an undergrad can apply to.
    expect(degreeLevels(listing({ degrees: ["Bachelor's", "Master's"] }))?.levels).toEqual([
      'undergrad',
      'masters',
    ]);
  });

  it('puts a BS/MS/PhD role on all three pages', () => {
    expect(
      degreeLevels(listing({ degrees: ["Bachelor's", "Master's", 'PhD'] }))?.levels,
    ).toEqual(['undergrad', 'masters', 'phd']);
  });

  it('keeps grad-only roles off the undergrad page', () => {
    expect(degreeLevels(listing({ degrees: ["Master's", 'PhD'] }))?.levels).toEqual([
      'masters',
      'phd',
    ]);
    expect(degreeLevels(listing({ degrees: ['PhD'] }))?.levels).toEqual(['phd']);
    expect(degreeLevels(listing({ degrees: ["Master's"] }))?.levels).toEqual(['masters']);
  });

  it('counts an MBA as masters-level', () => {
    expect(degreeLevels(listing({ degrees: ['MBA'] }))?.levels).toEqual(['masters']);
  });

  it("treats Associate's as undergrad", () => {
    expect(degreeLevels(listing({ degrees: ["Associate's"] }))?.levels).toEqual(['undergrad']);
  });

  it('drops a role whose degrees map to none of the three pages', () => {
    expect(degreeLevels(listing({ degrees: ['JD'] }))).toBeNull();
    expect(degreeLevels(listing({ degrees: ['MD', 'PharmD'] }))).toBeNull();
  });

  it('guesses undergrad from an ordinary title when degrees is empty', () => {
    const cases = [
      'Software Engineer Intern',
      'Backend Engineering Intern (Summer 2027)',
      'Full-Stack Intern',
      // "Masterclass" must not trip the master's pattern
      'Masterclass Platform Engineering Intern',
    ];
    for (const title of cases) {
      expect(degreeLevels(listing({ degrees: [], title })), title).toEqual({
        levels: ['undergrad'],
        confidence: 'inferred',
      });
    }
  });

  it('reads the level out of the title when degrees is empty', () => {
    const cases: Array<[string, string[]]> = [
      ['PhD Research Intern', ['phd']],
      ['Ph.D. Software Intern', ['phd']],
      ['Postdoc Research Intern', ['phd']],
      ['Masters Intern, Infrastructure', ['masters']],
      ['MBA Intern - Product', ['masters']],
      ['Software Engineering Intern - MS/PhD - Sys Intel & ML', ['masters', 'phd']],
    ];
    for (const [title, expected] of cases) {
      const result = degreeLevels(listing({ degrees: [], title }));
      expect(result?.levels, title).toEqual(expected);
      expect(result?.confidence, title).toBe('inferred');
    }
  });

  it('believes the degree data over the title', () => {
    // the title says PhD but the listing explicitly lists Bachelor's, so trust the data
    const result = degreeLevels(
      listing({ degrees: ["Bachelor's", 'PhD'], title: 'Software Intern - BS/MS/PhD' }),
    );
    expect(result?.levels).toEqual(['undergrad', 'phd']);
    expect(result?.confidence).toBe('explicit');
  });
});

describe('termStart', () => {
  it('maps seasons to nominal starts', () => {
    expect(termStart('Summer 2027')?.toISOString()).toBe('2027-05-15T00:00:00.000Z');
    expect(termStart('Fall 2026')?.toISOString()).toBe('2026-08-15T00:00:00.000Z');
    expect(termStart('Spring 2027')?.toISOString()).toBe('2027-01-01T00:00:00.000Z');
  });

  it('treats Winter YYYY as starting in December of the prior year', () => {
    expect(termStart('Winter 2027')?.toISOString()).toBe('2026-12-01T00:00:00.000Z');
  });

  it('returns null for unparseable terms', () => {
    expect(termStart('N/A')).toBeNull();
    expect(termStart('')).toBeNull();
    expect(termStart('Someday 2027')).toBeNull();
  });
});

describe('cycle selection', () => {
  it('keeps current and future seasons', () => {
    for (const t of ['Fall 2026', 'Winter 2027', 'Spring 2027', 'Summer 2027', 'Summer 2028']) {
      expect(isCurrentCycle(listing({ terms: [t] }), NOW), t).toBe(true);
    }
  });

  it('drops seasons already past', () => {
    for (const t of ['Summer 2026', 'Spring 2026', 'Winter 2026', 'Summer 2025']) {
      expect(isCurrentCycle(listing({ terms: [t] }), NOW), t).toBe(false);
    }
  });

  it('reports only the terms that actually matched', () => {
    // this one's kept because of Summer 2027, so Summer 2026 shouldn't show up
    // in the list of in-cycle terms
    expect(matchingCycleTerms(listing({ terms: ['Summer 2026', 'Summer 2027'] }), NOW)).toEqual([
      'Summer 2027',
    ]);
  });

  it('keeps a fresh N/A row but drops a stale one', () => {
    const fresh = listing({ terms: ['N/A'], date_posted: Math.floor(NOW.getTime() / 1000) });
    const stale = listing({
      terms: ['N/A'],
      date_posted: Math.floor((NOW.getTime() - 200 * 86_400_000) / 1000),
    });
    expect(isCurrentCycle(fresh, NOW)).toBe(true);
    expect(isCurrentCycle(stale, NOW)).toBe(false);
  });

  it('does not rescue a stale dated row via the N/A freshness path', () => {
    const staleButRecentlyPosted = listing({
      terms: ['Summer 2025'],
      date_posted: Math.floor(NOW.getTime() / 1000),
    });
    expect(isCurrentCycle(staleButRecentlyPosted, NOW)).toBe(false);
  });
});

describe('isRemote', () => {
  it('detects remote locations', () => {
    expect(isRemote(['Remote'])).toBe(true);
    expect(isRemote(['Remote in USA'])).toBe(true);
    expect(isRemote(['San Francisco, CA'])).toBe(false);
  });
});

describe('filterListings', () => {
  it('applies the full funnel and records staged counts', () => {
    const rows = [
      listing({ id: 'keep-ug' }),
      listing({ id: 'drop-inactive', active: false }),
      listing({ id: 'drop-hidden', is_visible: false }),
      listing({ id: 'keep-phd', degrees: ['PhD'] }),
      listing({ id: 'drop-jd', degrees: ['JD'] }),
      listing({ id: 'drop-category', category: 'Hardware' }),
      listing({ id: 'drop-oldterm', terms: ['Summer 2026'] }),
      listing({ id: 'keep-both', degrees: ["Bachelor's", "Master's"] }),
    ];

    const { kept, counts, cycleTerms, byLevel } = filterListings(rows, NOW);

    expect(kept.map((k) => k.listing.id)).toEqual(['keep-ug', 'keep-phd', 'keep-both']);
    expect(counts.upstreamTotal).toBe(8);
    expect(counts.afterActive).toBe(6);
    // the JD row is the one dropped here, it has no page to go on
    expect(counts.afterDegree).toBe(5);
    expect(counts.afterCategory).toBe(4);
    expect(counts.afterCycle).toBe(3);
    expect(cycleTerms).toEqual(['Summer 2027']);
    // these overlap on purpose, keep-both is counted twice
    expect(byLevel).toEqual({ undergrad: 2, masters: 1, phd: 1 });
  });

  it('never returns a kept row with no levels on it', () => {
    const { kept } = filterListings(
      [listing({ degrees: ["Bachelor's"] }), listing({ id: 'b', degrees: [] })],
      NOW,
    );
    for (const row of kept) expect(row.levels.length).toBeGreaterThan(0);
  });
});
