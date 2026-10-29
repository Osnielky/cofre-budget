import { describe, it, expect } from 'vitest';
import { activitySummary } from './activity';

const now = new Date('2026-10-29T15:00:00Z');

describe('activitySummary', () => {
  it('gives every trailing month, oldest first, even with nothing linked', () => {
    const s = activitySummary([], 6, now);
    expect(s.lastActivity).toBeNull();
    expect(s.monthly.map((m) => m.month)).toEqual(['2026-05', '2026-06', '2026-07', '2026-08', '2026-09', '2026-10']);
    expect(s.monthly.every((m) => m.net === 0 && m.income === 0 && m.expenses === 0)).toBe(true);
  });

  it('nets income and expenses per month and ignores rows outside the window', () => {
    const s = activitySummary([
      { date: '2026-10-05', amount: 3800 },
      { date: '2026-10-12', amount: '-290.5' },
      { date: '2026-08-01', amount: -1686.02 },
      { date: '2025-12-31', amount: -9999 },
    ], 3, now);
    expect(s.lastActivity).toBe('2026-10-12');
    expect(s.monthly).toEqual([
      { month: '2026-08', income: 0, expenses: 1686.02, net: -1686.02 },
      { month: '2026-09', income: 0, expenses: 0, net: 0 },
      { month: '2026-10', income: 3800, expenses: 290.5, net: 3509.5 },
    ]);
  });

  it('crosses a year boundary', () => {
    expect(activitySummary([], 3, new Date('2026-01-15T00:00:00Z')).monthly.map((m) => m.month)).toEqual(['2025-11', '2025-12', '2026-01']);
  });
});
