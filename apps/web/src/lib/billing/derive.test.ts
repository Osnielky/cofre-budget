import { describe, it, expect } from 'vitest';
import { trialProgress, yearlySavings, cardBrandLabel, daysUntil, describePaymentMethod, portalReturnNotice } from './derive';

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

describe('describePaymentMethod', () => {
  it('names a card with brand, last 4 and expiry', () => {
    expect(describePaymentMethod({ kind: 'card', brand: 'visa', last4: '4242', expMonth: 4, expYear: 2028 }))
      .toEqual({ badge: 'VISA', title: 'Visa ending in 4242', detail: 'Expires 04/2028' });
  });
  it('names a bank debit by bank and last 4, and copes without either', () => {
    expect(describePaymentMethod({ kind: 'bank', bankName: 'Chase', last4: '7682' }).title).toBe('Chase ending in 7682');
    expect(describePaymentMethod({ kind: 'bank', bankName: null, last4: null }).title).toBe('Bank account');
  });
  it('labels wallets and says plainly when nothing is on file', () => {
    expect(describePaymentMethod({ kind: 'other', label: 'Cash App' })).toMatchObject({ badge: 'CASH', title: 'Cash App' });
    expect(describePaymentMethod(null)).toMatchObject({ badge: null, title: 'No payment method on file' });
  });
});

describe('portalReturnNotice', () => {
  const bank = { kind: 'bank', bankName: 'Chase', last4: '7682' } as const;
  it('warns when the trip to Stripe saved nothing', () => {
    expect(portalReturnNotice(null, 'active').tone).toBe('warn');
  });
  it('confirms the saved method and, when past due, says the retry happens on its own', () => {
    expect(portalReturnNotice(bank, 'active')).toEqual({ tone: 'good', text: 'Chase ending in 7682 is saved and will be used for your next charge.' });
    expect(portalReturnNotice(bank, 'past_due').text).toMatch(/retry the failed payment/);
  });
});
