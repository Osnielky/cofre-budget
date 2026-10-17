import Stripe from 'stripe';

export type PriceIdMap = Record<string, { tier: 'pro' | 'elite'; interval: 'month' | 'year' }>;

export interface MappedSubscription {
  tier: 'pro' | 'elite';
  interval: 'month' | 'year';
  status: 'trialing' | 'active' | 'past_due' | 'canceled';
  currentPeriodEnd: Date | null;
  trialEnd: Date | null;
  cancelAtPeriodEnd: boolean;
}

const STATUS_MAP: Record<string, MappedSubscription['status']> = {
  trialing: 'trialing',
  active: 'active',
  past_due: 'past_due',
  paused: 'past_due',
  unpaid: 'past_due',
  incomplete: 'past_due',
  incomplete_expired: 'canceled',
  canceled: 'canceled',
};

export function mapStripeSubscription(sub: Stripe.Subscription, priceIds: PriceIdMap): MappedSubscription {
  const priceId = sub.items.data[0]?.price?.id;
  const tierInterval = priceId ? priceIds[priceId] : undefined;
  if (!tierInterval) throw new Error(`Subscription ${sub.id} is on an unknown price ID: ${priceId}`);

  const status = STATUS_MAP[sub.status];
  if (!status) throw new Error(`Subscription ${sub.id} is in an unknown status: ${sub.status}`);

  return {
    tier: tierInterval.tier,
    interval: tierInterval.interval,
    status,
    currentPeriodEnd: sub.items.data[0]?.current_period_end ? new Date(sub.items.data[0].current_period_end * 1000) : null,
    trialEnd: sub.trial_end ? new Date(sub.trial_end * 1000) : null,
    cancelAtPeriodEnd: sub.cancel_at_period_end,
  };
}
