import { classifyRemovals } from './diff.js';
import { emit, readPreviousJobs } from './emit.js';
import { filterListings } from './filter.js';
import { DICTIONARY_VERSION } from './keywords/dictionary.js';
import { fetchListings } from './sources/simplify.js';
import { loadState, pruneState, saveState } from './state.js';
import { toJob } from './transform.js';
import type { Job, Meta, VerifyVerdict } from './types.js';
import { applyStrikes, verifyAll, type JobRef } from './verify/index.js';

interface Args {
  verify: boolean;
  force: boolean;
  cache: boolean;
  limit?: number;
}

function parseArgs(argv: string[]): Args {
  const args: Args = {
    verify: !argv.includes('--no-verify'),
    force: argv.includes('--force'),
    cache: argv.includes('--cache'),
  };
  const limitFlag = argv.find((a) => a.startsWith('--limit='));
  if (limitFlag) {
    const n = Number(limitFlag.split('=')[1]);
    if (Number.isFinite(n) && n > 0) args.limit = n;
  }
  return args;
}

function pct(n: number, total: number): string {
  return total === 0 ? '0%' : `${Math.round((n / total) * 100)}%`;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const now = new Date();
  const warnings: string[] = [];

  console.log('▸ Fetching upstream listings…');
  const { repo, listings, fromCache } = await fetchListings({ useCache: args.cache });
  console.log(`  ${repo}: ${listings.length.toLocaleString()} listings${fromCache ? ' (cached)' : ''}`);

  console.log('▸ Filtering…');
  const { kept, counts, cycleTerms, byLevel } = filterListings(listings, now);
  console.log(
    `  active ${counts.afterActive} → placeable ${counts.afterDegree} → ` +
      `software ${counts.afterCategory} → in-cycle ${counts.afterCycle}`,
  );
  console.log(`  cycle terms: ${cycleTerms.join(', ') || '(none)'}`);
  console.log(
    `  by level (overlapping): undergrad ${byLevel.undergrad}, ` +
      `masters ${byLevel.masters}, phd ${byLevel.phd}`,
  );

  let selected = kept;
  if (args.limit !== undefined) {
    selected = kept.slice(0, args.limit);
    warnings.push(`--limit=${args.limit} applied; output is a partial sample, not a full run.`);
    console.log(`  (limited to ${selected.length} for this run)`);
  }

  const state = await loadState();
  const refs: JobRef[] = selected.map(({ listing }) => ({
    id: listing.id,
    url: listing.url,
    title: listing.title,
    company: listing.company_name,
  }));

  let verdicts = new Map<string, VerifyVerdict>();
  let tiers = { T1: 0, T2: 0, T3: 0 };
  let byAdapter: Meta['verification']['byAdapter'] = {};
  let attempted = 0;
  let skippedFresh = 0;
  let durationMs = 0;
  let removedIds: string[] = [];

  if (args.verify) {
    console.log(`▸ Verifying ${refs.length} postings…`);
    const report = await verifyAll(refs, state, { now, force: args.force });
    tiers = report.tiers;
    byAdapter = report.byAdapter;
    attempted = report.attempted;
    skippedFresh = report.skippedFresh;
    durationMs = report.durationMs;

    const applied = applyStrikes(refs, report.verdicts, state, now);
    verdicts = applied.effective;
    removedIds = applied.removedIds;

    console.log(
      `  tiers T1=${tiers.T1} T2=${tiers.T2} T3=${tiers.T3} | ` +
        `attempted ${attempted}, cached ${skippedFresh}, ${(durationMs / 1000).toFixed(1)}s`,
    );
    for (const [name, stat] of Object.entries(byAdapter).sort()) {
      console.log(`    ${name.padEnd(16)} open=${stat.open} closed=${stat.closed} unknown=${stat.unknown}`);
    }
    if (removedIds.length > 0) console.log(`  removing ${removedIds.length} confirmed-closed`);
  } else {
    warnings.push('Verification skipped (--no-verify): closure status is upstream-only.');
    console.log('▸ Verification skipped (--no-verify)');
    // still note when we first saw each role, so the "new" badges don't reset
    // just because we skipped verification this time
    for (const ref of refs) {
      state.jobs[ref.id] ??= { firstSeenAt: now.toISOString(), strikes: 0 };
    }
  }

  const nowIso = now.toISOString();
  const removed = new Set(removedIds);
  const jobs: Job[] = [];
  for (const { listing, levels, degreeConfidence } of selected) {
    if (removed.has(listing.id)) continue;
    jobs.push(toJob(listing, levels, degreeConfidence, verdicts.get(listing.id), state, now));
  }

  // remember the keywords we found so a cached run (which never re-downloads the
  // description) still has them next time
  for (const job of jobs) {
    if (job.skills.length === 0 && job.softSkills.length === 0) continue;
    const entry = (state.jobs[job.id] ??= { firstSeenAt: nowIso, strikes: 0 });
    entry.skills = job.skills;
    entry.softSkills = job.softSkills;
    entry.skillsVersion = DICTIONARY_VERSION;
  }

  const verifiedOpen = jobs.filter((j) => j.status === 'open').length;
  const unverified = jobs.length - verifiedOpen;
  const withSkills = jobs.filter((j) => j.skills.length > 0).length;

  // anything whose firstSeenAt is this exact run is brand new
  const newIds = jobs.filter((j) => j.firstSeenAt === nowIso).map((j) => j.id);

  // and everything that was on the site last time but isn't now, with a reason,
  // so the commit message can say more than just our own closures
  const previous = await readPreviousJobs();
  const removals = classifyRemovals(
    (previous ?? []).map((j) => j.id),
    new Set(jobs.map((j) => j.id)),
    removed,
    listings,
    now,
  );

  const meta: Meta = {
    generatedAt: nowIso,
    sourceRepo: repo,
    counts: {
      ...counts,
      verifiedOpen,
      unverified,
      closedRemoved: removedIds.length,
      emitted: jobs.length,
      withSkills,
    },
    tiers,
    verification: { attempted, byAdapter, durationMs, skippedFresh },
    diff: {
      newIds,
      closedIds: removedIds,
      closedUpstreamIds: removals.closedUpstream,
      pastTermIds: removals.pastTerm,
      otherRemovedIds: removals.other,
    },
    // recomputed from what actually got emitted, so closed removals are reflected
    byLevel: {
      undergrad: jobs.filter((j) => j.levels.includes('undergrad')).length,
      masters: jobs.filter((j) => j.levels.includes('masters')).length,
      phd: jobs.filter((j) => j.levels.includes('phd')).length,
    },
    cycleTerms,
    warnings,
  };

  // a --limit run is meant to be a small sample, so the drop check would just be
  // a false alarm here
  const { wrote, sanity } = await emit(jobs, meta, { allowDrop: args.limit !== undefined });

  if (!wrote) {
    console.error(`\n✖ ${sanity.message}`);
    process.exitCode = 1;
    return;
  }

  pruneState(state, new Set(refs.map((r) => r.id)));
  await saveState(state);

  console.log(
    `\n✔ Wrote ${jobs.length} roles — ${verifiedOpen} confirmed open (${pct(verifiedOpen, jobs.length)}), ` +
      `${unverified} unverified, ${removedIds.length} closed and removed`,
  );
  console.log(`  resume keywords on ${withSkills} roles (${pct(withSkills, jobs.length)})`);
  if (newIds.length > 0) console.log(`  ${newIds.length} new since last run`);
  if (removals.closedUpstream.length + removals.pastTerm.length + removals.other.length > 0) {
    console.log(
      `  also gone since last run: ${removals.closedUpstream.length} closed upstream, ` +
        `${removals.pastTerm.length} past their term, ${removals.other.length} other`,
    );
  }
  for (const w of warnings) console.log(`  ! ${w}`);
}

main().catch((err) => {
  console.error('\n✖ Pipeline failed:', err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
