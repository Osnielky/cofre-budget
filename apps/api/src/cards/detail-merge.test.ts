import { describe, it, expect } from 'vitest';
import { mergePlaidData, mergeSnapshot } from './detail-merge';
import type { PlaidCardData } from './card-types';

const plaid: PlaidCardData = {
  creditLimit: 10000,
  officialName: 'Freedom Unlimited',
  aprs: [{ type: 'purchase', percentage: 22.99, balanceSubjectTo: 900, interestCharged: 17 }],
  lastStatementBalance: 900,
  lastStatementDate: '2026-10-01',
  minimumPayment: 35,
  nextPaymentDueDate: '2026-10-26',
  lastPaymentAmount: 100,
  lastPaymentDate: '2026-09-25',
  isOverdue: false,
};

describe('mergePlaidData', () => {
  it('takes every Plaid value when nothing was edited by hand', () => {
    const r = mergePlaidData({ manualFields: [], manualEditedAt: null }, plaid);
    expect(r.values).toEqual(plaid);
    expect(r.manualFields).toEqual([]);
  });

  it('leaves hand-edited fields alone', () => {
    const r = mergePlaidData({ manualFields: ['creditLimit', 'aprs'], manualEditedAt: new Date('2026-10-05T12:00:00Z') }, plaid);
    expect(r.values).not.toHaveProperty('creditLimit');
    expect(r.values).not.toHaveProperty('aprs');
    expect(r.values.minimumPayment).toBe(35);
    expect(r.manualFields).toEqual(['creditLimit', 'aprs']);
  });

  it('a statement newer than the manual edit replaces statement fields', () => {
    const r = mergePlaidData(
      { manualFields: ['creditLimit', 'lastStatementBalance', 'minimumPayment', 'nextPaymentDueDate', 'lastStatementDate'], manualEditedAt: new Date('2026-09-15T12:00:00Z') },
      plaid,
    );
    expect(r.values.lastStatementBalance).toBe(900);
    expect(r.values.minimumPayment).toBe(35);
    expect(r.values.nextPaymentDueDate).toBe('2026-10-26');
    expect(r.values.lastStatementDate).toBe('2026-10-01');
    expect(r.values).not.toHaveProperty('creditLimit');
    expect(r.manualFields).toEqual(['creditLimit']);
  });

  it('a statement from the same day as the edit does not replace it', () => {
    const r = mergePlaidData({ manualFields: ['minimumPayment'], manualEditedAt: new Date('2026-10-01T18:00:00Z') }, plaid);
    expect(r.values).not.toHaveProperty('minimumPayment');
    expect(r.manualFields).toEqual(['minimumPayment']);
  });

  it('null from Plaid keeps last known value', () => {
    const r = mergePlaidData({ manualFields: [], manualEditedAt: null }, { ...plaid, creditLimit: null, aprs: null });
    expect(r.values).not.toHaveProperty('creditLimit');
    expect(r.values).not.toHaveProperty('aprs');
  });
});

describe('mergeSnapshot', () => {
  it('keeps earlier non-null values the new report lacks', () => {
    const next = { ...plaid, aprs: null, minimumPayment: null, creditLimit: 11000 };
    expect(mergeSnapshot(plaid, next)).toEqual({ ...plaid, creditLimit: 11000 });
  });

  it('starts from nothing', () => {
    expect(mergeSnapshot(null, plaid)).toEqual(plaid);
  });
});
