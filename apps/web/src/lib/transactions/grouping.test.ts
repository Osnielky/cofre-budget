import { describe, it, expect } from 'vitest';
import { groupTransactions } from './grouping';

type T = { id: string; amount: number; bankAccountId: string | null; bankAccount: { bankName: string } | null; transfer?: boolean; recurring?: boolean };
const tx = (id: string, amount: number, bank: string | null, extra: Partial<T> = {}): T =>
  ({ id, amount, bankAccountId: bank, bankAccount: bank ? { bankName: bank === 'b1' ? 'Chase' : 'Bank of America' } : null, ...extra });
const rules = { isNonSpending: (t: T) => !!t.transfer, isRecurring: (t: T) => !!t.recurring };
const rows = [
  tx('1', -10, 'b1', { recurring: true }),
  tx('2', 500, 'b2'),
  tx('3', -20, 'b2'),
  tx('4', -100, 'b1', { transfer: true }),
  tx('5', -5, null),
];

describe('groupTransactions', () => {
  it('groups by bank, sorted by bank name, keeping row order', () => {
    const g = groupTransactions(rows, 'bank', rules);
    expect(g.map((x) => x.label)).toEqual(['Bank of America', 'Chase', 'Unknown bank']);
    expect(g[1].txs.map((t) => t.id)).toEqual(['1', '4']);
  });
  it('groups by income / expenses, keeping transfers apart', () => {
    const g = groupTransactions(rows, 'flow', rules);
    expect(g.map((x) => [x.kind, x.txs.map((t) => t.id)])).toEqual([
      ['income', ['2']], ['expense', ['1', '3', '5']], ['other', ['4']],
    ]);
  });
  it('groups by recurring vs one-time and drops empty groups', () => {
    const g = groupTransactions(rows, 'recurring', rules);
    expect(g.map((x) => [x.kind, x.txs.length])).toEqual([['recurring', 1], ['one-time', 4]]);
    expect(groupTransactions([tx('9', -1, 'b1')], 'recurring', rules).map((x) => x.kind)).toEqual(['one-time']);
  });
  it('uses ids that cannot collide across modes', () => {
    const ids = [...groupTransactions(rows, 'flow', rules), ...groupTransactions(rows, 'recurring', rules)].map((g) => g.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
