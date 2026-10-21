import { describe, it, expect } from 'vitest';
import { transferKindOptions, explainTransfer, KIND_LABELS } from './transferKind';

const checking = { name: 'Chase Checking', accountType: 'checking' };
const schwab = { name: 'Schwab Individual', accountType: 'investment' };
const card = { name: 'Amex Blue Cash', accountType: 'credit' };

describe('transferKindOptions (mirrors the API)', () => {
  it('offers savings first for money into an investment account', () => {
    expect(transferKindOptions('checking', 'investment')).toEqual(['savings', 'internal']);
  });
  it('offers capital return, investment income and internal for money out of an investment account', () => {
    expect(transferKindOptions('investment', 'checking')).toEqual(['capital_return', 'investment_income', 'internal']);
  });
  it('only card payment into a card, only internal between checking accounts', () => {
    expect(transferKindOptions('checking', 'credit')).toEqual(['card_payment']);
    expect(transferKindOptions('checking', 'checking')).toEqual(['internal']);
  });
  it('has a label for every kind', () => {
    for (const k of ['savings', 'capital_return', 'investment_income', 'card_payment', 'internal'] as const) {
      expect(KIND_LABELS[k].title.length).toBeGreaterThan(0);
    }
  });
});

describe('explainTransfer', () => {
  it('savings: explains both sides in plain words with the category each one gets', () => {
    const e = explainTransfer('savings', { from: checking, to: schwab, amount: 1000 });
    expect(e.from).toEqual({ account: 'Chase Checking', amount: -1000, category: 'Investments', text: expect.stringMatching(/saved|invested/i) });
    expect(e.to).toEqual({ account: 'Schwab Individual', amount: 1000, category: 'Internal Transfer', text: expect.stringMatching(/not counted|balance/i) });
    expect(e.from.text).toMatch(/not .*spending|not an expense/i);
  });
  it('investment income: the receiving side counts as income this month', () => {
    const e = explainTransfer('investment_income', { from: schwab, to: checking, amount: 500 });
    expect(e.to.category).toBe('Investment income');
    expect(e.to.text).toMatch(/income/i);
    expect(e.from.category).toBe('Internal Transfer');
  });
  it('capital return: the receiving side is money taken back out of savings, not income', () => {
    const e = explainTransfer('capital_return', { from: schwab, to: checking, amount: 300 });
    expect(e.to.category).toBe('Investments');
    expect(e.to.text).toMatch(/not income|withdraw/i);
  });
  it('card payment: both sides are a card payment and neither is spending', () => {
    const e = explainTransfer('card_payment', { from: checking, to: card, amount: 250 });
    expect(e.from.category).toBe('Credit Card Payment');
    expect(e.to.category).toBe('Credit Card Payment');
    expect(e.from.text).toMatch(/not .*spending|already counted/i);
  });
  it('mentions the balance change on a manual receiving account', () => {
    const e = explainTransfer('savings', { from: checking, to: { ...schwab, provider: 'manual' }, amount: 1000 });
    expect(e.to.text).toMatch(/balance .*\$1,000/i);
  });
});
