import { describe, it, expect } from 'vitest';
import { ActivityRow, classifyActivity, computePerformance, mergePerformance } from './performance';

function row(over: Partial<ActivityRow>): ActivityRow {
  return { date: '2026-10-01', amount: 0, type: null, subtype: null, symbol: null, securityName: null, quantity: null, price: null, fees: null, name: '', ...over };
}
const buy  = (date: string, symbol: string, qty: number, price: number, fees = 0) =>
  row({ date, type: 'buy', subtype: 'buy', symbol, quantity: qty, price, fees, amount: -(qty * price + fees), securityName: `${symbol} Inc` });
const sell = (date: string, symbol: string, qty: number, price: number, fees = 0) =>
  row({ date, type: 'sell', subtype: 'sell', symbol, quantity: -qty, price, fees, amount: qty * price - fees });
const cash = (date: string, subtype: string, amount: number) => row({ date, type: 'cash', subtype, amount });

describe('classifyActivity', () => {
  it('reads Plaid types and subtypes', () => {
    expect(classifyActivity({ type: 'buy', subtype: 'buy to cover', quantity: 1, symbol: 'X' })).toBe('trade');
    expect(classifyActivity({ type: 'sell', subtype: 'sell short', quantity: -1, symbol: 'X' })).toBe('trade');
    expect(classifyActivity({ type: 'cash', subtype: 'deposit', quantity: null, symbol: null })).toBe('contribution');
    expect(classifyActivity({ type: 'cash', subtype: 'contribution', quantity: null, symbol: null })).toBe('contribution');
    expect(classifyActivity({ type: 'cash', subtype: 'withdrawal', quantity: null, symbol: null })).toBe('withdrawal');
    expect(classifyActivity({ type: 'cash', subtype: 'qualified dividend', quantity: null, symbol: 'VTI' })).toBe('income');
    expect(classifyActivity({ type: 'cash', subtype: 'interest', quantity: null, symbol: null })).toBe('income');
    expect(classifyActivity({ type: 'cash', subtype: 'long-term capital gain', quantity: null, symbol: null })).toBe('income');
    expect(classifyActivity({ type: 'cash', subtype: 'management fee', quantity: null, symbol: null })).toBe('fee');
    expect(classifyActivity({ type: 'cash', subtype: 'tax withheld', quantity: null, symbol: null })).toBe('fee');
    expect(classifyActivity({ type: 'fee', subtype: 'account fee', quantity: null, symbol: null })).toBe('fee');
    expect(classifyActivity({ type: 'transfer', subtype: 'transfer', quantity: 10, symbol: 'VTI' })).toBe('security_transfer');
    expect(classifyActivity({ type: 'transfer', subtype: 'transfer', quantity: null, symbol: null })).toBe('contribution');
    expect(classifyActivity({ type: null, subtype: null, quantity: null, symbol: null })).toBe('other');
  });
});

describe('computePerformance', () => {
  it('is all zeros on an empty account', () => {
    const p = computePerformance([]);
    expect(p).toMatchObject({ rows: 0, from: null, to: null, realizedPnl: 0, netResult: 0, bySymbol: [], byMonth: [], openPositions: [], recentClosed: [] });
    expect(p.trades).toMatchObject({ total: 0, closed: 0, winRate: null, profitFactor: null, largestWin: null });
  });

  it('a long round trip: FIFO cost, fees on both legs, win recorded', () => {
    const p = computePerformance([
      buy('2026-10-01', 'VTI', 10, 240, 1),
      sell('2026-10-20', 'VTI', 10, 250, 1),
    ]);
    // cost per unit 240.10 (fee baked in), proceeds 250 × 10 − 1 closing fee
    expect(p.realizedPnl).toBe(98);
    expect(p.trades).toMatchObject({ total: 2, closed: 1, wins: 1, losses: 0, winRate: 100, avgWin: 98, avgLoss: null, profitFactor: null });
    expect(p.recentClosed[0]).toEqual({ date: '2026-10-20', symbol: 'VTI', side: 'long', quantity: 10, entry: 240.1, exit: 250, fees: 1, pnl: 98 });
    expect(p.openPositions).toEqual([]);
    expect(p.bySymbol).toEqual([{ symbol: 'VTI', name: 'VTI Inc', realized: 98, closedTrades: 1, wins: 1, openQuantity: 0, avgCost: null, costBasis: 0 }]);
    expect(p.byMonth).toEqual([{ month: '2026-10', realized: 98, income: 0, fees: 0, closedTrades: 1 }]);
    expect([p.from, p.to]).toEqual(['2026-10-01', '2026-10-20']);
  });

  it('matches partial sells against the oldest lot first and leaves the rest open', () => {
    const p = computePerformance([
      buy('2026-09-01', 'SOFI', 10, 10),
      buy('2026-09-10', 'SOFI', 10, 20),
      sell('2026-10-05', 'SOFI', 15, 30),
    ]);
    // 10 @ 10 → +200, 5 @ 20 → +50
    expect(p.realizedPnl).toBe(250);
    expect(p.openPositions).toEqual([{ symbol: 'SOFI', name: 'SOFI Inc', side: 'long', quantity: 5, avgCost: 20, costBasis: 100, since: '2026-09-10' }]);
    expect(p.bySymbol[0]).toMatchObject({ openQuantity: 5, avgCost: 20, costBasis: 100 });
    expect(p.recentClosed[0]).toMatchObject({ quantity: 15, entry: cents(200 / 15), exit: 30, pnl: 250 });
  });

  it('a short sale opens a short lot and buying to cover realizes against it', () => {
    const p = computePerformance([
      row({ date: '2026-10-29', type: 'sell', subtype: 'sell short', symbol: 'SOFI', quantity: -10, price: 16.86, amount: 168.6, fees: 0.05 }),
      row({ date: '2026-11-02', type: 'buy', subtype: 'buy to cover', symbol: 'SOFI', quantity: 10, price: 15, amount: -150 }),
    ]);
    // short credit 16.86 − 0.005 fees/unit = 16.855; cover at 15 → (16.855 − 15) × 10 = 18.55
    expect(p.realizedPnl).toBe(18.55);
    expect(p.recentClosed[0]).toMatchObject({ side: 'short', quantity: 10, exit: 15, pnl: 18.55 });
    expect(p.openPositions).toEqual([]);
  });

  it('selling more than held flips the position into a short', () => {
    const p = computePerformance([buy('2026-10-01', 'TQQQ', 5, 70), sell('2026-10-02', 'TQQQ', 8, 72)]);
    expect(p.realizedPnl).toBe(10);
    expect(p.openPositions).toEqual([{ symbol: 'TQQQ', name: 'TQQQ Inc', side: 'short', quantity: 3, avgCost: 72, costBasis: 216, since: '2026-10-02' }]);
  });

  it('counts cash activity by kind and nets the result', () => {
    const p = computePerformance([
      cash('2026-09-01', 'deposit', 5000),
      cash('2026-09-15', 'withdrawal', -1000),
      cash('2026-10-02', 'qualified dividend', 45.5),
      cash('2026-10-03', 'interest', 0.4),
      cash('2026-10-04', 'management fee', -12),
      row({ date: '2026-10-05', type: 'fee', subtype: 'account fee', amount: -3 }),
      buy('2026-10-10', 'VTI', 1, 100), sell('2026-10-11', 'VTI', 1, 90),
    ]);
    expect(p).toMatchObject({ contributions: 5000, withdrawals: 1000, netContributed: 4000, income: 45.9, fees: 15, realizedPnl: -10, netResult: 20.9 });
    expect(p.trades).toMatchObject({ closed: 1, wins: 0, losses: 1, winRate: 0, avgLoss: 10 });
    expect(p.byMonth).toEqual([
      { month: '2026-10', realized: -10, income: 45.9, fees: 15, closedTrades: 1 },
    ]);
  });

  it('security transfers move lots without realizing, and splits reprice them', () => {
    const p = computePerformance([
      row({ date: '2026-09-01', type: 'transfer', subtype: 'transfer', symbol: 'AAPL', quantity: 10, price: 150, amount: 0 }),
      sell('2026-10-01', 'AAPL', 4, 200),
      row({ date: '2026-10-15', type: 'transfer', subtype: 'transfer', symbol: 'AAPL', quantity: -6, price: 210, amount: 0 }),
    ]);
    expect(p.realizedPnl).toBe(200);
    expect(p.trades.total).toBe(1);
    expect(p.openPositions).toEqual([]);
  });

  it('derives the price from the cash amount when Plaid sends none', () => {
    const p = computePerformance([
      row({ date: '2026-10-01', type: 'buy', subtype: 'buy', symbol: 'VOO', quantity: 2, price: 0, amount: -800 }),
      row({ date: '2026-10-02', type: 'sell', subtype: 'sell', symbol: 'VOO', quantity: -2, price: null, amount: 900 }),
    ]);
    expect(p.realizedPnl).toBe(100);
  });

  it('a trade without a symbol still counts its cash as realized', () => {
    const p = computePerformance([row({ date: '2026-10-01', type: 'sell', subtype: 'sell', amount: 12.34 })]);
    expect(p).toMatchObject({ realizedPnl: 12.34, trades: { total: 1, closed: 0 } });
  });

  it('ranks symbols by result, finds the largest win and loss, and computes the profit factor', () => {
    const p = computePerformance([
      buy('2026-10-01', 'A', 1, 10), sell('2026-10-02', 'A', 1, 40),   // +30
      buy('2026-10-03', 'B', 1, 10), sell('2026-10-04', 'B', 1, 5),    // −5
      buy('2026-10-05', 'C', 1, 10), sell('2026-10-06', 'C', 1, 0),    // −10
      buy('2026-10-07', 'A', 1, 10), sell('2026-10-08', 'A', 1, 12),   // +2
    ]);
    expect(p.bySymbol.map((s) => [s.symbol, s.realized, s.closedTrades, s.wins])).toEqual([['A', 32, 2, 2], ['C', -10, 1, 0], ['B', -5, 1, 0]]);
    expect(p.trades).toMatchObject({ closed: 4, wins: 2, losses: 2, winRate: 50, avgWin: 16, avgLoss: 7.5, profitFactor: 2.13 });
    expect(p.trades.largestWin).toMatchObject({ symbol: 'A', pnl: 30 });
    expect(p.trades.largestLoss).toMatchObject({ symbol: 'C', pnl: -10 });
    expect(p.recentClosed.map((t) => t.date)).toEqual(['2026-10-08', '2026-10-06', '2026-10-04', '2026-10-02']);
  });

  it('a same-day buy and sell is a long round trip whichever order Plaid sends them in', () => {
    const p = computePerformance([sell('2026-10-03', 'MNQ', 2, 120, 1.2), buy('2026-10-03', 'MNQ', 2, 100, 1.2)]);
    expect(p.recentClosed[0]).toMatchObject({ side: 'long', quantity: 2, pnl: 37.6 });
    expect(p.openPositions).toEqual([]);
  });

  it('does not depend on input order', () => {
    const rows = [sell('2026-10-20', 'VTI', 10, 250), buy('2026-10-01', 'VTI', 10, 240)];
    expect(computePerformance(rows).realizedPnl).toBe(100);
    expect(computePerformance([...rows].reverse()).realizedPnl).toBe(100);
  });
});

function cents(n: number) { return Math.round(n * 100) / 100; }

describe('mergePerformance', () => {
  const schwab = computePerformance([
    buy('2026-08-05', 'VTI', 6, 250), sell('2026-08-20', 'VTI', 6, 260),   // +60
    buy('2026-10-12', 'VTI', 10, 240.12),                                   // open 10
    cash('2026-09-01', 'deposit', 5000), cash('2026-10-15', 'dividend', 45.5),
  ]);
  const futures = computePerformance([
    buy('2026-09-03', 'MNQ', 2, 100, 1), sell('2026-09-03', 'MNQ', 2, 90, 1),   // −22
    buy('2026-09-10', 'MNQ', 1, 100), sell('2026-09-10', 'MNQ', 1, 130),        // +30
    buy('2026-10-01', 'VTI', 1, 200),                                           // open 1 (same symbol, other account)
    row({ date: '2026-09-30', type: 'fee', subtype: 'account fee', amount: -2.5 }),
    cash('2026-09-01', 'deposit', 1000), cash('2026-09-20', 'withdrawal', -300),
  ]);
  const merged = mergePerformance([{ label: 'Schwab', summary: schwab }, { label: 'Futures', summary: futures }]);

  it('adds the totals and re-derives the trade statistics from gross sums', () => {
    expect(merged).toMatchObject({ rows: 13, from: '2026-08-05', to: '2026-10-15', realizedPnl: 68, income: 45.5, fees: 2.5, contributions: 6000, withdrawals: 300, netContributed: 5700, netResult: 111 });
    expect(merged.trades).toMatchObject({ total: 8, closed: 3, wins: 2, losses: 1, winRate: 66.7, avgWin: 45, avgLoss: 22, profitFactor: 4.09, grossWin: 90, grossLoss: 22 });
    expect(merged.trades.largestWin).toMatchObject({ symbol: 'VTI', pnl: 60, account: 'Schwab' });
    expect(merged.trades.largestLoss).toMatchObject({ symbol: 'MNQ', pnl: -22, account: 'Futures' });
  });

  it('merges symbols and months across accounts and labels positions and trades', () => {
    expect(merged.bySymbol.map((s) => [s.symbol, s.realized, s.closedTrades, s.openQuantity, s.costBasis])).toEqual([
      ['VTI', 60, 1, 11, 2601.2],
      ['MNQ', 8, 2, 0, 0],
    ]);
    expect(merged.bySymbol[0].avgCost).toBe(cents(2601.2 / 11));
    expect(merged.byMonth).toEqual([
      { month: '2026-08', realized: 60, income: 0, fees: 0, closedTrades: 1 },
      { month: '2026-09', realized: 8, income: 0, fees: 2.5, closedTrades: 2 },
      { month: '2026-10', realized: 0, income: 45.5, fees: 0, closedTrades: 0 },
    ]);
    expect(merged.openPositions.map((p) => [p.symbol, p.account, p.quantity])).toEqual([['VTI', 'Schwab', 10], ['VTI', 'Futures', 1]]);
    expect(merged.recentClosed.map((t) => [t.date, t.account])).toEqual([['2026-09-10', 'Futures'], ['2026-09-03', 'Futures'], ['2026-08-20', 'Schwab']]);
  });

  it('a single part merges to itself', () => {
    const one = mergePerformance([{ label: 'Schwab', summary: schwab }]);
    expect({ ...one, openPositions: [], recentClosed: [], trades: { ...one.trades, largestWin: null, largestLoss: null } })
      .toEqual({ ...schwab, openPositions: [], recentClosed: [], trades: { ...schwab.trades, largestWin: null, largestLoss: null } });
  });

  it('merges nothing into an empty summary', () => {
    expect(mergePerformance([])).toMatchObject({ rows: 0, from: null, to: null, realizedPnl: 0, trades: { closed: 0, winRate: null } });
  });
});
