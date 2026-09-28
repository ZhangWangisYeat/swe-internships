import { afterEach, describe, expect, it, vi } from 'vitest';
import { ashbyAdapter } from '../src/verify/ashby.js';
import { __test as genericTest, extractIdentifier, genericAdapter, stillOnPosting } from '../src/verify/generic.js';
import { greenhouseAdapter } from '../src/verify/greenhouse.js';
import { applyStrikes, pickAdapter, tierOf } from '../src/verify/index.js';
import { leverAdapter } from '../src/verify/lever.js';
import type { JobRef } from '../src/verify/types.js';
import { cxsUrl, workdayAdapter } from '../src/verify/workday.js';
import type { PersistedState, VerifyVerdict } from '../src/types.js';

function ref(url: string, id = 'j1'): JobRef {
  return { id, url, title: 'Software Engineer Intern', company: 'Acme' };
}

// fake fetch so the tests don't actually hit the internet
function stubFetch(handler: (url: string) => { status?: number; body?: unknown; finalUrl?: string }) {
  vi.stubGlobal('fetch', async (input: string | URL) => {
    const url = String(input);
    const { status = 200, body = {}, finalUrl = url } = handler(url);
    const text = typeof body === 'string' ? body : JSON.stringify(body);
    return {
      ok: status >= 200 && status < 300,
      status,
      url: finalUrl,
      text: async () => text,
    } as unknown as Response;
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('adapter routing', () => {
  it('routes each host to the right adapter and tier', () => {
    const cases: Array<[string, string, string]> = [
      ['https://job-boards.greenhouse.io/cresta/jobs/5106468008', 'greenhouse', 'T1'],
      ['https://boards.greenhouse.io/acme/jobs/123456', 'greenhouse', 'T1'],
      ['https://jobs.ashbyhq.com/cohere/8c035d3d-1111-2222-3333-444455556666', 'ashby', 'T1'],
      ['https://jobs.lever.co/multiplylabs/acca98ab-c206-4f71-b7a5-6977e4828586', 'lever', 'T1'],
      ['https://jobs.smartrecruiters.com/Acme/744000012345678', 'smartrecruiters', 'T1'],
      ['https://salesforce.wd12.myworkdayjobs.com/x/job/y/z_JR1', 'workday', 'T2'],
      ['https://www.tesla.com/careers/search/job/12345', 'generic', 'T3'],
      ['https://lifeattiktok.com/search/7599841401208031541', 'generic', 'T3'],
    ];
    for (const [url, name, tier] of cases) {
      expect(pickAdapter(url).name, url).toBe(name);
      expect(tierOf(url), url).toBe(tier);
    }
  });

  it('falls back to generic for an unparseable URL', () => {
    expect(pickAdapter('not a url').name).toBe('generic');
  });
});

describe('greenhouse adapter', () => {
  const url = 'https://job-boards.greenhouse.io/cresta/jobs/5106468008';

  it('confirms open and takes first_published as the true open date', async () => {
    stubFetch(() => ({
      body: {
        jobs: [
          {
            id: 5106468008,
            title: 'Forward Deployed Engineering Intern (AI Agent)',
            absolute_url: url,
            first_published: '2026-02-02T21:05:19-05:00',
            application_deadline: null,
          },
        ],
        meta: { total: 1 },
      },
    }));

    const out = await greenhouseAdapter.verifyBoard!('cresta', [ref(url)]);
    expect(out.get('j1')?.status).toBe('open');
    expect(out.get('j1')?.publishedAt).toBe('2026-02-02T21:05:19-05:00');
  });

  it('treats absence from the live board as closed', async () => {
    // a real one i ran into: klaviyocampus job 7599114003 is gone, but loading its
    // page still gives you a 200 because it redirects to their job list
    stubFetch(() => ({ body: { jobs: [{ id: 999, title: 'Other' }] } }));
    const gone = 'https://job-boards.greenhouse.io/klaviyocampus/jobs/7599114003';
    const out = await greenhouseAdapter.verifyBoard!('klaviyocampus', [ref(gone)]);
    expect(out.get('j1')?.status).toBe('closed');
  });

  it('closes a listed job whose application_deadline has passed', async () => {
    stubFetch(() => ({
      body: {
        jobs: [{ id: 5106468008, application_deadline: '2026-01-01T00:00:00Z' }],
      },
    }));
    const out = await greenhouseAdapter.verifyBoard!('cresta', [ref(url)]);
    expect(out.get('j1')?.status).toBe('closed');
  });

  it('closes every row when the board itself 404s', async () => {
    stubFetch(() => ({ status: 404, body: {} }));
    const out = await greenhouseAdapter.verifyBoard!('dead-board', [ref(url)]);
    expect(out.get('j1')?.status).toBe('closed');
  });

  it('returns unverified — never closed — on a server error', async () => {
    // if a 500 counted as closed then one outage on their end wipes the whole list
    stubFetch(() => ({ status: 503, body: {} }));
    const out = await greenhouseAdapter.verifyBoard!('cresta', [ref(url)]);
    expect(out.get('j1')?.status).toBe('unverified');
  });
});

describe('ashby adapter', () => {
  const id = '8c035d3d-1111-2222-3333-444455556666';
  const url = `https://jobs.ashbyhq.com/cohere/${id}/application`;

  it('confirms open with publishedAt', async () => {
    stubFetch(() => ({
      body: { jobs: [{ id, title: 'SWE Intern', isListed: true, publishedAt: '2026-05-01T00:00:00Z' }] },
    }));
    const out = await ashbyAdapter.verifyBoard!('cohere', [ref(url)]);
    expect(out.get('j1')?.status).toBe('open');
    expect(out.get('j1')?.publishedAt).toBe('2026-05-01T00:00:00Z');
  });

  it('treats isListed=false as closed', async () => {
    stubFetch(() => ({ body: { jobs: [{ id, isListed: false }] } }));
    const out = await ashbyAdapter.verifyBoard!('cohere', [ref(url)]);
    expect(out.get('j1')?.status).toBe('closed');
  });

  it('treats absence as closed', async () => {
    stubFetch(() => ({ body: { jobs: [] } }));
    const out = await ashbyAdapter.verifyBoard!('cohere', [ref(url)]);
    expect(out.get('j1')?.status).toBe('closed');
  });
});

describe('lever adapter', () => {
  // based on something i actually found: the source list had these multiplylabs
  // roles down as active, but lever only lists 6 postings and none of them are
  // internships anymore
  it('closes a row upstream still marks active when Lever no longer lists it', async () => {
    stubFetch(() => ({
      body: [
        { id: 'aaaaaaaa-0000-0000-0000-000000000000', text: 'Robotics Engineer' },
        { id: 'bbbbbbbb-0000-0000-0000-000000000000', text: 'Scientist II' },
      ],
    }));
    const url = 'https://jobs.lever.co/multiplylabs/acca98ab-c206-4f71-b7a5-6977e4828586';
    const out = await leverAdapter.verifyBoard!('multiplylabs', [ref(url)]);
    expect(out.get('j1')?.status).toBe('closed');
  });

  it('confirms open and converts createdAt to ISO', async () => {
    const id = 'acca98ab-c206-4f71-b7a5-6977e4828586';
    stubFetch(() => ({ body: [{ id, text: 'SWE Intern', createdAt: 1_760_000_000_000 }] }));
    const out = await leverAdapter.verifyBoard!('multiplylabs', [
      ref(`https://jobs.lever.co/multiplylabs/${id}`),
    ]);
    expect(out.get('j1')?.status).toBe('open');
    expect(out.get('j1')?.publishedAt).toBe(new Date(1_760_000_000_000).toISOString());
  });
});

describe('workday cxsUrl', () => {
  it('derives the CXS endpoint from a public posting URL', () => {
    expect(
      cxsUrl(
        'https://salesforce.wd12.myworkdayjobs.com/Futureforce_Internships/job/California---San-Francisco/Summer-2027-Intern---Software-Engineer_JR340771',
      ),
    ).toBe(
      'https://salesforce.wd12.myworkdayjobs.com/wday/cxs/salesforce/Futureforce_Internships/job/California---San-Francisco/Summer-2027-Intern---Software-Engineer_JR340771',
    );
  });

  it('strips an optional locale segment', () => {
    expect(cxsUrl('https://bah.wd1.myworkdayjobs.com/en-US/BAH_Jobs/job/Remote/SWE-Intern_R123')).toBe(
      'https://bah.wd1.myworkdayjobs.com/wday/cxs/bah/BAH_Jobs/job/Remote/SWE-Intern_R123',
    );
  });

  it('returns undefined for URLs it cannot map', () => {
    expect(cxsUrl('https://salesforce.wd12.myworkdayjobs.com/Futureforce_Internships')).toBeUndefined();
    expect(cxsUrl('nonsense')).toBeUndefined();
  });
});

describe('workday adapter', () => {
  const url =
    'https://copart.wd12.myworkdayjobs.com/copart/job/Dallas-TX---Headquarters/Software-Engineering-Intern_JR109689';

  it('confirms open and uses startDate as the open date', async () => {
    stubFetch(() => ({
      body: {
        jobPostingInfo: {
          title: 'Software Engineering Intern',
          startDate: '2026-08-31',
          posted: true,
          canApply: true,
        },
      },
    }));
    const v = await workdayAdapter.verifyOne!(ref(url));
    expect(v.status).toBe('open');
    expect(v.publishedAt).toBe(new Date('2026-08-31').toISOString());
  });

  it('treats posted=false as closed', async () => {
    stubFetch(() => ({ body: { jobPostingInfo: { posted: false } } }));
    expect((await workdayAdapter.verifyOne!(ref(url))).status).toBe('closed');
  });

  it('treats canApply=false as closed', async () => {
    stubFetch(() => ({ body: { jobPostingInfo: { canApply: false } } }));
    expect((await workdayAdapter.verifyOne!(ref(url))).status).toBe('closed');
  });

  it('treats a 404 as closed and a 500 as unverified', async () => {
    stubFetch(() => ({ status: 404, body: {} }));
    expect((await workdayAdapter.verifyOne!(ref(url))).status).toBe('closed');
    vi.unstubAllGlobals();
    stubFetch(() => ({ status: 500, body: {} }));
    expect((await workdayAdapter.verifyOne!(ref(url))).status).toBe('unverified');
  });
});

describe('generic: identifier and redirect detection', () => {
  it('extracts identifiers', () => {
    expect(extractIdentifier(new URL('https://job-boards.greenhouse.io/x/jobs/7599114003'))).toBe(
      '7599114003',
    );
    expect(
      extractIdentifier(new URL('https://jobs.ashbyhq.com/x/3f1c261d-9b65-412b-9f17-34b8968bdd78')),
    ).toBe('3f1c261d-9b65-412b-9f17-34b8968bdd78');
    expect(extractIdentifier(new URL('https://careers.x.com/apply?jobId=98765'))).toBe('98765');
  });

  it('detects the real Greenhouse redirect-to-index case', () => {
    // 200 OK but we got bounced from the job to the company's job list, so it's gone
    const requested = new URL('https://job-boards.greenhouse.io/klaviyocampus/jobs/7599114003');
    expect(stillOnPosting(requested, 'https://job-boards.greenhouse.io/klaviyocampus')).toBe(false);
  });

  it('accepts a final URL that still carries the posting id', () => {
    const requested = new URL('https://job-boards.greenhouse.io/cresta/jobs/5106468008');
    expect(
      stillOnPosting(requested, 'https://job-boards.greenhouse.io/cresta/jobs/5106468008?utm=x'),
    ).toBe(true);
  });

  it('does not infer closure when there is no identifier to track', () => {
    const requested = new URL('https://careers.example.com/');
    expect(stillOnPosting(requested, 'https://careers.example.com/somewhere')).toBe(true);
  });
});

describe('generic adapter verdicts', () => {
  const url = 'https://careers.example.com/jobs/123456';

  it('reads a closure phrase as closed', async () => {
    stubFetch(() => ({ body: '<html><body>This job is no longer accepting applications.</body></html>' }));
    expect((await genericAdapter.verifyOne!(ref(url))).status).toBe('closed');
  });

  it('confirms open when reachable with no closure signal', async () => {
    stubFetch(() => ({ body: '<html><body><form>Apply now</form></body></html>' }));
    expect((await genericAdapter.verifyOne!(ref(url))).status).toBe('open');
  });

  it('returns unverified on 403 (bot-blocked), never closed', async () => {
    stubFetch(() => ({ status: 403, body: '' }));
    expect((await genericAdapter.verifyOne!(ref(url))).status).toBe('unverified');
  });

  it('does not fire on innocuous text containing the word closed', async () => {
    stubFetch(() => ({
      body: '<html><body>We closed our Series B. Closed captions available. Apply today!</body></html>',
    }));
    expect((await genericAdapter.verifyOne!(ref(url))).status).toBe('open');
  });

  it('has no catch-all closure pattern', () => {
    // stops someone (me, later) adding something like /closed/i and deleting a
    // load of live roles by accident
    for (const re of genericTest.CLOSED_PHRASES) {
      expect(re.test('closed'), String(re)).toBe(false);
    }
  });
});

describe('applyStrikes: two-strike rule', () => {
  function state(): PersistedState {
    return { version: 1, jobs: {} };
  }
  const NOW = new Date('2026-09-26T00:00:00Z');
  const jobs = [ref('https://careers.example.com/jobs/1', 'a')];
  const closedVerdict = new Map<string, VerifyVerdict>([['a', { status: 'closed', by: 'generic' }]]);

  it('holds a row on its first closed verdict', () => {
    const s = state();
    const { effective, removedIds } = applyStrikes(jobs, closedVerdict, s, NOW);
    expect(removedIds).toEqual([]);
    expect(effective.get('a')?.status).toBe('unverified');
    expect(s.jobs.a?.strikes).toBe(1);
  });

  it('removes only after a second consecutive closed verdict', () => {
    const s = state();
    applyStrikes(jobs, closedVerdict, s, NOW);
    const second = applyStrikes(jobs, closedVerdict, s, NOW);
    expect(second.removedIds).toEqual(['a']);
    expect(s.jobs.a?.strikes).toBe(2);
  });

  it('resets strikes when a row comes back open', () => {
    const s = state();
    applyStrikes(jobs, closedVerdict, s, NOW);
    expect(s.jobs.a?.strikes).toBe(1);
    applyStrikes(jobs, new Map([['a', { status: 'open', by: 'generic' }]]), s, NOW);
    expect(s.jobs.a?.strikes).toBe(0);
  });

  it('preserves firstSeenAt across runs', () => {
    const s = state();
    applyStrikes(jobs, new Map([['a', { status: 'open', by: 'generic' }]]), s, NOW);
    const first = s.jobs.a?.firstSeenAt;
    applyStrikes(jobs, new Map([['a', { status: 'open', by: 'generic' }]]), s, new Date('2026-10-01'));
    expect(s.jobs.a?.firstSeenAt).toBe(first);
  });
});
