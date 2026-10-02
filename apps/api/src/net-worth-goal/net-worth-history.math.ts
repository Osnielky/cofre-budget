import { isTrackingType } from '../bank-accounts/account-types';

export interface HistoryPoint { date: string; value: number; estimated: boolean }
export interface SnapshotValue { date: string; value: number }
export interface CashFlowTx { date: string; amount: number }
export interface TxForHistory {
  date: string;
  amount: number | string;
  debtId: string | null;
  categoryType: string | null;
  accountType: string | null;
}

/** Same rule as the web's inCashFlow(): transfers, debt payments and
 *  tracking-account activity move money around without changing net worth. */
export function isCashFlowTx(t: TxForHistory): boolean {
  if (t.debtId) return false;
  if (t.categoryType === 'transfer') return false;
  if (t.accountType && isTrackingType(t.accountType)) return false;
  return true;
}

const r2 = (n: number) => Math.round(n * 100) / 100;

function prevMonth(ym: string): string {
  const [y, m] = ym.split('-').map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`;
}

/** Last day of the month `ym` ('YYYY-MM') as YYYY-MM-DD. */
function monthEnd(ym: string): string {
  const [y, m] = ym.split('-').map(Number);
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
}

/**
 * Real snapshots (with today's live value last) plus estimated month-end points
 * for every month from the earliest transaction up to the month before the
 * first real point. Estimates walk backward from the first real value,
 * subtracting each month's net cash flow.
 */
export function buildHistory(input: {
  snapshots: SnapshotValue[];
  today: string;
  todayValue: number;
  txs: CashFlowTx[];
}): { points: HistoryPoint[]; firstRealDate: string } {
  const real = new Map<string, number>();
  for (const s of input.snapshots) if (s.date <= input.today) real.set(s.date, r2(s.value));
  real.set(input.today, r2(input.todayValue));
  const realPoints: HistoryPoint[] = [...real.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([date, value]) => ({ date, value, estimated: false }));

  const first = realPoints[0];
  const anchorMonth = first.date.slice(0, 7);

  // Net of the anchor month up to the first real date, and net per earlier month.
  let anchorNet = 0;
  const netByMonth = new Map<string, number>();
  let earliest: string | null = null;
  for (const t of input.txs) {
    if (t.date > first.date) continue;
    const ym = t.date.slice(0, 7);
    if (ym === anchorMonth) { anchorNet += t.amount; continue; }
    netByMonth.set(ym, (netByMonth.get(ym) ?? 0) + t.amount);
    if (!earliest || ym < earliest) earliest = ym;
  }

  const estimated: HistoryPoint[] = [];
  if (earliest) {
    let ym = prevMonth(anchorMonth);
    let value = first.value - anchorNet;
    while (ym >= earliest) {
      estimated.unshift({ date: monthEnd(ym), value: r2(value), estimated: true });
      value -= netByMonth.get(ym) ?? 0;
      ym = prevMonth(ym);
    }
  }

  return { points: [...estimated, ...realPoints], firstRealDate: first.date };
}
