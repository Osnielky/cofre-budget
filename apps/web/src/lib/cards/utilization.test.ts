import { describe, it, expect } from 'vitest';
import { utilization, totalUtilization, utilizationLevel, aprOf } from './utilization';

describe('utilization', () => {
  it('is balance over limit', () => { expect(utilization(300, 1000)).toBeCloseTo(0.3); });
  it('is null without a usable limit', () => {
    expect(utilization(300, null)).toBeNull();
    expect(utilization(300, 0)).toBeNull();
  });
});

describe('totalUtilization', () => {
  it('only counts cards with a limit', () => {
    expect(totalUtilization([
      { balance: 500, creditLimit: 1000 },
      { balance: 1500, creditLimit: 4000 },
      { balance: 9999, creditLimit: null },
    ])).toEqual({ balance: 2000, limit: 5000, ratio: 0.4 });
  });
  it('has no ratio when no card has a limit', () => {
    expect(totalUtilization([{ balance: 10, creditLimit: null }]).ratio).toBeNull();
  });
});

describe('utilizationLevel', () => {
  it.each([[0, 'ok'], [0.299, 'ok'], [0.3, 'watch'], [0.499, 'watch'], [0.5, 'high'], [1.2, 'high']])('%s → %s', (r, level) => {
    expect(utilizationLevel(r as number)).toBe(level);
  });
});

describe('aprOf', () => {
  it('finds the APR of a type', () => {
    const card = { aprs: [{ type: 'purchase' as const, percentage: 24.99, balanceSubjectTo: null, interestCharged: null }] };
    expect(aprOf(card, 'purchase')).toBe(24.99);
    expect(aprOf(card, 'special')).toBeNull();
  });
});
