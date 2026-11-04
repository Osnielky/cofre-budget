import { describe, it, expect } from 'vitest';
import { describePlanChange } from './planChange';
import type { PlanChangePreview } from './types';

const fmt = { money: (n: number) => `$${n.toFixed(2)}`, date: (iso: string) => iso.slice(0, 10) };
const visa = { kind: 'card', brand: 'visa', last4: '4242', expMonth: 1, expYear: 2030 } as const;

const upgrade: PlanChangePreview = {
  kind: 'upgrade', currency: 'usd', trialing: false,
  from: { tier: 'pro', interval: 'month', amount: 4.99 }, to: { tier: 'pro', interval: 'year', amount: 47.9 },
  chargeNow: 43.65, credit: 4.25, effectiveAt: '2026-11-04T12:00:00Z', nextChargeAt: '2027-11-04T12:00:00Z',
};

describe('describePlanChange', () => {
  it('spells out an upgrade: charged today, the credit, the method, and the renewal', () => {
    const c = describePlanChange(upgrade, visa, fmt);
    expect(c.chargeNow).toEqual({ label: 'Charged today', amount: 43.65, currency: 'usd' });
    expect(c.breakdown).toEqual([
      '$47.90 for Pro · Yearly covers the next 12 months starting today.',
      'Minus $4.25 credit for the unused part of your monthly Pro plan.',
    ]);
    expect(c.afterwards[1]).toBe('Then $47.90 / year, next on 2027-11-04, until you change or cancel.');
    expect(c.payment).toEqual({ text: 'Charged today to Visa ending in 4242.', blocking: false });
    expect(c.confirmLabel).toBe('Confirm and pay $43.65');
  });

  it('blocks an upgrade that costs money today when nothing is on file', () => {
    const c = describePlanChange(upgrade, null, fmt);
    expect(c.payment).toEqual({ text: 'No payment method on file — add one before switching.', blocking: true });
  });

  it('charges nothing during the trial and names the first payment', () => {
    const c = describePlanChange({ ...upgrade, trialing: true, chargeNow: 0, credit: 0, nextChargeAt: '2026-11-19T00:00:00Z' }, null, fmt);
    expect(c.chargeNow.amount).toBe(0);
    expect(c.afterwards[0]).toBe('Your trial continues on Pro · Yearly. The first payment is $47.90 on 2026-11-19.');
    expect(c.payment.blocking).toBe(false);
    expect(c.confirmLabel).toBe('Confirm switch to Pro yearly');
  });

  it('spells out a downgrade: nothing today, keep the paid plan until the date, no refund', () => {
    const c = describePlanChange({
      kind: 'downgrade', currency: 'usd', trialing: false,
      from: { tier: 'pro', interval: 'year', amount: 47.9 }, to: { tier: 'pro', interval: 'month', amount: 4.99 },
      chargeNow: 0, credit: 0, effectiveAt: '2027-11-04T12:00:00Z', nextChargeAt: '2027-11-04T12:00:00Z',
    }, visa, fmt);
    expect(c.chargeNow.amount).toBe(0);
    expect(c.breakdown).toEqual(["You've already paid for Pro · Yearly until 2027-11-04, so nothing is charged now."]);
    expect(c.afterwards[0]).toBe('You keep Pro · Yearly until 2027-11-04.');
    expect(c.afterwards[1]).toBe("From 2027-11-04 you're on Pro · Monthly at $4.99 / month, first charged on 2027-11-04.");
    expect(c.policy).toMatch(/isn't refunded or credited/);
    expect(c.confirmLabel).toBe('Schedule switch to Pro monthly');
  });
});
