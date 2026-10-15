/* Shapes shared by the cards module's entities, pure helpers and API responses.
   apps/web/src/lib/cards/types.ts mirrors CardView / CardProfileView — keep in sync. */

export type AprType = 'purchase' | 'balance_transfer' | 'cash_advance' | 'special';

export interface CardApr {
  type: AprType;
  percentage: number;
  /* Plaid-only; null for APRs typed in by hand. */
  balanceSubjectTo: number | null;
  interestCharged: number | null;
}

/* synced: Plaid Liabilities data present · unsupported: bank or card doesn't offer it ·
   not_consented: Item linked before Liabilities, needs update-mode consent ·
   pending: Plaid still extracting · manual: not a Plaid account */
export type LiabilitiesStatus = 'synced' | 'unsupported' | 'not_consented' | 'pending' | 'manual';

/* What Plaid reports for one credit account. Any field may be null. */
export interface PlaidCardData {
  creditLimit: number | null;
  officialName: string | null;
  aprs: CardApr[] | null;
  lastStatementBalance: number | null;
  lastStatementDate: string | null;
  minimumPayment: number | null;
  nextPaymentDueDate: string | null;
  lastPaymentAmount: number | null;
  lastPaymentDate: string | null;
  isOverdue: boolean | null;
}

export interface CardView {
  accountId: string;
  bankName: string;
  accountName: string;
  last4: string | null;
  /* Amount owed, always >= 0. */
  balance: number;
  provider: 'manual' | 'plaid';
  plaidItemId: string | null;
  /* PlaidItem.status ('active' | 'error' …); null for manual cards. */
  plaidItemStatus: string | null;
  creditLimit: number | null;
  officialName: string | null;
  aprs: CardApr[];
  lastStatementBalance: number | null;
  lastStatementDate: string | null;
  minimumPayment: number | null;
  nextPaymentDueDate: string | null;
  lastPaymentAmount: number | null;
  lastPaymentDate: string | null;
  isOverdue: boolean | null;
  promoAprEndsOn: string | null;
  rewardsBalance: number | null;
  liabilitiesStatus: LiabilitiesStatus;
  manualFields: string[];
  liabilitiesSyncedAt: string | null;
  /* True when a Plaid snapshot exists, so "Use bank data" can restore it. */
  hasBankData: boolean;
}

export const CARD_GOALS = ['pay_off_debt', 'cashback', 'travel', 'build_credit'] as const;
export type CardGoal = (typeof CARD_GOALS)[number];

export const SCORE_BANDS = ['<580', '580-669', '670-739', '740-799', '800+'] as const;
export type ScoreBand = (typeof SCORE_BANDS)[number];

export interface CardProfileView {
  goal: CardGoal | null;
  annualFeeOk: boolean | null;
  creditScoreBand: ScoreBand | null;
  monthlyDebtBudget: number | null;
  plannedPurchaseAmount: number | null;
  plannedPurchaseNote: string | null;
}
