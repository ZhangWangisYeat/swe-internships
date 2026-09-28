import type { Job } from '@/lib/types';

// squarer and more tracked-out than a pill, to sit with the rest of the editorial look
const base =
  'inline-flex items-center gap-1 rounded-[2px] px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-[0.14em] whitespace-nowrap';

export function NewBadge() {
  return (
    <span
      className={`${base} bg-accent-subtle text-accent`}
      title="Posted since your last visit"
    >
      New
    </span>
  );
}

// for roles we couldn't actually confirm are still open
export function UnverifiedBadge({ job }: { job: Job }) {
  return (
    <span
      className={`${base} bg-warn-subtle text-warn`}
      title={
        'Could not confirm this posting is still open — the site blocked our check or ' +
        'returned no clear signal. It is shown anyway so a real opening is never hidden.'
      }
    >
      Unverified
    </span>
  );
}

// for roles where the listing didn't say what degree you need, so we worked out which
// page it belongs on from the title. worth checking the posting yourself on these.
export function InferredBadge() {
  return (
    <span
      className={`${base} bg-bg-subtle text-text-faint`}
      title="The source listed no degree requirement, so the degree level was inferred from the job title. Check the posting before assuming you're eligible."
    >
      Degree?
    </span>
  );
}

export function SponsorshipBadge({ sponsorship }: { sponsorship: Job['sponsorship'] }) {
  if (sponsorship === 'Does Not Offer Sponsorship') {
    return (
      <span className={`${base} bg-danger-subtle text-danger`} title="Does not offer visa sponsorship">
        No sponsor
      </span>
    );
  }
  if (sponsorship === 'U.S. Citizenship is Required') {
    return (
      <span className={`${base} bg-danger-subtle text-danger`} title="Requires U.S. citizenship">
        US citizen
      </span>
    );
  }
  if (sponsorship === 'Offers Sponsorship') {
    return (
      <span className={`${base} bg-success-subtle text-success`} title="Offers visa sponsorship">
        Sponsors
      </span>
    );
  }
  return null;
}

export function RemoteBadge() {
  return (
    <span className={`${base} bg-success-subtle text-success`} title="Remote role">
      Remote
    </span>
  );
}
