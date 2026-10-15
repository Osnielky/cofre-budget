import { describe, it, expect } from 'vitest';
import { formFromCard, formToPatch, type DetailForm } from './detail-form';
import type { CardView } from './types';

const card = {
  creditLimit: 5000, aprs: [
    { type: 'purchase', percentage: 24.99, balanceSubjectTo: 800, interestCharged: 16 },
    { type: 'cash_advance', percentage: 29.99, balanceSubjectTo: null, interestCharged: null },
  ],
  lastStatementBalance: 800, minimumPayment: 35, nextPaymentDueDate: '2026-10-28',
  promoAprEndsOn: null, rewardsBalance: null,
} as unknown as CardView;

const blank: DetailForm = {
  creditLimit: '', purchaseApr: '', promoApr: '', promoAprEndsOn: '',
  lastStatementBalance: '', minimumPayment: '', nextPaymentDueDate: '', rewardsBalance: '',
};

describe('formFromCard', () => {
  it('prefills strings from the card', () => {
    expect(formFromCard(card)).toEqual({ ...blank, creditLimit: '5000', purchaseApr: '24.99', lastStatementBalance: '800', minimumPayment: '35', nextPaymentDueDate: '2026-10-28' });
  });
});

describe('formToPatch', () => {
  it('sends only changed fields, parsing $ and commas', () => {
    const { patch, errors } = formToPatch({ ...formFromCard(card), creditLimit: '$6,500.50' }, card);
    expect(errors).toEqual({});
    expect(patch).toEqual({ creditLimit: 6500.5 });
  });

  it('turns a cleared field into null', () => {
    expect(formToPatch({ ...formFromCard(card), minimumPayment: '  ' }, card).patch).toEqual({ minimumPayment: null });
  });

  it('rebuilds the APR list, keeping APR types the form does not edit', () => {
    const { patch } = formToPatch({ ...formFromCard(card), purchaseApr: '21.5', promoApr: '0', promoAprEndsOn: '2027-06-30' }, card);
    expect(patch.aprs).toEqual([
      { type: 'purchase', percentage: 21.5 },
      { type: 'special', percentage: 0 },
      { type: 'cash_advance', percentage: 29.99 },
    ]);
    expect(patch.promoAprEndsOn).toBe('2027-06-30');
  });

  it.each([
    ['creditLimit', 'abc'],
    ['creditLimit', '-5'],
    ['purchaseApr', '250'],
    ['nextPaymentDueDate', '2026-02-30'],
  ] as const)('flags %s = %s', (field, value) => {
    const { errors, patch } = formToPatch({ ...formFromCard(card), [field]: value }, card);
    expect(errors[field]).toBeTruthy();
    expect(patch).toEqual({});
  });
});
