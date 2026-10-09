import type { Payment } from '@/app/debts/types';

export interface PaymentRow extends Payment {
  /** 1 = oldest payment. */
  seq: number;
  paidSoFar: number;
  /** Balance still pending right after this payment. */
  remainingAfter: number;
  /** Cumulative % of the principal repaid after this payment. */
  pctRepaid: number;
  /** This payment as a % of the principal. */
  shareOfPrincipal: number;
  /** Days since the previous payment, or since the loan started for the first one. */
  daysSincePrev: number | null;
  sinceLoanStart: boolean;
  /** This payment brought the balance to zero. */
  paidOff: boolean;
}

const r2 = (n: number) => Math.round(n * 100) / 100;
const r1 = (n: number) => Math.round(n * 10) / 10;
const dayNum = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number);
  return Math.round(Date.UTC(y, m - 1, d) / 86_400_000);
};

/** Running balance per payment. Takes and returns the API's newest-first order. */
export function paymentHistory(principal: number, payments: Payment[], startDate: string | null): PaymentRow[] {
  const oldestFirst = [...payments].reverse();
  let paid = 0;
  const rows = oldestFirst.map((p, i): PaymentRow => {
    const before = Math.max(0, r2(principal - paid));
    paid = r2(paid + Number(p.amount));
    const remainingAfter = Math.max(0, r2(principal - paid));
    const prevDate = i > 0 ? oldestFirst[i - 1].date : startDate;
    return {
      ...p,
      seq: i + 1,
      paidSoFar: paid,
      remainingAfter,
      pctRepaid: principal > 0 ? r1(Math.min(100, (paid / principal) * 100)) : 0,
      shareOfPrincipal: principal > 0 ? r1((Number(p.amount) / principal) * 100) : 0,
      daysSincePrev: prevDate ? dayNum(p.date) - dayNum(prevDate) : null,
      sinceLoanStart: i === 0 && !!startDate,
      paidOff: before > 0 && remainingAfter === 0,
    };
  });
  return rows.reverse();
}

export interface HistorySummary {
  avgPayment: number;
  largest: number;
  /** Average days between consecutive payments; null with fewer than two. */
  avgDaysBetween: number | null;
  lastPaymentDaysAgo: number | null;
  /** YYYY-MM the balance would clear at the pace since the first payment. */
  projectedPayoff: string | null;
}

export function historySummary(remaining: number, payments: Payment[], today: string): HistorySummary {
  if (payments.length === 0) {
    return { avgPayment: 0, largest: 0, avgDaysBetween: null, lastPaymentDaysAgo: null, projectedPayoff: null };
  }
  const amounts = payments.map((p) => Number(p.amount));
  const total = amounts.reduce((s, a) => s + a, 0);
  const days = payments.map((p) => dayNum(p.date)).sort((a, b) => a - b);
  const first = days[0], last = days[days.length - 1];
  const avgDaysBetween = days.length > 1 ? Math.round((last - first) / (days.length - 1)) : null;

  let projectedPayoff: string | null = null;
  const span = dayNum(today) - first;
  if (remaining > 0 && span > 0) {
    const perDay = total / span;
    const payoff = new Date((dayNum(today) + Math.ceil(remaining / perDay)) * 86_400_000);
    projectedPayoff = `${payoff.getUTCFullYear()}-${String(payoff.getUTCMonth() + 1).padStart(2, '0')}`;
  }

  return {
    avgPayment: r2(total / payments.length),
    largest: Math.max(...amounts),
    avgDaysBetween,
    lastPaymentDaysAgo: dayNum(today) - last,
    projectedPayoff,
  };
}
