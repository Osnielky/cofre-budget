import { describe, it, expect } from 'vitest';
import { cashSummary, tradingOverview, monthKeys, brokerCashByMonth, type CashRow } from './trading-cash';
import { computePerformance } from './performance';
import type { TradingAccountMeta } from '../projects/project-account.entity';

const evals = { id: 'c1', name: 'Prop Firm Evals', icon: '🏦', color: '#4BA8D8' };
const payoutsCat = { id: 'c2', name: 'Prop Firm Payouts', icon: '💵', color: '#4FBF7F' };
const row = (id: string, date: string, amount: number, category = amount < 0 ? evals : payoutsCat): CashRow => ({ id, date, name: id, amount, category });
const today = '2026-10-31';
const meta = (over: Partial<TradingAccountMeta> = {}): TradingAccountMeta => ({ kind: 'prop_firm', status: 'funded', firm: 'Topstep', accountSize: 50000, startedAt: '2026-08-01', endedAt: null, notes: null, ...over });

describe('monthKeys', () => {
  it('gives the trailing n months ending with today\'s month, oldest first', () => {
    expect(monthKeys('2026-02-10', 3)).toEqual(['2025-12', '2026-01', '2026-02']);
  });
});

describe('cashSummary', () => {
  const rows = [row('eval', '2026-08-03', -149), row('reset', '2026-08-20', -99), row('p1', '2026-09-15', 500), row('p2', '2026-10-10', 1250)];

  it('splits spent and payouts, nets them, and derives ROI, cost per payout and timing', () => {
    const s = cashSummary(rows, meta(), today);
    expect(s.spent).toBe(248);
    expect(s.spentByCategory).toEqual([{ ...evals, total: 248, count: 2 }]);
    expect(s.payouts).toEqual({ count: 2, total: 1750, avg: 875, largest: 1250, last: '2026-10-10' });
    expect(s.netCash).toBe(1502);
    expect(s.roi).toBe(605.6);           // 1502 / 248 × 100, one decimal
    expect(s.costPerPayout).toBe(124);
    expect(s.daysToFirstPayout).toBe(45); // Aug 1 → Sep 15
    expect(s.daysActive).toBe(91);        // Aug 1 → Oct 31
    expect(s.rows.map((r) => r.id)).toEqual(['p2', 'p1', 'reset', 'eval']);
  });

  it('fills every trailing month, in and out', () => {
    const s = cashSummary(rows, meta(), today);
    expect(s.byMonth.slice(-4)).toEqual([
      { month: '2026-07', in: 0, out: 0 },
      { month: '2026-08', in: 248, out: 0 },
      { month: '2026-09', in: 0, out: 500 },
      { month: '2026-10', in: 0, out: 1250 },
    ]);
    expect(s.byMonth).toHaveLength(12);
  });

  it('roi is null when nothing was spent, timing is null without a payout or a start', () => {
    const onlyPayout = cashSummary([row('p', '2026-10-01', 300)], meta({ startedAt: null }), today);
    expect(onlyPayout).toMatchObject({ spent: 0, roi: null, costPerPayout: null, daysToFirstPayout: 0, daysActive: 30 });
    const onlyEval = cashSummary([row('e', '2026-10-01', -149)], meta({ startedAt: null }), today);
    expect(onlyEval).toMatchObject({ payouts: { count: 0, total: 0, avg: null, largest: 0, last: null }, daysToFirstPayout: null, roi: -100 });
    expect(cashSummary([], meta({ startedAt: null }), today)).toMatchObject({ daysActive: null, daysToFirstPayout: null, netCash: 0 });
  });

  it('days active stop at endedAt, and a payout before the start never goes negative', () => {
    const s = cashSummary([row('p', '2026-07-20', 100)], meta({ startedAt: '2026-08-01', endedAt: '2026-09-01' }), today);
    expect(s.daysActive).toBe(31);
    expect(s.daysToFirstPayout).toBe(0);
  });

  it('rows without a category land in an "Uncategorized" bucket', () => {
    const s = cashSummary([{ id: 'x', date: '2026-10-01', name: 'FEE', amount: -50, category: null }], meta(), today);
    expect(s.spentByCategory).toEqual([{ id: 'uncat', name: 'Uncategorized', icon: '·', color: '#6B6B8A', total: 50, count: 1 }]);
  });
});

describe('brokerCashByMonth', () => {
  it('buckets contributions as in and withdrawals as out', () => {
    const m = brokerCashByMonth([
      { date: '2026-09-01', amount: 5000, type: 'cash', subtype: 'deposit', quantity: null, symbol: null },
      { date: '2026-10-05', amount: -900, type: 'cash', subtype: 'withdrawal', quantity: null, symbol: null },
      { date: '2026-10-12', amount: -2401.2, type: 'buy', subtype: 'buy', quantity: 10, symbol: 'VTI' },
    ], today, 3);
    expect(m).toEqual([{ month: '2026-08', in: 0, out: 0 }, { month: '2026-09', in: 5000, out: 0 }, { month: '2026-10', in: 0, out: 900 }]);
  });
});

describe('tradingOverview', () => {
  const broker = computePerformance([
    { date: '2026-09-01', amount: 5000, type: 'cash', subtype: 'deposit', symbol: null, securityName: null, quantity: null, price: null, fees: null, name: 'DEP' },
    { date: '2026-10-12', amount: -1000, type: 'buy', subtype: 'buy', symbol: 'VTI', securityName: null, quantity: 10, price: 100, fees: null, name: 'BUY' },
    { date: '2026-10-20', amount: 1200, type: 'sell', subtype: 'sell', symbol: 'VTI', securityName: null, quantity: -10, price: 120, fees: null, name: 'SELL' },
    { date: '2026-10-25', amount: -300, type: 'cash', subtype: 'withdrawal', symbol: null, securityName: null, quantity: null, price: null, fees: null, name: 'WD' },
  ]);
  const empty = computePerformance([]);
  const topstepCash = cashSummary([row('e', '2026-08-03', -149), row('p', '2026-09-15', 500)], meta(), today);
  const failedCash = cashSummary([row('e2', '2026-09-03', -149)], meta({ status: 'failed', endedAt: '2026-09-20' }), today);

  const parts = [
    { meta: meta({ kind: 'broker', status: 'active', firm: null }), summary: broker, cashByMonth: brokerCashByMonth([], today), cash: null },
    { meta: meta(), summary: empty, cashByMonth: [], cash: topstepCash },
    { meta: meta({ status: 'failed' }), summary: empty, cashByMonth: [], cash: failedCash },
    { meta: meta({ status: 'evaluation' }), summary: empty, cashByMonth: [], cash: cashSummary([], meta({ status: 'evaluation' }), today) },
  ];

  it('adds brokers and prop firms into money in / out and counts accounts by status', () => {
    const o = tradingOverview(parts, today);
    expect(o.tradingPnl).toBe(200);
    expect(o.moneyIn).toBe(5298);     // 5000 deposit + 149 + 149
    expect(o.moneyOut).toBe(800);     // 300 withdrawal + 500 payout
    expect(o.netInPocket).toBe(-4498);
    expect(o.accountsByStatus).toEqual({ active: 1, evaluation: 1, funded: 1, failed: 1, closed: 0 });
  });

  it('pass rate counts prop-firm accounts that left evaluation; failed cost and payouts per account', () => {
    const o = tradingOverview(parts, today);
    expect(o.funded).toBe(1);
    expect(o.evaluated).toBe(2);       // funded + failed; the one still evaluating is not decided
    expect(o.passRate).toBe(50);
    expect(o.costOfFailed).toBe(149);
    expect(o.payoutsPerAccount).toBe(0.33); // 1 payout ÷ 3 prop-firm accounts
    expect(tradingOverview([parts[0]], today)).toMatchObject({ passRate: null, payoutsPerAccount: null, costOfFailed: 0 });
  });

  it('merges money in / out by month across kinds', () => {
    const o = tradingOverview([
      { ...parts[0], cashByMonth: brokerCashByMonth([{ date: '2026-09-01', amount: 5000, type: 'cash', subtype: 'deposit', quantity: null, symbol: null }], today) },
      parts[1],
    ], today);
    expect(o.byMonth.find((m) => m.month === '2026-09')).toEqual({ month: '2026-09', in: 5000, out: 500 });
    expect(o.byMonth.find((m) => m.month === '2026-08')).toEqual({ month: '2026-08', in: 149, out: 0 });
    expect(o.byMonth).toHaveLength(12);
  });
});
