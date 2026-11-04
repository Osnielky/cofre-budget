import { describe, it, expect } from 'vitest';
import { addInterval, extendedPeriodEnd, isPaidExtension } from './late-payment';

const DAY = 86_400_000;
const periodEnd = new Date('2026-11-29T00:00:00Z');
const pastDueSince = new Date('2026-10-29T00:00:00Z');

describe('extendedPeriodEnd', () => {
  it('gives one full interval from the day it was paid', () => {
    const paidAt = new Date('2026-11-14T00:00:00Z'); // 16 days late: Nov 29 + 16 d would be Dec 15, one month from the payment is Dec 14
    expect(extendedPeriodEnd({ currentPeriodEnd: periodEnd, pastDueSince, paidAt, interval: 'month' })).toEqual(new Date('2026-12-14T00:00:00Z'));
    // A short month makes the time-spent-past-due figure the smaller one.
    expect(extendedPeriodEnd({ currentPeriodEnd: new Date('2027-03-28T00:00:00Z'), pastDueSince: new Date('2027-02-28T00:00:00Z'), paidAt: new Date('2027-03-10T00:00:00Z'), interval: 'month' }))
      .toEqual(new Date(new Date('2027-03-28T00:00:00Z').getTime() + 10 * DAY));
  });

  it('never grants more than one interval from the payment (a subscription that sat past due across cycles)', () => {
    const paidAt = new Date('2027-01-20T00:00:00Z'); // 83 days late, Stripe already rolled the period on
    const rolledPeriodEnd = new Date('2027-01-29T00:00:00Z');
    expect(extendedPeriodEnd({ currentPeriodEnd: rolledPeriodEnd, pastDueSince, paidAt, interval: 'month' })).toEqual(new Date('2027-02-20T00:00:00Z'));
    expect(extendedPeriodEnd({ currentPeriodEnd: rolledPeriodEnd, pastDueSince, paidAt, interval: 'year' })).toEqual(new Date(rolledPeriodEnd.getTime() + 83 * DAY));
  });

  it('does nothing for a payment within the hour, one dated before the clock started, or one that would not move the date', () => {
    expect(extendedPeriodEnd({ currentPeriodEnd: periodEnd, pastDueSince, paidAt: new Date(pastDueSince.getTime() + 30 * 60_000), interval: 'month' })).toBeNull();
    expect(extendedPeriodEnd({ currentPeriodEnd: periodEnd, pastDueSince, paidAt: new Date('2026-10-28T00:00:00Z'), interval: 'month' })).toBeNull();
    expect(extendedPeriodEnd({ currentPeriodEnd: new Date('2027-06-01T00:00:00Z'), pastDueSince, paidAt: new Date('2026-11-14T00:00:00Z'), interval: 'month' })).toBeNull();
  });
});

describe('addInterval / isPaidExtension', () => {
  it('adds a calendar month or year in UTC', () => {
    expect(addInterval(new Date('2026-01-31T10:00:00Z'), 'month')).toEqual(new Date('2026-03-03T10:00:00Z'));
    expect(addInterval(new Date('2026-11-04T10:00:00Z'), 'year')).toEqual(new Date('2027-11-04T10:00:00Z'));
  });
  it('recognises only a Cofre-stamped trial with an end date', () => {
    expect(isPaidExtension({ status: 'trialing', trial_end: 1, metadata: { cofre_paid_period_extended: 'x' } })).toBe(true);
    expect(isPaidExtension({ status: 'trialing', trial_end: 1, metadata: {} })).toBe(false);
    expect(isPaidExtension({ status: 'active', trial_end: 1, metadata: { cofre_paid_period_extended: 'x' } })).toBe(false);
  });
});
