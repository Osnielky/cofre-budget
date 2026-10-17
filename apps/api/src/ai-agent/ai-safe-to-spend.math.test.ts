import { describe, it, expect } from 'vitest';
import { computeSafeToSpend } from './ai-safe-to-spend.math';

describe('computeSafeToSpend', () => {
  it('projects partial-month income and subtracts planned spending + a 5% buffer', () => {
    const now = new Date(2026, 8, 15); // Sep 15 of a 30-day month — 15/30 elapsed
    const out = computeSafeToSpend({ incomeSoFar: 3425, plannedSpending: 4200, now });
    expect(out.income).toBeCloseTo(6850, 2); // 3425 / (15/30)
    expect(out.safetyBuffer).toBeCloseTo(342.5, 2); // 5% of 6850
    expect(out.plannedSpending).toBe(4200);
    expect(out.safeAmount).toBeCloseTo(2307.5, 2); // 6850 - 4200 - 342.5
  });

  it('reports a negative safe amount when planned spending exceeds projected income', () => {
    const now = new Date(2026, 8, 30);
    const out = computeSafeToSpend({ incomeSoFar: 1000, plannedSpending: 4000, now });
    expect(out.safeAmount).toBeLessThan(0);
  });

  it('handles day 1 of the month without dividing by zero', () => {
    const now = new Date(2026, 8, 1);
    const out = computeSafeToSpend({ incomeSoFar: 200, plannedSpending: 100, now });
    expect(Number.isFinite(out.income)).toBe(true);
  });
});
