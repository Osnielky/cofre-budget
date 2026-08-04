import type { BudgetWithSpent, Transaction, Category } from './types';

function monthKeyOf(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function daysInMonth(month: string): number {
  const [y, m] = month.split('-').map(Number);
  return new Date(y, m, 0).getDate();
}

/** Current month -> now.getDate(); past month -> daysInMonth; future month -> 0. */
export function dayOfMonth(month: string, now: Date): number {
  const din = daysInMonth(month);
  const nowKey = monthKeyOf(now);
  if (month === nowKey) return Math.min(now.getDate(), din);
  return month < nowKey ? din : 0;
}

export function daysLeft(month: string, now: Date): number {
  return daysInMonth(month) - dayOfMonth(month, now);
}

export function elapsedPct(month: string, now: Date): number {
  const din = daysInMonth(month);
  return din > 0 ? +((dayOfMonth(month, now) / din) * 100).toFixed(1) : 0;
}

/** Income categories (or project-category targets) track earnings, not spending. */
export function isIncomeBudget(b: BudgetWithSpent): boolean {
  return b.category?.type === 'income' || !!b.projectCategoryId;
}

export function splitBudgets(budgets: BudgetWithSpent[]): { spending: BudgetWithSpent[]; targets: BudgetWithSpent[] } {
  return {
    spending: budgets.filter((b) => !isIncomeBudget(b)),
    targets: budgets.filter(isIncomeBudget),
  };
}

export type RiskGroup = 'over' | 'near' | 'ontrack';
export type Tone = 'green' | 'amber' | 'rose';

export interface BudgetDerived {
  isFixed: boolean;
  projected: number;
  projectedTone: Tone;
  perDay: number | null;
  riskGroup: RiskGroup;
}

/** Round up to the nearest $50 — used to suggest a new limit for an over-budget category. */
export function roundUp50(n: number): number {
  return Math.ceil(n / 50) * 50;
}

export function deriveBudget(b: BudgetWithSpent, month: string, now: Date): BudgetDerived {
  const isFixed = b.category?.isFixed === true;
  const spent = Number(b.spent);
  const amount = Number(b.amount);
  const remaining = Number(b.remaining);
  const dom = dayOfMonth(month, now);
  const din = daysInMonth(month);
  const dLeft = daysLeft(month, now);

  const projected = isFixed ? spent : (dom > 0 ? +((spent / dom) * din).toFixed(2) : 0);
  const projectedTone: Tone =
    projected <= amount ? 'green' : projected <= amount * 1.1 ? 'amber' : 'rose';
  const perDay = remaining > 0 && dLeft > 0 ? +(remaining / dLeft).toFixed(2) : null;

  const pct = b.percentage;
  const riskGroup: RiskGroup = pct >= 100 ? 'over' : pct >= 80 ? 'near' : 'ontrack';

  return { isFixed, projected, projectedTone, perDay, riskGroup };
}

export function riskCounts(spending: BudgetWithSpent[], month: string, now: Date): { over: number; near: number; ontrack: number } {
  let over = 0, near = 0, ontrack = 0;
  for (const b of spending) {
    const g = deriveBudget(b, month, now).riskGroup;
    if (g === 'over') over++;
    else if (g === 'near') near++;
    else ontrack++;
  }
  return { over, near, ontrack };
}

export interface MonthTotals {
  totalBudget: number;
  totalSpent: number;
  totalRemaining: number;
  overallPct: number;
  totalProjected: number;
  budgetPerDay: number;
}

export function monthTotals(spending: BudgetWithSpent[], month: string, now: Date): MonthTotals {
  const totalBudget = +spending.reduce((s, b) => s + Number(b.amount), 0).toFixed(2);
  const totalSpent = +spending.reduce((s, b) => s + Number(b.spent), 0).toFixed(2);
  const totalRemaining = +(totalBudget - totalSpent).toFixed(2);
  const overallPct = totalBudget > 0 ? +((totalSpent / totalBudget) * 100).toFixed(1) : 0;
  const totalProjected = +spending.reduce((s, b) => s + deriveBudget(b, month, now).projected, 0).toFixed(2);
  const dLeft = daysLeft(month, now);
  const budgetPerDay = dLeft > 0 ? +(totalRemaining / dLeft).toFixed(2) : 0;
  return { totalBudget, totalSpent, totalRemaining, overallPct, totalProjected, budgetPerDay };
}

export interface UnbudgetedSlice { categoryId: string; category: Category; total: number }

/** Expense spend on categories with no budget row this month (income/transfer excluded). */
export function unbudgetedSpending(txs: Transaction[], budgets: BudgetWithSpent[]): UnbudgetedSlice[] {
  const budgetedIds = new Set(budgets.map((b) => b.categoryId).filter((id): id is string => !!id));
  const map = new Map<string, UnbudgetedSlice>();
  for (const t of txs) {
    if (Number(t.amount) >= 0) continue;
    const cat = t.categoryRef;
    if (!cat || cat.type === 'income' || cat.type === 'transfer') continue;
    if (budgetedIds.has(cat.id)) continue;
    const cur = map.get(cat.id) ?? { categoryId: cat.id, category: cat, total: 0 };
    cur.total = +(cur.total + Math.abs(Number(t.amount))).toFixed(2);
    map.set(cat.id, cur);
  }
  return [...map.values()].sort((a, b) => b.total - a.total);
}

export interface CategoryTrendPoint { month: string; total: number }

/** Last `months` calendar months (ending at `month`, inclusive) of expense total for one category. */
export function categoryTrend(txs: Transaction[], categoryId: string, month: string, months = 6): CategoryTrendPoint[] {
  const [y, m] = month.split('-').map(Number);
  const keys = Array.from({ length: months }, (_, i) => {
    const d = new Date(y, m - 1 - (months - 1 - i), 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });
  const totals = new Map(keys.map((k) => [k, 0]));
  for (const t of txs) {
    if (Number(t.amount) >= 0) continue;
    if (t.categoryRef?.id !== categoryId) continue;
    const k = t.date.slice(0, 7);
    if (totals.has(k)) totals.set(k, +(totals.get(k)! + Math.abs(Number(t.amount))).toFixed(2));
  }
  return keys.map((k) => ({ month: k, total: totals.get(k)! }));
}

export interface BurnPoint { day: number; cumulative: number }

/** Cumulative daily spend across all budgeted categories, up to today (past months run the full month). */
export function burnSeries(txs: Transaction[], budgets: BudgetWithSpent[], month: string, now: Date): BurnPoint[] {
  const budgetedIds = new Set(budgets.map((b) => b.categoryId).filter((id): id is string => !!id));
  const lastDay = dayOfMonth(month, now) || daysInMonth(month);
  const perDay = new Map<number, number>();
  for (const t of txs) {
    if (Number(t.amount) >= 0) continue;
    if (!t.categoryRef || !budgetedIds.has(t.categoryRef.id)) continue;
    const day = Number(t.date.slice(8, 10));
    perDay.set(day, (perDay.get(day) ?? 0) + Math.abs(Number(t.amount)));
  }
  const points: BurnPoint[] = [];
  let cum = 0;
  for (let day = 1; day <= lastDay; day++) {
    cum += perDay.get(day) ?? 0;
    points.push({ day, cumulative: +cum.toFixed(2) });
  }
  return points;
}
