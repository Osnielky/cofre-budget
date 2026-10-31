import { describe, it, expect } from 'vitest';
import { accountFigures, accountSparkline, accountTitle, lastActivity, openPropAccount, sortAccounts, statusTone, STATUS_LABEL, type AccountSummaryLite, type AccountMeta } from './trading';

const meta = (over: Partial<AccountMeta> = {}): AccountMeta => ({ kind: 'prop_firm', status: 'funded', firm: 'Topstep', accountSize: 50000, startedAt: '2026-08-01', endedAt: null, notes: null, provider: 'manual', ...over });
const cash = { spent: 248, spentByCategory: [], payouts: { count: 2, total: 1750, avg: 875, largest: 1250, last: '2026-10-10' }, netCash: 1502, roi: 605.6, costPerPayout: 124, daysToFirstPayout: 45, daysActive: 91,
  byMonth: [{ month: '2026-08', in: 248, out: 0 }, { month: '2026-09', in: 0, out: 500 }, { month: '2026-10', in: 0, out: 1250 }], rows: [{ id: 'p', date: '2026-10-10', name: 'PAYOUT', amount: 1250, category: null }] };
const prop: AccountSummaryLite = { account: { id: 't1', bankName: 'Topstep', accountName: '50K #1' }, meta: meta(), cash, realizedPnl: 0, netResult: 0, trades: { closed: 0, winRate: null }, byMonth: [], to: null };
const broker: AccountSummaryLite = { account: { id: 's1', bankName: 'Charles Schwab', accountName: 'Individual' }, meta: meta({ kind: 'broker', status: 'active', firm: null, provider: 'plaid' }), cash: null, realizedPnl: 2360, netResult: 2400, trades: { closed: 148, winRate: 61 }, byMonth: [{ month: '2026-09', realized: 1000 }, { month: '2026-10', realized: 1360 }], to: '2026-10-30' };

describe('labels and tones', () => {
  it('names statuses plainly and tones them', () => {
    expect(STATUS_LABEL.evaluation).toBe('Evaluation');
    expect(statusTone('funded')).toBe('up');
    expect(statusTone('failed')).toBe('down');
    expect(statusTone('closed')).toBe('muted');
    expect(statusTone('active')).toBe('flat');
  });
  it('titles an account by firm and name', () => {
    expect(accountTitle(prop)).toBe('Topstep · 50K #1');
    expect(accountTitle(broker)).toBe('Charles Schwab · Individual');
  });
});

describe('accountFigures', () => {
  it('a prop-firm account shows net cash, payouts and platform P&L (or a hint)', () => {
    expect(accountFigures(prop)).toEqual([
      { label: 'Net cash', value: '+$1,502', tone: 'up' },
      { label: 'Payouts', value: '2 · $1,750', tone: 'flat' },
      { label: 'Platform P&L', value: 'No trades yet', tone: 'flat' },
    ]);
    expect(accountFigures({ ...prop, trades: { closed: 12, winRate: 58 }, netResult: 3100 })[2]).toEqual({ label: 'Platform P&L', value: '+$3,100', tone: 'up' });
    expect(accountFigures({ ...prop, cash: { ...cash, spent: 149, netCash: -149, payouts: { ...cash.payouts, count: 0, total: 0 } } })).toEqual([
      { label: 'Net cash', value: '-$149', tone: 'down' },
      { label: 'Payouts', value: '—', tone: 'flat' },
      { label: 'Platform P&L', value: 'No trades yet', tone: 'flat' },
    ]);
  });
  it('a broker shows realized, win rate and closed trades', () => {
    expect(accountFigures(broker)).toEqual([
      { label: 'Realized P&L', value: '+$2,360', tone: 'up' },
      { label: 'Win rate', value: '61%', tone: 'flat' },
      { label: 'Closed', value: '148 trades', tone: 'flat' },
    ]);
  });
});

describe('accountSparkline', () => {
  const months = ['2026-05', '2026-06', '2026-07', '2026-08', '2026-09', '2026-10'];
  it('is cumulative cash net for prop firms and cumulative realized for brokers; empty when flat', () => {
    expect(accountSparkline(prop, months)).toEqual([0, 0, 0, -248, 252, 1502]);
    expect(accountSparkline(broker, months)).toEqual([0, 0, 0, 0, 1000, 2360]);
    expect(accountSparkline({ ...broker, byMonth: [] }, months)).toEqual([]);
  });
});

describe('sortAccounts / lastActivity / openPropAccount', () => {
  it('orders funded and active first, then evaluation, then failed and closed', () => {
    const list = [{ meta: meta({ status: 'closed' }), id: 'c' }, { meta: meta({ status: 'evaluation' }), id: 'e' }, { meta: meta({ status: 'failed' }), id: 'f' }, { meta: meta({ kind: 'broker', status: 'active' }), id: 'a' }, { meta: meta({ status: 'funded' }), id: 'u' }];
    expect(sortAccounts(list).map((x) => x.id)).toEqual(['u', 'a', 'e', 'f', 'c']);
  });
  it('last activity is the newest of trade rows and attributed cash rows', () => {
    expect(lastActivity(prop)).toBe('2026-10-10');
    expect(lastActivity(broker)).toBe('2026-10-30');
    expect(lastActivity({ ...prop, cash: { ...cash, rows: [] } })).toBeNull();
  });
  it('pre-selects the only open prop-firm account, else nothing', () => {
    expect(openPropAccount([{ id: 'a', kind: 'broker', status: 'active' }, { id: 'b', kind: 'prop_firm', status: 'funded' }])).toBe('b');
    expect(openPropAccount([{ id: 'b', kind: 'prop_firm', status: 'funded' }, { id: 'c', kind: 'prop_firm', status: 'evaluation' }])).toBeNull();
    expect(openPropAccount([{ id: 'b', kind: 'prop_firm', status: 'failed' }])).toBeNull();
    expect(openPropAccount([{ id: 'legacy' }])).toBeNull();
  });
});
