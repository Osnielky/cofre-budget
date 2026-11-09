/* One period value for every page header (components/PeriodPicker.tsx).

   A page that works month by month (Dashboard, Budgets, Ask Cofre) only ever
   holds `kind: 'month'`; Transactions and Reports also take the relative
   presets and a custom range. Everything is a local calendar date string
   (YYYY-MM or YYYY-MM-DD), never Date.toISOString(), which shifts by the
   timezone. The maths lives in lib/reports/range.ts; this file maps the
   picker's value onto it and knows how a period steps back and forward. */

import {
  dayCount, monthKeysBetween, pad2, parseYmd, resolveRange, wholeMonthSpan, ymd,
  type RangePreset, type ReportRange,
} from './reports/range';

export type PeriodPreset = Exclude<RangePreset, 'this-month' | 'custom'>;

export type Period =
  | { kind: 'month'; month: string }
  | { kind: 'preset'; preset: PeriodPreset }
  | { kind: 'custom'; from: string; to: string };

export const PERIOD_PRESETS: PeriodPreset[] = ['last-month', '3m', '6m', 'ytd', '12m'];
export const PRESET_LABELS: Record<PeriodPreset, string> = {
  'last-month': 'Last month', '3m': 'Last 3 months', '6m': 'Last 6 months', ytd: 'Year to date', '12m': 'Last 12 months',
};

const LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export const SHORT_MONTHS = LONG.map((m) => m.slice(0, 3));

export function monthKey(d: Date): string { return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`; }
export function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split('-').map(Number);
  return monthKey(new Date(y, m - 1 + delta, 1));
}
export function monthStart(month: string): string { return `${month}-01`; }
export function monthEnd(month: string): string {
  const [y, m] = month.split('-').map(Number);
  return ymd(new Date(y, m, 0));
}
/** "November 2026" (long) or "Nov 2026" (short). */
export function monthName(month: string, style: 'long' | 'short' = 'long'): string {
  const [y, m] = month.split('-').map(Number);
  return `${style === 'long' ? LONG[m - 1] : SHORT_MONTHS[m - 1]} ${y}`;
}
export function thisMonth(now: Date = new Date()): Period { return { kind: 'month', month: monthKey(now) }; }

/** A custom range that is exactly one calendar month is that month. */
export function normalizePeriod(p: Period): Period {
  if (p.kind !== 'custom') return p;
  return wholeMonthSpan(p.from, p.to) === 1 ? { kind: 'month', month: p.from.slice(0, 7) } : p;
}

/** Concrete dates. A month is the whole month (1st to last day, so future-dated rows
    in the current month still show); the presets end today, as on Reports. */
export function resolvePeriod(p: Period, now: Date): ReportRange {
  if (p.kind === 'month') return resolveRange('custom', now, { from: monthStart(p.month), to: monthEnd(p.month) });
  if (p.kind === 'preset') return resolveRange(p.preset, now);
  return resolveRange('custom', now, { from: p.from, to: p.to });
}

/** What the control reads: "November 2026", "Last 3 months", "Sep 3 – Nov 9, 2026". */
export function periodLabel(p: Period, now: Date): string {
  if (p.kind === 'month') return monthName(p.month);
  if (p.kind === 'preset') return PRESET_LABELS[p.preset];
  return resolvePeriod(p, now).label;
}

/** Month keys the picker may show; `null` / undefined means no bound on that side. */
export interface MonthBounds { min?: string | null; max?: string | null }

export function monthAllowed(month: string, b: MonthBounds): boolean {
  return (!b.min || month >= b.min) && (!b.max || month <= b.max);
}

const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const firstMonth = (p: Period) => p.kind === 'month' ? p.month : p.kind === 'custom' ? p.from.slice(0, 7) : '';

/**
 * The period one step back (-1) or forward (+1), or null when there is nothing
 * there: a month steps a month; a preset or custom range steps by its own
 * length (its previous period as Reports defines it, or the same span after
 * it), clamped to today and to the bounds. A range that lands on exactly one
 * calendar month becomes that month.
 */
export function stepPeriod(p: Period, dir: -1 | 1, now: Date, b: MonthBounds = {}): Period | null {
  if (p.kind === 'month') {
    const m = shiftMonth(p.month, dir);
    return monthAllowed(m, b) ? { kind: 'month', month: m } : null;
  }
  const r = resolvePeriod(p, now);
  if (dir === -1) {
    let from = r.prevFrom;
    const to = r.prevTo;
    if (b.min && to.slice(0, 7) < b.min) return null;
    if (b.min && from.slice(0, 7) < b.min) from = monthStart(b.min);
    return normalizePeriod({ kind: 'custom', from, to });
  }
  const whole = wholeMonthSpan(r.from, r.to);
  let from: string, to: string;
  if (whole) {
    from = monthStart(shiftMonth(r.from.slice(0, 7), whole));
    to = monthEnd(shiftMonth(r.to.slice(0, 7), whole));
    if (b.max && to.slice(0, 7) > b.max) to = monthEnd(b.max);
  } else {
    const f = addDays(parseYmd(r.to), 1);
    from = ymd(f);
    to = ymd(addDays(f, r.days - 1));
    const today = ymd(now);
    if (to > today) to = today;
  }
  if (from > ymd(now) || (b.max && from.slice(0, 7) > b.max) || to < from) return null;
  return normalizePeriod({ kind: 'custom', from, to });
}

/* ── Reports keeps `preset` / `from` / `to` in the URL; these map that onto a Period
      and back. Reports' "this month" runs from the 1st to today (its pace charts need
      the elapsed days), so the current month round-trips as the 'this-month' preset. */

export interface RangeState { preset: RangePreset; from: string; to: string }

export function periodFromRangeState(s: RangeState, now: Date): Period {
  if (s.preset === 'this-month') return thisMonth(now);
  if (s.preset === 'custom') return s.from && s.to && s.from <= s.to ? normalizePeriod({ kind: 'custom', from: s.from, to: s.to }) : thisMonth(now);
  return { kind: 'preset', preset: s.preset };
}

export function rangeStateFromPeriod(p: Period, now: Date): RangeState {
  if (p.kind === 'month') {
    return p.month === monthKey(now)
      ? { preset: 'this-month', from: '', to: '' }
      : { preset: 'custom', from: monthStart(p.month), to: monthEnd(p.month) };
  }
  if (p.kind === 'preset') return { preset: p.preset, from: '', to: '' };
  return { preset: 'custom', from: p.from, to: p.to };
}

/** Same period? (a month and the equal whole-month custom range count as the same). */
export function samePeriod(a: Period, b: Period): boolean {
  const x = normalizePeriod(a), y = normalizePeriod(b);
  if (x.kind !== y.kind) return false;
  if (x.kind === 'month') return x.month === (y as typeof x).month;
  if (x.kind === 'preset') return x.preset === (y as typeof x).preset;
  return x.from === (y as typeof x).from && x.to === (y as typeof x).to;
}

/** For the month grid: the twelve keys of a year. */
export function monthsOfYear(year: number): string[] {
  return Array.from({ length: 12 }, (_, i) => `${year}-${pad2(i + 1)}`);
}

export { dayCount, monthKeysBetween, firstMonth };
