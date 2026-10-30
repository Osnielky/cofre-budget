import { describe, it, expect } from 'vitest';
import { monthLabel, monthSeries, monthStats, monthWindow, shortMoney, type MonthPoint } from './monthly';

const m = (month: string, realized: number, closedTrades = 1): MonthPoint => ({ month, realized, income: 0, fees: 0, closedTrades });

describe('monthSeries', () => {
  it('fills the months the engine skipped and accumulates realized P&L', () => {
    const s = monthSeries([m('2026-03', 1526), m('2025-12', 12.5), m('2026-02', -40), m('2026-06', 100)]);
    expect(s.map((p) => [p.month, p.realized, p.cumulative, p.active])).toEqual([
      ['2025-12', 12.5, 12.5, true],
      ['2026-01', 0, 12.5, false],
      ['2026-02', -40, -27.5, true],
      ['2026-03', 1526, 1498.5, true],
      ['2026-04', 0, 1498.5, false],
      ['2026-05', 0, 1498.5, false],
      ['2026-06', 100, 1598.5, true],
    ]);
    expect(monthSeries([])).toEqual([]);
  });
  it('windows to the last N months while the cumulative keeps the full history', () => {
    const s = monthSeries([m('2025-01', 500), m('2026-02', 10)]);
    const w = monthWindow(s, 3);
    expect(w.map((p) => [p.month, p.cumulative])).toEqual([['2025-12', 500], ['2026-01', 500], ['2026-02', 510]]);
  });
});

describe('monthStats', () => {
  const series = monthSeries([m('2025-11', 900, 3), m('2025-12', 12.5), m('2026-02', -40), m('2026-03', 1526, 4), m('2026-06', 100), m('2026-07', -290), m('2026-10', 700, 5)]);
  const window = monthWindow(series, 12);  // 2025-11 … 2026-10 = 12 months

  it('counts active and green months, finds best and worst, averages and totals the year', () => {
    const st = monthStats(window, series);
    expect(st.activeMonths).toBe(7);
    expect(st.greenMonths).toBe(5);
    expect(st.best).toMatchObject({ month: '2026-03', realized: 1526 });
    expect(st.worst).toMatchObject({ month: '2026-07', realized: -290 });
    expect(st.avgMonth).toBe(Math.round(((900 + 12.5 - 40 + 1526 + 100 - 290 + 700) / 7) * 100) / 100);
    expect(st.year).toEqual({ year: '2026', realized: 1996, closedTrades: 12 });
    expect(st.allTime).toBe(2908.5);
  });
  it('ignores filled months and keeps the year total over months outside the window', () => {
    const w = monthWindow(series, 3);  // Aug, Sep, Oct 2026 — Aug and Sep are filled
    const st = monthStats(w, series);
    expect(st.activeMonths).toBe(1);
    expect(st.best).toMatchObject({ month: '2026-10' });
    expect(st.year?.realized).toBe(1996);
  });
  it('is empty without data', () => {
    expect(monthStats([], [])).toEqual({ activeMonths: 0, greenMonths: 0, best: null, worst: null, avgMonth: null, year: null, allTime: 0 });
  });
});

describe('labels', () => {
  it('formats the axis month and short signed money', () => {
    expect(monthLabel('2026-03')).toBe('Mar 26');
    expect(shortMoney(1526)).toBe('+$1,526');
    expect(shortMoney(-290.4)).toBe('-$290');
    expect(shortMoney(0.2)).toBe('$0');
    expect(shortMoney(12400)).toBe('+$12.4k');
    expect(shortMoney(-20000)).toBe('-$20k');
  });
});
