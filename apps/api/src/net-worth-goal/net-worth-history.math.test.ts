import { describe, it, expect } from 'vitest';
import { buildHistory, isCashFlowTx } from './net-worth-history.math';

const TODAY = '2026-10-02';

describe('buildHistory', () => {
  it('returns only today when there are no snapshots or transactions', () => {
    const out = buildHistory({ snapshots: [], today: TODAY, todayValue: 1234.5, txs: [] });
    expect(out.points).toEqual([{ date: TODAY, value: 1234.5, estimated: false }]);
    expect(out.firstRealDate).toBe(TODAY);
  });

  it('estimates month-end values back to the earliest transaction month, carrying empty months flat', () => {
    const out = buildHistory({
      snapshots: [], today: TODAY, todayValue: 1000,
      txs: [
        { date: '2026-10-01', amount: 100 },  // this month, before today
        { date: '2026-09-15', amount: 200 },
        { date: '2026-07-10', amount: -50 },
      ],
    });
    expect(out.points).toEqual([
      { date: '2026-07-31', value: 700, estimated: true },
      { date: '2026-08-31', value: 700, estimated: true },  // August had no transactions
      { date: '2026-09-30', value: 900, estimated: true },
      { date: TODAY, value: 1000, estimated: false },
    ]);
  });

  it('anchors estimates on the first real snapshot and ignores later transactions', () => {
    const out = buildHistory({
      snapshots: [{ date: '2026-09-01', value: 500 }], today: TODAY, todayValue: 1000,
      txs: [
        { date: '2026-09-20', amount: 9999 },  // after the first snapshot: real data covers it
        { date: '2026-08-10', amount: 100 },
      ],
    });
    expect(out.points).toEqual([
      { date: '2026-08-31', value: 500, estimated: true },
      { date: '2026-09-01', value: 500, estimated: false },
      { date: TODAY, value: 1000, estimated: false },
    ]);
    expect(out.firstRealDate).toBe('2026-09-01');
  });

  it('never produces an estimated point on or after the first real date', () => {
    const out = buildHistory({
      snapshots: [{ date: '2026-09-30', value: 10 }], today: TODAY, todayValue: 20,
      txs: [{ date: '2026-09-02', amount: 5 }, { date: '2026-06-02', amount: 5 }],
    });
    const firstReal = out.points.find((p) => !p.estimated)!;
    for (const p of out.points.filter((x) => x.estimated)) expect(p.date < firstReal.date).toBe(true);
    expect(out.points.filter((p) => p.date.startsWith('2026-09') && p.estimated)).toHaveLength(0);
  });

  it('keeps negative net worth negative', () => {
    const out = buildHistory({
      snapshots: [], today: TODAY, todayValue: -200,
      txs: [{ date: '2026-09-05', amount: -300 }],
    });
    expect(out.points[0]).toEqual({ date: '2026-09-30', value: -200, estimated: true });
  });

  it("replaces today's stored snapshot with the live value", () => {
    const out = buildHistory({ snapshots: [{ date: TODAY, value: 10 }], today: TODAY, todayValue: 20, txs: [] });
    expect(out.points).toEqual([{ date: TODAY, value: 20, estimated: false }]);
  });

  it('crosses a year boundary', () => {
    const out = buildHistory({
      snapshots: [], today: '2026-01-15', todayValue: 100,
      txs: [{ date: '2025-11-03', amount: 10 }],
    });
    expect(out.points.map((p) => p.date)).toEqual(['2025-11-30', '2025-12-31', '2026-01-15']);
  });
});

describe('isCashFlowTx', () => {
  const base = { date: '2026-09-01', amount: -10, debtId: null, categoryType: 'expense', accountType: 'checking' };
  it('counts an ordinary transaction', () => expect(isCashFlowTx(base)).toBe(true));
  it('ignores transfers', () => expect(isCashFlowTx({ ...base, categoryType: 'transfer' })).toBe(false));
  it('ignores debt payments', () => expect(isCashFlowTx({ ...base, debtId: 'd1' })).toBe(false));
  it('ignores tracking accounts', () => expect(isCashFlowTx({ ...base, accountType: 'investment' })).toBe(false));
  it('counts transactions with no category or account', () =>
    expect(isCashFlowTx({ ...base, categoryType: null, accountType: null })).toBe(true));
});
