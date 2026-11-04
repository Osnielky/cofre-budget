import { PLAN_PRICES, TRIAL_DAYS } from '@/lib/plans';
import type { BillingOverview, PaymentMethodSummary, SubscriptionInfo } from './types';

const DAY = 24 * 60 * 60 * 1000;

/** Whole days until `iso`, rounded up; 0 once it has passed. */
export function daysUntil(iso: string, now: Date = new Date()): number {
  return Math.max(0, Math.ceil((new Date(iso).getTime() - now.getTime()) / DAY));
}

/** Progress through the free trial that ends at `trialEnd`. */
export function trialProgress(trialEnd: string, now: Date = new Date()) {
  const daysLeft = Math.min(TRIAL_DAYS, daysUntil(trialEnd, now));
  const dayOfTrial = TRIAL_DAYS - daysLeft;
  return { totalDays: TRIAL_DAYS, daysLeft, dayOfTrial, pct: Math.round((dayOfTrial / TRIAL_DAYS) * 100) };
}

/** What a year costs on monthly billing vs. the yearly price. */
export function yearlySavings(tier: 'pro' | 'elite') {
  const p = PLAN_PRICES[tier];
  const monthlyYear = p.month * 12;
  return { amount: Math.round((monthlyYear - p.year) * 100) / 100, pct: Math.round(((monthlyYear - p.year) / monthlyYear) * 100) };
}

const BRANDS: Record<string, string> = {
  visa: 'Visa', mastercard: 'Mastercard', amex: 'American Express', discover: 'Discover',
  diners: 'Diners Club', jcb: 'JCB', unionpay: 'UnionPay',
};

export function cardBrandLabel(brand: string): string {
  return BRANDS[brand] ?? brand.charAt(0).toUpperCase() + brand.slice(1);
}

/** The three lines of the payment-method tile: badge, what it is, one detail. */
export function describePaymentMethod(pm: PaymentMethodSummary | null): { badge: string | null; title: string; detail: string } {
  if (!pm) return { badge: null, title: 'No payment method on file', detail: 'Add a card or bank account before your next charge' };
  switch (pm.kind) {
    case 'card':
      return {
        badge: pm.brand.toUpperCase().slice(0, 4),
        title: `${cardBrandLabel(pm.brand)} ending in ${pm.last4}`,
        detail: `Expires ${String(pm.expMonth).padStart(2, '0')}/${pm.expYear}`,
      };
    case 'bank':
      return {
        badge: 'BANK',
        title: `${pm.bankName ?? 'Bank account'}${pm.last4 ? ` ending in ${pm.last4}` : ''}`,
        detail: 'Bank debit · charged automatically',
      };
    default:
      return { badge: pm.label.toUpperCase().slice(0, 4), title: pm.label, detail: 'Saved with Stripe' };
  }
}

/**
 * What to tell someone who just came back from Stripe's payment-method page:
 * whether anything is on file now, and what happens next.
 */
export function portalReturnNotice(pm: PaymentMethodSummary | null, status: 'trialing' | 'active' | 'past_due' | 'canceled'): { tone: 'good' | 'warn'; text: string } {
  if (!pm) return { tone: 'warn', text: 'Nothing was saved — Stripe still has no payment method for you. You can try again below.' };
  const what = describePaymentMethod(pm).title;
  if (status === 'past_due') return { tone: 'good', text: `${what} is saved. Stripe will retry the failed payment with it — your plan is back as soon as it goes through.` };
  return { tone: 'good', text: `${what} is saved and will be used for your next charge.` };
}

const TIER_NAME = { pro: 'Pro', elite: 'Elite' } as const;

export interface PastDueSummary {
  /** The 24-hour grace has run out: `users.plan` is already free. */
  paused: boolean;
  /** The open invoice Stripe is waiting on, when the overview has loaded it. */
  due: { amount: number; currency: string; date: string; hostedUrl: string | null } | null;
  /** One line for the plan card's status. */
  headline: string;
  /** What happened and what gets the plan back. */
  body: string;
  /** What the primary button should say. */
  action: 'Add payment method' | 'Update payment method';
}

/**
 * Explains a past-due subscription in one place so every billing card tells
 * the same story: whether the plan is paused, which invoice is unpaid, why it
 * could not be taken (no method on file vs a failed one) and what fixes it.
 */
export function pastDueSummary(
  sub: SubscriptionInfo,
  plan: 'free' | 'pro' | 'elite',
  overview: BillingOverview | null,
  fmt: { money: (n: number, currency: string) => string; date: (iso: string) => string },
): PastDueSummary | null {
  if (sub.status !== 'past_due') return null;
  const paused = plan === 'free';
  const tier = TIER_NAME[sub.tier];
  const open = overview?.invoices.find((i) => i.status === 'open') ?? null;
  const due = open ? { amount: open.total, currency: open.currency, date: open.date, hostedUrl: open.hostedUrl } : null;
  const payment = due ? `The ${fmt.money(due.amount, due.currency)} payment due ${fmt.date(due.date)}` : 'Your last payment';
  const hasMethod = !!overview?.paymentMethod;
  const why = overview == null
    ? "couldn't be taken."
    : hasMethod
      ? `failed on ${describePaymentMethod(overview.paymentMethod).title}.`
      : "couldn't be taken — there's no payment method on file.";
  const outcome = `${tier} ${paused ? 'comes back' : 'stays on'} as soon as it goes through.`;
  const fix = overview == null
    ? `Add or update your payment method and Stripe retries right away; ${outcome}`
    : hasMethod
      ? `Update it and Stripe retries right away; ${outcome}`
      : `Add one and Stripe collects it right away; ${outcome}`;
  return {
    paused,
    due,
    headline: paused ? `${tier} is paused — you're on Basic until the payment goes through.` : `Your last payment failed — ${tier} pauses soon unless it's paid.`,
    body: `${payment} ${why} ${fix}`,
    action: hasMethod ? 'Update payment method' : 'Add payment method',
  };
}
