import type Stripe from 'stripe';
import type { PriceIdMap } from './billing.mapping';

/**
 * Changing plan, the money side.
 *
 * Policy (mirrors the Terms "Plan changes" clause and the plan-change dialog):
 *  - An UPGRADE — a higher tier, or monthly → yearly — takes effect now. Stripe
 *    charges today the new price for the rest of the period minus credit for the
 *    unused part of the old one (`always_invoice`), and the billing cycle restarts
 *    when the interval changes.
 *  - A DOWNGRADE — a lower tier, or yearly → monthly — takes effect when the period
 *    already paid for ends (a subscription schedule). Nothing is charged or
 *    refunded today: payments are non-refundable, the user keeps what they paid for.
 */
export type Tier = 'pro' | 'elite';
export type Interval = 'month' | 'year';
export type PlanChangeKind = 'upgrade' | 'downgrade' | 'same';

const TIER_RANK: Record<Tier, number> = { pro: 1, elite: 2 };

export function classifyPlanChange(from: { tier: Tier; interval: Interval }, to: { tier: Tier; interval: Interval }): PlanChangeKind {
  if (from.tier === to.tier && from.interval === to.interval) return 'same';
  if (TIER_RANK[to.tier] < TIER_RANK[from.tier]) return 'downgrade';
  if (to.tier === from.tier && from.interval === 'year' && to.interval === 'month') return 'downgrade';
  return 'upgrade';
}

export interface PlanChangePreview {
  kind: 'upgrade' | 'downgrade';
  from: { tier: Tier; interval: Interval; amount: number };
  to: { tier: Tier; interval: Interval; amount: number };
  currency: string;
  /** Taken today. 0 on a downgrade and while trialing. */
  chargeNow: number;
  /** Credit for the unused part of the old plan, already deducted from `chargeNow`. */
  credit: number;
  /** When the new plan applies: now for an upgrade, the paid-through date for a downgrade. */
  effectiveAt: string;
  /** The first regular charge on the new plan. */
  nextChargeAt: string | null;
  trialing: boolean;
  /** Set when the upgrade ends a late-payment extension: the paid-through date given up, not credited. */
  forfeitsPaidThrough: string | null;
}

const major = (cents: number) => Math.round(cents) / 100;
const iso = (unix: number) => new Date(unix * 1000).toISOString();

/**
 * Reads an upgrade's prorated preview invoice: what is charged today, how much
 * of that is unused-time credit, and when the new period ends.
 */
export function summarizeUpgradePreview(invoice: Stripe.Invoice, newPriceId: string): { chargeNow: number; credit: number; periodEnd: string | null } {
  const lines = invoice.lines?.data ?? [];
  const credit = lines.filter((l) => l.amount < 0).reduce((sum, l) => sum + l.amount, 0);
  const newLine = lines.find((l) => l.amount > 0 && l.pricing?.price_details?.price === newPriceId) ?? lines.find((l) => l.amount > 0);
  return {
    chargeNow: major(Math.max(0, invoice.amount_due)),
    credit: major(Math.abs(credit)),
    periodEnd: newLine?.period?.end ? iso(newLine.period.end) : null,
  };
}

export interface PendingChange {
  tier: Tier;
  interval: Interval;
  effectiveAt: string;
}

/**
 * A scheduled downgrade is the schedule's next phase: the first one starting
 * after `now` whose price is a plan we know. Null when the schedule only
 * describes the current plan (or is not ours).
 */
export function pendingChangeFromSchedule(schedule: Stripe.SubscriptionSchedule | null | undefined, priceIds: PriceIdMap, now: Date = new Date()): PendingChange | null {
  if (!schedule || schedule.status === 'released' || schedule.status === 'canceled' || schedule.status === 'completed') return null;
  const nowUnix = now.getTime() / 1000;
  const next = [...schedule.phases].sort((a, b) => a.start_date - b.start_date).find((p) => p.start_date > nowUnix);
  const priceId = next?.items?.[0]?.price;
  const plan = typeof priceId === 'string' ? priceIds[priceId] : typeof priceId === 'object' && priceId ? priceIds[priceId.id] : undefined;
  if (!next || !plan) return null;
  return { tier: plan.tier, interval: plan.interval, effectiveAt: iso(next.start_date) };
}
