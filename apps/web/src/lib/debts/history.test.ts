import { describe, it, expect } from 'vitest';
import { paymentHistory, historySummary } from './history';
import type { Payment } from '@/app/debts/types';

const pay = (id: string, date: string, amount: number): Payment =>
  ({ id, date, amount, note: null, transactionId: null });

// API order: newest first. Mirrors the Osmny Roque loan: $8,900 lent Oct 15, 2025.
const PAYMENTS = [
  pay('e', '2026-10-08', 1900),
  pay('d', '2026-09-08', 200),
  pay('c', '2026-09-08', 3000),
  pay('b', '2026-08-14', 500),
  pay('a', '2026-06-15', 200),
];

describe('paymentHistory', () => {
  const rows = paymentHistory(8900, PAYMENTS, '2025-10-15');

  it('keeps newest-first order and numbers payments oldest = #1', () => {
    expect(rows.map((r) => [r.id, r.seq])).toEqual([['e', 5], ['d', 4], ['c', 3], ['b', 2], ['a', 1]]);
  });

  it('shows the balance still pending after each payment', () => {
    expect(rows.map((r) => r.remainingAfter)).toEqual([3100, 5000, 5200, 8200, 8700]);
    expect(rows.map((r) => r.paidSoFar)).toEqual([5800, 3900, 3700, 700, 200]);
  });

  it('reports cumulative % repaid and each payment\'s share of the principal', () => {
    expect(rows[0].pctRepaid).toBe(65.2);
    expect(rows[2].shareOfPrincipal).toBe(33.7);
  });

  it('measures days since the previous payment, or since the loan for the first', () => {
    expect(rows.map((r) => r.daysSincePrev)).toEqual([30, 0, 25, 60, 243]);
    expect(rows[4].sinceLoanStart).toBe(true);
    expect(rows[3].sinceLoanStart).toBe(false);
  });

  it('flags the payment that clears the balance, never going below zero', () => {
    const r = paymentHistory(500, [pay('y', '2026-02-01', 400), pay('x', '2026-01-01', 200)], null);
    expect(r[0].remainingAfter).toBe(0);
    expect(r[0].paidOff).toBe(true);
    expect(r[1].paidOff).toBe(false);
    expect(r[1].daysSincePrev).toBeNull();
  });
});

describe('historySummary', () => {
  const s = historySummary(3100, PAYMENTS, '2026-10-09');

  it('averages payment size and spacing', () => {
    expect(s.avgPayment).toBe(1160);
    expect(s.avgDaysBetween).toBe(29); // (60+25+0+30)/4 = 28.75
    expect(s.largest).toBe(3000);
    expect(s.lastPaymentDaysAgo).toBe(1);
  });

  it('projects a payoff month from the pace since the first payment', () => {
    // $5,800 over Jun 15 → Oct 9 (116 days) ≈ $1,521/mo; $3,100 left ≈ 2.04 months
    expect(s.projectedPayoff).toBe('2026-12');
  });

  it('has no projection once paid off or without payments', () => {
    expect(historySummary(0, [pay('x', '2026-01-01', 500)], '2026-10-09').projectedPayoff).toBeNull();
    expect(historySummary(500, [], '2026-10-09').avgPayment).toBe(0);
  });
});
