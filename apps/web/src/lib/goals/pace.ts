import type { HistoryPoint } from './history';

const DAY = 86_400_000;
const MONTH_DAYS = 30.4375;

/** YYYY-MM key `months` months after `now` (UTC). */
export function addMonths(now: Date, months: number): string {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + months, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

/**
 * Average net-worth change per month over the last 90 days of history
 * (first point on or after the cutoff → last point). Null without at least
 * two points 14+ days apart, so a brand-new history does not produce a pace.
 */
export function monthlyPace(points: HistoryPoint[], now: Date): number | null {
  if (points.length < 2) return null;
  const sorted = [...points].sort((a, b) => (a.date < b.date ? -1 : 1));
  const cutoff = new Date(now.getTime() - 90 * DAY).toISOString().slice(0, 10);
  const window = sorted.filter((p) => p.date >= cutoff);
  const first = window.length >= 2 ? window[0] : sorted[Math.max(0, sorted.length - 2)];
  const last = sorted[sorted.length - 1];
  const days = (Date.parse(`${last.date}T00:00:00Z`) - Date.parse(`${first.date}T00:00:00Z`)) / DAY;
  if (days < 14) return null;
  return Math.round(((last.value - first.value) / days) * MONTH_DAYS * 100) / 100;
}

/** Month (YYYY-MM) the target is reached at `pacePerMonth`, or null if the pace will never get there. */
export function projectReach(current: number, target: number, pacePerMonth: number, now: Date): string | null {
  if (current >= target) return addMonths(now, 0);
  if (pacePerMonth <= 0) return null;
  return addMonths(now, Math.ceil((target - current) / pacePerMonth));
}

/** Monthly growth needed to hit `target` by `targetDate` (YYYY-MM-DD); null if that date is not at least a month away. */
export function requiredMonthly(current: number, target: number, targetDate: string, now: Date): number | null {
  const [y, m] = targetDate.split('-').map(Number);
  const months = (y - now.getUTCFullYear()) * 12 + (m - 1 - now.getUTCMonth());
  if (!Number.isFinite(months) || months < 1) return null;
  const gap = target - current;
  if (gap <= 0) return 0;
  return Math.round((gap / months) * 100) / 100;
}

/** "Jun 2028" for a YYYY-MM key. */
export function monthKeyLabel(key: string): string {
  const [y, m] = key.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' });
}
