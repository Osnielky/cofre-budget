import { describe, it, expect } from 'vitest';
import { isTransfer, inCashFlow, txInMonth, monthKeyOf, monthlyCashFlow, trendSeries, categoryTotals, foldOther, topMerchants, expenseChanges, calendarDays, spendingPace, fixedVariable, netWorthBreakdown, dailyCumulative, assetMix, netWorthTrend } from './derive';
import type { Transaction, Category, BankAccount, Debt } from './types';

export function cat(p: Partial<Category> = {}): Category {
  return { id: 'c1', name: 'Food', icon: '🍔', color: '#fff', type: 'expense', ...p };
}
export function acct(p: Partial<BankAccount> = {}): BankAccount {
  return { id: 'a1', bankName: 'B', accountName: 'A', accountType: 'checking', color: '#fff', balance: 0, ...p };
}
export function debt(p: Partial<Debt> = {}): Debt {
  return { remaining: 0, status: 'open', direction: 'lent', ...p };
}
export function tx(p: Partial<Transaction> = {}): Transaction {
  return {
    id: 't1', name: 'Store', amount: -10, date: '2026-07-01', source: 'manual',
    categoryRef: cat(), bankAccount: acct(), projectId: null, debtId: null, ...p,
  };
}

describe('isTransfer', () => {
  it('flags transfer-type categories', () => {
    expect(isTransfer(tx({ categoryRef: cat({ type: 'transfer' }) }))).toBe(true);
  });
  it('flags debt repayments', () => {
    expect(isTransfer(tx({ debtId: 'd1' }))).toBe(true);
  });
  it('passes normal expenses', () => {
    expect(isTransfer(tx())).toBe(false);
  });
});

describe('inCashFlow', () => {
  it('excludes transfers', () => {
    expect(inCashFlow(tx({ debtId: 'd1' }))).toBe(false);
  });
  it('excludes tracking accounts (investment)', () => {
    expect(inCashFlow(tx({ bankAccount: acct({ accountType: 'investment' }) }))).toBe(false);
  });
  it('includes ordinary checking expenses', () => {
    expect(inCashFlow(tx())).toBe(true);
  });
  it('tolerates null bankAccount', () => {
    expect(inCashFlow(tx({ bankAccount: null }))).toBe(true);
  });
});

describe('txInMonth / monthKeyOf', () => {
  it('filters by YYYY-MM prefix', () => {
    const txs = [tx({ date: '2026-06-30' }), tx({ date: '2026-07-01' }), tx({ date: '2026-07-31' })];
    expect(txInMonth(txs, '2026-07')).toHaveLength(2);
  });
  it('monthKeyOf formats with zero-padding', () => {
    expect(monthKeyOf(new Date(2026, 0, 15))).toBe('2026-01');
  });
});

const NOW = new Date(2026, 6, 3); // Jul 3 2026

describe('monthlyCashFlow', () => {
  it('splits project vs personal and computes per-month net', () => {
    const txs = [
      tx({ date: '2026-01-05', amount: 1000 }),                       // personal income
      tx({ date: '2026-01-06', amount: 500, projectId: 'p1' }),       // project income
      tx({ date: '2026-01-07', amount: -300 }),                       // personal expense
      tx({ date: '2026-01-08', amount: -200, projectId: 'p1' }),      // project expense
    ];
    const out = monthlyCashFlow(txs, NOW);
    expect(out).toHaveLength(7); // Jan..Jul
    expect(out[0]).toEqual({ month: 'Jan', revPersonal: 1000, revProject: 500, expPersonal: 300, expProject: 200, net: 1000 });
    expect(out[1].net).toBe(0); // empty Feb
  });
  it('excludes transfers and tracking accounts', () => {
    const txs = [
      tx({ date: '2026-01-05', amount: 1000, debtId: 'd1' }),
      tx({ date: '2026-01-05', amount: 1000, bankAccount: acct({ accountType: 'investment' }) }),
    ];
    expect(monthlyCashFlow(txs, NOW)[0].revPersonal).toBe(0);
  });
});

describe('trendSeries', () => {
  it('returns the last 6 months with income, expenses, net', () => {
    const txs = [tx({ date: '2026-07-01', amount: 800 }), tx({ date: '2026-07-02', amount: -300 })];
    const out = trendSeries(txs, NOW);
    expect(out).toHaveLength(6); // Feb..Jul
    expect(out[5]).toEqual({ month: 'Jul', income: 800, expenses: 300, net: 500 });
  });
  it('clamps to January when fewer months exist', () => {
    expect(trendSeries([], new Date(2026, 2, 15))).toHaveLength(3); // Jan, Feb, Mar
  });
});

describe('categoryTotals', () => {
  it('groups expenses by category with pct', () => {
    const food = cat({ id: 'f', name: 'Food' });
    const gas  = cat({ id: 'g', name: 'Gas' });
    const out = categoryTotals([
      tx({ amount: -75, categoryRef: food }), tx({ amount: -25, categoryRef: gas }),
      tx({ amount: 500, categoryRef: cat({ id: 'i', type: 'income' }) }), // ignored for dir=expense
    ], 'expense');
    expect(out.map((s) => [s.id, s.value, s.pct])).toEqual([['f', 75, 75], ['g', 25, 25]]);
  });
  it('folds uncategorized', () => {
    const out = categoryTotals([tx({ amount: -10, categoryRef: null })], 'expense');
    expect(out[0].id).toBe('uncat');
  });
});

describe('foldOther', () => {
  it('keeps top max-1 and sums the tail', () => {
    const slices = [80, 10, 6, 4].map((v, i) => ({ id: `c${i}`, name: `C${i}`, icon: '', color: '', value: v, pct: v }));
    const out = foldOther(slices, 3);
    expect(out).toHaveLength(3);
    expect(out[2]).toMatchObject({ id: 'other', value: 10 });
  });
  it('no-ops when under the cap', () => {
    expect(foldOther([], 6)).toHaveLength(0);
  });
});

describe('topMerchants', () => {
  it('normalizes names case-insensitively and ranks by total', () => {
    const out = topMerchants([
      tx({ name: 'Amazon', amount: -50 }), tx({ name: 'AMAZON ', amount: -30 }),
      tx({ name: 'Walmart', amount: -60 }),
    ]);
    expect(out[0]).toEqual({ name: 'Amazon', total: 80 });
    expect(out[1]).toEqual({ name: 'Walmart', total: 60 });
  });
});

describe('expenseChanges', () => {
  const food = cat({ id: 'f', name: 'Food' });
  it('computes per-category deltas vs previous month', () => {
    const { changes } = expenseChanges([
      tx({ date: '2026-06-10', amount: -100, categoryRef: food }),
      tx({ date: '2026-07-10', amount: -150, categoryRef: food }),
    ], '2026-07');
    expect(changes[0]).toMatchObject({ id: 'f', current: 150, previous: 100, delta: 50, pct: 50 });
  });
  it('collapses trivial changes into unchanged count', () => {
    const { changes, unchanged } = expenseChanges([
      tx({ date: '2026-06-10', amount: -100, categoryRef: food }),
      tx({ date: '2026-07-10', amount: -101, categoryRef: food }),
    ], '2026-07');
    expect(changes).toHaveLength(0);
    expect(unchanged).toBe(1);
  });
  it('handles January (previous month = December prior year) without crashing', () => {
    const { changes } = expenseChanges([tx({ date: '2026-01-10', amount: -100, categoryRef: food })], '2026-01');
    expect(changes[0].pct).toBeNull(); // no previous data
  });
});

describe('calendarDays', () => {
  it('pads to full weeks, Sunday-first', () => {
    const out = calendarDays([], '2026-07'); // Jul 1 2026 = Wednesday
    expect(out.length % 7).toBe(0);
    expect(out.slice(0, 3).every((c) => c.day === null)).toBe(true); // Sun,Mon,Tue pads
    expect(out[3].day).toBe(1);
  });
  it('buckets intensity by quartile of max daily spend', () => {
    const out = calendarDays([
      tx({ date: '2026-07-01', amount: -100 }),
      tx({ date: '2026-07-02', amount: -20 }),
    ], '2026-07');
    const d1 = out.find((c) => c.day === 1)!;
    const d2 = out.find((c) => c.day === 2)!;
    const d3 = out.find((c) => c.day === 3)!;
    expect(d1.intensity).toBe(4);
    expect(d2.intensity).toBe(1);
    expect(d3.intensity).toBe(0);
  });
});

describe('spendingPace', () => {
  const budget = { id: 'b1', amount: 1000, spent: 0, category: cat() };
  it('computes month vs budget percentages and projection', () => {
    // Jul 15 of a 31-day month ≈ 48.4% elapsed; $600 spent of $1000 = 60%
    const out = spendingPace([budget], [tx({ date: '2026-07-10', amount: -600 })], '2026-07', new Date(2026, 6, 15));
    expect(out.monthPct).toBeCloseTo(48.4, 1);
    expect(out.budgetPct).toBe(60);
    expect(out.projected).toBeCloseTo(1240, 0);
    expect(out.overBy).toBeCloseTo(240, 0);
  });
  it('flags missing budgets', () => {
    expect(spendingPace([], [], '2026-07', new Date(2026, 6, 15)).hasBudgets).toBe(false);
  });
  it('views past months as fully elapsed', () => {
    expect(spendingPace([budget], [], '2026-06', new Date(2026, 6, 15)).monthPct).toBe(100);
  });
});

describe('fixedVariable', () => {
  it('splits on category.isFixed; unflagged goes variable', () => {
    const rent = cat({ id: 'r', name: 'Rent', isFixed: true });
    const out = fixedVariable([
      tx({ date: '2026-07-01', amount: -1500, categoryRef: rent }),
      tx({ date: '2026-07-02', amount: -500 }),           // Food, unflagged
      tx({ date: '2026-07-03', amount: -100, categoryRef: null }),
    ], '2026-07');
    expect(out.fixedTotal).toBe(1500);
    expect(out.variableTotal).toBe(600);
    expect(out.fixedPct).toBeCloseTo(71.4, 1);
    expect(out.fixed).toHaveLength(1);
    expect(out.variable).toHaveLength(2);
  });
});

describe('netWorthBreakdown', () => {
  it('sums assets minus liabilities with receivables', () => {
    const out = netWorthBreakdown(
      [acct({ id: 'a1', accountName: 'Chk', accountType: 'checking', balance: 5000 }),
       acct({ id: 'a2', accountName: 'CC', accountType: 'credit', balance: 1200 })],
      [debt({ remaining: 300, status: 'open' })],
      [], '2026-07',
    );
    expect(out.assets).toBe(5300);       // 5000 + 300 receivable
    expect(out.liabilities).toBe(1200);
    expect(out.total).toBe(4100);
  });
  it('treats open "owed" debts as a liability, not a receivable', () => {
    const out = netWorthBreakdown(
      [acct({ balance: 5000 })],
      [debt({ remaining: 300, status: 'open', direction: 'lent' }),
       debt({ remaining: 800, status: 'open', direction: 'owed' })],
      [], '2026-07',
    );
    expect(out.assets).toBe(5300);         // 5000 + 300 receivable ('lent')
    expect(out.liabilities).toBe(800);     // 800 payable ('owed')
    expect(out.total).toBe(4500);
    expect(out.liabilityItems).toContainEqual({ label: 'Debts you owe', value: 800, color: '#6B6B8A' });
  });
  it('approximates month delta from this month cash flow', () => {
    const out = netWorthBreakdown(
      [acct({ balance: 5000 })], [],
      [tx({ date: '2026-07-01', amount: 1000 })], '2026-07',
    );
    expect(out.deltaPct).toBeCloseTo(25, 0); // 1000 / (5000-1000)
  });
  it('mirrors the dashboard page: liability balances are treated by magnitude regardless of sign', () => {
    // If a credit-card balance is ever stored negative (owed amount as a negative number),
    // the page's totalDebt = Math.abs(balance) must still be reproduced here.
    const out = netWorthBreakdown(
      [acct({ id: 'a1', accountName: 'Chk', accountType: 'checking', balance: 5000 }),
       acct({ id: 'a2', accountName: 'CC', accountType: 'credit', balance: -1200 })],
      [], [], '2026-07',
    );
    expect(out.liabilities).toBe(1200);
    expect(out.total).toBe(3800);
  });
  it('exposes this month cash flow as a dollar amount', () => {
    const out = netWorthBreakdown(
      [acct({ balance: 5000 })], [],
      [tx({ date: '2026-07-01', amount: 1000 })], '2026-07',
    );
    expect(out.monthNet).toBe(1000);
  });
});

describe('assetMix', () => {
  it('groups accounts by type and computes percentages', () => {
    const out = assetMix(
      [acct({ id: 'a1', accountName: 'Chase Checking', accountType: 'checking', balance: 3000 }),
       acct({ id: 'a2', accountName: 'Ally Savings', accountType: 'savings', balance: 1000 }),
       acct({ id: 'a3', accountName: 'Vanguard', accountType: 'investment', balance: 6000 })],
      [],
    );
    expect(out).toHaveLength(3);
    expect(out[0]).toMatchObject({ label: 'Investment Account', value: 6000, pct: 60 });
    expect(out[0].accounts).toEqual([{ id: 'a3', label: 'Vanguard', value: 6000 }]);
  });
  it('merges multiple accounts of the same type into one group', () => {
    const out = assetMix(
      [acct({ id: 'a1', accountName: 'Chk 1', accountType: 'checking', balance: 1000 }),
       acct({ id: 'a2', accountName: 'Chk 2', accountType: 'checking', balance: 500 })],
      [],
    );
    expect(out).toHaveLength(1);
    expect(out[0].value).toBe(1500);
    expect(out[0].accounts).toHaveLength(2);
  });
  it('adds a receivables group for open lent debts, excludes paid ones', () => {
    const out = assetMix([], [debt({ remaining: 300, status: 'open' }), debt({ remaining: 200, status: 'paid' })]);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ label: 'Money owed to you', value: 300 });
  });
  it('excludes open "owed" debts from the receivables group', () => {
    const out = assetMix([], [debt({ remaining: 300, status: 'open', direction: 'lent' }),
      debt({ remaining: 900, status: 'open', direction: 'owed' })]);
    expect(out).toHaveLength(1);
    expect(out[0].value).toBe(300);
  });
  it('excludes liability accounts', () => {
    const out = assetMix([acct({ accountType: 'credit', balance: 500 })], []);
    expect(out).toHaveLength(0);
  });
});

describe('netWorthTrend', () => {
  const NOW = new Date(2026, 6, 15); // Jul 15 2026
  it('walks backward from current using each month net cash flow, capped to start of year', () => {
    const yearTx = [
      tx({ date: '2026-06-01', amount: 500 }),
      tx({ date: '2026-07-01', amount: 200 }),
    ];
    const out = netWorthTrend(10000, yearTx, NOW, 3);
    expect(out.map((p) => p.month)).toEqual(['May', 'Jun', 'Jul']);
    expect(out[2].value).toBe(10000);   // Jul (current)
    expect(out[1].value).toBe(9800);    // before Jul's +200
    expect(out[0].value).toBe(9300);    // before Jun's +500
  });
});

describe('dailyCumulative', () => {
  const NOW = new Date(2026, 6, 4); // Jul 4 2026
  it('accumulates income and expenses by day, flat after last transaction', () => {
    const out = dailyCumulative([
      tx({ date: '2026-07-01', amount: 100 }),
      tx({ date: '2026-07-03', amount: -40 }),
    ], '2026-07', NOW);
    expect(out).toHaveLength(4); // current month capped at Jul 4
    expect(out[0]).toEqual({ day: 1, income: 100, expenses: 0, net: 100 });
    expect(out[2]).toEqual({ day: 3, income: 100, expenses: 40, net: 60 });
    expect(out[3].net).toBe(60);
  });
  it('covers the whole month for past months', () => {
    expect(dailyCumulative([], '2026-06', NOW)).toHaveLength(30);
  });
  it('excludes transfers and tracking accounts', () => {
    const out = dailyCumulative([
      tx({ date: '2026-07-01', amount: 500, debtId: 'd1' }),
      tx({ date: '2026-07-01', amount: 500, bankAccount: acct({ accountType: 'investment' }) }),
    ], '2026-07', NOW);
    expect(out[0].income).toBe(0);
  });
});
