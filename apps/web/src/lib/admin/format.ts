const MIN = 60_000, HOUR = 60 * MIN, DAY = 24 * HOUR;

/** "Never" / "Just now" / "45m ago" / "5h ago" / "3d ago", then a short date. */
export function relativeTime(iso: string | null, now: Date = new Date()): string {
  if (!iso) return 'Never';
  const t = new Date(iso);
  const diff = now.getTime() - t.getTime();
  if (diff < MIN) return 'Just now';
  if (diff < HOUR) return `${Math.floor(diff / MIN)}m ago`;
  if (diff < DAY) return `${Math.floor(diff / HOUR)}h ago`;
  if (diff < 30 * DAY) return `${Math.floor(diff / DAY)}d ago`;
  return t.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
}

export function money(n: number): string {
  return `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
