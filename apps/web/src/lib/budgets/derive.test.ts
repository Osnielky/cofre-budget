import { describe, it, expect } from 'vitest';
import {
  daysInMonth, dayOfMonth, daysLeft, elapsedPct, isIncomeBudget, splitBudgets,
  roundUp50, deriveBudget, riskCounts, monthTotals, unbudgetedSpending, burnSeries, categoryTrend,
} from './derive';
import type { BudgetWithSpent, Transaction, Category } from './types';

function cat(p: Partial<Category> = {}): Category {
  return { id: 'c1', name: 'Dining', icon: '🍽️', color: '#fff', type: 'expense', ...p };
}
function budget(p: Partial<BudgetWithSpent> = {}): BudgetWithSpent {
  return {
    id: 'b1', categoryId: 'c1', category: cat(), amount: 350, spent: 438.9,
    percentage: 125, remaining: -88.9, ...p,
  };
}
function tx(p: Partial<Transaction> = {}): Transaction {
  return { id: 't1', name: 'Store', amount: -10, date: '2026-08-16', categoryRef: cat(), bankAccount: null, ...p };
}

const NOW = new Date(2026, 7, 21); // Aug 21 2026 — 21 of 31 days elapsed
const MONTH = '2026-08';

describe('daysInMonth / dayOfMonth / daysLeft / elapsedPct', () => {
  it('daysInMonth returns the correct day count', () => {
    expect(daysInMonth('2026-08')).toBe(31);
    expect(daysInMonth('2026-02')).toBe(28);
  });
  it('dayOfMonth uses now.getDate() for the current month', () => {
    expect(dayOfMonth(MONTH, NOW)).toBe(21);
  });
  it('dayOfMonth returns the full month length for a past month', () => {
    expect(dayOfMonth('2026-07', NOW)).toBe(31);
  });
  it('dayOfMonth returns 0 for a future month', () => {
    expect(dayOfMonth('2026-09', NOW)).toBe(0);
  });
  it('daysLeft is daysInMonth minus dayOfMonth', () => {
    expect(daysLeft(MONTH, NOW)).toBe(10);
  });
  it('elapsedPct is dayOfMonth / daysInMonth as a percent', () => {
    expect(elapsedPct(MONTH, NOW)).toBeCloseTo(67.7, 1);
  });
});

describe('isIncomeBudget / splitBudgets', () => {
  it('flags income-category budgets', () => {
    expect(isIncomeBudget(budget({ category: cat({ type: 'income' }) }))).toBe(true);
  });
  it('flags project-category targets even with no category', () => {
    expect(isIncomeBudget(budget({ category: null, projectCategoryId: 'pc1' }))).toBe(true);
  });
  it('treats ordinary expense budgets as spending', () => {
    expect(isIncomeBudget(budget())).toBe(false);
  });
  it('splitBudgets partitions spending vs targets', () => {
    const spending = budget();
    const target = budget({ id: 'b2', category: cat({ type: 'income' }) });
    const { spending: s, targets: t } = splitBudgets([spending, target]);
    expect(s).toEqual([spending]);
    expect(t).toEqual([target]);
  });
});

describe('roundUp50', () => {
  it('rounds up to the nearest 50', () => {
    expect(roundUp50(647.87)).toBe(650);
    expect(roundUp50(600)).toBe(600);
    expect(roundUp50(601)).toBe(650);
  });
});

describe('deriveBudget', () => {
  it('projects a non-fixed budget forward at its current daily rate', () => {
    const d = deriveBudget(budget({ amount: 350, spent: 438.9 }), MONTH, NOW);
    expect(d.isFixed).toBe(false);
    expect(d.projected).toBeCloseTo(647.87, 1); // 438.9 / 21 * 31
    expect(d.projectedTone).toBe('rose'); // well over 110% of 350
  });
  it('keeps a fixed budget projected at its current spend (no extrapolation)', () => {
    const d = deriveBudget(budget({ category: cat({ isFixed: true }), amount: 1500, spent: 1450, percentage: 97, remaining: 50 }), MONTH, NOW);
    expect(d.projected).toBe(1450);
    expect(d.projectedTone).toBe('green');
  });
  it('tones amber when projected is over but within 10%', () => {
    const d = deriveBudget(budget({ amount: 660, spent: 438.9, percentage: 67, remaining: 221.1 }), MONTH, NOW);
    // projected ~647.87, amount 660 -> under, so force a case just over 100% but under 110%
    const d2 = deriveBudget(budget({ amount: 630, spent: 438.9, percentage: 70, remaining: 191.1 }), MONTH, NOW);
    expect(d.projectedTone).toBe('green');
    expect(d2.projectedTone).toBe('amber'); // 647.87 is ~102.8% of 630
  });
  it('computes perDay from remaining budget over days left, null when overspent', () => {
    const onTrack = deriveBudget(budget({ amount: 700, spent: 612.4, percentage: 88, remaining: 87.6 }), MONTH, NOW);
    expect(onTrack.perDay).toBeCloseTo(8.76, 1); // 87.6 / 10 days left
    const over = deriveBudget(budget({ amount: 350, spent: 438.9, percentage: 125, remaining: -88.9 }), MONTH, NOW);
    expect(over.perDay).toBeNull();
  });
  it('groups risk by percentage thresholds', () => {
    expect(deriveBudget(budget({ percentage: 100 }), MONTH, NOW).riskGroup).toBe('over');
    expect(deriveBudget(budget({ percentage: 85 }), MONTH, NOW).riskGroup).toBe('near');
    expect(deriveBudget(budget({ percentage: 50 }), MONTH, NOW).riskGroup).toBe('ontrack');
  });
});

describe('riskCounts', () => {
  it('tallies budgets into over/near/ontrack buckets', () => {
    const spending = [
      budget({ id: '1', percentage: 110 }),
      budget({ id: '2', percentage: 85 }),
      budget({ id: '3', percentage: 50 }),
      budget({ id: '4', percentage: 20 }),
    ];
    expect(riskCounts(spending, MONTH, NOW)).toEqual({ over: 1, near: 1, ontrack: 2 });
  });
});

describe('monthTotals', () => {
  it('sums budget/spent/remaining and computes overall pct + per-day pace', () => {
    const spending = [
      budget({ id: '1', amount: 350, spent: 438.9, category: cat() }),
      budget({ id: '2', amount: 700, spent: 612.4, category: cat({ isFixed: false }) }),
    ];
    const t = monthTotals(spending, MONTH, NOW);
    expect(t.totalBudget).toBe(1050);
    expect(t.totalSpent).toBeCloseTo(1051.3, 1);
    expect(t.totalRemaining).toBeCloseTo(-1.3, 1);
    expect(t.overallPct).toBeCloseTo(100.1, 1);
    expect(t.budgetPerDay).toBeCloseTo(-0.13, 1); // -1.3 / 10 days left
  });
  it('returns zeros for an empty budget list', () => {
    const t = monthTotals([], MONTH, NOW);
    expect(t).toEqual({ totalBudget: 0, totalSpent: 0, totalRemaining: 0, overallPct: 0, totalProjected: 0, budgetPerDay: 0 });
  });
});

describe('unbudgetedSpending', () => {
  it('groups expense transactions whose category has no budget row', () => {
    const budgets = [budget({ categoryId: 'c1' })];
    const txs = [
      tx({ categoryRef: cat({ id: 'c1' }), amount: -20 }),          // budgeted -> excluded
      tx({ categoryRef: cat({ id: 'c2', name: 'Gifts' }), amount: -50 }),
      tx({ categoryRef: cat({ id: 'c2', name: 'Gifts' }), amount: -36 }),
      tx({ categoryRef: cat({ id: 'c3', name: 'Salary', type: 'income' }), amount: 100 }), // income -> excluded
      tx({ categoryRef: null, amount: -15 }),                        // uncategorized -> excluded
    ];
    const result = unbudgetedSpending(txs, budgets);
    expect(result).toEqual([{ categoryId: 'c2', category: cat({ id: 'c2', name: 'Gifts' }), total: 86 }]);
  });
});

describe('burnSeries', () => {
  it('builds a cumulative daily series for budgeted categories only, up to today', () => {
    const budgets = [budget({ categoryId: 'c1' })];
    const txs = [
      tx({ date: '2026-08-01', amount: -10, categoryRef: cat({ id: 'c1' }) }),
      tx({ date: '2026-08-03', amount: -5, categoryRef: cat({ id: 'c1' }) }),
      tx({ date: '2026-08-03', amount: -100, categoryRef: cat({ id: 'c9', name: 'Unbudgeted' }) }), // excluded
    ];
    const series = burnSeries(txs, budgets, MONTH, NOW);
    expect(series).toHaveLength(21); // stops at "today" (day 21), not the full 31-day month
    expect(series[0]).toEqual({ day: 1, cumulative: 10 });
    expect(series[2]).toEqual({ day: 3, cumulative: 15 });
    expect(series[20]).toEqual({ day: 21, cumulative: 15 });
  });
  it('runs the full month for a past month', () => {
    const series = burnSeries([], [budget()], '2026-07', NOW);
    expect(series).toHaveLength(31);
  });
});

describe('categoryTrend', () => {
  it('returns 6 months ending at the given month, zero-filled where no spend', () => {
    const txs = [
      tx({ date: '2026-06-15', amount: -40, categoryRef: cat({ id: 'c1' }) }),
      tx({ date: '2026-08-05', amount: -30, categoryRef: cat({ id: 'c1' }) }),
      tx({ date: '2026-08-06', amount: -20, categoryRef: cat({ id: 'c1' }) }),
      tx({ date: '2026-08-06', amount: -99, categoryRef: cat({ id: 'c2' }) }), // other category
      tx({ date: '2026-08-06', amount: 500, categoryRef: cat({ id: 'c1' }) }), // income, excluded
    ];
    const trend = categoryTrend(txs, 'c1', MONTH, 6);
    expect(trend.map((p) => p.month)).toEqual(['2026-03', '2026-04', '2026-05', '2026-06', '2026-07', '2026-08']);
    expect(trend.find((p) => p.month === '2026-06')?.total).toBe(40);
    expect(trend.find((p) => p.month === '2026-08')?.total).toBe(50);
    expect(trend.find((p) => p.month === '2026-03')?.total).toBe(0);
  });
});
