import { describe, it, expect } from 'vitest';
import { trialProgress, yearlySavings, cardBrandLabel, daysUntil, describePaymentMethod, portalReturnNotice, pastDueSummary } from './derive';
import type { BillingOverview, SubscriptionInfo } from './types';

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

describe('pastDueSummary', () => {
  const fmt = { money: (n: number) => `$${n.toFixed(2)}`, date: (iso: string) => iso.slice(0, 10) };
  const sub: SubscriptionInfo = { tier: 'pro', interval: 'month', status: 'past_due', currentPeriodEnd: '2026-11-29T00:00:00Z', trialEnd: null, cancelAtPeriodEnd: false };
  const overview = (pm: BillingOverview['paymentMethod']): BillingOverview => ({
    paymentMethod: pm, billingAddress: null, upcoming: null,
    invoices: [
      { id: 'in_2', number: null, date: '2026-10-29T00:00:00Z', total: 4.99, currency: 'usd', status: 'open', description: null, pdfUrl: null, hostedUrl: 'https://pay.stripe.com/i/2' },
      { id: 'in_1', number: null, date: '2026-10-14T00:00:00Z', total: 0, currency: 'usd', status: 'paid', description: null, pdfUrl: null, hostedUrl: null },
    ],
  });

  it('is null unless the subscription is past due', () => {
    expect(pastDueSummary({ ...sub, status: 'active' }, 'pro', null, fmt)).toBeNull();
  });

  it('explains a paused plan with no payment method: the trial-ended-without-a-card case', () => {
    const out = pastDueSummary(sub, 'free', overview(null), fmt);
    expect(out).toMatchObject({ paused: true, action: 'Add payment method', due: { amount: 4.99, date: '2026-10-29T00:00:00Z', hostedUrl: 'https://pay.stripe.com/i/2' } });
    expect(out?.headline).toBe("Pro is paused — you're on Basic until the payment goes through.");
    expect(out?.body).toBe("The $4.99 payment due 2026-10-29 couldn't be taken — there's no payment method on file. Add one and Stripe collects it right away; Pro comes back as soon as it goes through.");
  });

  it('names the method that failed while the plan is still inside the grace window', () => {
    const out = pastDueSummary(sub, 'pro', overview({ kind: 'card', brand: 'visa', last4: '4242', expMonth: 1, expYear: 2030 }), fmt);
    expect(out).toMatchObject({ paused: false, action: 'Update payment method' });
    expect(out?.headline).toMatch(/pauses soon/);
    expect(out?.body).toMatch(/failed on Visa ending in 4242\. Update it and Stripe retries right away; Pro stays on/);
  });

  it('still reads when the Stripe overview has not loaded', () => {
    const out = pastDueSummary(sub, 'free', null, fmt);
    expect(out?.due).toBeNull();
    expect(out?.body).toBe("Your last payment couldn't be taken. Add or update your payment method and Stripe retries right away; Pro comes back as soon as it goes through.");
  });
});
