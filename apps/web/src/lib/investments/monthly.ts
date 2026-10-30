/* The "Realized P&L by month" chart of a trading project: a continuous month
   timeline (the engine only reports months that had activity), the cumulative
   curve over it and the summary figures beside it. Pure; the component only draws.
   Spec: docs/superpowers/specs/2026-10-29-trading-performance-design.md */

export interface MonthPoint { month: string; realized: number; income: number; fees: number; closedTrades: number }

export interface MonthSeriesPoint extends MonthPoint {
  /** Realized P&L added up from the first month of history through this one. */
  cumulative: number;
  /** False for a month the engine did not report (filled in to keep the timeline continuous). */
  active: boolean;
}

export interface MonthStats {
  /** Months with activity inside the window. */
  activeMonths: number;
  greenMonths: number;
  best: MonthPoint | null;
  worst: MonthPoint | null;
  /** Average realized over the active months; null without any. */
  avgMonth: number | null;
  /** Realized in the calendar year of the last month shown. */
  year: { year: string; realized: number; closedTrades: number } | null;
  /** Realized over the whole history, not just the window. */
  allTime: number;
}

const cents = (n: number) => Math.round(n * 100) / 100 + 0;

function nextMonth(key: string): string {
  const [y, m] = key.split('-').map(Number);
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`;
}

/** Every month from the first reported to the last, zero-filled, with the cumulative total. */
export function monthSeries(months: MonthPoint[]): MonthSeriesPoint[] {
  if (months.length === 0) return [];
  const sorted = [...months].sort((a, b) => a.month.localeCompare(b.month));
  const byKey = new Map(sorted.map((m) => [m.month, m]));
  const out: MonthSeriesPoint[] = [];
  let acc = 0;
  for (let key = sorted[0].month; key <= sorted[sorted.length - 1].month; key = nextMonth(key)) {
    const m = byKey.get(key);
    acc = cents(acc + (m?.realized ?? 0));
    out.push(m ? { ...m, cumulative: acc, active: true } : { month: key, realized: 0, income: 0, fees: 0, closedTrades: 0, cumulative: acc, active: false });
  }
  return out;
}

/** The last `count` months of the series — the chart window. */
export function monthWindow(series: MonthSeriesPoint[], count: number): MonthSeriesPoint[] {
  return series.slice(-count);
}

export function monthStats(window: MonthSeriesPoint[], series: MonthSeriesPoint[]): MonthStats {
  const active = window.filter((m) => m.active && (m.realized !== 0 || m.closedTrades > 0));
  const best = active.reduce<MonthPoint | null>((b, m) => (!b || m.realized > b.realized ? m : b), null);
  const worst = active.reduce<MonthPoint | null>((b, m) => (!b || m.realized < b.realized ? m : b), null);
  const last = window[window.length - 1];
  const yearKey = last?.month.slice(0, 4);
  const yearMonths = yearKey ? series.filter((m) => m.month.startsWith(yearKey)) : [];
  return {
    activeMonths: active.length,
    greenMonths: active.filter((m) => m.realized > 0).length,
    best, worst,
    avgMonth: active.length ? cents(active.reduce((s, m) => s + m.realized, 0) / active.length) : null,
    year: yearKey ? { year: yearKey, realized: cents(yearMonths.reduce((s, m) => s + m.realized, 0)), closedTrades: yearMonths.reduce((s, m) => s + m.closedTrades, 0) } : null,
    allTime: series.length ? series[series.length - 1].cumulative : 0,
  };
}

/** "Mar 26" for the axis. */
export function monthLabel(key: string): string {
  return new Date(`${key}-15T12:00:00`).toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
}

/** Short signed money for bar labels: +$1,526 · -$290 · $0. Thousands collapse past five digits ($12.4k). */
export function shortMoney(n: number): string {
  const abs = Math.abs(n);
  const body = abs >= 10_000 ? `$${(abs / 1000).toFixed(1).replace(/\.0$/, '')}k` : `$${Math.round(abs).toLocaleString('en-US')}`;
  if (Math.round(abs) === 0) return '$0';
  return n < 0 ? `-${body}` : `+${body}`;
}
