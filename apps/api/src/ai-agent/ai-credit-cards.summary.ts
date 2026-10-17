import type { CardProfileView, CardView, AprType } from '../cards/card-types';

/* What Ask Cofre's get_credit_cards tool returns. Derived figures are computed here,
   in tested code, so the model explains numbers rather than inventing them. */

export type CardDataSource =
  | 'bank' | 'bank_and_user' | 'entered_by_user' | 'needs_bank_permission' | 'bank_does_not_share' | 'pending';

export interface AiCreditCard {
  accountId: string;
  name: string;
  accountName: string;
  bank: string;
  last4: string | null;
  balance: number;
  creditLimit: number | null;
  utilizationPct: number | null;
  purchaseApr: number | null;
  aprs: { type: AprType; percentage: number }[];
  /* Sum of interest Plaid reported on the last statement; null when not reported. */
  interestChargedLastStatement: number | null;
  /* balance × purchase APR ÷ 12 — a rough monthly cost if the balance is carried. */
  estimatedMonthlyInterest: number | null;
  lastStatementBalance: number | null;
  lastStatementDate: string | null;
  minimumPayment: number | null;
  nextPaymentDueDate: string | null;
  isOverdue: boolean | null;
  promoAprEndsOn: string | null;
  rewardsBalance: number | null;
  dataSource: CardDataSource;
  /* Key facts we don't have, so the model can ask for them instead of guessing. */
  missing: ('creditLimit' | 'purchaseApr' | 'minimumPayment' | 'nextPaymentDueDate')[];
}

export interface AiCreditCardsSummary {
  cards: AiCreditCard[];
  /* Cards without a known limit are left out of both sides. */
  totals: { balance: number; creditLimit: number; utilizationPct: number | null };
  profile: CardProfileView | null;
}

const round = (n: number, places: number) => Math.round(n * 10 ** places) / 10 ** places;

function dataSource(c: CardView): CardDataSource {
  switch (c.liabilitiesStatus) {
    case 'manual': return 'entered_by_user';
    case 'not_consented': return 'needs_bank_permission';
    case 'unsupported': return 'bank_does_not_share';
    case 'pending': return 'pending';
    default: return c.manualFields.length > 0 ? 'bank_and_user' : 'bank';
  }
}

function summarizeCard(c: CardView): AiCreditCard {
  const purchaseApr = c.aprs.find((a) => a.type === 'purchase')?.percentage ?? null;
  const reported = c.aprs.map((a) => a.interestCharged).filter((v): v is number => v !== null);
  const missing: AiCreditCard['missing'] = [];
  if (c.creditLimit === null) missing.push('creditLimit');
  if (purchaseApr === null) missing.push('purchaseApr');
  if (c.minimumPayment === null) missing.push('minimumPayment');
  if (c.nextPaymentDueDate === null) missing.push('nextPaymentDueDate');

  return {
    accountId: c.accountId,
    name: c.officialName ?? c.accountName,
    accountName: c.accountName,
    bank: c.bankName,
    last4: c.last4,
    balance: c.balance,
    creditLimit: c.creditLimit,
    utilizationPct: c.creditLimit && c.creditLimit > 0 ? round((c.balance / c.creditLimit) * 100, 1) : null,
    purchaseApr,
    aprs: c.aprs.map((a) => ({ type: a.type, percentage: a.percentage })),
    interestChargedLastStatement: reported.length > 0 ? round(reported.reduce((s, v) => s + v, 0), 2) : null,
    estimatedMonthlyInterest: purchaseApr === null ? null : round((c.balance * purchaseApr) / 100 / 12, 2),
    lastStatementBalance: c.lastStatementBalance,
    lastStatementDate: c.lastStatementDate,
    minimumPayment: c.minimumPayment,
    nextPaymentDueDate: c.nextPaymentDueDate,
    isOverdue: c.isOverdue,
    promoAprEndsOn: c.promoAprEndsOn,
    rewardsBalance: c.rewardsBalance,
    dataSource: dataSource(c),
    missing,
  };
}

export function summarizeCreditCards(cards: CardView[], profile: CardProfileView | null): AiCreditCardsSummary {
  let balance = 0;
  let creditLimit = 0;
  for (const c of cards) {
    if (!c.creditLimit || c.creditLimit <= 0) continue;
    balance += c.balance;
    creditLimit += c.creditLimit;
  }
  return {
    cards: cards.map(summarizeCard),
    totals: {
      balance: round(balance, 2),
      creditLimit: round(creditLimit, 2),
      utilizationPct: creditLimit > 0 ? round((balance / creditLimit) * 100, 1) : null,
    },
    profile,
  };
}
