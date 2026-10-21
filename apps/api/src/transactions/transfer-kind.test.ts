import { describe, it, expect } from 'vitest';
import { transferKindOptions, defaultTransferKind, categoriesForKind, TRANSFER_CATEGORY_DEFAULTS } from './transfer-kind';

describe('transferKindOptions (from = sending account, to = receiving account)', () => {
  it('money into savings or an investment account is savings by default, or a plain transfer', () => {
    expect(transferKindOptions('checking', 'investment')).toEqual(['savings', 'internal']);
    expect(transferKindOptions('checking', 'savings')).toEqual(['savings', 'internal']);
    expect(defaultTransferKind('checking', 'investment')).toBe('savings');
  });

  it('money out of an investment account can be a capital return, investment income, or a plain transfer', () => {
    expect(transferKindOptions('investment', 'checking')).toEqual(['capital_return', 'investment_income', 'internal']);
    expect(defaultTransferKind('investment', 'checking')).toBe('capital_return');
  });

  it('money out of a savings account is a withdrawal of savings, not income', () => {
    expect(transferKindOptions('savings', 'checking')).toEqual(['capital_return', 'internal']);
  });

  it('money into a credit card or line of credit is a card payment', () => {
    expect(transferKindOptions('checking', 'credit')).toEqual(['card_payment']);
    expect(transferKindOptions('checking', 'line_of_credit')).toEqual(['card_payment']);
  });

  it('anything else is a plain internal transfer', () => {
    expect(transferKindOptions('checking', 'checking')).toEqual(['internal']);
    expect(transferKindOptions('credit', 'checking')).toEqual(['internal']);
    expect(transferKindOptions('cash', 'checking')).toEqual(['internal']);
    expect(transferKindOptions('', '')).toEqual(['internal']);
  });
});

describe('categoriesForKind', () => {
  it('savings: the sending side is Investments, the receiving side a transfer', () => {
    expect(categoriesForKind('savings')).toEqual({ from: 'Investments', to: 'Internal Transfer' });
  });
  it('capital return: the receiving side is Investments (a withdrawal of savings)', () => {
    expect(categoriesForKind('capital_return')).toEqual({ from: 'Internal Transfer', to: 'Investments' });
  });
  it('investment income: the receiving side is income', () => {
    expect(categoriesForKind('investment_income')).toEqual({ from: 'Internal Transfer', to: 'Investment income' });
  });
  it('card payment and internal use the transfer categories on both sides', () => {
    expect(categoriesForKind('card_payment')).toEqual({ from: 'Credit Card Payment', to: 'Credit Card Payment' });
    expect(categoriesForKind('internal')).toEqual({ from: 'Internal Transfer', to: 'Internal Transfer' });
  });
  it('every category a kind can name has a default definition to create it from', () => {
    const names = new Set(TRANSFER_CATEGORY_DEFAULTS.map((d) => d.name));
    for (const kind of ['savings', 'capital_return', 'investment_income', 'card_payment', 'internal'] as const) {
      const { from, to } = categoriesForKind(kind);
      expect(names.has(from)).toBe(true);
      expect(names.has(to)).toBe(true);
    }
  });
});
