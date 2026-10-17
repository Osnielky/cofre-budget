import type { CardApr, LiabilitiesStatus, PlaidCardData } from './card-types';

/* Structural subsets of Plaid's AccountBase / CreditCardLiability, so this file and its
   tests don't depend on the SDK's full types. */
export interface PlaidAccountLike {
  account_id: string;
  official_name?: string | null;
  balances: { limit?: number | null };
}

export interface PlaidCreditLike {
  account_id: string | null;
  aprs: { apr_type: string; apr_percentage: number; balance_subject_to_apr: number | null; interest_charge_amount: number | null }[];
  is_overdue: boolean | null;
  last_payment_amount: number | null;
  last_payment_date: string | null;
  last_statement_issue_date: string | null;
  last_statement_balance: number | null;
  minimum_payment_amount: number | null;
  next_payment_due_date: string | null;
}

const APR_TYPES: Record<string, CardApr['type']> = {
  purchase_apr: 'purchase',
  balance_transfer_apr: 'balance_transfer',
  cash_apr: 'cash_advance',
  special: 'special',
};

export function mapPlaidCard(account: PlaidAccountLike, credit: PlaidCreditLike | null): PlaidCardData {
  return {
    creditLimit: account.balances.limit ?? null,
    officialName: account.official_name ?? null,
    aprs: credit
      ? credit.aprs
          .filter((a) => a.apr_type in APR_TYPES)
          .map((a) => ({
            type: APR_TYPES[a.apr_type],
            percentage: a.apr_percentage,
            balanceSubjectTo: a.balance_subject_to_apr ?? null,
            interestCharged: a.interest_charge_amount ?? null,
          }))
      : null,
    lastStatementBalance: credit?.last_statement_balance ?? null,
    lastStatementDate: credit?.last_statement_issue_date ?? null,
    minimumPayment: credit?.minimum_payment_amount ?? null,
    nextPaymentDueDate: credit?.next_payment_due_date ?? null,
    lastPaymentAmount: credit?.last_payment_amount ?? null,
    lastPaymentDate: credit?.last_payment_date ?? null,
    isOverdue: credit?.is_overdue ?? null,
  };
}

/* Plaid error codes that mean "no Liabilities data for this Item right now" rather than
   a failure. Anything else returns null and is treated as a real error. */
export function liabilitiesErrorStatus(errorCode: string | undefined): LiabilitiesStatus | null {
  switch (errorCode) {
    case 'ADDITIONAL_CONSENT_REQUIRED': return 'not_consented';
    case 'PRODUCT_NOT_READY': return 'pending';
    case 'PRODUCTS_NOT_SUPPORTED':
    case 'NO_LIABILITY_ACCOUNTS': return 'unsupported';
    default: return null;
  }
}
