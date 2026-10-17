import { describe, it, expect } from 'vitest';
import { estimateMrr } from './plan-prices';

describe('estimateMrr', () => {
  it('adds monthly prices and spreads yearly ones over 12 months', () => {
    expect(estimateMrr([
      { tier: 'pro', interval: 'month' },   // 4.99
      { tier: 'elite', interval: 'month' }, // 7.99
      { tier: 'pro', interval: 'year' },    // 47.90 / 12 = 3.9917
      { tier: 'elite', interval: 'year' },  // 76.70 / 12 = 6.3917
    ])).toBe(23.36);
  });
  it('is 0 with no subscriptions', () => {
    expect(estimateMrr([])).toBe(0);
  });
});
