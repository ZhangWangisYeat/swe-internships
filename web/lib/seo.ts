import type { Metadata } from 'next';
import { levelCounts, season } from './buildData';
import { levelConfig } from './levels';
import { REFRESH_HOURS, SITE_NAME } from './site';
import type { DegreeLevel } from './types';

// who each page is for, in the words people actually type into google
const AUDIENCE: Record<DegreeLevel, { title: string; description: string }> = {
  undergrad: {
    title: 'Software Engineering Internships for Undergrads',
    description: 'for undergrads',
  },
  masters: {
    title: "Software Engineering Internships for Master's Students",
    description: "for Master's and MBA students",
  },
  phd: {
    title: 'PhD Software Engineering & Research Internships',
    description: 'for PhD students',
  },
};

// title and description for one level's page. the count and the season get baked
// in at build time, and since the site rebuilds after every refresh they stay
// current. a real number in the search snippet ("1,073 open") is a lot more
// clickable than a vague "find internships".
export function levelMetadata(level: DegreeLevel): Metadata {
  const { href } = levelConfig(level);
  const audience = AUDIENCE[level];
  const s = season();
  const count = levelCounts()[level];

  const title = s ? `${s} ${audience.title}` : audience.title;
  // kept under ~160 characters, past that google cuts it off with "...". it says
  // the list updates every few hours and not that every role gets checked that often,
  // because a role that's already confirmed open is only rechecked every 12.
  const description =
    count > 0
      ? `${count.toLocaleString('en-US')} open SWE internships ${audience.description}, each ` +
        `checked against the company's own job board so closed roles drop off. Updated ` +
        `every ${REFRESH_HOURS} hours.`
      : `Software engineering internships ${audience.description}, each checked against the ` +
        `company's own job board so closed roles drop off. Updated every ${REFRESH_HOURS} hours.`;

  return {
    title,
    description,
    // without a canonical, /masters and /masters/ (and the preview
    // urls cloudflare makes for every deploy) can all count as separate copies
    alternates: { canonical: href },
    openGraph: {
      type: 'website',
      url: href,
      siteName: SITE_NAME,
      title,
      description,
      locale: 'en_US',
    },
    twitter: { card: 'summary_large_image', title, description },
  };
}
