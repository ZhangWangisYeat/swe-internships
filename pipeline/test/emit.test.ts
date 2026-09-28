import { describe, expect, it } from 'vitest';
import { checkSanity } from '../src/emit.js';
import { DICTIONARY_VERSION } from '../src/keywords/dictionary.js';
import { normalizeApplyUrl, resolveDateOpened, toJob } from '../src/transform.js';
import type { Job, PersistedState, RawListing } from '../src/types.js';

function job(overrides: Partial<Job> = {}): Job {
  return {
    id: 'j',
    company: 'Acme',
    title: 'SWE Intern',
    locations: ['SF'],
    remote: false,
    dateOpened: '2026-09-01T00:00:00.000Z',
    dateOpenedSource: 'list',
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

describe('checkSanity', () => {
  it('passes when there is no meaningful baseline', () => {
    expect(checkSanity(undefined, []).ok).toBe(true);
    expect(checkSanity(Array.from({ length: 10 }, () => job()), []).ok).toBe(true);
  });

  it('passes on a normal run-over-run change', () => {
    const prev = Array.from({ length: 900 }, () => job());
    const next = Array.from({ length: 870 }, () => job());
    expect(checkSanity(prev, next).ok).toBe(true);
  });

  it('blocks a catastrophic drop', () => {
    // this is what turns "something broke upstream" into "the site is a bit out of
    // date" rather than "the site is empty"
    const prev = Array.from({ length: 900 }, () => job());
    const next = Array.from({ length: 100 }, () => job());
    const result = checkSanity(prev, next);
    expect(result.ok).toBe(false);
    expect(result.message).toContain('Refusing to write');
  });

  it('blocks an emptied list outright', () => {
    expect(checkSanity(Array.from({ length: 900 }, () => job()), []).ok).toBe(false);
  });

  it('allows growth', () => {
    const prev = Array.from({ length: 100 }, () => job());
    const next = Array.from({ length: 5000 }, () => job());
    expect(checkSanity(prev, next).ok).toBe(true);
  });
});

describe('resolveDateOpened', () => {
  const listed = (iso: string) => Date.parse(iso);

  it('prefers the ATS date when it is close to the listing date', () => {
    // normal situation, the source list is just a bit behind the real posting
    const r = resolveDateOpened(listed('2026-09-01T00:00:00Z'), '2026-08-15T00:00:00.000Z');
    expect(r.dateOpened).toBe('2026-08-15T00:00:00.000Z');
    expect(r.dateOpenedSource).toBe('ats');
    expect(r.originalPostedAt).toBeUndefined();
  });

  it('prefers a newer ATS date than the listing date', () => {
    const r = resolveDateOpened(listed('2026-06-01T00:00:00Z'), '2026-09-01T00:00:00.000Z');
    expect(r.dateOpened).toBe('2026-09-01T00:00:00.000Z');
    expect(r.dateOpenedSource).toBe('ats');
  });

  it('flips to the listing date for an evergreen req, keeping the origin', () => {
    // the actual palantir case. lever says created 2021-07-01, the source list added
    // it 2026-06-29, and it's currently tagged Summer 2028. showing 2021 both looked
    // like a bug and pushed a live role to the very bottom of the date sort.
    const r = resolveDateOpened(listed('2026-06-29T00:00:00Z'), '2021-07-01T00:00:00.000Z');
    expect(r.dateOpened).toBe('2026-06-29T00:00:00.000Z');
    expect(r.dateOpenedSource).toBe('list');
    expect(r.originalPostedAt).toBe('2021-07-01T00:00:00.000Z');
  });

  it('handles the oldest real case (SmartRecruiters releasedDate 2014)', () => {
    const r = resolveDateOpened(listed('2026-08-18T00:00:00Z'), '2014-03-13T01:52:56.000Z');
    expect(r.dateOpened.slice(0, 10)).toBe('2026-08-18');
    expect(r.originalPostedAt).toBe('2014-03-13T01:52:56.000Z');
  });

  it('does not flip a gap just under the threshold', () => {
    // about 364 days apart, which could genuinely be the real posting date, so keep it
    const r = resolveDateOpened(listed('2026-07-31T00:00:00Z'), '2025-08-01T00:00:00.000Z');
    expect(r.dateOpenedSource).toBe('ats');
    expect(r.originalPostedAt).toBeUndefined();
  });

  it('falls back to the listing date when there is no ATS date', () => {
    const r = resolveDateOpened(listed('2026-09-01T00:00:00Z'), undefined);
    expect(r.dateOpened).toBe('2026-09-01T00:00:00.000Z');
    expect(r.dateOpenedSource).toBe('list');
    expect(r.originalPostedAt).toBeUndefined();
  });

  it('ignores an unparseable ATS date', () => {
    const r = resolveDateOpened(listed('2026-09-01T00:00:00Z'), 'not-a-date');
    expect(r.dateOpenedSource).toBe('list');
    expect(r.originalPostedAt).toBeUndefined();
  });
});

describe('normalizeApplyUrl', () => {
  it('upgrades http to https', () => {
    // there really are listings with plain http:// links to forms where you upload
    // your resume, which isn't ok
    expect(normalizeApplyUrl('http://jobs.ashbyhq.com/bree/abc/application')).toBe(
      'https://jobs.ashbyhq.com/bree/abc/application',
    );
    expect(normalizeApplyUrl('http://getfiber.ai/careers?gh_jid=5225258007')).toBe(
      'https://getfiber.ai/careers?gh_jid=5225258007',
    );
  });

  it('leaves https URLs untouched apart from embed', () => {
    const url = 'https://job-boards.greenhouse.io/cresta/jobs/5106468008';
    expect(normalizeApplyUrl(url)).toBe(url);
  });

  it('strips embed=true so the full posting loads', () => {
    expect(normalizeApplyUrl('https://jobs.ashbyhq.com/bree/abc/application?embed=true')).toBe(
      'https://jobs.ashbyhq.com/bree/abc/application',
    );
  });

  it('preserves other query parameters', () => {
    expect(normalizeApplyUrl('https://x.com/careers?gh_jid=1&utm_source=list')).toBe(
      'https://x.com/careers?gh_jid=1&utm_source=list',
    );
  });

  it('returns unparseable input unchanged rather than throwing', () => {
    expect(normalizeApplyUrl('not a url')).toBe('not a url');
  });
});

describe('toJob', () => {
  const listing: RawListing = {
    id: 'x1',
    company_name: 'Acme',
    company_url: 'https://simplify.jobs/c/Acme',
    title: 'Software Engineer Intern',
    category: 'Software',
    degrees: ["Bachelor's"],
    terms: ['Summer 2027'],
    locations: ['Remote in USA'],
    url: 'https://example.com/jobs/1',
    active: true,
    is_visible: true,
    sponsorship: 'Does Not Offer Sponsorship',
    source: 'Simplify',
    date_posted: Math.floor(Date.UTC(2026, 5, 1) / 1000),
    date_updated: Math.floor(Date.UTC(2026, 5, 1) / 1000),
  };
  const NOW = new Date('2026-09-26T12:00:00Z');
  const emptyState: PersistedState = { version: 1, jobs: {} };

  it('prefers the ATS publish date over the list date', () => {
    const result = toJob(
      listing,
      ['undergrad'],
      'explicit',
      { status: 'open', by: 'greenhouse', publishedAt: '2026-08-15T00:00:00.000Z' },
      emptyState,
      NOW,
    );
    expect(result.dateOpened).toBe('2026-08-15T00:00:00.000Z');
    expect(result.dateOpenedSource).toBe('ats');
  });

  it('falls back to the list date when no ATS date is available', () => {
    const result = toJob(listing, ['undergrad'], 'explicit', { status: 'open', by: 'generic' }, emptyState, NOW);
    expect(result.dateOpened).toBe(new Date(listing.date_posted * 1000).toISOString());
    expect(result.dateOpenedSource).toBe('list');
  });

  it('maps an unverified verdict to status unverified', () => {
    const result = toJob(listing, ['undergrad'], 'explicit', { status: 'unverified', by: 'generic' }, emptyState, NOW);
    expect(result.status).toBe('unverified');
  });

  it('marks status unverified when no verdict exists at all', () => {
    expect(toJob(listing, ['undergrad'], 'explicit', undefined, emptyState, NOW).status).toBe('unverified');
  });

  it('preserves an existing firstSeenAt', () => {
    const state: PersistedState = {
      version: 1,
      jobs: { x1: { firstSeenAt: '2026-01-01T00:00:00.000Z', strikes: 0 } },
    };
    expect(toJob(listing, ['undergrad'], 'explicit', undefined, state, NOW).firstSeenAt).toBe(
      '2026-01-01T00:00:00.000Z',
    );
  });

  it('reuses cached keywords when there is no description this run', () => {
    // a cached run never re-downloads the posting, so without this the skills would
    // empty themselves out every second run
    const state: PersistedState = {
      version: 1,
      jobs: {
        x1: {
          firstSeenAt: '2026-01-01T00:00:00.000Z',
          strikes: 0,
          skills: ['Python', 'React'],
          softSkills: ['Collaboration'],
          skillsVersion: DICTIONARY_VERSION,
        },
      },
    };
    const result = toJob(listing, ['undergrad'], 'explicit', { status: 'open', by: 'cache' }, state, NOW);
    expect(result.skills).toEqual(['Python', 'React']);
    expect(result.softSkills).toEqual(['Collaboration']);
  });

  it('throws away cached keywords from an older dictionary version', () => {
    // otherwise a bad extraction stays cached forever, which is exactly what happened
    // with roles tagged "Spring" from the season bug after the pattern was fixed
    const state: PersistedState = {
      version: 1,
      jobs: {
        x1: {
          firstSeenAt: '2026-01-01T00:00:00.000Z',
          strikes: 0,
          skills: ['Spring'],
          softSkills: [],
          skillsVersion: DICTIONARY_VERSION - 1,
        },
      },
    };
    const result = toJob(listing, ['undergrad'], 'explicit', { status: 'open', by: 'cache' }, state, NOW);
    expect(result.skills).toEqual([]);
  });

  it('prefers a fresh extraction over the cached one', () => {
    const state: PersistedState = {
      version: 1,
      jobs: {
        x1: {
          firstSeenAt: '2026-01-01T00:00:00.000Z',
          strikes: 0,
          skills: ['Fortran'],
          softSkills: [],
          skillsVersion: DICTIONARY_VERSION,
        },
      },
    };
    const result = toJob(
      listing,
      ['undergrad'],
      'explicit',
      {
        status: 'open',
        by: 'greenhouse',
        description:
          '<h3>Requirements</h3><ul><li>Strong Python and Kubernetes experience</li></ul>',
      },
      state,
      NOW,
    );
    expect(result.skills).toContain('Python');
    expect(result.skills).not.toContain('Fortran');
  });

  it('keeps cached keywords when a fresh page yields nothing', () => {
    // some career sites are javascript shells with no description in the HTML. that
    // shouldn't wipe good keywords we already had.
    const state: PersistedState = {
      version: 1,
      jobs: {
        x1: {
          firstSeenAt: '2026-01-01T00:00:00.000Z',
          strikes: 0,
          skills: ['Python'],
          softSkills: [],
          skillsVersion: DICTIONARY_VERSION,
        },
      },
    };
    const result = toJob(
      listing,
      ['undergrad'],
      'explicit',
      { status: 'open', by: 'generic', description: '<div id="root"></div>' },
      state,
      NOW,
    );
    expect(result.skills).toEqual(['Python']);
  });

  it('carries sponsorship through and detects remote', () => {
    const result = toJob(listing, ['undergrad'], 'explicit', undefined, emptyState, NOW);
    expect(result.sponsorship).toBe('Does Not Offer Sponsorship');
    expect(result.remote).toBe(true);
  });

  it('collapses an unknown sponsorship value to Other', () => {
    const result = toJob(
      { ...listing, sponsorship: 'Something New Upstream' },
      ['undergrad'],
      'explicit',
      undefined,
      emptyState,
      NOW,
    );
    expect(result.sponsorship).toBe('Other');
  });
});
