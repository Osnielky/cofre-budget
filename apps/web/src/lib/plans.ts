/** What checkout charges. Must match the live Stripe Price amounts
 *  (deploy/cloudbuild.yaml _STRIPE_PRICE_*); shown on the pricing cards and in
 *  the homepage's structured data. */
export const PLAN_PRICES = {
  pro: { month: 4.99, year: 47.9 },
  elite: { month: 7.99, year: 76.7 },
} as const;

/** Mirrors trial_period_days in apps/api/src/billing/billing.service.ts. */
export const TRIAL_DAYS = 15;
