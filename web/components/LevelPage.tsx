import { levelCounts } from '@/lib/buildData';
import type { DegreeLevel } from '@/lib/types';
import { Dashboard } from './Dashboard';
import { HowItWorks } from './HowItWorks';
import { RoleIndex } from './RoleIndex';

// what all three level pages render. the dashboard (table, filters, tracker) is
// client side and loads the live /data/jobs.json in the browser, so it's always
// whatever the scheduled job wrote last.
//
// the two sections passed in as children are server components built from the same
// file at build time. they're what search engines and no-javascript visitors get,
// see RoleIndex for why the table can't do that. they only go stale if a deploy
// fails, since the host rebuilds the site after every data commit.
export function LevelPage({ level }: { level: DegreeLevel }) {
  return (
    <Dashboard level={level} initialCounts={levelCounts()}>
      <HowItWorks />
      <RoleIndex level={level} />
    </Dashboard>
  );
}
