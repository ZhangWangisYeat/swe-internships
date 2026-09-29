import { describe, expect, it } from 'vitest';
import { EMPTY_FILTERS, type FilterValue } from '@/components/Filters';
import { decorateJobs, filterJobs, locationOptions } from '@/lib/filterJobs';
import type { Job } from '@/lib/types';

function job(overrides: Partial<Job> = {}): Job {
  return {
    id: 'j1',
    company: 'Acme',
    title: 'Software Engineer Intern',
    locations: ['San Francisco, CA'],
    remote: false,
    dateOpened: '2026-09-01T00:00:00.000Z',
    dateOpenedSource: 'ats',
    url: 'https://example.com/jobs/1',
    terms: ['Summer 2027'],
    degrees: ["Bachelor's"],
    levels: ['undergrad'],
    degreeConfidence: 'explicit',
    sponsorship: 'Other',
    skills: [],
    softSkills: [],
    status: 'open',
    firstSeenAt: '2026-09-01T00:00:00.000Z',
    ...overrides,
  };
}

const f = (over: Partial<FilterValue> = {}): FilterValue => ({ ...EMPTY_FILTERS, ...over });

describe('decorateJobs', () => {
  it('marks rows first seen after the last visit as new', () => {
    const lastVisit = Date.parse('2026-09-10T00:00:00Z');
    const rows = decorateJobs(
      [
        job({ id: 'old', firstSeenAt: '2026-09-01T00:00:00.000Z' }),
        job({ id: 'new', firstSeenAt: '2026-09-20T00:00:00.000Z' }),
      ],
      {},
      lastVisit,
    );
    expect(rows.find((r) => r.id === 'old')?.isNew).toBe(false);
    expect(rows.find((r) => r.id === 'new')?.isNew).toBe(true);
  });

  it('marks nothing new until lastVisit is known', () => {
    // otherwise every row flashes a New badge on the first render
    const rows = decorateJobs([job({ firstSeenAt: '2099-01-01T00:00:00.000Z' })], {}, null);
    expect(rows[0]?.isNew).toBe(false);
  });

  it('on a first visit, only flags roles that opened in the last few days', () => {
    const now = Date.parse('2026-09-28T00:00:00Z');
    const rows = decorateJobs(
      [
        // seen today but opened weeks ago, which is every role right after a fresh
        // install. these must not all light up as new.
        job({ id: 'old', dateOpened: '2026-09-01T00:00:00.000Z', firstSeenAt: '2026-09-27T00:00:00.000Z' }),
        job({ id: 'fresh', dateOpened: '2026-09-26T00:00:00.000Z', firstSeenAt: '2026-09-27T00:00:00.000Z' }),
      ],
      {},
      'first',
      now,
    );
    expect(rows.find((r) => r.id === 'old')?.isNew).toBe(false);
    expect(rows.find((r) => r.id === 'fresh')?.isNew).toBe(true);
  });

  it('attaches tracker state, defaulting to none', () => {
    const rows = decorateJobs([job({ id: 'a' }), job({ id: 'b' })], { a: 'applied' }, 0);
    expect(rows.find((r) => r.id === 'a')?.track).toBe('applied');
    expect(rows.find((r) => r.id === 'b')?.track).toBe('none');
  });
});

describe('filterJobs', () => {
  const rows = decorateJobs(
    [
      job({ id: 'a', company: 'Stripe', title: 'Backend Intern', locations: ['NYC'] }),
      job({ id: 'b', company: 'Figma', title: 'Frontend Intern', locations: ['SF'], remote: true }),
      job({
        id: 'c',
        company: 'Palantir',
        title: 'SWE Intern',
        locations: ['Denver, CO'],
        sponsorship: 'U.S. Citizenship is Required',
      }),
      job({
        id: 'd',
        company: 'Datadog',
        title: 'Platform Intern',
        locations: ['NYC'],
        sponsorship: 'Does Not Offer Sponsorship',
        firstSeenAt: '2026-09-25T00:00:00.000Z',
      }),
    ],
    { a: 'saved', b: 'applied' },
    Date.parse('2026-09-10T00:00:00Z'),
  );

  it('returns everything with no filters', () => {
    expect(filterJobs(rows, f())).toHaveLength(4);
  });

  it('searches company, title and location together', () => {
    expect(filterJobs(rows, f({ query: 'stripe' })).map((r) => r.id)).toEqual(['a']);
    expect(filterJobs(rows, f({ query: 'frontend' })).map((r) => r.id)).toEqual(['b']);
    expect(filterJobs(rows, f({ query: 'nyc' })).map((r) => r.id)).toEqual(['a', 'd']);
  });

  it('is case-insensitive and ignores surrounding whitespace', () => {
    expect(filterJobs(rows, f({ query: '  FIGMA  ' })).map((r) => r.id)).toEqual(['b']);
  });

  it('searches skills as well, so you can find roles by technology', () => {
    const withSkills = decorateJobs(
      [
        job({ id: 'k8s', company: 'Acme', title: 'Backend Intern', skills: ['Kubernetes', 'Go'] }),
        job({ id: 'web', company: 'Beta', title: 'Frontend Intern', skills: ['React'] }),
        job({ id: 'soft', company: 'Gamma', title: 'Intern', softSkills: ['Mentorship'] }),
      ],
      {},
      0,
    );
    expect(filterJobs(withSkills, f({ query: 'kubernetes' })).map((r) => r.id)).toEqual(['k8s']);
    expect(filterJobs(withSkills, f({ query: 'react' })).map((r) => r.id)).toEqual(['web']);
    expect(filterJobs(withSkills, f({ query: 'mentorship' })).map((r) => r.id)).toEqual(['soft']);
  });

  it('filters by location as OR across selections', () => {
    expect(filterJobs(rows, f({ locations: ['NYC', 'SF'] })).map((r) => r.id)).toEqual([
      'a',
      'b',
      'd',
    ]);
  });

  it('filters remote only', () => {
    expect(filterJobs(rows, f({ remoteOnly: true })).map((r) => r.id)).toEqual(['b']);
  });

  it('hides roles that will not sponsor or require citizenship', () => {
    expect(filterJobs(rows, f({ hideNoSponsorship: true })).map((r) => r.id)).toEqual(['a', 'b']);
  });

  it('filters by tracker state', () => {
    expect(filterJobs(rows, f({ track: 'saved' })).map((r) => r.id)).toEqual(['a']);
    expect(filterJobs(rows, f({ track: 'applied' })).map((r) => r.id)).toEqual(['b']);
    expect(filterJobs(rows, f({ track: 'untracked' })).map((r) => r.id)).toEqual(['c', 'd']);
  });

  it('combines filters as AND', () => {
    expect(
      filterJobs(rows, f({ locations: ['NYC'], hideNoSponsorship: true })).map((r) => r.id),
    ).toEqual(['a']);
    // filters that contradict each other should just give back nothing, not blow up
    expect(filterJobs(rows, f({ remoteOnly: true, locations: ['NYC'] }))).toHaveLength(0);
  });
});

describe('locationOptions', () => {
  it('counts locations and orders by frequency then name', () => {
    const opts = locationOptions([
      job({ locations: ['NYC', 'SF'] }),
      job({ locations: ['NYC'] }),
      job({ locations: ['Austin, TX'] }),
    ]);
    expect(opts[0]).toEqual({ label: 'NYC', count: 2 });
    expect(opts.map((o) => o.label)).toEqual(['NYC', 'Austin, TX', 'SF']);
  });
});
