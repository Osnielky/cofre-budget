/* Public credit-card payoff calculator. Monthly interest is balance × APR / 12,
   charged before the payment lands, the usual simplification for a card paid
   on the statement date. */

/** 50 years; past this the honest answer is "this payment does not work". */
export const MAX_PAYOFF_MONTHS = 600;

export interface PayoffInput {
  balance: number;
  /** Purchase APR in percent (24 = 24%). */
  aprPct: number;
  /** Fixed monthly payment. */
  payment: number;
}

export interface PayoffRow {
  month: number;
  interest: number;
  principal: number;
  balance: number;
}

export type PayoffResult =
  | { never: false; months: number; totalInterest: number; totalPaid: number; schedule: PayoffRow[] }
  | { never: true; minimumToMakeProgress: number; cappedAt: number | null };

export function payoffPlan(input: PayoffInput): PayoffResult {
  const balance0 = Math.max(0, num(input.balance));
  const rate = Math.max(0, num(input.aprPct)) / 100 / 12;
  const payment = num(input.payment);

  if (balance0 === 0) return { never: false, months: 0, totalInterest: 0, totalPaid: 0, schedule: [] };

  const firstInterest = round2(balance0 * rate);
  if (payment <= firstInterest) {
    return { never: true, minimumToMakeProgress: round2(firstInterest + 1), cappedAt: null };
  }

  const schedule: PayoffRow[] = [];
  let balance = balance0;
  let totalInterest = 0;
  let month = 0;
  while (balance > 0 && month < MAX_PAYOFF_MONTHS) {
    month += 1;
    const interest = round2(balance * rate);
    const due = round2(balance + interest);
    const paid = Math.min(payment, due);
    const principal = round2(paid - interest);
    balance = round2(due - paid);
    totalInterest = round2(totalInterest + interest);
    schedule.push({ month, interest, principal, balance });
  }
  if (balance > 0) {
    return { never: true, minimumToMakeProgress: round2(firstInterest + 1), cappedAt: MAX_PAYOFF_MONTHS };
  }
  return {
    never: false,
    months: month,
    totalInterest,
    totalPaid: round2(balance0 + totalInterest),
    schedule,
  };
}

const num = (n: number) => (Number.isFinite(n) ? n : 0);
const round2 = (n: number) => Math.round(n * 100) / 100;
