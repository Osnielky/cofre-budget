import { describe, it, expect } from 'vitest';
import { isTrade, splitTrades, summarizeTrades } from './trades';

const buy  = { id: 'b', amount: -2401.2, plaidCategory: ['buy', 'buy'] };
const sellShort = { id: 's', amount: 168.55, plaidCategory: ['sell', 'sell short'] };
const dividend = { id: 'd', amount: 45.5, plaidCategory: ['cash', 'dividend'] };
const deposit = { id: 'x', amount: 1000, plaidCategory: ['transfer', 'deposit'] };
const grocery = { id: 'g', amount: -58, plaidCategory: ['Food and Drink', 'Groceries'] };
const manual = { id: 'm', amount: -20, plaidCategory: null };

describe('isTrade', () => {
  it('is true only for Plaid buy / sell types, whatever the subtype', () => {
    expect(isTrade(buy)).toBe(true);
    expect(isTrade(sellShort)).toBe(true);
    expect(isTrade({ amount: -1, plaidCategory: ['Buy', 'buy to cover'] })).toBe(true);
  });
  it('leaves cash activity, bank transactions and manual rows in the ledger', () => {
    expect(isTrade(dividend)).toBe(false);
    expect(isTrade(deposit)).toBe(false);
    expect(isTrade(grocery)).toBe(false);
    expect(isTrade(manual)).toBe(false);
    expect(isTrade({ amount: 1 })).toBe(false);
  });
});

describe('splitTrades', () => {
  it('keeps order inside each half', () => {
    const { ledger, trades } = splitTrades([buy, dividend, sellShort, grocery, manual]);
    expect(ledger.map((r) => r.id)).toEqual(['d', 'g', 'm']);
    expect(trades.map((r) => r.id)).toEqual(['b', 's']);
  });
});

describe('summarizeTrades', () => {
  it('totals buys and sells as positive cash and nets them', () => {
    expect(summarizeTrades([buy, sellShort, { amount: '-10.10', plaidCategory: ['buy', 'buy'] }]))
      .toEqual({ count: 3, bought: 2411.3, sold: 168.55, net: -2242.75 });
  });
  it('is all zeros with no trades', () => {
    expect(summarizeTrades([])).toEqual({ count: 0, bought: 0, sold: 0, net: 0 });
  });
});
