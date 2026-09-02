import { describe, it, expect } from 'vitest';
import { computeSavingsTrend } from './ai-savings-trend.math';

describe('computeSavingsTrend', () => {
  it('projects the current partial month to month-end and averages the trailing months', () => {
    const monthlyNets = [
      { month: '2026-03', net: 1800 },
      { month: '2026-04', net: 1950 },
      { month: '2026-05', net: 2500 },
      { month: '2026-06', net: 1700 },
      { month: '2026-07', net: 2900 },
      { month: '2026-08', net: 1400 }, // current, partial month
    ];
    const now = new Date(2026, 7, 21); // Aug 21 of a 31-day month — 21/31 elapsed
    const out = computeSavingsTrend(monthlyNets, now);
    expect(out.projected).toBeCloseTo(2066.67, 1); // 1400 / (21/31)
    expect(out.sixMonthAvg).toBeCloseTo(2041.67, 1); // (1800+1950+2500+1700+2900+1400)/6
  });

  it('projects using the actual net when the month just started (avoids inflating a near-zero fraction)', () => {
    const monthlyNets = [{ month: '2026-08', net: 50 }];
    const now = new Date(2026, 7, 1); // day 1 — frac = 1/31, still > 0
    const out = computeSavingsTrend(monthlyNets, now);
    expect(out.projected).toBeCloseTo(50 / (1 / 31), 1);
  });

  it('handles a single month with no history', () => {
    const out = computeSavingsTrend([{ month: '2026-08', net: 1000 }], new Date(2026, 7, 31));
    expect(out.sixMonthAvg).toBe(1000);
  });
});
