/* Cash metrics for a trading project's accounts. Pure: no I/O, `today` is passed
   in. A prop-firm account the user is not connected to has no trade rows of its
   own; what Cofre knows is the money the user attributed to it from other
   accounts (evaluations and resets paid, payouts received). Spec:
   docs/superpowers/specs/2026-10-31-trading-accounts-design.md §5 */

import { classifyActivity, type ActivityRow, type PerformanceSummary } from './performance';
import type { TradingAccountMeta, TradingStatus } from '../projects/project-account.entity';

export interface CashCategory { id: string; name: string; icon: string; color: string }
/** A project transaction attributed to the account. Cofre sign: negative = money the user spent. */
export interface CashRow { id: string; date: string; name: string; amount: number; category: CashCategory | null }
/** `in` = money from the user (spent, deposited); `out` = money to the user (payouts, withdrawals). */
export interface MonthFlow { month: string; in: number; out: number }

export interface CashSummary {
  spent: number;
  spentByCategory: (CashCategory & { total: number; count: number })[];
  payouts: { count: number; total: number; avg: number | null; largest: number; last: string | null };
  netCash: number;
  /** netCash ÷ spent × 100, one decimal; null when nothing was spent. */
  roi: number | null;
  costPerPayout: number | null;
  daysToFirstPayout: number | null;
  daysActive: number | null;
  byMonth: MonthFlow[];
  /** Newest first, capped at 50. */
  rows: CashRow[];
}

export interface TradingOverview {
  tradingPnl: number;
  moneyIn: number;
  moneyOut: number;
  netInPocket: number;
  accountsByStatus: Record<TradingStatus, number>;
  funded: number;
  evaluated: number;
  passRate: number | null;
  costOfFailed: number;
  payoutsPerAccount: number | null;
  byMonth: MonthFlow[];
}

const UNCAT: CashCategory = { id: 'uncat', name: 'Uncategorized', icon: '·', color: '#6B6B8A' };
const cents = (n: number) => Math.round(n * 100) / 100 + 0;
const pct1 = (n: number) => Math.round(n * 10) / 10;
const dayMs = 86_400_000;
const daysBetween = (from: string, to: string) => Math.max(0, Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / dayMs));

export function monthKeys(today: string, n: number): string[] {
  const [y, m] = today.slice(0, 7).split('-').map(Number);
  const keys: string[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(y, m - 1 - i, 1));
    keys.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`);
  }
  return keys;
}

function emptyMonths(today: string, n: number): MonthFlow[] {
  return monthKeys(today, n).map((month) => ({ month, in: 0, out: 0 }));
}

function addFlow(months: MonthFlow[], date: string, inAmt: number, outAmt: number): void {
  const m = months.find((x) => x.month === date.slice(0, 7));
  if (!m) return;
  m.in = cents(m.in + inAmt);
  m.out = cents(m.out + outAmt);
}

/** A connected broker's deposits and withdrawals by month, from its raw rows. */
export function brokerCashByMonth(rows: Pick<ActivityRow, 'date' | 'amount' | 'type' | 'subtype' | 'quantity' | 'symbol'>[], today: string, n = 12): MonthFlow[] {
  const months = emptyMonths(today, n);
  for (const r of rows) {
    const kind = classifyActivity(r);
    if (kind === 'contribution') addFlow(months, r.date, Math.abs(Number(r.amount) || 0), 0);
    else if (kind === 'withdrawal') addFlow(months, r.date, 0, Math.abs(Number(r.amount) || 0));
  }
  return months;
}

export function cashSummary(rows: CashRow[], meta: Pick<TradingAccountMeta, 'startedAt' | 'endedAt'>, today: string): CashSummary {
  const sorted = [...rows].sort((a, b) => a.date.localeCompare(b.date));
  const byCat = new Map<string, CashCategory & { total: number; count: number }>();
  const payouts: CashRow[] = [];
  let spent = 0;
  const months = emptyMonths(today, 12);

  for (const r of sorted) {
    const amt = Number(r.amount) || 0;
    if (amt < 0) {
      const cat = r.category ?? UNCAT;
      const cur = byCat.get(cat.id) ?? { ...cat, total: 0, count: 0 };
      cur.total = cents(cur.total + Math.abs(amt)); cur.count += 1;
      byCat.set(cat.id, cur);
      spent += Math.abs(amt);
      addFlow(months, r.date, Math.abs(amt), 0);
    } else if (amt > 0) {
      payouts.push(r);
      addFlow(months, r.date, 0, amt);
    }
  }

  const payoutTotal = cents(payouts.reduce((s, r) => s + Number(r.amount), 0));
  const netCash = cents(payoutTotal - spent);
  const start = meta.startedAt ?? sorted[0]?.date ?? null;
  const end = meta.endedAt ?? today;
  const firstPayout = payouts[0]?.date ?? null;

  return {
    spent: cents(spent),
    spentByCategory: [...byCat.values()].sort((a, b) => b.total - a.total),
    payouts: {
      count: payouts.length,
      total: payoutTotal,
      avg: payouts.length ? cents(payoutTotal / payouts.length) : null,
      largest: cents(payouts.reduce((m, r) => Math.max(m, Number(r.amount)), 0)),
      last: payouts.length ? payouts[payouts.length - 1].date : null,
    },
    netCash,
    roi: spent > 0 ? pct1((netCash / spent) * 100) : null,
    costPerPayout: payouts.length && spent > 0 ? cents(spent / payouts.length) : null,
    daysToFirstPayout: firstPayout && start ? daysBetween(start, firstPayout) : null,
    daysActive: start ? daysBetween(start, end) : null,
    byMonth: months,
    rows: [...sorted].reverse().slice(0, 50),
  };
}

export function tradingOverview(
  parts: { meta: TradingAccountMeta; summary: PerformanceSummary; cashByMonth: MonthFlow[]; cash: CashSummary | null }[],
  today: string,
): TradingOverview {
  const accountsByStatus: Record<TradingStatus, number> = { active: 0, evaluation: 0, funded: 0, failed: 0, closed: 0 };
  const months = emptyMonths(today, 12);
  let tradingPnl = 0, moneyIn = 0, moneyOut = 0, costOfFailed = 0, payoutCount = 0, propAccounts = 0, funded = 0, failed = 0;

  for (const p of parts) {
    accountsByStatus[p.meta.status] += 1;
    tradingPnl += p.summary.netResult;
    moneyIn += p.summary.contributions;
    moneyOut += p.summary.withdrawals;
    for (const m of p.cashByMonth) addFlow(months, `${m.month}-01`, m.in, m.out);
    if (p.meta.kind === 'prop_firm') {
      propAccounts += 1;
      if (p.meta.status === 'funded' || p.meta.status === 'closed') funded += 1;
      if (p.meta.status === 'failed') failed += 1;
    }
    if (p.cash) {
      moneyIn += p.cash.spent;
      moneyOut += p.cash.payouts.total;
      payoutCount += p.cash.payouts.count;
      if (p.meta.status === 'failed') costOfFailed += p.cash.spent;
      for (const m of p.cash.byMonth) addFlow(months, `${m.month}-01`, m.in, m.out);
    }
  }

  const evaluated = funded + failed;
  return {
    tradingPnl: cents(tradingPnl),
    moneyIn: cents(moneyIn),
    moneyOut: cents(moneyOut),
    netInPocket: cents(moneyOut - moneyIn),
    accountsByStatus,
    funded, evaluated,
    passRate: evaluated ? pct1((funded / evaluated) * 100) : null,
    costOfFailed: cents(costOfFailed),
    payoutsPerAccount: propAccounts ? cents(payoutCount / propAccounts) : null,
    byMonth: months,
  };
}
