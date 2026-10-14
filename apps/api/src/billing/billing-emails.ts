/**
 * Which billing email a subscription change deserves, and what it says.
 *
 * Decided by comparing the subscription we had saved with the one Stripe just
 * sent, so a duplicate or retried webhook (same state twice) never emails twice.
 */

export type Tier = 'pro' | 'elite';
export type Interval = 'month' | 'year';
export type SubStatus = 'trialing' | 'active' | 'past_due' | 'canceled';

export interface SubState {
  tier: Tier;
  interval: Interval;
  status: SubStatus;
  cancelAtPeriodEnd: boolean;
}

export type BillingEmailKind = 'started' | 'changed' | 'cancel_scheduled' | 'ended';

export function billingEmailFor(prev: SubState | null, next: SubState): BillingEmailKind | null {
  if (next.status === 'canceled') return prev && prev.status !== 'canceled' ? 'ended' : null;
  if (!prev || prev.status === 'canceled') return 'started';
  if (!prev.cancelAtPeriodEnd && next.cancelAtPeriodEnd) return 'cancel_scheduled';
  if (prev.tier !== next.tier || prev.interval !== next.interval) return 'changed';
  return null;
}

/* Mirrors the paid tiers in apps/web/src/components/PricingCards.tsx — keep both in sync. */
const PLAN_FEATURES: Record<Tier, string[]> = {
  pro: [
    'Everything in Basic',
    'Automatic bank sync with Plaid',
    'Up to 4 linked institutions',
    'Ask Cofre AI assistant (25 messages a day)',
  ],
  elite: [
    'Everything in Pro',
    'Automatic bank sync with Plaid',
    'Unlimited linked institutions',
    'Ask Cofre AI assistant (50 messages a day)',
  ],
};

const TIER_NAME: Record<Tier, string> = { pro: 'Pro', elite: 'Elite' };
const INTERVAL_NAME: Record<Interval, string> = { month: 'Monthly', year: 'Yearly' };

export interface BillingEmailContext {
  name: string;
  tier: Tier;
  interval: Interval;
  status: SubStatus;
  /** Price per interval in major units (4.99), or null when Stripe didn't say. */
  amount: number | null;
  currency: string;
  trialEnd: Date | null;
  currentPeriodEnd: Date | null;
  prevTier?: Tier;
  prevInterval?: Interval;
  appUrl: string;
}

export interface BillingEmailContent {
  subject: string;
  heading: string;
  intro: string;
  rows: [string, string][];
  featuresTitle?: string;
  features?: string[];
  note?: string;
  cta: { label: string; href: string };
}

const date = (d: Date | null) =>
  d ? d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' }) : '—';

function price(amount: number | null, currency: string): string | null {
  if (amount == null) return null;
  return amount.toLocaleString('en-US', { style: 'currency', currency: currency.toUpperCase() || 'USD' });
}

const planLabel = (tier: Tier, interval: Interval) => `${TIER_NAME[tier]} · ${INTERVAL_NAME[interval]}`;

export function billingEmailContent(kind: BillingEmailKind, c: BillingEmailContext): BillingEmailContent {
  const plan = TIER_NAME[c.tier];
  const amount = price(c.amount, c.currency);
  const perInterval = amount ? `${amount} / ${c.interval}` : '—';
  const trialing = c.status === 'trialing' && !!c.trialEnd;
  // While trialing, the first charge (and the end of access, if canceled) is the trial end.
  const nextDate = trialing ? c.trialEnd : c.currentPeriodEnd;
  const nextPayment = amount ? `${amount} on ${date(nextDate)}` : date(nextDate);
  const hello = c.name ? `Hi ${c.name}, ` : '';

  switch (kind) {
    case 'started':
      return {
        subject: `Welcome to Cofre ${plan}`,
        heading: `Welcome to Cofre ${plan}`,
        intro: trialing
          ? `${hello}your ${plan} plan is active and your free trial has started. You won't be charged until the trial ends, and you can cancel any time before then.`
          : `${hello}thanks for subscribing — your ${plan} plan is active.`,
        rows: [
          ['Plan', planLabel(c.tier, c.interval)],
          ['Price', perInterval],
          ...(trialing
            ? ([['Free trial ends', date(c.trialEnd)], ['First payment', nextPayment]] as [string, string][])
            : ([['Next payment', nextPayment]] as [string, string][])),
          ['Renews', `Automatically every ${c.interval} until you cancel`],
        ],
        featuresTitle: `What's included in ${plan}`,
        features: PLAN_FEATURES[c.tier],
        note: 'You can change or cancel your plan any time from Settings → Billing.',
        cta: { label: 'Open Cofre', href: `${c.appUrl}/dashboard` },
      };

    case 'changed':
      return {
        subject: `Your Cofre plan changed to ${plan}`,
        heading: 'Your plan has changed',
        intro: `${hello}your subscription has been updated. Here are the new details.`,
        rows: [
          ['Previous plan', c.prevTier && c.prevInterval ? planLabel(c.prevTier, c.prevInterval) : '—'],
          ['New plan', planLabel(c.tier, c.interval)],
          ['Price', perInterval],
          [trialing ? 'First payment' : 'Next payment', nextPayment],
        ],
        featuresTitle: `What's included in ${plan}`,
        features: PLAN_FEATURES[c.tier],
        note: 'Stripe adjusts any price difference for the rest of this period on your next invoice.',
        cta: { label: 'View billing', href: `${c.appUrl}/settings?tab=billing` },
      };

    case 'cancel_scheduled':
      return {
        subject: `Your Cofre ${plan} cancellation is confirmed`,
        heading: 'Your cancellation is confirmed',
        intro: `${hello}we've canceled your ${plan} plan. You keep full ${plan} access until the date below, and you won't be charged again.`,
        rows: [
          ['Plan', planLabel(c.tier, c.interval)],
          ['Access until', date(nextDate)],
          ['After that', 'Your account moves to the free Basic plan'],
          ['Your data', 'Kept — accounts, transactions, budgets and goals stay as they are'],
        ],
        featuresTitle: `You'll lose access to`,
        features: PLAN_FEATURES[c.tier].filter((f) => !f.startsWith('Everything in')),
        note: 'Changed your mind? You can keep your plan from Settings → Billing before the date above.',
        cta: { label: 'Keep my plan', href: `${c.appUrl}/settings?tab=billing` },
      };

    case 'ended':
      return {
        subject: `Your Cofre ${plan} plan has ended`,
        heading: `Your ${plan} plan has ended`,
        intro: `${hello}your ${plan} subscription has ended and your account is now on the free Basic plan. Everything you've added is still here.`,
        rows: [
          ['Previous plan', planLabel(c.tier, c.interval)],
          ['Current plan', 'Basic (free)'],
          ['Your data', 'Kept — nothing was deleted'],
        ],
        featuresTitle: 'No longer available on Basic',
        features: PLAN_FEATURES[c.tier].filter((f) => !f.startsWith('Everything in')),
        note: 'You can come back to a paid plan whenever you like.',
        cta: { label: 'Reactivate', href: `${c.appUrl}/pricing` },
      };
  }
}
