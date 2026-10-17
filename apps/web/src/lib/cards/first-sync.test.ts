import { describe, it, expect } from 'vitest';
import { itemsNeedingFirstSync } from './first-sync';
import type { CardView } from './types';

const base: CardView = {
  accountId: 'a', bankName: 'Chase', accountName: 'Freedom', last4: '1234', balance: 100,
  provider: 'plaid', plaidItemId: 'i1', plaidItemStatus: 'active', creditLimit: null, officialName: null,
  aprs: [], lastStatementBalance: null, lastStatementDate: null, minimumPayment: null, nextPaymentDueDate: null,
  lastPaymentAmount: null, lastPaymentDate: null, isOverdue: null, promoAprEndsOn: null, rewardsBalance: null,
  liabilitiesStatus: 'pending', manualFields: [], liabilitiesSyncedAt: null, hasBankData: false,
};

describe('itemsNeedingFirstSync', () => {
  it('returns distinct item ids of never-synced pending Plaid cards', () => {
    expect(itemsNeedingFirstSync([base, { ...base, accountId: 'b' }, { ...base, accountId: 'c', plaidItemId: 'i2' }])).toEqual(['i1', 'i2']);
  });
  it('skips manual, synced, bank-data, already-synced and errored cards', () => {
    expect(itemsNeedingFirstSync([
      { ...base, provider: 'manual', plaidItemId: null },
      { ...base, liabilitiesStatus: 'synced' },
      { ...base, hasBankData: true },
      { ...base, liabilitiesSyncedAt: '2026-10-01T00:00:00Z' },
      { ...base, plaidItemStatus: 'error' },
      { ...base, plaidItemId: null },
    ])).toEqual([]);
  });
});
