// where the site lives and what it's called. set NEXT_PUBLIC_SITE_URL in the host's
// build settings to the real address (and change it there if we ever move to a
// custom domain). everything that needs an absolute url reads it from here: canonical
// links, the sitemap, link previews. if these point at the wrong host google treats
// the pages as copies of somewhere else and won't rank them.
export const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL ?? 'https://swe-internships.workers.dev'
).replace(/\/+$/, '');

export const SITE_NAME = 'SWE Internship Tracker';

// how often the scheduled job runs. this is shown on the page and in the
// descriptions, so if you change the cron in refresh.yml change this too.
export const REFRESH_HOURS = 6;
