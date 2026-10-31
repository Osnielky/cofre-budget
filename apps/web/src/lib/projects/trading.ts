/* Trading-account helpers for the Projects page: labels, card figures,
   sparklines and ordering. Pure; the API computes every money figure
   (apps/api/src/investments/trading-cash.ts) and this file only shapes it for
   display. Spec: docs/superpowers/specs/2026-10-31-trading-accounts-design.md */

import { money, type Figure } from './overview';

export type TradingKind = 'broker' | 'prop_firm';
export type TradingStatus = 'active' | 'evaluation' | 'funded' | 'failed' | 'closed';

export interface AccountMeta {
  kind: TradingKind; status: TradingStatus; firm: string | null; accountSize: number | null;
  startedAt: string | null; endedAt: string | null; notes: string | null; provider: string;
}
export interface MonthFlow { month: string; in: number; out: number }
export interface CashCategoryTotal { id: string; name: string; icon: string; color: string; total: number; count: number }
export interface CashRow { id: string; date: string; name: string; amount: number; category: { id: string; name: string; icon: string; color: string } | null }
export interface CashSummary {
  spent: number; spentByCategory: CashCategoryTotal[];
  payouts: { count: number; total: number; avg: number | null; largest: number; last: string | null };
  netCash: number; roi: number | null; costPerPayout: number | null;
  daysToFirstPayout: number | null; daysActive: number | null;
  byMonth: MonthFlow[]; rows: CashRow[];
}
/** The slice of an account's performance the cards and sorting need. */
export interface AccountSummaryLite {
  account: { id: string; bankName: string; accountName: string };
  meta: AccountMeta;
  cash: CashSummary | null;
  realizedPnl: number;
  netResult: number;
  trades: { closed: number; winRate: number | null };
  byMonth: { month: string; realized: number }[];
  to: string | null;
}

export const STATUS_LABEL: Record<TradingStatus, string> = { active: 'Active', evaluation: 'Evaluation', funded: 'Funded', failed: 'Failed', closed: 'Closed' };
export const KIND_LABEL: Record<TradingKind, string> = { broker: 'Broker', prop_firm: 'Prop firm' };
const STATUS_ORDER: Record<TradingStatus, number> = { funded: 0, active: 1, evaluation: 2, failed: 3, closed: 4 };

export function statusTone(s: TradingStatus): 'up' | 'down' | 'flat' | 'muted' {
  return s === 'funded' ? 'up' : s === 'failed' ? 'down' : s === 'closed' ? 'muted' : 'flat';
}

const tone = (n: number): Figure['tone'] => (n > 0 ? 'up' : n < 0 ? 'down' : 'flat');

export function accountTitle(a: Pick<AccountSummaryLite, 'account'>): string {
  return `${a.account.bankName} · ${a.account.accountName}`;
}

export function accountFigures(a: AccountSummaryLite): Figure[] {
  if (a.meta.kind === 'prop_firm') {
    const c = a.cash;
    const net = c?.netCash ?? 0;
    const hasTrades = a.trades.closed > 0;
    return [
      { label: 'Net cash', value: money(net, true), tone: tone(net) },
      { label: 'Payouts', value: c && c.payouts.count > 0 ? `${c.payouts.count} · ${money(c.payouts.total)}` : '—', tone: 'flat' },
      { label: 'Platform P&L', value: hasTrades ? money(a.netResult, true) : 'No trades yet', tone: hasTrades ? tone(a.netResult) : 'flat' },
    ];
  }
  return [
    { label: 'Realized P&L', value: money(a.realizedPnl, true), tone: tone(a.realizedPnl) },
    { label: 'Win rate', value: a.trades.winRate == null ? '—' : `${a.trades.winRate}%`, tone: 'flat' },
    { label: 'Closed', value: `${a.trades.closed} trade${a.trades.closed === 1 ? '' : 's'}`, tone: 'flat' },
  ];
}

const cents = (n: number) => Math.round(n * 100) / 100 + 0;

/** Cumulative series over `months`; empty when nothing moved. Prop firms: cash out − in; brokers: realized. */
export function accountSparkline(a: AccountSummaryLite, months: string[]): number[] {
  const perMonth = new Map<string, number>();
  if (a.meta.kind === 'prop_firm') {
    for (const m of a.cash?.byMonth ?? []) perMonth.set(m.month, cents(m.out - m.in));
  } else {
    for (const m of a.byMonth) perMonth.set(m.month, m.realized);
  }
  if (![...perMonth.values()].some((v) => v !== 0)) return [];
  let acc = 0;
  return months.map((m) => (acc = cents(acc + (perMonth.get(m) ?? 0))));
}

export function sortAccounts<T extends { meta: AccountMeta }>(list: T[]): T[] {
  return [...list].sort((a, b) => STATUS_ORDER[a.meta.status] - STATUS_ORDER[b.meta.status]);
}

export function lastActivity(a: AccountSummaryLite): string | null {
  const cashLast = a.cash?.rows[0]?.date ?? null;
  const dates = [a.to, cashLast].filter((d): d is string => !!d).sort();
  return dates.length ? dates[dates.length - 1] : null;
}

/** When linking a transaction to a trading project: the single open prop-firm account to pre-select, else null. */
export function openPropAccount(accounts: { id: string; kind?: TradingKind; status?: TradingStatus }[]): string | null {
  const open = accounts.filter((a) => a.kind === 'prop_firm' && (a.status === 'evaluation' || a.status === 'funded' || a.status === 'active'));
  return open.length === 1 ? open[0].id : null;
}
