import { describe, it, expect } from 'vitest';
import { isTransfer, inCashFlow, txInMonth, monthKeyOf } from './derive';
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
