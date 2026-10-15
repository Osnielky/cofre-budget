import { describe, it, expect } from 'vitest';
import { cardNotice } from './card-notice';
import type { CardView } from './types';

const base: CardView = {
  accountId: 'a', bankName: 'Chase', accountName: 'Freedom', last4: '1234', balance: 100,
  provider: 'plaid', plaidItemId: 'i', plaidItemStatus: 'active', creditLimit: 1000, officialName: null,
  aprs: [{ type: 'purchase', percentage: 20, balanceSubjectTo: null, interestCharged: null }],
  lastStatementBalance: null, lastStatementDate: null, minimumPayment: null, nextPaymentDueDate: null,
  lastPaymentAmount: null, lastPaymentDate: null, isOverdue: null, promoAprEndsOn: null, rewardsBalance: null,
  liabilitiesStatus: 'synced', manualFields: [], liabilitiesSyncedAt: null, hasBankData: true,
};

describe('cardNotice', () => {
  it('nothing to say for a synced card', () => { expect(cardNotice(base)).toBeNull(); });
  it('a broken bank connection wins', () => {
    expect(cardNotice({ ...base, plaidItemStatus: 'error', liabilitiesStatus: 'not_consented' })?.kind).toBe('reconnect');
  });
  it('asks for consent on older links', () => {
    expect(cardNotice({ ...base, liabilitiesStatus: 'not_consented' })?.kind).toBe('enable');
  });
  it('says data is on the way', () => {
    expect(cardNotice({ ...base, liabilitiesStatus: 'pending' })?.kind).toBe('pending');
  });
  it('asks for details when the bank does not share them and none were typed', () => {
    expect(cardNotice({ ...base, liabilitiesStatus: 'unsupported', aprs: [] })?.kind).toBe('add_details');
    expect(cardNotice({ ...base, provider: 'manual', plaidItemId: null, plaidItemStatus: null, liabilitiesStatus: 'manual', creditLimit: null })?.kind).toBe('add_details');
  });
  it('is quiet once a manual card has APR and limit', () => {
    expect(cardNotice({ ...base, provider: 'manual', plaidItemId: null, plaidItemStatus: null, liabilitiesStatus: 'manual' })).toBeNull();
  });
});
