/**
 * A late payment buys a full period from the day it is paid.
 *
 * Stripe's own rule is that an invoice covers the period it was issued for, so a
 * customer who pays 15 days late would get 15 days and be charged again. Cofre
 * instead moves the renewal date by the time the subscription spent past due:
 * after the overdue invoice is paid, `subscriptions.update` sets `trial_end` to
 * `currentPeriodEnd + (paidAt − pastDueSince)` with `proration_behavior: 'none'`
 * — the way Stripe documents for moving a billing date without charging — and
 * stamps the subscription's metadata so the mapper reads that Stripe "trial" as
 * the paid period it is. Resetting `billing_cycle_anchor` was tried and rejected:
 * in flexible billing mode it moves the period without invoicing, and voiding
 * the old invoice then makes the subscription active unpaid.
 */
export const PAID_EXTENSION_METADATA_KEY = 'cofre_paid_period_extended';

/** Below this the recovery was quick enough that nothing is owed back. */
export const MIN_LATE_MS = 60 * 60 * 1000;

/**
 * The renewal date a late payment earns: the current period end pushed out by
 * the time spent past due. Null when the payment was not meaningfully late.
 */
export function extendedPeriodEnd(currentPeriodEnd: Date, pastDueSince: Date, now: Date = new Date()): Date | null {
  const late = now.getTime() - pastDueSince.getTime();
  if (!Number.isFinite(late) || late < MIN_LATE_MS) return null;
  return new Date(currentPeriodEnd.getTime() + late);
}
