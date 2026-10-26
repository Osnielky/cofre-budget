import { describe, it, expect } from 'vitest';
import { payoffPlan, MAX_PAYOFF_MONTHS } from './payoff';

describe('payoffPlan', () => {
  it('pays a balance down with monthly interest charged first', () => {
    // $5,000 at 24% APR, $200/mo: n = −ln(1 − 0.02·5000/200) / ln(1.02) ≈ 35.0 → 36 payments, ≈ $2,000 interest.
    const r = payoffPlan({ balance: 5_000, aprPct: 24, payment: 200 });
    expect(r.never).toBe(false);
    if (r.never) return;
    expect(r.months).toBe(36);
    expect(r.totalInterest).toBeGreaterThan(1_990);
    expect(r.totalInterest).toBeLessThan(2_010);
    expect(r.totalPaid).toBeCloseTo(5_000 + r.totalInterest, 2);
    expect(r.schedule).toHaveLength(36);
    expect(r.schedule[35].balance).toBe(0);
    // The last payment is only what is left, not the full $200.
    expect(r.schedule[35].interest + r.schedule[35].principal).toBeLessThan(200);
  });

  it('clears a zero-APR balance in balance / payment months', () => {
    const r = payoffPlan({ balance: 1_200, aprPct: 0, payment: 100 });
    expect(r.never).toBe(false);
    if (r.never) return;
    expect(r.months).toBe(12);
    expect(r.totalInterest).toBe(0);
  });

  it('reports never when the payment does not cover the interest', () => {
    const r = payoffPlan({ balance: 10_000, aprPct: 24, payment: 200 });
    expect(r.never).toBe(true);
    if (!r.never) return;
    // First month's interest is $200; one more dollar makes progress.
    expect(r.minimumToMakeProgress).toBe(201);
  });

  it('is already paid with no balance', () => {
    const r = payoffPlan({ balance: 0, aprPct: 20, payment: 50 });
    expect(r).toMatchObject({ never: false, months: 0, totalInterest: 0, totalPaid: 0 });
  });

  it('treats zero or negative payments as never', () => {
    expect(payoffPlan({ balance: 100, aprPct: 0, payment: 0 }).never).toBe(true);
  });

  it('stops at the cap for a payment that barely beats the interest', () => {
    // $1 of principal a month on a $1B balance: progress, but not within 50 years.
    const r = payoffPlan({ balance: 1_000_000_000, aprPct: 24, payment: 20_000_001 });
    expect(r.never).toBe(true);
    if (!r.never) return;
    expect(r.cappedAt).toBe(MAX_PAYOFF_MONTHS);
  });
});
