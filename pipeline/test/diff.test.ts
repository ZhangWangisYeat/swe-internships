import { describe, expect, it } from 'vitest';
import { classifyRemovals } from '../src/diff.js';
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

// fall terms count as starting aug 15 and stay in the cycle for 45 days, so fall
// 2026 drops out during sep 29. the 30th is safely past it.
const NOW = new Date(Date.UTC(2026, 8, 30));

describe('classifyRemovals', () => {
  it('splits removed roles by why they left', () => {
    const listings = [
      listing({ id: 'kept' }),
      listing({ id: 'we-closed' }),
      listing({ id: 'upstream-inactive', active: false }),
      listing({ id: 'upstream-hidden', is_visible: false }),
      listing({ id: 'fall-2026', terms: ['Fall 2026'] }),
      listing({ id: 'still-fine' }),
    ];
    const out = classifyRemovals(
      ['kept', 'we-closed', 'upstream-inactive', 'upstream-hidden', 'vanished', 'fall-2026', 'still-fine'],
      new Set(['kept']),
      new Set(['we-closed']),
      listings,
      NOW,
    );
    expect(out.verifiedClosed).toEqual(['we-closed']);
    expect(out.closedUpstream).toEqual(['upstream-inactive', 'upstream-hidden', 'vanished']);
    expect(out.pastTerm).toEqual(['fall-2026']);
    // active and in cycle but gone anyway, eg. its category changed upstream
    expect(out.other).toEqual(['still-fine']);
  });

  it('counts our own closure first even if upstream closed it too', () => {
    const out = classifyRemovals(
      ['x'],
      new Set(),
      new Set(['x']),
      [listing({ id: 'x', active: false })],
      NOW,
    );
    expect(out.verifiedClosed).toEqual(['x']);
    expect(out.closedUpstream).toEqual([]);
  });
});
