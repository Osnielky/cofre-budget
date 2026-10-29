import { describe, it, expect } from 'vitest';
import { investmentsErrorStatus, investmentsWindow, mapInvestmentTransaction, PlaidInvestmentTx } from './investments.mapper';

const securities = new Map([
  ['sec-vti', { security_id: 'sec-vti', name: 'Vanguard Total Stock Market ETF', ticker_symbol: 'VTI' }],
  ['sec-cash', { security_id: 'sec-cash', name: 'U S Dollar', ticker_symbol: null }],
]);

function tx(over: Partial<PlaidInvestmentTx>): PlaidInvestmentTx {
  return {
    investment_transaction_id: 'itx-1', account_id: 'acct', security_id: null, date: '2026-10-12',
    name: '', quantity: 0, amount: 0, price: 0, fees: null, type: 'cash', subtype: 'deposit', ...over,
  };
}

describe('mapInvestmentTransaction', () => {
  it('flips the sign so money into the account is positive', () => {
    // Plaid: buy debits cash (+), sell / dividend / deposit credit it (−).
    expect(mapInvestmentTransaction(tx({ type: 'buy', subtype: 'buy', amount: 2401.2, quantity: 10, price: 240.12, security_id: 'sec-vti', name: 'BUY VTI' }), securities).amount).toBe(-2401.2);
    expect(mapInvestmentTransaction(tx({ type: 'cash', subtype: 'dividend', amount: -45.5, security_id: 'sec-vti', name: 'DIVIDEND VTI' }), securities).amount).toBe(45.5);
    expect(mapInvestmentTransaction(tx({ type: 'cash', subtype: 'deposit', amount: -1000, name: 'TRANSFER FROM CHECKING' }), securities).amount).toBe(1000);
  });

  it('keeps Plaid\'s name and writes the trade details into the note', () => {
    const row = mapInvestmentTransaction(tx({ type: 'buy', subtype: 'buy', amount: 2401.85, quantity: 10, price: 240.12, fees: 0.65, security_id: 'sec-vti', name: 'BUY VANGUARD TOTAL STOCK' }), securities);
    expect(row).toEqual({
      externalId: 'itx-1', amount: -2401.85, name: 'BUY VANGUARD TOTAL STOCK', date: '2026-10-12',
      plaidCategory: ['buy', 'buy'], note: 'Buy · 10 × VTI @ $240.12 · fee $0.65',
      symbol: 'VTI', securityName: 'Vanguard Total Stock Market ETF', quantity: 10, price: 240.12, fees: 0.65,
    });
  });

  it('keeps the sell sign on quantity, derives a missing price from the cash amount, and nulls empty fields', () => {
    const sell = mapInvestmentTransaction(tx({ type: 'sell', subtype: 'sell short', amount: -168.6, quantity: -10, price: 0, fees: 0, security_id: 'sec-vti', name: 'SOFI - SOLDTOOPEN' }), securities);
    expect(sell).toMatchObject({ symbol: 'VTI', quantity: -10, price: 16.86, fees: null });
    const div = mapInvestmentTransaction(tx({ type: 'cash', subtype: 'dividend', amount: -3, security_id: 'sec-vti' }), securities);
    expect(div).toMatchObject({ symbol: 'VTI', quantity: null, price: null, fees: null });
    const deposit = mapInvestmentTransaction(tx({ type: 'cash', subtype: 'deposit', amount: -1000 }), securities);
    expect(deposit).toMatchObject({ symbol: null, securityName: null, quantity: null, price: null });
  });

  it('builds a name from the subtype and security when Plaid sends none', () => {
    expect(mapInvestmentTransaction(tx({ type: 'cash', subtype: 'dividend', amount: -3, security_id: 'sec-vti' }), securities).name).toBe('Dividend VTI');
    expect(mapInvestmentTransaction(tx({ type: 'fee', subtype: 'management fee', amount: 12 }), securities).name).toBe('Management fee');
  });

  it('uses the security name when there is no ticker and skips the quantity line for cash', () => {
    const row = mapInvestmentTransaction(tx({ type: 'cash', subtype: 'interest', amount: -0.4, security_id: 'sec-cash', name: 'INTEREST' }), securities);
    expect(row.note).toBe('Interest · U S Dollar');
  });
});

describe('investmentsWindow', () => {
  const now = new Date('2026-10-28T15:00:00Z');
  it('asks for two years on the first pull', () => {
    expect(investmentsWindow(null, now)).toEqual({ start: '2024-10-28', end: '2026-10-28' });
  });
  it('re-reads two weeks before the last synced date afterwards', () => {
    expect(investmentsWindow('2026-10-20', now)).toEqual({ start: '2026-10-06', end: '2026-10-28' });
  });
  it('never asks for more than Plaid keeps', () => {
    expect(investmentsWindow('2020-01-01', now).start).toBe('2024-10-28');
  });
});

describe('investmentsErrorStatus', () => {
  it('maps consent, readiness and support errors; anything else is a real failure', () => {
    expect(investmentsErrorStatus('ADDITIONAL_CONSENT_REQUIRED')).toBe('not_consented');
    expect(investmentsErrorStatus('PRODUCT_NOT_READY')).toBe('pending');
    expect(investmentsErrorStatus('PRODUCTS_NOT_SUPPORTED')).toBe('unsupported');
    expect(investmentsErrorStatus('NO_INVESTMENT_ACCOUNTS')).toBe('unsupported');
    expect(investmentsErrorStatus('INVALID_PRODUCT')).toBe('unsupported');
    expect(investmentsErrorStatus('RATE_LIMIT_EXCEEDED')).toBeNull();
    expect(investmentsErrorStatus(undefined)).toBeNull();
  });
});
