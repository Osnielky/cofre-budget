import { describe, it, expect } from 'vitest';
import { isTransfer, inCashFlow, txInMonth, monthKeyOf, monthlyCashFlow, trendSeries } from './derive';
import type { Transaction, Category, BankAccount } from './types';

export function cat(p: Partial<Category> = {}): Category {
  return { id: 'c1', name: 'Food', icon: '🍔', color: '#fff', type: 'expense', ...p };
}
export function acct(p: Partial<BankAccount> = {}): BankAccount {
  return { id: 'a1', bankName: 'B', accountName: 'A', accountType: 'checking', color: '#fff', balance: 0, ...p };
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
