import { describe, it, expect } from 'vitest';
import { buildSnapshot, composeTurn, windowHistory, type SnapshotInput } from './ai-snapshot';

const base: SnapshotInput = {
  today: new Date(2026, 10, 5), // 2026-11-05 local
  focusMonth: '2026-10',
  accounts: [
    { name: 'Checking', type: 'checking', balance: 1234.56 },
    { name: 'GREY BOA', type: 'credit', balance: 1645.96 },
    { name: 'Individual', type: 'investment', balance: 37799.53 },
  ],
  netWorth: { current: 52000, target: 1_000_000, projectedDate: '2041-03-01' },
  month: { key: '2026-10', income: 5200, spending: 3100.5, budgeted: 3500, budgetSpent: 2900 },
  categories: [
    { name: 'Groceries', type: 'expense' },
    { name: 'Dining', type: 'expense' },
    { name: 'Investments', type: 'savings' },
    { name: 'Salary', type: 'income' },
    { name: 'Internal Transfer', type: 'transfer' },
  ],
};

describe('buildSnapshot', () => {
  it('starts with today and the month the user is looking at', () => {
    const text = buildSnapshot(base);
    expect(text.split('\n')[0]).toBe('Today: 2026-11-05. The user is looking at 2026-10.');
  });

  it('falls back to the current month when the UI sends none', () => {
    const text = buildSnapshot({ ...base, focusMonth: null });
    expect(text.split('\n')[0]).toBe('Today: 2026-11-05. The user is looking at 2026-11 (the current month).');
  });

  it('lists every account with its type and balance', () => {
    const text = buildSnapshot(base);
    expect(text).toContain('Accounts: Checking (checking) $1,234.56; GREY BOA (credit) $1,645.96 owed; Individual (investment) $37,799.53');
  });

  it('summarises net worth against the goal', () => {
    expect(buildSnapshot(base)).toContain('Net worth: $52,000.00 of the $1,000,000 goal · projected to reach it 2041-03-01');
    expect(buildSnapshot({ ...base, netWorth: { current: 52000, target: 1_000_000, projectedDate: null } }))
      .toContain('Net worth: $52,000.00 of the $1,000,000 goal · no projection yet');
    expect(buildSnapshot({ ...base, netWorth: null })).not.toContain('Net worth');
  });

  it('gives the month totals in one line', () => {
    expect(buildSnapshot(base)).toContain('2026-10 so far: income $5,200.00 · spending $3,100.50 · budgets $3,500.00 planned, $2,900.00 spent');
    expect(buildSnapshot({ ...base, month: null })).not.toContain('so far');
  });

  it('names the categories and marks the non-expense ones', () => {
    expect(buildSnapshot(base)).toContain('Categories: Groceries, Dining, Investments [savings], Salary [income], Internal Transfer [transfer]');
  });

  it('says so when there are no accounts yet', () => {
    expect(buildSnapshot({ ...base, accounts: [] })).toContain('Accounts: none connected yet');
  });
});

describe('composeTurn', () => {
  it('replaces the stored copy of the latest message with one that carries the snapshot', () => {
    const stored = [
      { role: 'user' as const, content: 'hi' },
      { role: 'assistant' as const, content: 'hello' },
      { role: 'user' as const, content: 'how much did I spend?' },
    ];
    const turn = composeTurn(stored, 'Today: 2026-11-05.', 20);
    expect(turn).toHaveLength(3);
    expect(turn.slice(0, 2)).toEqual(stored.slice(0, 2));
    expect(turn[2]).toEqual({ role: 'user', content: '<snapshot>\nToday: 2026-11-05.\n</snapshot>\n\nhow much did I spend?' });
  });

  it('bounds the earlier turns by the window', () => {
    const stored = Array.from({ length: 41 }, (_, i) => ({ role: (i % 2 === 0 ? 'user' : 'assistant') as 'user' | 'assistant', content: `m${i}` }));
    const turn = composeTurn(stored, 'snap', 4);
    expect(turn.map((m) => m.content.slice(0, 3))).toEqual(['m36', 'm37', 'm38', 'm39', '<sn']);
  });
});

describe('windowHistory', () => {
  const turn = (i: number) => ({ role: (i % 2 === 0 ? 'user' : 'assistant') as 'user' | 'assistant', content: `m${i}` });

  it('keeps a short conversation whole', () => {
    const msgs = [0, 1, 2].map(turn);
    expect(windowHistory(msgs, 20)).toEqual(msgs);
  });

  it('keeps only the newest messages and still opens on a user turn', () => {
    const msgs = Array.from({ length: 25 }, (_, i) => turn(i));
    const kept = windowHistory(msgs, 20);
    expect(kept.length).toBeLessThanOrEqual(20);
    expect(kept[0].role).toBe('user');
    expect(kept.at(-1)).toEqual(msgs.at(-1));
  });
});
