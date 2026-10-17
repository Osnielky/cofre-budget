import type { CardView } from './types';
import { aprOf, totalUtilization } from './utilization';
import { cardNotice } from './card-notice';

/* Numbers and tips for the /cards overview. Everything here comes from the user's real
   card data — when a fact is missing the result is null, never an estimate. */

export type UtilizationRating = 'Excellent' | 'Good' | 'High' | 'Very high';

export function utilizationRating(ratio: number): UtilizationRating {
  if (ratio < 0.1) return 'Excellent';
  if (ratio < 0.3) return 'Good';
  if (ratio < 0.5) return 'High';
  return 'Very high';
}

const r2 = (n: number) => Math.round(n * 100) / 100;
const money = (n: number) => `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const cardName = (c: CardView) => c.officialName ?? c.accountName;

function utcDay(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}

export function shortDate(iso: string): string {
  return new Date(utcDay(iso)).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
}

/* Limit minus balance over cards with a known limit; an over-limit card adds 0. */
export function availableCredit(cards: CardView[]): { available: number; pct: number } | null {
  let available = 0;
  let limit = 0;
  for (const c of cards) {
    if (!c.creditLimit || c.creditLimit <= 0) continue;
    available += Math.max(0, c.creditLimit - c.balance);
    limit += c.creditLimit;
  }
  if (limit === 0) return null;
  return { available: r2(available), pct: Math.round((available / limit) * 100) };
}

/* The card carrying a balance with the highest purchase APR — the one to pay first. */
export function highestApr(cards: CardView[]): { accountId: string; name: string; apr: number; monthlyInterest: number } | null {
  let best: { accountId: string; name: string; apr: number; monthlyInterest: number } | null = null;
  for (const c of cards) {
    const apr = aprOf(c, 'purchase');
    if (apr === null || c.balance <= 0) continue;
    if (!best || apr > best.apr) {
      best = { accountId: c.accountId, name: cardName(c), apr, monthlyInterest: r2((c.balance * apr) / 1200) };
    }
  }
  return best;
}

export function nextPayment(cards: CardView[], today: string): { accountId: string; name: string; date: string; minimumPayment: number | null } | null {
  let next: { accountId: string; name: string; date: string; minimumPayment: number | null } | null = null;
  for (const c of cards) {
    const due = c.nextPaymentDueDate;
    if (!due || due < today) continue;
    if (!next || due < next.date) next = { accountId: c.accountId, name: cardName(c), date: due, minimumPayment: c.minimumPayment };
  }
  return next;
}

export type TipKind = 'utilization' | 'pay_first' | 'due_soon' | 'missing_data';
export interface StrategyTip { kind: TipKind; title: string; detail: string; tone: 'good' | 'warn' | 'info' }

const DUE_SOON_DAYS = 7;

/* Up to four tips, most useful first. */
export function strategyTips(cards: CardView[], today: string): StrategyTip[] {
  const tips: StrategyTip[] = [];

  const { ratio } = totalUtilization(cards);
  if (ratio !== null) {
    const pct = Math.round(ratio * 100);
    tips.push(ratio < 0.3
      ? { kind: 'utilization', title: 'Keep utilization under 30%', detail: `You're at ${pct}% — good for your credit score.`, tone: 'good' }
      : { kind: 'utilization', title: 'Bring utilization under 30%', detail: `You're at ${pct}%. Paying balances down below 30% can lift your credit score.`, tone: 'warn' });
  }

  const top = highestApr(cards);
  if (top) {
    tips.push({
      kind: 'pay_first',
      title: `Pay ${top.name} first`,
      detail: `Highest APR (${top.apr}%) — about ${money(top.monthlyInterest)}/month in interest at its current balance.`,
      tone: 'info',
    });
  }

  const due = nextPayment(cards, today);
  if (due && (utcDay(due.date) - utcDay(today)) / 86_400_000 <= DUE_SOON_DAYS) {
    tips.push({
      kind: 'due_soon',
      title: `Payment due ${shortDate(due.date)}`,
      detail: due.minimumPayment !== null ? `${money(due.minimumPayment)} minimum on ${due.name}.` : `Payment due on ${due.name}.`,
      tone: 'warn',
    });
  }

  const missing = cards.filter((c) => {
    const kind = cardNotice(c)?.kind;
    return kind === 'add_details' || kind === 'enable';
  }).length;
  if (missing > 0) {
    tips.push({
      kind: 'missing_data',
      title: missing === 1 ? '1 card is missing details' : `${missing} cards are missing details`,
      detail: 'Add the APR and limit (or enable card details) so these tips cover every card.',
      tone: 'info',
    });
  }

  return tips.slice(0, 4);
}
