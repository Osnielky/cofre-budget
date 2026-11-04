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

export type Interval = 'month' | 'year';

export function addInterval(date: Date, interval: Interval): Date {
  const d = new Date(date.getTime());
  if (interval === 'month') d.setUTCMonth(d.getUTCMonth() + 1);
  else d.setUTCFullYear(d.getUTCFullYear() + 1);
  return d;
}

/**
 * The renewal date a late payment earns: the current period end pushed out by
 * the time spent past due, capped at one full interval from the payment — a
 * subscription that sat past due across several Stripe cycles gets one paid
 * period from the day it paid, never more. Null when the payment was not
 * meaningfully late or the date would not move.
 */
export function extendedPeriodEnd(input: { currentPeriodEnd: Date; pastDueSince: Date; paidAt: Date; interval: Interval }): Date | null {
  const late = input.paidAt.getTime() - input.pastDueSince.getTime();
  if (!Number.isFinite(late) || late < MIN_LATE_MS) return null;
  const end = Math.min(input.currentPeriodEnd.getTime() + late, addInterval(input.paidAt, input.interval).getTime());
  if (end <= input.currentPeriodEnd.getTime()) return null;
  return new Date(end);
}

/** A Stripe "trial" that is really a paid period moved by a late payment. */
export function isPaidExtension(sub: { status: string; trial_end?: number | null; metadata?: Record<string, string> | null }): boolean {
  return sub.status === 'trialing' && !!sub.metadata?.[PAID_EXTENSION_METADATA_KEY] && !!sub.trial_end;
}
