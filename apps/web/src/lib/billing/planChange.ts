import type { PaymentMethodSummary, PlanChangePreview } from './types';
import { describePaymentMethod } from './derive';

const TIER = { pro: 'Pro', elite: 'Elite' } as const;
const INTERVAL = { month: 'Monthly', year: 'Yearly' } as const;
const PER = { month: 'month', year: 'year' } as const;

export const planLabel = (p: { tier: 'pro' | 'elite'; interval: 'month' | 'year' }) => `${TIER[p.tier]} · ${INTERVAL[p.interval]}`;

export interface PlanChangeCopy {
  title: string;
  /** The headline figure: what is taken today. */
  chargeNow: { label: string; amount: number; currency: string };
  /** How that figure comes about, one short line each. */
  breakdown: string[];
  /** What happens after today. */
  afterwards: string[];
  /** The money-policy line shown beside the Terms link. */
  policy: string;
  /** Payment line: the method that will be charged, or why the change cannot go ahead. */
  payment: { text: string; blocking: boolean };
  confirmLabel: string;
}

/**
 * Plain-language version of a plan-change preview for the confirmation dialog.
 * Every sentence here must agree with the Terms "Plan changes" clause and the
 * billing emails in apps/api/src/billing/billing-emails.ts.
 */
export function describePlanChange(
  p: PlanChangePreview,
  pm: PaymentMethodSummary | null,
  fmt: { money: (n: number, currency: string) => string; date: (iso: string) => string },
): PlanChangeCopy {
  const money = (n: number) => fmt.money(n, p.currency);
  const to = planLabel(p.to), from = planLabel(p.from);
  const newPrice = `${money(p.to.amount)} / ${PER[p.to.interval]}`;

  if (p.kind === 'downgrade') {
    const until = fmt.date(p.effectiveAt);
    return {
      title: `Switch to ${to}`,
      chargeNow: { label: 'Charged today', amount: 0, currency: p.currency },
      breakdown: [`You've already paid for ${from} until ${until}, so nothing is charged now.`],
      afterwards: [
        `You keep ${from} until ${until}.`,
        `From ${until} you're on ${to} at ${newPrice}${p.nextChargeAt ? `, first charged on ${fmt.date(p.nextChargeAt)}` : ''}.`,
        'You can keep your current plan instead at any time before then.',
      ],
      policy: "Payments aren't refundable: the time you've already paid for isn't refunded or credited, you simply keep using it.",
      payment: { text: 'Nothing is charged today, so no payment is needed now.', blocking: false },
      confirmLabel: `Schedule switch to ${TIER[p.to.tier]} ${INTERVAL[p.to.interval].toLowerCase()}`,
    };
  }

  const breakdown: string[] = [];
  const afterwards: string[] = [];
  if (p.trialing) {
    breakdown.push("You're still on your free trial, so nothing is charged today.");
    afterwards.push(`Your trial continues on ${to}. The first payment is ${money(p.to.amount)}${p.nextChargeAt ? ` on ${fmt.date(p.nextChargeAt)}` : ' when the trial ends'}.`);
  } else {
    breakdown.push(`${money(p.to.amount)} for ${to} covers ${p.to.interval === 'year' ? 'the next 12 months' : 'the rest of this period'} starting today.`);
    if (p.credit > 0) breakdown.push(`Minus ${money(p.credit)} credit for the unused part of your ${INTERVAL[p.from.interval].toLowerCase()} ${TIER[p.from.tier]} plan.`);
    afterwards.push(`${to} starts right away.`);
    afterwards.push(`Then ${newPrice}${p.nextChargeAt ? `, next on ${fmt.date(p.nextChargeAt)}` : ''}, until you change or cancel.`);
  }
  const needsPayment = !p.trialing && p.chargeNow > 0;
  const method = describePaymentMethod(pm);
  const payment = pm
    ? { text: needsPayment ? `Charged today to ${method.title}.` : `${method.title} stays on file for the next payment.`, blocking: false }
    : { text: needsPayment ? 'No payment method on file — add one before switching.' : 'Add a payment method before your first charge.', blocking: needsPayment };
  return {
    title: `Switch to ${to}`,
    chargeNow: { label: 'Charged today', amount: p.chargeNow, currency: p.currency },
    breakdown,
    afterwards,
    policy: "Payments aren't refundable. Switching back to a lower plan later takes effect when the period you've paid for ends.",
    payment,
    confirmLabel: needsPayment ? `Confirm and pay ${money(p.chargeNow)}` : `Confirm switch to ${TIER[p.to.tier]} ${INTERVAL[p.to.interval].toLowerCase()}`,
  };
}
