import { inCashFlow, monthKeyOf } from '@/lib/dashboard/derive';
import type { Category, Transaction } from '@/lib/dashboard/types';
import { toCents, type Cents } from './money';
import type { BudgetSource } from './calculations';

/** Budget row as returned by GET /budgets?month= */
export interface ServerBudget {
  id: string;
  categoryId: string | null;
  category: Category | null;
  amount: number | string;
  spent: number;
  percentage: number;
  remaining: number;
  month?: string;
  sourceMonth?: string | null;
  projectId?: string | null;
  project?: { id: string; name: string; icon: string; color?: string | null } | null;
  projectCategoryId?: string | null;
}

export const isIncomeBudget = (b: ServerBudget) => b.category?.type === 'income' || !!b.projectCategoryId;

export const TREND_MONTHS = 6;

export function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split('-').map(Number);
  return monthKeyOf(new Date(y, m - 1 + delta, 1));
}

/** Month keys oldest → `month`, inclusive. */
export function monthsBack(month: string, n: number): string[] {
  return Array.from({ length: n }, (_, i) => shiftMonth(month, i - (n - 1)));
}

export function daysIn(month: string): number {
  const [y, m] = month.split('-').map(Number);
  return new Date(y, m, 0).getDate();
}

/** Share of `month` elapsed at `now` — same rule as the dashboard's spendingPace. */
export function monthFraction(month: string, now: Date): number {
  const cur = monthKeyOf(now);
  if (month > cur) return 0;
  if (month < cur) return 1;
  return now.getDate() / daysIn(month);
}

export interface Assembled {
  sources: BudgetSource[];
  totalSpentCents: Cents;      // every cash-flow expense this month
  incomeReceivedCents: Cents;  // every cash-flow income this month
  uncategorizedCents: Cents;   // part of totalSpent with no category
  expectedIncomeCents: Cents;
  incomeTargetReceivedCents: Cents;
}

/**
 * Builds the page's model inputs from server budgets + raw transactions.
 * Actual spending is computed from transactions with the dashboard's
 * classification (`inCashFlow`: no transfers, debt repayments or tracking
 * accounts) so the category rows, totals and charts all agree. Split parents
 * are already excluded by the transactions API.
 */
export function assemble(budgets: ServerBudget[], txs: Transaction[], month: string): Assembled {
  const trendKeys = monthsBack(month, TREND_MONTHS);
  const trendIdx = new Map(trendKeys.map((k, i) => [k, i]));
  const byCat = new Map<string, Cents[]>();
  const catMeta = new Map<string, Category>();
  let totalSpentCents = 0, incomeReceivedCents = 0, uncategorizedCents = 0;

  for (const t of txs) {
    if (!inCashFlow(t)) continue;
    const mk = t.date.slice(0, 7);
    const cents = toCents(t.amount);
    if (mk === month) {
      if (cents > 0) incomeReceivedCents += cents;
      else {
        totalSpentCents += -cents;
        if (!t.categoryRef) uncategorizedCents += -cents;
      }
    }
    const i = trendIdx.get(mk);
    if (i === undefined || cents >= 0 || !t.categoryRef) continue;
    catMeta.set(t.categoryRef.id, t.categoryRef);
    const arr = byCat.get(t.categoryRef.id) ?? Array<Cents>(TREND_MONTHS).fill(0);
    arr[i] += -cents;
    byCat.set(t.categoryRef.id, arr);
  }

  const last = TREND_MONTHS - 1;
  const spending = budgets.filter((b) => !isIncomeBudget(b) && b.category);
  const budgeted = new Set(spending.map((b) => b.categoryId));
  const sources: BudgetSource[] = spending.map((b) => {
    const trend = byCat.get(b.categoryId!) ?? Array<Cents>(TREND_MONTHS).fill(0);
    return {
      key: b.id,
      budgetId: b.id,
      categoryId: b.categoryId,
      name: b.category!.name,
      icon: b.category!.icon,
      color: b.category!.color,
      isFixed: b.category!.isFixed === true,
      originalCents: toCents(b.amount),
      spentCents: trend[last],
      trendCents: trend,
      sourceMonth: b.sourceMonth ?? null,
    };
  });

  // Categories with spending this month but no budget: surfaced as $0 rows so
  // they show as "Unbudgeted" and can be given a budget inline.
  for (const [id, trend] of byCat) {
    const cat = catMeta.get(id)!;
    if (budgeted.has(id) || trend[last] <= 0 || cat.type === 'income' || cat.type === 'transfer') continue;
    sources.push({
      key: `new:${id}`, budgetId: null, categoryId: id,
      name: cat.name, icon: cat.icon, color: cat.color, isFixed: cat.isFixed === true,
      originalCents: 0, spentCents: trend[last], trendCents: trend,
    });
  }

  const targets = budgets.filter(isIncomeBudget);
  return {
    sources,
    totalSpentCents,
    incomeReceivedCents,
    uncategorizedCents,
    expectedIncomeCents: targets.reduce((s, b) => s + toCents(b.amount), 0),
    incomeTargetReceivedCents: targets.reduce((s, b) => s + toCents(b.spent), 0),
  };
}

export interface DailyPoint {
  day: number;
  label: string;
  actual: number | null;     // cumulative spend (dollars), through today
  budget: number;            // linear budget pace
  projected: number | null;  // run-rate projection, today → month end
  savings: number | null;    // expected income − cumulative spend
  plannedSavings: number;    // expected income − budget pace
}

/** Day-by-day series for the Budget vs. Actual chart. Actual spending comes
    only from transactions; drafts move the budget/planned lines alone. */
export function dailySeries(
  txs: Transaction[], month: string, now: Date, totalBudgetCents: Cents, expectedIncomeCents: Cents,
): DailyPoint[] {
  const days = daysIn(month);
  const frac = monthFraction(month, now);
  const today = frac <= 0 ? 0 : frac >= 1 ? days : now.getDate();
  const perDay = Array<Cents>(days + 1).fill(0);
  for (const t of txs) {
    if (!t.date.startsWith(month) || !inCashFlow(t)) continue;
    const c = toCents(t.amount);
    if (c < 0) perDay[Number(t.date.slice(8, 10))] += -c;
  }
  const [y, m] = month.split('-').map(Number);
  const short = new Date(y, m - 1, 1).toLocaleString('en-US', { month: 'short' });
  const spentToday = perDay.slice(1, today + 1).reduce((s, v) => s + v, 0);
  const rate = today > 0 ? spentToday / today : 0;

  const out: DailyPoint[] = [];
  let cum = 0;
  for (let d = 1; d <= days; d++) {
    cum += perDay[d];
    const pace = Math.round((totalBudgetCents * d) / days);
    const actual = d <= today ? cum : null;
    const projected = today > 0 && today < days && d >= today ? Math.round(spentToday + rate * (d - today)) : null;
    out.push({
      day: d,
      label: `${short} ${d}`,
      actual: actual === null ? null : actual / 100,
      budget: pace / 100,
      projected: projected === null ? null : projected / 100,
      savings: actual === null ? null : (expectedIncomeCents - actual) / 100,
      plannedSavings: (expectedIncomeCents - pace) / 100,
    });
  }
  return out;
}
