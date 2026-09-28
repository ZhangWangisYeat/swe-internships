import { jobsForLevel } from '@/lib/buildData';
import { formatDate } from '@/lib/format';
import { levelConfig } from '@/lib/levels';
import type { DegreeLevel } from '@/lib/types';

interface Props {
  level: DegreeLevel;
}

// every role on this page as plain html, rendered at build time.
//
// the interactive table can't do this job: it's filled in by javascript after the
// page loads, and it only ever draws the ~20 rows on screen, so a search engine
// would see a loading skeleton and maybe 20 roles out of a thousand. this list is
// what google actually reads. it also works with javascript off, and ctrl+f finds
// anything in it.
//
// it starts collapsed so it doesn't get in the way of the real table. google
// still indexes what's inside a <details>, it counts collapsed content the same
// as visible content now that it indexes the mobile layout first.
//
// the styling is a few classes in globals.css (.role-index) and not tailwind
// utilities on each row, because it's ~1,000 rows and repeating the same long class
// strings on every one of them added a big chunk to the html for nothing.
export function RoleIndex({ level }: Props) {
  const jobs = [...jobsForLevel(level)].sort(
    (a, b) => a.company.localeCompare(b.company) || a.title.localeCompare(b.title),
  );
  if (jobs.length === 0) return null;

  const { label } = levelConfig(level);

  return (
    <section aria-labelledby="role-index-heading" className="border-t border-border-base pt-6">
      <span className="eyebrow">Plain list</span>
      <h2 id="role-index-heading" className="mt-2 text-3xl text-text">
        Every {label} role, A to Z
      </h2>

      <details className="role-index mt-4 rounded-[var(--radius)] border border-border-base bg-surface">
        <summary className="cursor-pointer px-4 py-3 text-sm text-text-muted hover:text-text">
          Show all {jobs.length.toLocaleString('en-US')} roles as a list
        </summary>
        <ul>
          {jobs.map((job) => (
            <li key={job.id}>
              <b>{job.company}</b>{' '}
              <a href={job.url} target="_blank" rel="nofollow noopener noreferrer">
                {job.title}
              </a>
              <span>
                {' · '}
                {shortLocations(job.locations)}
                {' · opened '}
                {formatDate(job.dateOpened)}
              </span>
            </li>
          ))}
        </ul>
      </details>
    </section>
  );
}

// some roles list 30+ offices, which would turn one line into a paragraph
function shortLocations(locations: string[]): string {
  if (locations.length === 0) return 'Location not listed';
  const head = locations.slice(0, 3).join(', ');
  return locations.length > 3 ? `${head} +${locations.length - 3} more` : head;
}
