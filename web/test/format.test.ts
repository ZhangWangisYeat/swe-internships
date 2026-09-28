import { describe, expect, it } from 'vitest';
import { formatLocations, relativeAge, relativeAgeLong } from '@/lib/format';

const NOW = Date.parse('2026-09-27T12:00:00Z');
const daysAgo = (n: number) => new Date(NOW - n * 86_400_000).toISOString();

describe('relativeAgeLong', () => {
  it('reads like english and starts with a capital', () => {
    expect(relativeAgeLong(daysAgo(0), NOW)).toBe('Today');
    expect(relativeAgeLong(daysAgo(1), NOW)).toBe('Yesterday');
    expect(relativeAgeLong(daysAgo(2), NOW)).toBe('2 days ago');
    expect(relativeAgeLong(daysAgo(29), NOW)).toBe('29 days ago');
  });

  it('switches to months and years, singular where it should be', () => {
    expect(relativeAgeLong(daysAgo(30), NOW)).toBe('1 month ago');
    expect(relativeAgeLong(daysAgo(90), NOW)).toBe('3 months ago');
    expect(relativeAgeLong(daysAgo(400), NOW)).toBe('1 year ago');
    expect(relativeAgeLong(daysAgo(800), NOW)).toBe('2 years ago');
  });

  it('treats a future timestamp as today rather than going negative', () => {
    expect(relativeAgeLong(new Date(NOW + 60_000).toISOString(), NOW)).toBe('Today');
  });

  it('gives back an empty string for junk so the header renders blank, not NaN', () => {
    expect(relativeAgeLong('not-a-date', NOW)).toBe('');
    expect(relativeAgeLong('', NOW)).toBe('');
  });
});

describe('relativeAge', () => {
  it('stays short for the table column', () => {
    // the narrow Date Opened column needs the compact form, so this one is unchanged
    expect(relativeAge(daysAgo(0), NOW)).toBe('today');
    expect(relativeAge(daysAgo(1), NOW)).toBe('1d');
    expect(relativeAge(daysAgo(5), NOW)).toBe('5d');
    expect(relativeAge(daysAgo(60), NOW)).toBe('2mo');
    expect(relativeAge(daysAgo(800), NOW)).toBe('2y');
  });
});

describe('formatLocations', () => {
  it('shows the first two and counts the rest', () => {
    const r = formatLocations(['NYC', 'SF', 'Austin, TX', 'Denver, CO']);
    expect(r.text).toBe('NYC · SF');
    expect(r.extra).toBe(2);
    expect(r.full).toBe('NYC, SF, Austin, TX, Denver, CO');
  });

  it('handles an empty list', () => {
    expect(formatLocations([]).text).toBe('Not specified');
  });
});
