import type { Cents } from './money';

/**
 * The single financial model behind the Budgets page. Every card, chart,
 * row, alert and toolbar reads from `computePlan` — no component re-derives
 * these formulas.
 *
 * Inputs are integer cents. "Original" values are what the server has
 * persisted; "draft" values are unsaved edits keyed by row key.
 */

/** Existing Cofre thresholds (budgets page + dashboard): ≥80% near, ≥100% over. */
export const THRESHOLDS = { near: 80, over: 100 } as const;

export type HealthStatus = 'over' | 'near' | 'ok' | 'unbudgeted' | 'idle';

/** One spending category on the page — either a persisted budget or a
    category with spending this month but no budget yet. */
export interface BudgetSource {
  key: string;                 // stable row key: budget id, or `new:<categoryId>`
  budgetId: string | null;
  categoryId: string | null;
  name: string;
  icon: string;
  color: string;
  isFixed: boolean;            // fixed vs discretionary (Category.isFixed)
  originalCents: Cents;
  spentCents: Cents;           // actual expenses this month (transfers excluded)
  trendCents: Cents[];         // monthly spend, oldest → current month
  sourceMonth?: string | null; // carried-forward origin, if any
}

export type Drafts = Readonly<Record<string, Cents>>;

export interface DerivedRow extends BudgetSource {
  budgetCents: Cents;          // draft if edited, else original
  remainingCents: Cents;
  usagePct: number | null;     // null when budget is 0 (no division by zero)
  status: HealthStatus;
  deltaCents: Cents;           // budget − original
  modified: boolean;
}

export function usagePercent(spent: Cents, budget: Cents): number | null {
  if (budget <= 0) return null;
  return Math.round((spent * 10000) / budget) / 100; // 2-decimal percent
}

export function statusOf(spent: Cents, budget: Cents): HealthStatus {
  if (budget <= 0) return spent > 0 ? 'unbudgeted' : 'idle';
  const pct = (spent * 100) / budget;
  if (pct >= THRESHOLDS.over) return 'over';
  if (pct >= THRESHOLDS.near) return 'near';
  return 'ok';
}

export function deriveRow(src: BudgetSource, drafts: Drafts): DerivedRow {
  const budgetCents = drafts[src.key] ?? src.originalCents;
  return {
    ...src,
    budgetCents,
    remainingCents: budgetCents - src.spentCents,
    usagePct: usagePercent(src.spentCents, budgetCents),
    status: statusOf(src.spentCents, budgetCents),
    deltaCents: budgetCents - src.originalCents,
    modified: budgetCents !== src.originalCents,
  };
}

export interface PlanInputs {
  sources: BudgetSource[];
  drafts: Drafts;
  expectedIncomeCents: Cents;   // Σ income targets
  incomeTargetReceivedCents: Cents; // Σ earned against income targets
  incomeReceivedCents: Cents;   // all cash-flow income this month
  totalSpentCents: Cents;       // all cash-flow expenses this month (incl. unbudgeted/uncategorized)
  /** Share of the month elapsed: 0 = future month, 1 = past month. */
  monthFraction: number;
}

export interface HealthCounts { over: number; near: number; ok: number; unbudgeted: number; idle: number }

export interface Plan {
  rows: DerivedRow[];
  totalBudgetCents: Cents;
  originalTotalBudgetCents: Cents;
  totalSpentCents: Cents;
  underBudgetCents: Cents;          // totalBudget − totalSpent (negative = over)
  expectedIncomeCents: Cents;
  incomeTargetReceivedCents: Cents;
  plannedSavingsCents: Cents;       // expectedIncome − totalBudget
  originalPlannedSavingsCents: Cents;
  budgetDifferenceCents: Cents;     // draft − original total
  savingsImpactCents: Cents;        // original − draft total
  savingsChangePct: number | null;  // impact relative to original planned savings
  projectedExpensesCents: Cents;
  projectedSavingsCents: Cents;     // expectedIncome − projectedExpenses
  actualCashFlowCents: Cents;       // income received − expenses paid
  health: HealthCounts;
  modifiedCount: number;
  attention: DerivedRow[];          // over / near / unbudgeted, riskiest first
}

/**
 * Projected month-end expenses using the app's existing run-rate method
 * (`spendingPace` on the dashboard): spent ÷ share-of-month-elapsed. A future
 * month has no spending to extrapolate, so the plan itself is the projection.
 */
export function projectExpenses(spent: Cents, monthFraction: number, totalBudget: Cents): Cents {
  if (monthFraction <= 0) return totalBudget;
  if (monthFraction >= 1) return spent;
  return Math.round(spent / monthFraction);
}

const RISK_ORDER: Record<HealthStatus, number> = { over: 0, unbudgeted: 1, near: 2, ok: 3, idle: 4 };

/** Higher = riskier. Used for "Sort by highest risk" and attention ordering. */
export function riskScore(r: DerivedRow): number {
  if (r.status === 'unbudgeted') return 1_000_000 + r.spentCents / 100;
  return r.usagePct ?? -1;
}

export function compareRisk(a: DerivedRow, b: DerivedRow): number {
  return RISK_ORDER[a.status] - RISK_ORDER[b.status] || riskScore(b) - riskScore(a);
}

export function computePlan(input: PlanInputs): Plan {
  const rows = input.sources.map((s) => deriveRow(s, input.drafts));
  const totalBudgetCents = rows.reduce((s, r) => s + r.budgetCents, 0);
  const originalTotalBudgetCents = rows.reduce((s, r) => s + r.originalCents, 0);
  const plannedSavingsCents = input.expectedIncomeCents - totalBudgetCents;
  const originalPlannedSavingsCents = input.expectedIncomeCents - originalTotalBudgetCents;
  const savingsImpactCents = originalTotalBudgetCents - totalBudgetCents;
  const projectedExpensesCents = projectExpenses(input.totalSpentCents, input.monthFraction, totalBudgetCents);

  const health: HealthCounts = { over: 0, near: 0, ok: 0, unbudgeted: 0, idle: 0 };
  for (const r of rows) health[r.status]++;

  return {
    rows,
    totalBudgetCents,
    originalTotalBudgetCents,
    totalSpentCents: input.totalSpentCents,
    underBudgetCents: totalBudgetCents - input.totalSpentCents,
    expectedIncomeCents: input.expectedIncomeCents,
    incomeTargetReceivedCents: input.incomeTargetReceivedCents,
    plannedSavingsCents,
    originalPlannedSavingsCents,
    budgetDifferenceCents: -savingsImpactCents,
    savingsImpactCents,
    savingsChangePct: originalPlannedSavingsCents !== 0
      ? Math.round((savingsImpactCents * 10000) / Math.abs(originalPlannedSavingsCents)) / 100
      : null,
    projectedExpensesCents,
    projectedSavingsCents: input.expectedIncomeCents - projectedExpensesCents,
    actualCashFlowCents: input.incomeReceivedCents - input.totalSpentCents,
    health,
    modifiedCount: rows.filter((r) => r.modified).length,
    attention: rows.filter((r) => r.status === 'over' || r.status === 'near' || r.status === 'unbudgeted').sort(compareRisk),
  };
}

/* ── Table filtering / sorting ─────────────────────────────────────────── */

export type RowFilter = 'all' | 'over' | 'near' | 'ok' | 'unbudgeted';
export type RowSort = 'risk' | 'spent' | 'budget' | 'name' | 'remaining';

export function filterRows(rows: DerivedRow[], filter: RowFilter, query: string): DerivedRow[] {
  const q = query.trim().toLowerCase();
  return rows.filter((r) => {
    if (q && !r.name.toLowerCase().includes(q)) return false;
    if (filter === 'all') return true;
    if (filter === 'ok') return r.status === 'ok' || r.status === 'idle';
    return r.status === filter;
  });
}

export function sortRows(rows: DerivedRow[], sort: RowSort): DerivedRow[] {
  const out = [...rows];
  switch (sort) {
    case 'risk':      return out.sort(compareRisk);
    case 'spent':     return out.sort((a, b) => b.spentCents - a.spentCents);
    case 'budget':    return out.sort((a, b) => b.budgetCents - a.budgetCents);
    case 'remaining': return out.sort((a, b) => a.remainingCents - b.remainingCents);
    case 'name':      return out.sort((a, b) => a.name.localeCompare(b.name));
  }
}

/* ── Slider scale ──────────────────────────────────────────────────────── */

export interface SliderScale { max: Cents; step: Cents }

/** Practical slider range for a row, derived from persisted values only so the
    scale doesn't shift under the thumb while dragging. Typed values may exceed it. */
export function sliderScale(originalCents: Cents, spentCents: Cents): SliderScale {
  const base = Math.max(originalCents * 2, Math.round(spentCents * 1.5), 100_00);
  const step = base <= 500_00 ? 5_00 : base <= 2_000_00 ? 10_00 : base <= 10_000_00 ? 25_00 : 50_00;
  return { max: Math.ceil(base / step) * step, step };
}
