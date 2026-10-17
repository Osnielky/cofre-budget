import { describe, it, expect, vi } from 'vitest';
import { parseMoneyInput, formatMoney, applyPercent, toCents } from './money';
import { computePlan, projectMonthExpenses, deriveRow, statusOf, usagePercent, sliderScale, filterRows, sortRows, projectExpenses, type BudgetSource } from './calculations';
import { draftReducer, emptyDraft, previewAdjust, canUndo, type DraftState } from './draft';
import { buildBatchPayload, saveBudgetBatch } from './persist';
import { assemble, dailySeries, monthFraction, type ServerBudget } from './assemble';
import type { Transaction, Category } from '@/lib/dashboard/types';

/* Acceptance fixture: 16 categories totalling $3,915.00, $7,300 expected income. */
function src(key: string, name: string, budget: number, spent: number, extra: Partial<BudgetSource> = {}): BudgetSource {
  return {
    key, budgetId: key, categoryId: `c-${key}`, name, icon: '•', color: '#888', isFixed: false,
    originalCents: toCents(budget), spentCents: toCents(spent), trendCents: [], ...extra,
  };
}
const SOURCES: BudgetSource[] = [
  src('house', 'House & Home', 1300, 1300, { isFixed: true }),
  src('food', 'Food & Dining', 250, 364.63),
  src('transport', 'Transportation', 240, 280),
  src('gym', 'Gym & Health', 180, 178),
  src('subs', 'Subscriptions', 225, 225, { isFixed: true }),
  src('child', 'Child Support', 200, 200, { isFixed: true }),
  src('car', 'Car Insurance', 125, 123.56, { isFixed: true }),
  src('laundry', 'Laundry', 50, 45.59),
  src('care', 'Personal Care', 80, 72.40),
  src('misc', 'Misc', 1265, 684.57),
];
const BASE = {
  sources: SOURCES, expectedIncomeCents: 730000, incomeTargetReceivedCents: 423400,
  incomeReceivedCents: 423400, totalSpentCents: 347375, monthFraction: 17 / 31,
};
const originals = Object.fromEntries(SOURCES.map((s) => [s.key, s.originalCents]));
const loaded: DraftState = draftReducer(emptyDraft, { type: 'load', originals });

describe('acceptance example: Food & Dining $250 → $400', () => {
  const before = computePlan({ ...BASE, drafts: {} });
  const state = draftReducer(loaded, { type: 'set', key: 'food', cents: 40000 });
  const after = computePlan({ ...BASE, drafts: state.drafts });
  const food = after.rows.find((r) => r.key === 'food')!;

  it('starts from the documented baseline', () => {
    expect(before.totalBudgetCents).toBe(391500);
    expect(before.plannedSavingsCents).toBe(338500);
    expect(before.rows.find((r) => r.key === 'food')!.status).toBe('over');
  });
  it('updates the row', () => {
    expect(food.budgetCents).toBe(40000);
    expect(food.remainingCents).toBe(3537);
    expect(food.usagePct).toBe(91.16);
    expect(food.status).toBe('near'); // no longer over budget
  });
  it('updates totals and savings, not spending', () => {
    expect(after.totalBudgetCents).toBe(406500);
    expect(after.totalSpentCents).toBe(347375);
    expect(after.plannedSavingsCents).toBe(323500);
    expect(after.savingsImpactCents).toBe(-15000);
    expect(after.budgetDifferenceCents).toBe(15000);
    expect(after.originalPlannedSavingsCents).toBe(338500);
    expect(after.modifiedCount).toBe(1);
    expect(after.health.over).toBe(before.health.over - 1);
    expect(after.projectedExpensesCents).toBe(before.projectedExpensesCents);
  });
  it('reports the savings change percentage', () => {
    expect(after.savingsChangePct).toBe(-4.43); // -150 / 3385
  });
});

describe('calculations', () => {
  it('handles zero budgets without dividing by zero', () => {
    expect(usagePercent(5000, 0)).toBeNull();
    expect(statusOf(5000, 0)).toBe('unbudgeted');
    expect(statusOf(0, 0)).toBe('idle');
    const r = deriveRow(src('z', 'Z', 0, 12.5), {});
    expect(r.remainingCents).toBe(-1250);
    expect(r.usagePct).toBeNull();
  });
  it('transitions over → near → ok as the budget grows', () => {
    expect(statusOf(10000, 10000)).toBe('over');
    expect(statusOf(10000, 12000)).toBe('near');
    expect(statusOf(10000, 12501)).toBe('ok');
  });
  it('keeps cent precision across many sums', () => {
    const many = Array.from({ length: 10 }, (_, i) => src(`k${i}`, `K${i}`, 0.1, 0));
    const p = computePlan({ ...BASE, sources: many, drafts: {} });
    expect(p.totalBudgetCents).toBe(100); // 0.1 × 10 is exactly $1.00
  });
  it('projects fixed categories at actual and flexible ones at the run-rate', () => {
    const rows = [deriveRow(src('f', 'Rent', 1000, 1000, { isFixed: true }), {}), deriveRow(src('v', 'Food', 300, 100), {})];
    // half the month gone: rent stays $1000, food doubles to $200, $50 uncategorized stays $50
    expect(projectMonthExpenses(rows, 115000, 0.5)).toBe(100000 + 20000 + 5000);
    // future month: the plan is the projection
    expect(projectMonthExpenses([deriveRow(src('v', 'Food', 300, 0), {})], 0, 0)).toBe(30000);
  });
  it('projects with the run-rate method, using the plan for future months', () => {
    expect(projectExpenses(1000, 0.5, 9999)).toBe(2000);
    expect(projectExpenses(1000, 1, 9999)).toBe(1000);
    expect(projectExpenses(0, 0, 9999)).toBe(9999);
  });
  it('keeps the slider scale stable and practical', () => {
    expect(sliderScale(25000, 36463)).toEqual({ max: 55000, step: 1000 });
    expect(sliderScale(0, 0).max).toBe(10000);
  });
  it('filters and sorts', () => {
    const p = computePlan({ ...BASE, drafts: {} });
    expect(filterRows(p.rows, 'over', '').map((r) => r.key).sort()).toEqual(['child', 'food', 'house', 'subs', 'transport']);
    expect(filterRows(p.rows, 'all', 'dining').map((r) => r.key)).toEqual(['food']);
    expect(sortRows(p.rows, 'risk')[0].key).toBe('food'); // 146% is the riskiest
    expect(sortRows(p.rows, 'name')[0].key).toBe('car');
  });
});

describe('money input', () => {
  it('parses typical inputs exactly', () => {
    expect(parseMoneyInput('$1,234.5')).toEqual({ ok: true, cents: 123450 });
    expect(parseMoneyInput('400')).toEqual({ ok: true, cents: 40000 });
    expect(parseMoneyInput('.75')).toEqual({ ok: true, cents: 75 });
    expect(parseMoneyInput('0.29')).toEqual({ ok: true, cents: 29 }); // no 28.999… float bug
  });
  it('rejects invalid input instead of rounding', () => {
    expect(parseMoneyInput('-5').ok).toBe(false);
    expect(parseMoneyInput('abc').ok).toBe(false);
    expect(parseMoneyInput('1.234').ok).toBe(false);
    expect(parseMoneyInput('').ok).toBe(false);
  });
  it('formats', () => {
    expect(formatMoney(-11463)).toBe('-$114.63');
    expect(formatMoney(15000, { sign: true })).toBe('+$150.00');
    expect(applyPercent(25000, 10)).toBe(27500);
    expect(applyPercent(33333, -10)).toBe(30000);
  });
});

describe('draft reducer', () => {
  it('slider and input share one value; setting back to original clears the draft', () => {
    let s = draftReducer(loaded, { type: 'set', key: 'food', cents: 30000 });
    expect(s.drafts.food).toBe(30000);
    s = draftReducer(s, { type: 'set', key: 'food', cents: 25000 });
    expect(s.drafts).toEqual({});
  });
  it('rejects negative or fractional cents', () => {
    expect(draftReducer(loaded, { type: 'set', key: 'food', cents: -1 })).toBe(loaded);
    expect(draftReducer(loaded, { type: 'set', key: 'food', cents: 1.5 })).toBe(loaded);
  });
  it('tracks multiple drafts and undoes edit gestures', () => {
    let s = draftReducer(loaded, { type: 'checkpoint' });
    s = draftReducer(s, { type: 'set', key: 'food', cents: 40000 });
    s = draftReducer(s, { type: 'checkpoint' });
    s = draftReducer(s, { type: 'set', key: 'gym', cents: 20000 });
    expect(Object.keys(s.drafts).sort()).toEqual(['food', 'gym']);
    s = draftReducer(s, { type: 'undo' });
    expect(s.drafts).toEqual({ food: 40000 });
    s = draftReducer(s, { type: 'undo' });
    expect(s.drafts).toEqual({});
    expect(canUndo(s)).toBe(false);
  });
  it('applies percentage adjustments on top of manual edits, with an exact preview', () => {
    let s = draftReducer(loaded, { type: 'set', key: 'food', cents: 40000 });
    const preview = previewAdjust(s, 10, ['food', 'gym']);
    s = draftReducer(s, { type: 'adjust', pct: 10, keys: ['food', 'gym'] });
    expect(s.drafts).toEqual(preview);
    expect(s.drafts).toEqual({ food: 44000, gym: 19800 });
    s = draftReducer(s, { type: 'undo' });
    expect(s.drafts).toEqual({ food: 40000 }); // manual edit survives undo of the adjustment
  });
  it('resets everything and can undo the reset', () => {
    let s = draftReducer(loaded, { type: 'set', key: 'food', cents: 40000 });
    s = draftReducer(s, { type: 'resetAll' });
    expect(s.drafts).toEqual({});
    s = draftReducer(s, { type: 'undo' });
    expect(s.drafts).toEqual({ food: 40000 });
  });
  it('rebase keeps unsaved drafts and drops ones the server now matches', () => {
    let s = draftReducer(loaded, { type: 'set', key: 'food', cents: 40000 });
    s = draftReducer(s, { type: 'set', key: 'gym', cents: 20000 });
    s = draftReducer(s, { type: 'rebase', originals: { ...originals, food: 40000 } });
    expect(s.drafts).toEqual({ gym: 20000 });
    s = draftReducer(s, { type: 'rebase', originals: { food: 40000 } }); // gym row removed
    expect(s.drafts).toEqual({});
  });
  it('load clears drafts (month change)', () => {
    const s = draftReducer(draftReducer(loaded, { type: 'set', key: 'food', cents: 1 }), { type: 'load', originals });
    expect(s.drafts).toEqual({});
  });
});

describe('persistence', () => {
  const sources = [...SOURCES, { ...src('new:x', 'Pets', 0, 40), budgetId: null, categoryId: 'cat-pets' }, { ...src('new:y', 'Gifts', 0, 5), budgetId: null, categoryId: 'cat-gifts' }];
  it('builds updates and creates; skips $0 creates', () => {
    const { payload, invalid } = buildBatchPayload('2026-10', sources, { food: 40000, 'new:x': 5000, 'new:y': 0 });
    expect(invalid).toEqual([]);
    expect(payload).toEqual({ month: '2026-10', items: [{ id: 'food', amount: 400 }, { categoryId: 'cat-pets', amount: 50 }] });
  });
  it('reports success', async () => {
    const f = vi.fn().mockResolvedValue(new Response(JSON.stringify({ saved: 1 }), { status: 200 }));
    const r = await saveBudgetBatch('http://api', { month: '2026-10', items: [{ id: 'a', amount: 1 }] }, f);
    expect(r).toEqual({ ok: true, saved: 1 });
    expect(f.mock.calls[0][0]).toBe('http://api/budgets/batch');
    expect(f.mock.calls[0][1].method).toBe('PUT');
  });
  it('surfaces server and network failures without throwing', async () => {
    const bad = vi.fn().mockResolvedValue(new Response(JSON.stringify({ message: 'Budget x not found' }), { status: 404 }));
    expect(await saveBudgetBatch('http://api', { month: '2026-10', items: [{ id: 'x', amount: 1 }] }, bad))
      .toEqual({ ok: false, error: 'Budget x not found' });
    const down = vi.fn().mockRejectedValue(new TypeError('fetch failed'));
    const r = await saveBudgetBatch('http://api', { month: '2026-10', items: [{ id: 'x', amount: 1 }] }, down);
    expect(r.ok).toBe(false);
  });
});

describe('assemble from real-shaped data', () => {
  const food: Category = { id: 'cf', name: 'Food', icon: '🍔', color: '#f00', type: 'expense' };
  const pets: Category = { id: 'cp', name: 'Pets', icon: '🐶', color: '#0f0', type: 'expense' };
  const xfer: Category = { id: 'ct', name: 'Transfer', icon: '↔', color: '#00f', type: 'transfer' };
  const salary: Category = { id: 'cs', name: 'Salary', icon: '💵', color: '#0ff', type: 'income' };
  const tx = (id: string, date: string, amount: number, categoryRef: Category | null): Transaction =>
    ({ id, name: id, date, amount, source: 'manual', categoryRef, bankAccount: null, projectId: null });
  const txs = [
    tx('1', '2026-10-03', -100.1, food),
    tx('2', '2026-10-05', -0.2, food),
    tx('3', '2026-10-06', -40, pets),        // unbudgeted
    tx('4', '2026-10-07', -500, xfer),       // transfer: excluded
    tx('5', '2026-10-08', -9.99, null),      // uncategorized
    tx('6', '2026-10-01', 3000, salary),
    tx('7', '2026-09-12', -80, food),        // trend history
  ];
  const budgets: ServerBudget[] = [
    { id: 'bf', categoryId: 'cf', category: food, amount: '250.00', spent: 0, percentage: 0, remaining: 0 },
    { id: 'bs', categoryId: 'cs', category: salary, amount: '7300.00', spent: 3000, percentage: 41, remaining: 0 },
  ];
  const a = assemble(budgets, txs, '2026-10');

  it('excludes transfers and counts uncategorized in total spent', () => {
    expect(a.totalSpentCents).toBe(10010 + 20 + 4000 + 999);
    expect(a.uncategorizedCents).toBe(999);
    expect(a.incomeReceivedCents).toBe(300000);
    expect(a.expectedIncomeCents).toBe(730000);
  });
  it('builds budget rows, unbudgeted rows and 6-month trends', () => {
    const byKey = Object.fromEntries(a.sources.map((s) => [s.key, s]));
    expect(byKey.bf.spentCents).toBe(10030);
    expect(byKey.bf.trendCents.slice(-2)).toEqual([8000, 10030]);
    expect(byKey['new:cp']).toMatchObject({ budgetId: null, originalCents: 0, spentCents: 4000 });
    expect(byKey.bs).toBeUndefined(); // income targets aren't spending rows
  });
  it('daily series leaves actuals untouched when the budget changes', () => {
    const now = new Date(2026, 9, 10);
    const s1 = dailySeries(txs, '2026-10', now, 25000, 730000);
    const s2 = dailySeries(txs, '2026-10', now, 40000, 730000);
    expect(s1.map((p) => p.actual)).toEqual(s2.map((p) => p.actual));
    expect(s1[30].budget).toBe(250);
    expect(s2[30].budget).toBe(400);
    expect(s1[9].projected).toBe(s1[9].actual); // projection starts at today
    expect(s1[11].actual).toBeNull();
    expect(monthFraction('2026-11', now)).toBe(0);
  });
});
