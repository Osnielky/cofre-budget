import { describe, it, expect } from 'vitest';
import {
  isAcceptedImportFile, mergeFileRows, dateRangeOf, pickFinalBalance, balanceCarriers,
  createKeyFor, defaultNewAccount, summarizeImports, rowKey,
} from './multiFile';
import type { CsvRow } from '@/lib/csvImport';

const row = (date: string, name: string, amount: number, ref?: string): CsvRow =>
  ({ date, name, amount, referenceNumber: ref ?? `${date}|${name}|${amount.toFixed(2)}` });

describe('isAcceptedImportFile', () => {
  it('accepts csv and txt, case-insensitively', () => {
    expect(isAcceptedImportFile('Chase1234.CSV')).toBe(true);
    expect(isAcceptedImportFile('stmt.txt')).toBe(true);
    expect(isAcceptedImportFile('stmt.pdf')).toBe(false);
    expect(isAcceptedImportFile('stmt.xlsx')).toBe(false);
  });
});

describe('rowKey', () => {
  it('prefers the bank reference, else the composite key', () => {
    expect(rowKey(row('2026-01-02', 'A', -1, 'REF9'))).toBe('REF9');
    expect(rowKey({ date: '2026-01-02', name: 'A', amount: -1 })).toBe('2026-01-02|A|-1.00');
  });
});

describe('mergeFileRows', () => {
  it('concatenates files and drops rows repeated across overlapping statements', () => {
    const jan = { name: 'jan.csv', rows: [row('2026-01-05', 'Coffee', -4), row('2026-01-31', 'Rent', -1200)] };
    const feb = { name: 'feb.csv', rows: [row('2026-01-31', 'Rent', -1200), row('2026-02-03', 'Grocery', -80)] };
    const { rows, repeated } = mergeFileRows([jan, feb]);
    expect(rows.map((r) => r.name)).toEqual(['Coffee', 'Rent', 'Grocery']);
    expect(repeated).toBe(1);
  });

  it('keeps legitimately identical-looking rows apart when bank refs differ', () => {
    const a = { name: 'a.csv', rows: [row('2026-01-05', 'Coffee', -4, 'R1')] };
    const b = { name: 'b.csv', rows: [row('2026-01-05', 'Coffee', -4, 'R2')] };
    expect(mergeFileRows([a, b]).rows).toHaveLength(2);
  });
});

describe('dateRangeOf', () => {
  it('returns min/max regardless of sort order, null when empty', () => {
    expect(dateRangeOf([row('2026-03-01', 'x', 1), row('2026-01-15', 'y', 1), row('2026-02-10', 'z', 1)]))
      .toEqual({ from: '2026-01-15', to: '2026-03-01' });
    expect(dateRangeOf([])).toBeNull();
  });
});

describe('pickFinalBalance', () => {
  it('takes the balance from the file with the newest transaction, not the last dropped', () => {
    const files = [
      { name: 'mar.csv', rows: [row('2026-03-30', 'x', 1)], finalBalance: 300 },
      { name: 'jan.csv', rows: [row('2026-01-30', 'x', 1)], finalBalance: 100 },
    ];
    expect(pickFinalBalance(files)).toBe(300);
  });

  it('ignores files without a balance column; undefined when none have one', () => {
    expect(pickFinalBalance([
      { name: 'new.csv', rows: [row('2026-05-01', 'x', 1)] },
      { name: 'old.csv', rows: [row('2026-01-01', 'x', 1)], finalBalance: 42 },
    ])).toBe(42);
    expect(pickFinalBalance([{ name: 'a.csv', rows: [row('2026-01-01', 'x', 1)] }])).toBeUndefined();
  });
});

describe('balanceCarriers', () => {
  it('picks one balance-bearing file per target account', () => {
    const files = [
      { name: 'chase-jan.csv', target: 'acc1', rows: [row('2026-01-31', 'x', 1)], finalBalance: 10 },
      { name: 'chase-feb.csv', target: 'acc1', rows: [row('2026-02-28', 'x', 1)], finalBalance: 20 },
      { name: 'bofa.csv',      target: 'acc2', rows: [row('2026-01-15', 'x', 1)], finalBalance: 5 },
      { name: 'amex.csv',      target: 'acc3', rows: [row('2026-01-15', 'x', 1)] },
    ];
    expect([...balanceCarriers(files)].sort()).toEqual([1, 2]);
  });
});

describe('createKeyFor', () => {
  it('groups files for the same new account and separates different cards', () => {
    const chaseCredit = { bank: 'chase', type: 'credit' as const };
    expect(createKeyFor(chaseCredit, '1234')).toBe(createKeyFor(chaseCredit, '1234'));
    expect(createKeyFor(chaseCredit, '1234')).not.toBe(createKeyFor(chaseCredit, '9999'));
    expect(createKeyFor(chaseCredit, null)).not.toBe(createKeyFor({ bank: 'chase', type: 'bank' }, null));
  });
});

describe('defaultNewAccount', () => {
  it('derives type and a readable name from the fingerprint', () => {
    expect(defaultNewAccount({ bank: 'chase', type: 'credit' }, '1234', 'Chase')).toEqual({
      bankName: 'Chase', accountName: 'Chase Credit ••1234', accountType: 'credit', last4: '1234', color: '#9B6DFF',
    });
    expect(defaultNewAccount({ bank: null, type: 'unknown' }, null, '').accountName).toBe('Checking');
  });
});

describe('summarizeImports', () => {
  const acc = (id: string) => ({ id, bankName: 'B', accountName: id, accountType: 'checking', color: '#000' });
  it('totals counts, dedupes accounts, and unions the date range', () => {
    const s = summarizeImports([
      { fileName: 'a', imported: 10, skipped: 2, account: acc('x'), dateRange: { from: '2026-01-01', to: '2026-01-31' } },
      { fileName: 'b', imported: 5,  skipped: 0, account: acc('x'), dateRange: { from: '2026-02-01', to: '2026-02-28' } },
      { fileName: 'c', imported: 1,  skipped: 1, account: acc('y'), dateRange: null },
    ]);
    expect(s).toEqual({
      files: 3, imported: 16, skipped: 3,
      accounts: [acc('x'), acc('y')],
      dateRange: { from: '2026-01-01', to: '2026-02-28' },
    });
  });
  it('handles an empty batch', () => {
    expect(summarizeImports([])).toEqual({ files: 0, imported: 0, skipped: 0, accounts: [], dateRange: null });
  });
});
