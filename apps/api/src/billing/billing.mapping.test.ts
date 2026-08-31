import { describe, it, expect } from 'vitest';
import { mapStripeSubscription, PriceIdMap } from './billing.mapping';
import Stripe from 'stripe';

const PRICE_IDS: PriceIdMap = {
  price_pro_month: { tier: 'pro', interval: 'month' },
  price_pro_year: { tier: 'pro', interval: 'year' },
  price_elite_month: { tier: 'elite', interval: 'month' },
  price_elite_year: { tier: 'elite', interval: 'year' },
};

function fakeSub(overrides: Partial<Stripe.Subscription> & { priceId: string }): Stripe.Subscription {
  const { priceId, ...rest } = overrides;
  return {
    id: 'sub_123',
    status: 'trialing',
    current_period_end: 1_800_000_000,
    trial_end: 1_700_000_000,
    cancel_at_period_end: false,
    items: { data: [{ price: { id: priceId } }] },
    ...rest,
  } as unknown as Stripe.Subscription;
}

describe('mapStripeSubscription', () => {
  it('maps a trialing Pro-monthly subscription', () => {
    const out = mapStripeSubscription(fakeSub({ priceId: 'price_pro_month', status: 'trialing' } as any), PRICE_IDS);
    expect(out).toEqual({
      tier: 'pro',
      interval: 'month',
      status: 'trialing',
      currentPeriodEnd: new Date(1_800_000_000 * 1000),
      trialEnd: new Date(1_700_000_000 * 1000),
      cancelAtPeriodEnd: false,
    });
  });

  it('maps an active Elite-yearly subscription with no trial', () => {
    const out = mapStripeSubscription(
      fakeSub({ priceId: 'price_elite_year', status: 'active', trial_end: null } as any),
      PRICE_IDS,
    );
    expect(out.tier).toBe('elite');
    expect(out.interval).toBe('year');
    expect(out.status).toBe('active');
    expect(out.trialEnd).toBeNull();
  });

  it('collapses unpaid and incomplete into past_due', () => {
    expect(mapStripeSubscription(fakeSub({ priceId: 'price_pro_month', status: 'unpaid' } as any), PRICE_IDS).status).toBe('past_due');
    expect(mapStripeSubscription(fakeSub({ priceId: 'price_pro_month', status: 'incomplete' } as any), PRICE_IDS).status).toBe('past_due');
  });

  it('maps canceled straight through', () => {
    expect(mapStripeSubscription(fakeSub({ priceId: 'price_pro_month', status: 'canceled' } as any), PRICE_IDS).status).toBe('canceled');
  });

  it('carries cancelAtPeriodEnd through unchanged', () => {
    const out = mapStripeSubscription(fakeSub({ priceId: 'price_pro_month', cancel_at_period_end: true } as any), PRICE_IDS);
    expect(out.cancelAtPeriodEnd).toBe(true);
  });

  it('throws when the subscription is on a price ID this app does not recognize', () => {
    expect(() => mapStripeSubscription(fakeSub({ priceId: 'price_unknown' } as any), PRICE_IDS)).toThrow(/unknown price/i);
  });
});
