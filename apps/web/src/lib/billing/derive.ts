import { PLAN_PRICES, TRIAL_DAYS } from '@/lib/plans';

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
