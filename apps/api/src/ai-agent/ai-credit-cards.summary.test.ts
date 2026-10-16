import { describe, it, expect } from 'vitest';
import { summarizeCreditCards } from './ai-credit-cards.summary';
import type { CardView, CardProfileView } from '../cards/card-types';

function card(overrides: Partial<CardView> = {}): CardView {
  return {
    accountId: 'a1', bankName: 'Bank of America', accountName: 'GREY BOA', last4: '1234', balance: 1645.96,
    provider: 'plaid', plaidItemId: 'i1', plaidItemStatus: 'active',
    creditLimit: 5000, officialName: 'Customized Cash Rewards',
    aprs: [
      { type: 'purchase', percentage: 24, balanceSubjectTo: 1645.96, interestCharged: 31.5 },
      { type: 'cash_advance', percentage: 29.99, balanceSubjectTo: null, interestCharged: null },
    ],
    lastStatementBalance: 1600, lastStatementDate: '2026-10-01', minimumPayment: 40, nextPaymentDueDate: '2026-10-28',
    lastPaymentAmount: 200, lastPaymentDate: '2026-09-25', isOverdue: false,
    promoAprEndsOn: null, rewardsBalance: null,
    liabilitiesStatus: 'synced', manualFields: [], liabilitiesSyncedAt: '2026-10-16T10:00:00.000Z', hasBankData: true,
    ...overrides,
  };
}

const profile: CardProfileView = {
  goal: 'pay_off_debt', annualFeeOk: false, creditScoreBand: '670-739',
  monthlyDebtBudget: 500, plannedPurchaseAmount: null, plannedPurchaseNote: null,
};

describe('summarizeCreditCards', () => {
  it('summarizes a synced card with utilization and interest figures', () => {
    const out = summarizeCreditCards([card()], profile);
    expect(out.cards[0]).toEqual({
      accountId: 'a1',
      name: 'Customized Cash Rewards',
      accountName: 'GREY BOA',
      bank: 'Bank of America',
      last4: '1234',
      balance: 1645.96,
      creditLimit: 5000,
      utilizationPct: 32.9,
      purchaseApr: 24,
      aprs: [{ type: 'purchase', percentage: 24 }, { type: 'cash_advance', percentage: 29.99 }],
      interestChargedLastStatement: 31.5,
      estimatedMonthlyInterest: 32.92,
      lastStatementBalance: 1600,
      lastStatementDate: '2026-10-01',
      minimumPayment: 40,
      nextPaymentDueDate: '2026-10-28',
      isOverdue: false,
      promoAprEndsOn: null,
      rewardsBalance: null,
      dataSource: 'bank',
      missing: [],
    });
    expect(out.totals).toEqual({ balance: 1645.96, creditLimit: 5000, utilizationPct: 32.9 });
    expect(out.profile).toEqual(profile);
  });

  it('lists what is missing and leaves derived figures null', () => {
    const out = summarizeCreditCards([card({ creditLimit: null, aprs: [], liabilitiesStatus: 'not_consented', hasBankData: false, minimumPayment: null, nextPaymentDueDate: null })], null);
    const c = out.cards[0];
    expect(c.utilizationPct).toBeNull();
    expect(c.purchaseApr).toBeNull();
    expect(c.estimatedMonthlyInterest).toBeNull();
    expect(c.interestChargedLastStatement).toBeNull();
    expect(c.dataSource).toBe('needs_bank_permission');
    expect(c.missing).toEqual(['creditLimit', 'purchaseApr', 'minimumPayment', 'nextPaymentDueDate']);
    expect(out.totals.utilizationPct).toBeNull();
    expect(out.profile).toBeNull();
  });

  it('labels data sources', () => {
    const src = (o: Partial<CardView>) => summarizeCreditCards([card(o)], null).cards[0].dataSource;
    expect(src({ liabilitiesStatus: 'manual', provider: 'manual' })).toBe('entered_by_user');
    expect(src({ manualFields: ['creditLimit'] })).toBe('bank_and_user');
    expect(src({ liabilitiesStatus: 'unsupported' })).toBe('bank_does_not_share');
    expect(src({ liabilitiesStatus: 'pending' })).toBe('pending');
  });

  it('totals only cards with a limit and a zero-interest card estimates 0', () => {
    const out = summarizeCreditCards([
      card(),
      card({ accountId: 'a2', accountName: 'RED BOA', officialName: null, balance: 630.32, creditLimit: null,
        aprs: [{ type: 'purchase', percentage: 0, balanceSubjectTo: null, interestCharged: null }] }),
    ], null);
    expect(out.totals).toEqual({ balance: 1645.96, creditLimit: 5000, utilizationPct: 32.9 });
    expect(out.cards[1].name).toBe('RED BOA');
    expect(out.cards[1].estimatedMonthlyInterest).toBe(0);
  });
});
