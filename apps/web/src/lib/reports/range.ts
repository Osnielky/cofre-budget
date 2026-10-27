/* Report periods. Dates are local calendar dates as YYYY-MM-DD strings (the
   API stores transaction dates that way), never Date.toISOString(), which
   shifts by the timezone. */

export type RangePreset = 'this-month' | 'last-month' | '3m' | '6m' | 'ytd' | '12m' | 'custom';

export const PRESETS: { id: RangePreset; label: string }[] = [
  { id: 'this-month', label: 'This month' },
  { id: 'last-month', label: 'Last month' },
  { id: '3m', label: '3M' },
  { id: '6m', label: '6M' },
  { id: 'ytd', label: 'YTD' },
  { id: '12m', label: '12M' },
  { id: 'custom', label: 'Custom' },
];

export interface ReportRange {
  preset: RangePreset;
  from: string;
  to: string;
  prevFrom: string;
  prevTo: string;
  /** YYYY-MM keys from the first to the last month of the period. */
  months: string[];
  /** Inclusive day count of the period. */
  days: number;
  label: string;
  prevLabel: string;
}

export const pad2 = (n: number) => String(n).padStart(2, '0');
export const ymd = (d: Date) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
export const parseYmd = (s: string) => { const [y, m, d] = s.slice(0, 10).split('-').map(Number); return new Date(y, m - 1, d); };
const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const monthStart = (y: number, m0: number) => new Date(y, m0, 1);
const monthEnd = (y: number, m0: number) => new Date(y, m0 + 1, 0);

export function monthKeysBetween(from: string, to: string): string[] {
  const a = parseYmd(from), b = parseYmd(to);
  const keys: string[] = [];
  for (let y = a.getFullYear(), m = a.getMonth(); y < b.getFullYear() || (y === b.getFullYear() && m <= b.getMonth()); ) {
    keys.push(`${y}-${pad2(m + 1)}`);
    m += 1; if (m === 12) { m = 0; y += 1; }
  }
  return keys;
}

export function dayCount(from: string, to: string): number {
  return Math.round((parseYmd(to).getTime() - parseYmd(from).getTime()) / 86_400_000) + 1;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const monthLabel = (key: string) => { const [y, m] = key.split('-').map(Number); return `${MONTHS[m - 1]} ${y}`; };
export const shortMonth = (key: string) => MONTHS[Number(key.split('-')[1]) - 1];

function describe(from: string, to: string): string {
  const a = parseYmd(from), b = parseYmd(to);
  const sameMonth = a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth();
  if (sameMonth && a.getDate() === 1 && b.getDate() === monthEnd(a.getFullYear(), a.getMonth()).getDate()) return `${MONTHS[a.getMonth()]} ${a.getFullYear()}`;
  const fa = `${MONTHS[a.getMonth()]} ${a.getDate()}${a.getFullYear() !== b.getFullYear() ? `, ${a.getFullYear()}` : ''}`;
  const fb = `${MONTHS[b.getMonth()]} ${b.getDate()}, ${b.getFullYear()}`;
  return `${fa} – ${fb}`;
}

/**
 * Resolve a preset into concrete dates. Month presets end today (or at the
 * end of the finished month) and the previous period is the same number of
 * whole months before; a custom range's previous period is the same number of
 * days immediately before it.
 */
export function resolveRange(preset: RangePreset, now: Date, custom?: { from: string; to: string }): ReportRange {
  const y = now.getFullYear(), m0 = now.getMonth();
  let from: string, to: string, prevFrom: string, prevTo: string;

  if (preset === 'custom' && custom && custom.from && custom.to && custom.from <= custom.to) {
    from = custom.from; to = custom.to;
    const n = dayCount(from, to);
    prevTo = ymd(addDays(parseYmd(from), -1));
    prevFrom = ymd(addDays(parseYmd(prevTo), -(n - 1)));
  } else {
    const monthsBack = preset === '3m' ? 3 : preset === '6m' ? 6 : preset === '12m' ? 12 : preset === 'ytd' ? m0 + 1 : 1;
    if (preset === 'last-month') {
      from = ymd(monthStart(y, m0 - 1)); to = ymd(monthEnd(y, m0 - 1));
      prevFrom = ymd(monthStart(y, m0 - 2)); prevTo = ymd(monthEnd(y, m0 - 2));
    } else {
      from = ymd(monthStart(y, m0 - monthsBack + 1)); to = ymd(now);
      prevFrom = ymd(monthStart(y, m0 - 2 * monthsBack + 1)); prevTo = ymd(monthEnd(y, m0 - monthsBack));
    }
    if (preset === 'custom') preset = 'this-month';
  }

  return {
    preset, from, to, prevFrom, prevTo,
    months: monthKeysBetween(from, to),
    days: dayCount(from, to),
    label: describe(from, to),
    prevLabel: describe(prevFrom, prevTo),
  };
}
