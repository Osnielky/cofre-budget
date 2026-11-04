import { PLAN_PRICES, TRIAL_DAYS } from '@/lib/plans';
import type { PaymentMethodSummary } from './types';

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
