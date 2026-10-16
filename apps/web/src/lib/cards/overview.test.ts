import { describe, it, expect } from 'vitest';
import { utilizationRating, availableCredit, highestApr, nextPayment, strategyTips } from './overview';
import type { CardView } from './types';

function card(o: Partial<CardView> = {}): CardView {
  return {
    accountId: 'a', bankName: 'Bank of America', accountName: 'GREY BOA', last4: '1234', balance: 1645.96,
    provider: 'plaid', plaidItemId: 'i', plaidItemStatus: 'active', creditLimit: 9300, officialName: null,
    aprs: [{ type: 'purchase', percentage: 24, balanceSubjectTo: null, interestCharged: null }],
    lastStatementBalance: null, lastStatementDate: null, minimumPayment: 40, nextPaymentDueDate: '2026-10-20',
    lastPaymentAmount: null, lastPaymentDate: null, isOverdue: false, promoAprEndsOn: null, rewardsBalance: null,
    liabilitiesStatus: 'synced', manualFields: [], liabilitiesSyncedAt: null, hasBankData: true,
    ...o,
  };
}

const TODAY = '2026-10-16';

describe('utilizationRating', () => {
  it.each([[0, 'Excellent'], [0.099, 'Excellent'], [0.1, 'Good'], [0.299, 'Good'], [0.3, 'High'], [0.499, 'High'], [0.5, 'Very high']])('%s → %s', (r, label) => {
    expect(utilizationRating(r as number)).toBe(label);
  });
});

describe('availableCredit', () => {
  it('sums limit minus balance over cards with a limit', () => {
    expect(availableCredit([card({ balance: 1000, creditLimit: 4000 }), card({ balance: 500, creditLimit: 1000 }), card({ creditLimit: null })]))
      .toEqual({ available: 3500, pct: 70 });
  });
  it('never goes below zero for an over-limit card and is null with no limits', () => {
    expect(availableCredit([card({ balance: 1200, creditLimit: 1000 })])).toEqual({ available: 0, pct: 0 });
    expect(availableCredit([card({ creditLimit: null })])).toBeNull();
  });
});

describe('highestApr', () => {
  it('picks the highest purchase APR among cards carrying a balance, with monthly interest', () => {
    const r = highestApr([
      card({ accountId: 'a', accountName: 'GREY BOA', balance: 1645.96, aprs: [{ type: 'purchase', percentage: 24, balanceSubjectTo: null, interestCharged: null }] }),
      card({ accountId: 'b', accountName: 'RED BOA', balance: 630.32, aprs: [{ type: 'purchase', percentage: 27.99, balanceSubjectTo: null, interestCharged: null }] }),
      card({ accountId: 'c', accountName: 'Paid off', balance: 0, aprs: [{ type: 'purchase', percentage: 29.99, balanceSubjectTo: null, interestCharged: null }] }),
    ]);
    expect(r).toEqual({ accountId: 'b', name: 'RED BOA', apr: 27.99, monthlyInterest: 14.7 });
  });
  it('is null when no card has an APR', () => {
    expect(highestApr([card({ aprs: [] })])).toBeNull();
  });
});

describe('nextPayment', () => {
  it('returns the earliest upcoming due date', () => {
    expect(nextPayment([
      card({ accountId: 'a', accountName: 'GREY BOA', nextPaymentDueDate: '2026-10-28', minimumPayment: 40 }),
      card({ accountId: 'b', accountName: 'RED BOA', nextPaymentDueDate: '2026-10-20', minimumPayment: 25 }),
      card({ accountId: 'c', nextPaymentDueDate: '2026-10-01' }),
    ], TODAY)).toEqual({ accountId: 'b', name: 'RED BOA', date: '2026-10-20', minimumPayment: 25 });
  });
  it('is null when nothing is due', () => {
    expect(nextPayment([card({ nextPaymentDueDate: null })], TODAY)).toBeNull();
  });
});

describe('strategyTips', () => {
  it('builds utilization, pay-first, due-soon and missing-data tips from real data', () => {
    const tips = strategyTips([
      card({ accountId: 'a', accountName: 'GREY BOA', balance: 1645.96, creditLimit: 9300, nextPaymentDueDate: '2026-10-20', minimumPayment: 40 }),
      card({ accountId: 'b', accountName: 'RED BOA', balance: 630.32, creditLimit: 7200, aprs: [], liabilitiesStatus: 'unsupported', nextPaymentDueDate: null }),
    ], TODAY);
    expect(tips.map((t) => t.kind)).toEqual(['utilization', 'pay_first', 'due_soon', 'missing_data']);
    expect(tips[0]).toMatchObject({ title: 'Keep utilization under 30%', tone: 'good' });
    expect(tips[0].detail).toContain('14%');
    expect(tips[1].title).toBe('Pay GREY BOA first');
    expect(tips[1].detail).toContain('24%');
    expect(tips[1].detail).toContain('$32.92');
    expect(tips[2].title).toBe('Payment due Oct 20');
    expect(tips[2].detail).toContain('$40.00');
    expect(tips[3].title).toBe('1 card is missing details');
  });

  it('warns when utilization is high and stays quiet when there is nothing to say', () => {
    expect(strategyTips([card({ balance: 4000, creditLimit: 5000, nextPaymentDueDate: '2026-11-30' })], TODAY)[0]).toMatchObject({ kind: 'utilization', tone: 'warn' });
    expect(strategyTips([], TODAY)).toEqual([]);
  });

  it('caps at four tips', () => {
    expect(strategyTips([card()], TODAY).length).toBeLessThanOrEqual(4);
  });
});
