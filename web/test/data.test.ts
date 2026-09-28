import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { JobsPayload, Sponsorship } from '@/lib/types';

// these run against the real data file rather than made up test data.
//
// the other tests check my logic is right on its own. this checks the data i'm
// actually shipping is what the UI expects, which is the thing most likely to catch
// the source list quietly changing format on me.
const JOBS_PATH = path.resolve(import.meta.dirname, '..', '..', 'data', 'jobs.json');
const exists = fs.existsSync(JOBS_PATH);

const SPONSORSHIPS = new Set<Sponsorship>([
  'Other',
  'Does Not Offer Sponsorship',
  'U.S. Citizenship is Required',
  'Offers Sponsorship',
]);

const GRAD_ONLY = /\b(ph\.?\s?d|doctoral|post-?doc|m\.?b\.?a)\b/i;

describe.skipIf(!exists)('data/jobs.json contract', () => {
  const payload = exists
    ? (JSON.parse(fs.readFileSync(JOBS_PATH, 'utf8')) as JobsPayload)
    : ({ generatedAt: '', count: 0, jobs: [] } as JobsPayload);

  it('has a coherent envelope', () => {
    expect(Number.isNaN(Date.parse(payload.generatedAt))).toBe(false);
    expect(payload.count).toBe(payload.jobs.length);
    expect(payload.jobs.length).toBeGreaterThan(0);
  });

  it('has no duplicate ids', () => {
    const ids = new Set(payload.jobs.map((j) => j.id));
    expect(ids.size).toBe(payload.jobs.length);
  });

  it('populates every column the table renders', () => {
    for (const job of payload.jobs) {
      expect(job.company.trim(), job.id).not.toBe('');
      expect(job.title.trim(), job.id).not.toBe('');
      expect(Array.isArray(job.locations), job.id).toBe(true);
      expect(Number.isNaN(Date.parse(job.dateOpened)), `${job.id} dateOpened`).toBe(false);
      expect(job.url.startsWith('https://'), `${job.id} url: ${job.url}`).toBe(true);
    }
  });

  it('never ships a row marked closed', () => {
    // closed roles should be gone entirely, not shown greyed out
    for (const job of payload.jobs) {
      expect(['open', 'unverified'], job.id).toContain(job.status);
    }
  });

  it('gives every role at least one level to live on', () => {
    // a row with no levels would be invisible on all three pages
    for (const job of payload.jobs) {
      expect(Array.isArray(job.levels), job.id).toBe(true);
      expect(job.levels.length, `${job.id} has no level`).toBeGreaterThan(0);
      for (const level of job.levels) {
        expect(['undergrad', 'masters', 'phd'], job.id).toContain(level);
      }
    }
  });

  it('puts each role on the levels its degree data actually allows', () => {
    for (const job of payload.jobs) {
      if (job.degrees.length === 0) continue; // inferred rows are checked below
      const ug = job.degrees.includes("Bachelor's") || job.degrees.includes("Associate's");
      const ms = job.degrees.includes("Master's") || job.degrees.includes('MBA');
      const phd = job.degrees.includes('PhD');
      const why = `${job.id} (${job.title}) degrees=${job.degrees.join('/')} levels=${job.levels.join('/')}`;
      expect(job.levels.includes('undergrad'), why).toBe(ug);
      expect(job.levels.includes('masters'), why).toBe(ms);
      expect(job.levels.includes('phd'), why).toBe(phd);
    }
  });

  it('does not put an obviously grad-only title on the undergrad page', () => {
    // the inferred rows are the risky ones, since we guessed from the title
    for (const job of payload.jobs) {
      if (job.degrees.length > 0) continue;
      expect(job.degreeConfidence, job.id).toBe('inferred');
      if (job.levels.includes('undergrad')) {
        expect(GRAD_ONLY.test(job.title), `${job.id} (${job.title})`).toBe(false);
      }
    }
  });

  it('has real content on all three pages', () => {
    const counts = {
      undergrad: payload.jobs.filter((j) => j.levels.includes('undergrad')).length,
      masters: payload.jobs.filter((j) => j.levels.includes('masters')).length,
      phd: payload.jobs.filter((j) => j.levels.includes('phd')).length,
    };
    for (const [level, n] of Object.entries(counts)) {
      expect(n, `${level} page is empty`).toBeGreaterThan(0);
    }
    // undergrad should be the biggest by a wide margin, that's the shape of the market
    expect(counts.undergrad).toBeGreaterThan(counts.masters);
    expect(counts.masters).toBeGreaterThan(counts.phd);
  });

  it('uses only known sponsorship values', () => {
    for (const job of payload.jobs) {
      expect(SPONSORSHIPS.has(job.sponsorship), `${job.id}: ${job.sponsorship}`).toBe(true);
    }
  });

  it('keeps remote flag consistent with locations', () => {
    for (const job of payload.jobs) {
      const looksRemote = job.locations.some((l) => /\bremote\b/i.test(l));
      expect(job.remote, `${job.id}: ${job.locations.join(', ')}`).toBe(looksRemote);
    }
  });

  it('labels dateOpenedSource correctly', () => {
    for (const job of payload.jobs) {
      expect(['ats', 'list'], job.id).toContain(job.dateOpenedSource);
    }
  });

  it('never displays an implausibly old Date Opened', () => {
    // some companies' job boards report creation dates as far back as 2014 for reqs
    // they never closed. those shouldn't reach the table, they look like a bug and
    // they sink to the bottom of the date sort where nobody sees them.
    const generated = Date.parse(payload.generatedAt);
    const twoYears = 730 * 86_400_000;
    for (const job of payload.jobs) {
      const age = generated - Date.parse(job.dateOpened);
      expect(age, `${job.id} (${job.company} — ${job.title}) shows ${job.dateOpened}`).toBeLessThan(
        twoYears,
      );
    }
  });

  it('keeps the original requisition date whenever it overrode one', () => {
    for (const job of payload.jobs) {
      if (!job.originalPostedAt) continue;
      // we only save the original date when we decided to show the listing date instead
      expect(job.dateOpenedSource, job.id).toBe('list');
      expect(
        Date.parse(job.originalPostedAt),
        `${job.id} origin should predate the displayed date`,
      ).toBeLessThan(Date.parse(job.dateOpened));
    }
  });

  it('always has skill arrays, even when empty', () => {
    // the table reads these unconditionally, so a missing array would crash a row
    for (const job of payload.jobs) {
      expect(Array.isArray(job.skills), job.id).toBe(true);
      expect(Array.isArray(job.softSkills), job.id).toBe(true);
    }
  });

  it('keeps keyword lists short enough to paste onto a resume', () => {
    for (const job of payload.jobs) {
      expect(job.skills.length, `${job.id} has too many hard skills`).toBeLessThanOrEqual(9);
      expect(job.softSkills.length, `${job.id} has too many soft skills`).toBeLessThanOrEqual(3);
    }
  });

  it('has no blank or duplicated keywords', () => {
    for (const job of payload.jobs) {
      const all = [...job.skills, ...job.softSkills];
      for (const skill of all) {
        expect(skill.trim(), `${job.id} has a blank keyword`).not.toBe('');
      }
      expect(new Set(all).size, `${job.id} repeats a keyword`).toBe(all.length);
    }
  });

  it('extracted keywords for a decent share of roles', () => {
    // not every posting is readable (some career sites are javascript shells), but if
    // this collapses it means description capture broke somewhere
    const withSkills = payload.jobs.filter((j) => j.skills.length > 0).length;
    expect(withSkills / payload.jobs.length).toBeGreaterThan(0.5);
  });

  it('does not read the season "Spring" as the Java framework', () => {
    // regression guard for a real bug: 56 roles were tagged Spring with no Java in
    // them at all, because every posting mentions "Spring 2027" somewhere
    const springNoJava = payload.jobs.filter(
      (j) => j.skills.includes('Spring') && !j.skills.includes('Java'),
    );
    expect(springNoJava.length, 'Spring is matching the season again').toBeLessThan(10);
  });

  it('confirms a strong majority of rows as open', () => {
    // if verification quietly stops working this number tanks, so it's worth asserting
    const open = payload.jobs.filter((j) => j.status === 'open').length;
    expect(open / payload.jobs.length).toBeGreaterThan(0.6);
  });
});
