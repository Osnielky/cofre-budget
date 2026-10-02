import { LEVELS, type Level } from './levels';

export interface HistoryPoint { date: string; value: number; estimated: boolean }
export type HistoryRange = '1M' | '3M' | '6M' | 'YTD' | '1Y' | 'ALL';

export const RANGES: { id: HistoryRange; label: string }[] = [
  { id: '1M', label: '1M' }, { id: '3M', label: '3M' }, { id: '6M', label: '6M' },
  { id: 'YTD', label: 'YTD' }, { id: '1Y', label: '1Y' }, { id: 'ALL', label: 'All time' },
];

const MONTHS_BACK: Record<'1M' | '3M' | '6M' | '1Y', number> = { '1M': 1, '3M': 3, '6M': 6, '1Y': 12 };
const pad = (n: number) => String(n).padStart(2, '0');
const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** First date (YYYY-MM-DD) inside the range, or null for all time. */
export function rangeCutoff(range: HistoryRange, now: Date): string | null {
  if (range === 'ALL') return null;
  if (range === 'YTD') return `${now.getFullYear()}-01-01`;
  return ymd(new Date(now.getFullYear(), now.getMonth() - MONTHS_BACK[range], now.getDate()));
}

/** Points inside the range; the latest point alone if none fall inside it. */
export function filterRange(points: HistoryPoint[], range: HistoryRange, now: Date): HistoryPoint[] {
  const cutoff = rangeCutoff(range, now);
  if (!cutoff) return points;
  const kept = points.filter((p) => p.date >= cutoff);
  return kept.length ? kept : points.slice(-1);
}

export interface RangeSummary { start: number; end: number; growth: number; pct: number | null }

export function rangeSummary(points: HistoryPoint[]): RangeSummary | null {
  if (!points.length) return null;
  const start = points[0].value;
  const end = points[points.length - 1].value;
  const growth = Math.round((end - start) * 100) / 100;
  // A percentage of a zero or negative start is meaningless.
  const pct = start > 0 ? Math.round((growth / start) * 1000) / 10 : null;
  return { start, end, growth, pct };
}

export interface Crossing { level: Level; date: string; value: number; estimated: boolean }

/** The first point at or above each level threshold, counting only real crossings
 *  (the previous point was below). Dips and recoveries don't add a second marker. */
export function milestoneCrossings(points: HistoryPoint[]): Crossing[] {
  const out: Crossing[] = [];
  for (const level of LEVELS) {
    for (let i = 1; i < points.length; i++) {
      if (points[i - 1].value < level.threshold && points[i].value >= level.threshold) {
        out.push({ level, date: points[i].date, value: points[i].value, estimated: points[i].estimated });
        break;
      }
    }
  }
  return out;
}

export function monthLabel(date: string): string {
  return new Date(`${date.slice(0, 10)}T00:00:00`).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
}

export function rangeLabel(points: HistoryPoint[]): string {
  if (!points.length) return '';
  const a = monthLabel(points[0].date);
  const b = monthLabel(points[points.length - 1].date);
  return a === b ? a : `${a} – ${b}`;
}
