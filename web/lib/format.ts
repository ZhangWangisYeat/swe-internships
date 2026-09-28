// little formatting helpers used by the table and the header

const DATE_FMT = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
  timeZone: 'UTC',
});

export function formatDate(iso: string): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return '—';
  return DATE_FMT.format(new Date(t));
}

// short version of how old something is, like "3d" or "2mo". returns an empty
// string if the date is junk, so the table just shows nothing instead of "NaN".
export function relativeAge(iso: string, now: number = Date.now()): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return '';
  const days = Math.floor((now - t) / 86_400_000);
  if (days <= 0) return 'today';
  if (days === 1) return '1d';
  if (days < 30) return `${days}d`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo`;
  return `${Math.floor(months / 12)}y`;
}

// the spelled-out, properly capitalised version of the above: "Today", "Yesterday",
// "2 days ago". the short one is for the narrow Date Opened column where there's no
// room for words; this one is for the header where it should just read like english.
export function relativeAgeLong(iso: string, now: number = Date.now()): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return '';

  const days = Math.floor((now - t) / 86_400_000);
  if (days <= 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 30) return `${days} days ago`;

  const months = Math.floor(days / 30);
  if (months < 12) return `${months} month${months === 1 ? '' : 's'} ago`;

  const years = Math.floor(months / 12);
  return `${years} year${years === 1 ? '' : 's'} ago`;
}

export function formatDateTime(iso: string): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return '—';
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(t));
}

// squash a list of locations down for the table. shows the first two and then a
// "+3" for the rest, otherwise a role listed in eight cities wrecks the column width.
export function formatLocations(locations: string[]): { text: string; extra: number; full: string } {
  if (locations.length === 0) return { text: 'Not specified', extra: 0, full: 'Not specified' };
  const head = locations.slice(0, 2).join(' · ');
  return {
    text: head,
    extra: Math.max(0, locations.length - 2),
    full: locations.join(', '),
  };
}
