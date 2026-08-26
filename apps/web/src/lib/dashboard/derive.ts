import { isTrackingAccount, isLiability, accountTypeMeta } from '@/lib/accountTypes';
import type { Transaction, Budget, BankAccount, Debt } from './types';

/** Transfers between own accounts + debt repayments — excluded everywhere. */
export function isTransfer(t: Transaction): boolean {
  return t.categoryRef?.type === 'transfer' || !!t.debtId;
}

/** Cash-flow eligible: not a transfer, not on a net-worth-only tracking account. */
export function inCashFlow(t: Transaction): boolean {
  return !isTransfer(t) && !isTrackingAccount(t.bankAccount?.accountType ?? '');
}

export function txInMonth(txs: Transaction[], monthKey: string): Transaction[] {
  return txs.filter((t) => t.date.startsWith(monthKey));
}

export function monthKeyOf(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

const MONTHS_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

export interface CashFlowMonth {
  month: string; revPersonal: number; revProject: number;
  expPersonal: number; expProject: number; net: number;
}

export function monthlyCashFlow(yearTx: Transaction[], now: Date): CashFlowMonth[] {
  const year = now.getFullYear();
  return Array.from({ length: now.getMonth() + 1 }, (_, i) => {
    const txs = txInMonth(yearTx, `${year}-${String(i + 1).padStart(2, '0')}`).filter(inCashFlow);
    const sum = (pred: (t: Transaction) => boolean) =>
      +txs.filter(pred).reduce((s, t) => s + Math.abs(Number(t.amount)), 0).toFixed(2);
    const revPersonal = sum((t) => Number(t.amount) > 0 && !t.projectId);
    const revProject  = sum((t) => Number(t.amount) > 0 && !!t.projectId);
    const expPersonal = sum((t) => Number(t.amount) < 0 && !t.projectId);
    const expProject  = sum((t) => Number(t.amount) < 0 && !!t.projectId);
    return {
      month: MONTHS_SHORT[i], revPersonal, revProject, expPersonal, expProject,
      net: +(revPersonal + revProject - expPersonal - expProject).toFixed(2),
    };
  });
}

export interface TrendPoint { month: string; income: number; expenses: number; net: number }

export function trendSeries(yearTx: Transaction[], now: Date, months = 6): TrendPoint[] {
  const year = now.getFullYear();
  const end = now.getMonth();               // 0-based current month
  const start = Math.max(0, end - months + 1);
  return Array.from({ length: end - start + 1 }, (_, k) => {
    const i = start + k;
    const txs = txInMonth(yearTx, `${year}-${String(i + 1).padStart(2, '0')}`).filter(inCashFlow);
    const income   = +txs.filter((t) => Number(t.amount) > 0).reduce((s, t) => s + Number(t.amount), 0).toFixed(2);
    const expenses = +txs.filter((t) => Number(t.amount) < 0).reduce((s, t) => s + Math.abs(Number(t.amount)), 0).toFixed(2);
    return { month: MONTHS_SHORT[i], income, expenses, net: +(income - expenses).toFixed(2) };
  });
}

export interface CategorySlice { id: string; name: string; icon: string; color: string; value: number; pct: number }

const UNCAT = { id: 'uncat', name: 'Uncategorized', icon: '❓', color: '#6B6B8A' };
const OTHER = { id: 'other', name: 'Other', icon: '·', color: '#6B6B8A' };

export function categoryTotals(txs: Transaction[], dir: 'income' | 'expense'): CategorySlice[] {
  const sign = dir === 'income' ? 1 : -1;
  const map = new Map<string, CategorySlice>();
  for (const t of txs) {
    if (!inCashFlow(t) || Math.sign(Number(t.amount)) !== sign) continue;
    const c = t.categoryRef ?? UNCAT as never;
    const key = t.categoryRef ? t.categoryRef.id : 'uncat';
    const cur = map.get(key) ?? { id: key, name: c.name, icon: c.icon, color: c.color, value: 0, pct: 0 };
    cur.value = +(cur.value + Math.abs(Number(t.amount))).toFixed(2);
    map.set(key, cur);
  }
  const slices = [...map.values()].sort((a, b) => b.value - a.value);
  const total = slices.reduce((s, x) => s + x.value, 0);
  for (const s of slices) s.pct = total > 0 ? +((s.value / total) * 100).toFixed(1) : 0;
  return slices;
}

export function foldOther(slices: CategorySlice[], max: number): CategorySlice[] {
  if (slices.length <= max) return slices;
  const head = slices.slice(0, max - 1);
  const tail = slices.slice(max - 1);
  const value = +tail.reduce((s, x) => s + x.value, 0).toFixed(2);
  const pct = +tail.reduce((s, x) => s + x.pct, 0).toFixed(1);
  return [...head, { ...OTHER, value, pct }];
}

export interface MerchantSlice { name: string; total: number }

export function topMerchants(txs: Transaction[], n = 5): MerchantSlice[] {
  const map = new Map<string, MerchantSlice>();
  for (const t of txs) {
    if (!inCashFlow(t) || Number(t.amount) >= 0) continue;
    const display = t.name.trim();
    const key = display.toLowerCase();
    const cur = map.get(key) ?? { name: display, total: 0 };
    cur.total = +(cur.total + Math.abs(Number(t.amount))).toFixed(2);
    map.set(key, cur);
  }
  return [...map.values()].sort((a, b) => b.total - a.total).slice(0, n);
}

export interface ExpenseChange {
  id: string; name: string; icon: string; color: string;
  current: number; previous: number; delta: number; pct: number | null;
}

export function expenseChanges(yearTx: Transaction[], monthKey: string): { changes: ExpenseChange[]; unchanged: number } {
  const [y, m] = monthKey.split('-').map(Number);
  const prev = new Date(y, m - 2); // previous month
  const prevKey = monthKeyOf(prev);
  const cur = categoryTotals(txInMonth(yearTx, monthKey), 'expense');
  const before = new Map(categoryTotals(txInMonth(yearTx, prevKey), 'expense').map((s) => [s.id, s]));
  const all: ExpenseChange[] = [];
  const seen = new Set<string>();
  for (const s of cur) {
    seen.add(s.id);
    const p = before.get(s.id)?.value ?? 0;
    all.push({
      id: s.id, name: s.name, icon: s.icon, color: s.color,
      current: s.value, previous: p, delta: +(s.value - p).toFixed(2),
      pct: p > 0 ? +(((s.value - p) / p) * 100).toFixed(1) : null,
    });
  }
  for (const [id, s] of before) {
    if (seen.has(id)) continue; // category dropped to zero this month
    all.push({ id, name: s.name, icon: s.icon, color: s.color, current: 0, previous: s.value, delta: -s.value, pct: -100 });
  }
  const meaningful = (c: ExpenseChange) => Math.abs(c.delta) >= 5 && (c.pct === null || Math.abs(c.pct) >= 2);
  return {
    changes: all.filter(meaningful).sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta)),
    unchanged: all.filter((c) => !meaningful(c)).length,
  };
}

export interface CalendarCell { day: number | null; total: number; intensity: 0 | 1 | 2 | 3 | 4 }

export function calendarDays(yearTx: Transaction[], monthKey: string): CalendarCell[] {
  const [y, m] = monthKey.split('-').map(Number);
  const daysInMonth = new Date(y, m, 0).getDate();
  const firstDow = new Date(y, m - 1, 1).getDay(); // 0 = Sunday
  const perDay = new Map<number, number>();
  for (const t of txInMonth(yearTx, monthKey)) {
    if (!inCashFlow(t) || Number(t.amount) >= 0) continue;
    const day = Number(t.date.slice(8, 10));
    perDay.set(day, +(((perDay.get(day) ?? 0) + Math.abs(Number(t.amount)))).toFixed(2));
  }
  const max = Math.max(0, ...perDay.values());
  const bucket = (v: number): CalendarCell['intensity'] =>
    v <= 0 || max <= 0 ? 0 : v <= max * 0.25 ? 1 : v <= max * 0.5 ? 2 : v <= max * 0.75 ? 3 : 4;
  const cells: CalendarCell[] = [];
  for (let i = 0; i < firstDow; i++) cells.push({ day: null, total: 0, intensity: 0 });
  for (let d = 1; d <= daysInMonth; d++) {
    const total = perDay.get(d) ?? 0;
    cells.push({ day: d, total, intensity: bucket(total) });
  }
  while (cells.length % 7 !== 0) cells.push({ day: null, total: 0, intensity: 0 });
  return cells;
}

export interface PaceStats { monthPct: number; budgetPct: number; projected: number; overBy: number; hasBudgets: boolean }

export function spendingPace(budgets: Budget[], yearTx: Transaction[], monthKey: string, now: Date): PaceStats {
  const spendingBudgets = budgets.filter((b) => b.category ? b.category.type !== 'income' : true);
  const totalBudget = spendingBudgets.reduce((s, b) => s + Number(b.amount), 0);
  const spent = txInMonth(yearTx, monthKey)
    .filter((t) => inCashFlow(t) && Number(t.amount) < 0)
    .reduce((s, t) => s + Math.abs(Number(t.amount)), 0);
  const [y, m] = monthKey.split('-').map(Number);
  const daysInMonth = new Date(y, m, 0).getDate();
  const isCurrent = monthKeyOf(now) === monthKey;
  const isFuture = monthKey > monthKeyOf(now);
  const frac = isFuture ? 0 : isCurrent ? now.getDate() / daysInMonth : 1;
  const projected = frac > 0 ? +(spent / frac).toFixed(2) : 0;
  return {
    monthPct: +(frac * 100).toFixed(1),
    budgetPct: totalBudget > 0 ? +((spent / totalBudget) * 100).toFixed(1) : 0,
    projected,
    overBy: +(projected - totalBudget).toFixed(2),
    hasBudgets: spendingBudgets.length > 0 && totalBudget > 0,
  };
}

export interface FixedVariableSplit {
  fixedTotal: number; variableTotal: number; fixedPct: number;
  fixed: CategorySlice[]; variable: CategorySlice[];
}

export function fixedVariable(yearTx: Transaction[], monthKey: string): FixedVariableSplit {
  const txs = txInMonth(yearTx, monthKey).filter((t) => inCashFlow(t) && Number(t.amount) < 0);
  const fixed = categoryTotals(txs.filter((t) => t.categoryRef?.isFixed === true), 'expense');
  const variable = categoryTotals(txs.filter((t) => t.categoryRef?.isFixed !== true), 'expense');
  const fixedTotal = +fixed.reduce((s, x) => s + x.value, 0).toFixed(2);
  const variableTotal = +variable.reduce((s, x) => s + x.value, 0).toFixed(2);
  const all = fixedTotal + variableTotal;
  return {
    fixedTotal, variableTotal,
    fixedPct: all > 0 ? +((fixedTotal / all) * 100).toFixed(1) : 0,
    fixed, variable,
  };
}

export interface NetWorthItem { label: string; value: number; color: string }
export interface NetWorthBreakdown {
  total: number; assets: number; liabilities: number;
  assetItems: NetWorthItem[]; liabilityItems: NetWorthItem[]; deltaPct: number | null;
  monthNet: number;
}

/**
 * Reproduces the net-worth math from `apps/web/src/app/dashboard/page.tsx`:
 *   totalBalance = Σ(asset balances) − Σ|liability balances|
 *   receivables  = Σ(open 'lent' debts' remaining)      — an asset
 *   payables     = Σ(open 'owed' debts' remaining)      — a liability
 *   netWorth     = totalBalance + receivables − payables
 * Liability balances are taken by magnitude (Math.abs), matching the page's
 * `isDebtAcc(a) ? -Math.abs(balance) : balance` — sign convention in the DB
 * must not change the reported debt.
 */
export function netWorthBreakdown(
  accounts: BankAccount[], debts: Debt[], yearTx: Transaction[], monthKey: string,
): NetWorthBreakdown {
  const assetAccts = accounts.filter((a) => !isLiability(a.accountType));
  const liabAccts  = accounts.filter((a) => isLiability(a.accountType));
  const openDebts = debts.filter((d) => d.status === 'open');
  const receivables = openDebts.filter((d) => d.direction === 'lent').reduce((s, d) => s + Number(d.remaining), 0);
  const payables = openDebts.filter((d) => d.direction === 'owed').reduce((s, d) => s + Number(d.remaining), 0);
  const assets = +(assetAccts.reduce((s, a) => s + Number(a.balance), 0) + receivables).toFixed(2);
  const liabilities = +(liabAccts.reduce((s, a) => s + Math.abs(Number(a.balance)), 0) + payables).toFixed(2);
  const total = +(assets - liabilities).toFixed(2);
  const monthNet = txInMonth(yearTx, monthKey).filter(inCashFlow)
    .reduce((s, t) => s + Number(t.amount), 0);
  const base = total - monthNet;
  const assetItems: NetWorthItem[] = [
    ...assetAccts.map((a) => ({ label: a.accountName, value: Number(a.balance), color: a.color })),
    ...(receivables > 0 ? [{ label: 'Owed to you', value: receivables, color: '#6B6B8A' }] : []),
  ];
  const liabilityItems: NetWorthItem[] = [
    ...liabAccts.map((a) => ({ label: a.accountName, value: Math.abs(Number(a.balance)), color: a.color })),
    ...(payables > 0 ? [{ label: 'Debts you owe', value: payables, color: '#6B6B8A' }] : []),
  ];
  return {
    total, assets, liabilities,
    assetItems, liabilityItems,
    deltaPct: base > 0 ? +((monthNet / base) * 100).toFixed(1) : null,
    monthNet: +monthNet.toFixed(2),
  };
}

export interface AssetMixAccount { id: string; label: string; value: number }
export interface AssetMixGroup {
  key: string; label: string; icon: string; value: number; pct: number; accounts: AssetMixAccount[];
}

const RECEIVABLES_GROUP_KEY = 'receivables';

/**
 * Groups asset accounts by their account type (Checking, Savings, Investment
 * Account, …) plus a synthetic "Money owed to you" group for open debts
 * receivable — the finest breakdown the data model supports, since accounts
 * are the only real "asset" records in this app (no separate asset entity).
 */
export function assetMix(accounts: BankAccount[], debts: Debt[]): AssetMixGroup[] {
  const assetAccts = accounts.filter((a) => !isLiability(a.accountType));
  const groups = new Map<string, AssetMixGroup>();
  for (const a of assetAccts) {
    const meta = accountTypeMeta(a.accountType);
    const key = meta.value;
    const group = groups.get(key) ?? { key, label: meta.label, icon: meta.icon, value: 0, pct: 0, accounts: [] };
    group.value = +(group.value + Number(a.balance)).toFixed(2);
    group.accounts.push({ id: a.id, label: a.accountName, value: Number(a.balance) });
    groups.set(key, group);
  }
  const openReceivables = debts.filter((d) => d.status === 'open' && d.direction === 'lent');
  const receivables = openReceivables.reduce((s, d) => s + Number(d.remaining), 0);
  if (receivables > 0) {
    groups.set(RECEIVABLES_GROUP_KEY, {
      key: RECEIVABLES_GROUP_KEY, label: 'Money owed to you', icon: '🤝',
      value: +receivables.toFixed(2), pct: 0,
      accounts: openReceivables.map((d, i) => ({ id: `debt-${i}`, label: 'Owed to you', value: Number(d.remaining) })),
    });
  }
  const list = [...groups.values()].sort((a, b) => b.value - a.value);
  const total = list.reduce((s, g) => s + g.value, 0);
  for (const g of list) {
    g.pct = total > 0 ? +((g.value / total) * 100).toFixed(1) : 0;
    g.accounts.sort((a, b) => b.value - a.value);
  }
  return list;
}

const TREND_MONTHS_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

export interface NetWorthTrendPoint { month: string; value: number }

/**
 * Approximate net-worth-over-time sparkline: walks backward from `current`
 * by each month's net cash flow (the same approximation the net-worth-goal
 * pace math already relies on). Capped to the current calendar year, since
 * `yearTx` only covers Jan 1 → today.
 */
export function netWorthTrend(current: number, yearTx: Transaction[], now: Date, months = 6): NetWorthTrendPoint[] {
  const year = now.getFullYear();
  const end = now.getMonth();
  const start = Math.max(0, end - months + 1);
  const netByMonth: number[] = [];
  for (let i = start; i <= end; i++) {
    const mk = `${year}-${String(i + 1).padStart(2, '0')}`;
    netByMonth.push(txInMonth(yearTx, mk).filter(inCashFlow).reduce((s, t) => s + Number(t.amount), 0));
  }
  const points: NetWorthTrendPoint[] = [];
  let value = current;
  for (let k = netByMonth.length - 1; k >= 0; k--) {
    points.unshift({ month: TREND_MONTHS_SHORT[start + k], value: +value.toFixed(2) });
    value -= netByMonth[k];
  }
  return points;
}

export interface DailyPoint { day: number; income: number; expenses: number; net: number }

/** Cumulative income/expenses/net per day of the month — sparkline series.
 *  Current month is capped at `now`'s day; past months cover every day. */
export function dailyCumulative(yearTx: Transaction[], monthKey: string, now: Date): DailyPoint[] {
  const [y, m] = monthKey.split('-').map(Number);
  const daysInMonth = new Date(y, m, 0).getDate();
  const lastDay = monthKeyOf(now) === monthKey ? Math.min(now.getDate(), daysInMonth) : daysInMonth;
  const perDay = new Map<number, { inc: number; exp: number }>();
  for (const t of txInMonth(yearTx, monthKey)) {
    if (!inCashFlow(t)) continue;
    const day = Number(t.date.slice(8, 10));
    const cur = perDay.get(day) ?? { inc: 0, exp: 0 };
    const amt = Number(t.amount);
    if (amt > 0) cur.inc += amt; else cur.exp += Math.abs(amt);
    perDay.set(day, cur);
  }
  const points: DailyPoint[] = [];
  let inc = 0, exp = 0;
  for (let day = 1; day <= lastDay; day++) {
    const p = perDay.get(day);
    if (p) { inc += p.inc; exp += p.exp; }
    points.push({ day, income: +inc.toFixed(2), expenses: +exp.toFixed(2), net: +(inc - exp).toFixed(2) });
  }
  return points;
}
