import { describe, it, expect } from 'vitest';
import {
  isEligibleCounterpart, describeMatch, orientSides, searchCandidates, dayGap, type LinkTx,
} from './transferLink';

/* The pair from the reported bug: a +$9.50 deposit into Chase on 2026-03-13. */
const deposit: LinkTx = {
  id: 'dep', name: 'Payment received', amount: 9.5, date: '2026-03-13', bankAccountId: 'chase',
};

function tx(over: Partial<LinkTx> = {}): LinkTx {
  return { id: 'c1', name: 'SUNPASS', amount: -9.5, date: '2026-03-14', bankAccountId: 'bofa', ...over };
}

describe('isEligibleCounterpart', () => {
  it('accepts an opposite-signed transaction in another account', () => {
    expect(isEligibleCounterpart(deposit, tx())).toBe(true);
  });

  it('accepts a differing amount — the search tab is a manual choice', () => {
    expect(isEligibleCounterpart(deposit, tx({ amount: -10 }))).toBe(true);
  });

  it('rejects the transaction itself', () => {
    expect(isEligibleCounterpart(deposit, tx({ id: 'dep' }))).toBe(false);
  });

  it('rejects a transaction in the same account', () => {
    expect(isEligibleCounterpart(deposit, tx({ bankAccountId: 'chase' }))).toBe(false);
  });

  it('rejects a transaction pointing the same direction', () => {
    expect(isEligibleCounterpart(deposit, tx({ amount: 9.5 }))).toBe(false);
  });

  it('rejects a transaction already linked to another transfer', () => {
    // Linking it again would silently break the pair it already belongs to.
    expect(isEligibleCounterpart(deposit, tx({ counterpartTxId: 'other' }))).toBe(false);
  });

  it('rejects a transaction with no account', () => {
    expect(isEligibleCounterpart(deposit, tx({ bankAccountId: null }))).toBe(false);
  });
});

describe('describeMatch', () => {
  it('says so when the amounts are equal', () => {
    expect(describeMatch(deposit, tx())).toMatchObject({ sameAmount: true, dayDiff: 1, label: 'Same amount, 1 day apart' });
  });

  it('does not claim equality when the amounts differ', () => {
    // The exact case the user reported: $9.50 vs $10.00 was labelled "Same amount".
    const d = describeMatch(deposit, tx({ amount: -10 }));
    expect(d.sameAmount).toBe(false);
    expect(d.label).toBe('Amounts differ, 1 day apart');
  });

  it('collapses amount and date into one phrase when both agree', () => {
    expect(describeMatch(deposit, tx({ date: '2026-03-13' })).label).toBe('Same amount and date');
  });

  it('pluralises the day gap', () => {
    expect(describeMatch(deposit, tx({ date: '2026-03-16' })).label).toBe('Same amount, 3 days apart');
  });
});

describe('orientSides', () => {
  it('puts the outgoing leg on the FROM side when the source is the deposit', () => {
    const payment = tx();
    const { from, to, srcIsFrom } = orientSides(deposit, payment);
    expect(from).toBe(payment);
    expect(to).toBe(deposit);
    expect(srcIsFrom).toBe(false);
  });

  it('puts the source on the FROM side when the source is the payment', () => {
    const payment = tx();
    const { from, to, srcIsFrom } = orientSides(payment, deposit);
    expect(from).toBe(payment);
    expect(to).toBe(deposit);
    expect(srcIsFrom).toBe(true);
  });

  it('leaves the far side empty until something is chosen', () => {
    expect(orientSides(deposit, null).from).toBeNull();
  });
});

describe('searchCandidates', () => {
  const pool: LinkTx[] = [
    tx({ id: 'far', name: 'SUNPASS TOLLS', date: '2026-03-16' }),
    tx({ id: 'near', name: 'SUNPASS ACC', date: '2026-03-13' }),
    tx({ id: 'wrongway', name: 'SUNPASS REFUND', amount: 9.5 }),
    tx({ id: 'linked', name: 'SUNPASS OLD', counterpartTxId: 'x' }),
    tx({ id: 'other', name: 'PUBLIX' }),
  ];

  it('returns eligible candidates closest in date first', () => {
    // near = same day, other = 1 day out, far = 3 days out.
    expect(searchCandidates(deposit, pool, '').map((t) => t.id)).toEqual(['near', 'other', 'far']);
  });

  it('filters by name, case-insensitively', () => {
    expect(searchCandidates(deposit, pool, 'publix').map((t) => t.id)).toEqual(['other']);
  });

  it('never surfaces an ineligible candidate, whatever the query', () => {
    const ids = searchCandidates(deposit, pool, 'sunpass').map((t) => t.id);
    expect(ids).not.toContain('wrongway');
    expect(ids).not.toContain('linked');
  });
});

describe('dayGap', () => {
  it('counts whole days regardless of order', () => {
    expect(dayGap('2026-03-13', '2026-03-16')).toBe(3);
    expect(dayGap('2026-03-16', '2026-03-13')).toBe(3);
  });

  it('is zero for the same date', () => {
    expect(dayGap('2026-03-13', '2026-03-13')).toBe(0);
  });
});
