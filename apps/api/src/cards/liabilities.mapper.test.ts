import { describe, it, expect } from 'vitest';
import { mapPlaidCard, liabilitiesErrorStatus } from './liabilities.mapper';

const account = { account_id: 'acc-1', official_name: 'Chase Sapphire Preferred', balances: { limit: 12000 } };
const credit = {
  account_id: 'acc-1',
  aprs: [
    { apr_type: 'purchase_apr', apr_percentage: 24.99, balance_subject_to_apr: 1500.5, interest_charge_amount: 31.2 },
    { apr_type: 'balance_transfer_apr', apr_percentage: 0, balance_subject_to_apr: 2000, interest_charge_amount: 0 },
    { apr_type: 'cash_apr', apr_percentage: 29.99, balance_subject_to_apr: null, interest_charge_amount: null },
    { apr_type: 'special', apr_percentage: 0, balance_subject_to_apr: null, interest_charge_amount: null },
  ],
  is_overdue: false,
  last_payment_amount: 250,
  last_payment_date: '2026-09-20',
  last_statement_issue_date: '2026-10-01',
  last_statement_balance: 3500.5,
  minimum_payment_amount: 45,
  next_payment_due_date: '2026-10-28',
};

describe('mapPlaidCard', () => {
  it('maps limit, name, APRs and statement fields', () => {
    expect(mapPlaidCard(account, credit)).toEqual({
      creditLimit: 12000,
      officialName: 'Chase Sapphire Preferred',
      aprs: [
        { type: 'purchase', percentage: 24.99, balanceSubjectTo: 1500.5, interestCharged: 31.2 },
        { type: 'balance_transfer', percentage: 0, balanceSubjectTo: 2000, interestCharged: 0 },
        { type: 'cash_advance', percentage: 29.99, balanceSubjectTo: null, interestCharged: null },
        { type: 'special', percentage: 0, balanceSubjectTo: null, interestCharged: null },
      ],
      lastStatementBalance: 3500.5,
      lastStatementDate: '2026-10-01',
      minimumPayment: 45,
      nextPaymentDueDate: '2026-10-28',
      lastPaymentAmount: 250,
      lastPaymentDate: '2026-09-20',
      isOverdue: false,
    });
  });

  it('drops APR types it does not know', () => {
    const data = mapPlaidCard(account, { ...credit, aprs: [{ apr_type: 'mystery_apr', apr_percentage: 5, balance_subject_to_apr: null, interest_charge_amount: null }] });
    expect(data.aprs).toEqual([]);
  });

  it('without liabilities data keeps only limit and name', () => {
    const data = mapPlaidCard({ account_id: 'acc-1', official_name: null, balances: { limit: null } }, null);
    expect(data).toEqual({
      creditLimit: null, officialName: null, aprs: null,
      lastStatementBalance: null, lastStatementDate: null, minimumPayment: null, nextPaymentDueDate: null,
      lastPaymentAmount: null, lastPaymentDate: null, isOverdue: null,
    });
  });
});

describe('liabilitiesErrorStatus', () => {
  it.each([
    ['ADDITIONAL_CONSENT_REQUIRED', 'not_consented'],
    ['PRODUCT_NOT_READY', 'pending'],
    ['PRODUCTS_NOT_SUPPORTED', 'unsupported'],
    ['NO_LIABILITY_ACCOUNTS', 'unsupported'],
  ])('%s → %s', (code, status) => {
    expect(liabilitiesErrorStatus(code)).toBe(status);
  });

  it('returns null for real failures', () => {
    expect(liabilitiesErrorStatus('ITEM_LOGIN_REQUIRED')).toBeNull();
    expect(liabilitiesErrorStatus(undefined)).toBeNull();
  });
});
