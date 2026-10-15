import { describe, it, expect } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import { validateDetailPatch, validateProfile } from './card-validation';

describe('validateDetailPatch', () => {
  it('accepts valid values and drops unknown keys', () => {
    expect(validateDetailPatch({
      creditLimit: 5000.456, minimumPayment: null, nextPaymentDueDate: '2026-11-05',
      aprs: [{ type: 'purchase', percentage: 21.5 }],
      id: 'evil', userId: 'evil', liabilitiesStatus: 'synced', lastPaymentAmount: 1,
    })).toEqual({
      creditLimit: 5000.46, minimumPayment: null, nextPaymentDueDate: '2026-11-05',
      aprs: [{ type: 'purchase', percentage: 21.5, balanceSubjectTo: null, interestCharged: null }],
    });
  });

  it.each([
    [{ creditLimit: '1,200' }],
    [{ creditLimit: -5 }],
    [{ creditLimit: Number.NaN }],
    [{ creditLimit: 20_000_000 }],
    [{ rewardsBalance: Infinity }],
    [{ aprs: [{ type: 'purchase', percentage: 250 }] }],
    [{ aprs: [{ type: 'teaser', percentage: 5 }] }],
    [{ aprs: 'purchase' }],
    [{ aprs: Array.from({ length: 9 }, () => ({ type: 'special', percentage: 0 })) }],
    [{ nextPaymentDueDate: '2026-02-30' }],
    [{ promoAprEndsOn: '11/05/2026' }],
    [{ lastStatementDate: '' }],
  ])('rejects %j', (body) => {
    expect(() => validateDetailPatch(body)).toThrow(BadRequestException);
  });

  it('rejects a non-object body', () => {
    expect(() => validateDetailPatch(null)).toThrow(BadRequestException);
    expect(() => validateDetailPatch([])).toThrow(BadRequestException);
  });
});

describe('validateProfile', () => {
  it('accepts a full profile and trims the note', () => {
    expect(validateProfile({
      goal: 'pay_off_debt', annualFeeOk: false, creditScoreBand: '670-739',
      monthlyDebtBudget: 600, plannedPurchaseAmount: null, plannedPurchaseNote: '  new laptop  ', userId: 'evil',
    })).toEqual({
      goal: 'pay_off_debt', annualFeeOk: false, creditScoreBand: '670-739',
      monthlyDebtBudget: 600, plannedPurchaseAmount: null, plannedPurchaseNote: 'new laptop',
    });
  });

  it('turns a blank note into null', () => {
    expect(validateProfile({ plannedPurchaseNote: '   ' })).toEqual({ plannedPurchaseNote: null });
  });

  it.each([
    [{ goal: 'get_rich' }],
    [{ creditScoreBand: '900' }],
    [{ annualFeeOk: 'yes' }],
    [{ monthlyDebtBudget: -1 }],
    [{ plannedPurchaseNote: 'x'.repeat(121) }],
  ])('rejects %j', (body) => {
    expect(() => validateProfile(body)).toThrow(BadRequestException);
  });
});
