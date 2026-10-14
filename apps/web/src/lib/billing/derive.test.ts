import { describe, it, expect } from 'vitest';
import { trialProgress, yearlySavings, cardBrandLabel, daysUntil } from './derive';

describe('trialProgress', () => {
  it('counts days left and how far through the 15-day trial we are', () => {
    const out = trialProgress('2026-10-29T12:00:00Z', new Date('2026-10-17T12:00:00Z'));
    expect(out).toEqual({ totalDays: 15, daysLeft: 12, dayOfTrial: 3, pct: 20 });
  });
  it('clamps at the ends', () => {
    expect(trialProgress('2026-10-29T12:00:00Z', new Date('2026-11-05T00:00:00Z'))).toMatchObject({ daysLeft: 0, pct: 100 });
    expect(trialProgress('2026-10-29T12:00:00Z', new Date('2026-10-14T12:00:00Z'))).toMatchObject({ daysLeft: 15, pct: 0 });
  });
});

describe('yearlySavings', () => {
  it('uses the real list prices', () => {
    expect(yearlySavings('pro')).toEqual({ amount: 11.98, pct: 20 });
    expect(yearlySavings('elite')).toEqual({ amount: 19.18, pct: 20 });
  });
});

describe('daysUntil', () => {
  it('rounds up whole days and never goes negative', () => {
    expect(daysUntil('2026-10-20T00:00:00Z', new Date('2026-10-14T18:00:00Z'))).toBe(6);
    expect(daysUntil('2026-10-10T00:00:00Z', new Date('2026-10-14T18:00:00Z'))).toBe(0);
  });
});

describe('cardBrandLabel', () => {
  it('names common brands and falls back to a capitalised value', () => {
    expect(cardBrandLabel('visa')).toBe('Visa');
    expect(cardBrandLabel('amex')).toBe('American Express');
    expect(cardBrandLabel('somebank')).toBe('Somebank');
  });
});
