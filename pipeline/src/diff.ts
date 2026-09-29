import { isCurrentCycle } from './filter.js';
import type { RawListing } from './types.js';

export interface RemovalBreakdown {
  // our own verifier saw these closed twice in a row
  verifiedClosed: string[];
  // simplify marked them inactive/hidden, or they vanished from the list entirely
  closedUpstream: string[];
  // still active upstream, but every term they list has already started
  pastTerm: string[];
  // anything else (category or degree info changed upstream, a --limit run, ...)
  other: string[];
}

// sort every role that was on the site last run but isn't now into why it left.
//
// this exists because the commit message used to only count our own verified
// closures. on 2026-09-29 the list dropped by 160 roles and the commit said
// "-19 closed", because ~125 fall 2026 roles had aged out of the cycle and 38 more
// were closed upstream. it looked like the pipeline was silently eating roles.
export function classifyRemovals(
  previousIds: string[],
  emittedIds: Set<string>,
  verifiedClosedIds: Set<string>,
  listings: RawListing[],
  now: Date,
): RemovalBreakdown {
  const byId = new Map(listings.map((l) => [l.id, l]));
  const out: RemovalBreakdown = { verifiedClosed: [], closedUpstream: [], pastTerm: [], other: [] };

  for (const id of previousIds) {
    if (emittedIds.has(id)) continue;
    const listing = byId.get(id);
    if (verifiedClosedIds.has(id)) out.verifiedClosed.push(id);
    else if (!listing || !listing.active || !listing.is_visible) out.closedUpstream.push(id);
    else if (!isCurrentCycle(listing, now)) out.pastTerm.push(id);
    else out.other.push(id);
  }
  return out;
}
