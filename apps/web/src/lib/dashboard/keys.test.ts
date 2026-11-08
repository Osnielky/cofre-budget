import { describe, it, expect } from 'vitest';
import { budgetsKey, currentMonth, dashboardKeys, transactionsKey, yearRange, YEAR_LIST_LIMIT } from './keys';

describe('dashboard cache keys', () => {
  const today = new Date('2026-11-08T15:30:00Z');

  it('yearRange runs from Jan 1 of the local year to today (UTC date)', () => {
    expect(yearRange(today)).toEqual({ from: '2026-01-01', to: '2026-11-08' });
  });

  it('currentMonth is the UTC month', () => {
    expect(currentMonth(today)).toBe('2026-11');
  });

  it('transactionsKey carries the dashboard list limit', () => {
    expect(transactionsKey('2026-01-01', '2026-11-08')).toBe(`/transactions?from=2026-01-01&to=2026-11-08&limit=${YEAR_LIST_LIMIT}`);
  });

  it('dashboardKeys lists the year, the month budgets and the shared lists, each once', () => {
    const keys = dashboardKeys(today);
    expect(keys).toEqual([
      '/transactions?from=2026-01-01&to=2026-11-08&limit=5000',
      budgetsKey('2026-11'),
      '/bank-accounts', '/projects', '/debts',
    ]);
    expect(new Set(keys).size).toBe(keys.length);
  });
});
