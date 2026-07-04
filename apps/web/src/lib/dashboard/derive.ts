import { isTrackingAccount } from '@/lib/accountTypes';
import type { Transaction, Budget } from './types';

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
