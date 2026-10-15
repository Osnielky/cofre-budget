/* Mirror of apps/api/src/cards/card-types.ts (CardView / CardProfileView) — keep in sync. */

export type AprType = 'purchase' | 'balance_transfer' | 'cash_advance' | 'special';
export interface CardApr { type: AprType; percentage: number; balanceSubjectTo: number | null; interestCharged: number | null }
export type LiabilitiesStatus = 'synced' | 'unsupported' | 'not_consented' | 'pending' | 'manual';

export interface CardView {
  accountId: string;
  bankName: string;
  accountName: string;
  last4: string | null;
  balance: number;
  provider: 'manual' | 'plaid';
  plaidItemId: string | null;
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
  hasBankData: boolean;
}

export type CardGoal = 'pay_off_debt' | 'cashback' | 'travel' | 'build_credit';
export type ScoreBand = '<580' | '580-669' | '670-739' | '740-799' | '800+';

export interface CardProfileView {
  goal: CardGoal | null;
  annualFeeOk: boolean | null;
  creditScoreBand: ScoreBand | null;
  monthlyDebtBudget: number | null;
  plannedPurchaseAmount: number | null;
  plannedPurchaseNote: string | null;
}
