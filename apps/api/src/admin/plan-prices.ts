/* List prices in USD. Mirrors apps/web/src/lib/plans.ts (PLAN_PRICES); change both
   together. Stripe discounts are not reflected, so MRR built from these is an estimate. */
export const PLAN_PRICES = {
  pro: { month: 4.99, year: 47.9 },
  elite: { month: 7.99, year: 76.7 },
} as const;

export type PaidTier = keyof typeof PLAN_PRICES;
export type BillingInterval = 'month' | 'year';

/** Monthly recurring revenue: monthly price, or yearly price ÷ 12, summed and rounded to cents. */
export function estimateMrr(subs: { tier: PaidTier; interval: BillingInterval }[]): number {
  const total = subs.reduce((s, x) => {
    const p = PLAN_PRICES[x.tier];
    return p ? s + (x.interval === 'year' ? p.year / 12 : p.month) : s;
  }, 0);
  return Math.round(total * 100) / 100;
}
