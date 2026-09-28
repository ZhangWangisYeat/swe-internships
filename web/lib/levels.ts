import type { DegreeLevel } from './types';

export interface LevelConfig {
  id: DegreeLevel;
  // url path. undergrad is the root since that's the page i actually use.
  href: string;
  // short label for the nav tabs
  label: string;
  // the tracked-out label above the heading
  eyebrow: string;
  heading: string;
  blurb: string;
}

export const LEVELS: LevelConfig[] = [
  {
    id: 'undergrad',
    href: '/',
    label: 'Undergrad',
    eyebrow: 'Open to undergraduates',
    heading: 'Software Internships',
    blurb:
      "Roles a Bachelor's or Associate's student can apply to. Closed postings verified against employer job boards and removed.",
  },
  {
    id: 'masters',
    href: '/masters/',
    label: "Master's",
    eyebrow: "Open to master's students",
    heading: "Master's Internships",
    blurb:
      "Roles open to Master's or MBA students. Many also accept undergrads, so they appear on both pages.",
  },
  {
    id: 'phd',
    href: '/phd/',
    label: 'PhD',
    eyebrow: 'Open to PhD students',
    heading: 'PhD Internships',
    blurb:
      'Roles open to PhD candidates, including research-track internships. Often more research-heavy than the other two.',
  },
];

export function levelConfig(id: DegreeLevel): LevelConfig {
  const hit = LEVELS.find((l) => l.id === id);
  // LEVELS covers every DegreeLevel, so this is only here to keep types happy
  if (!hit) throw new Error(`no config for level ${id}`);
  return hit;
}
