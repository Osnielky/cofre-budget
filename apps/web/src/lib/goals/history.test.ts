import { describe, it, expect } from 'vitest';
import { filterRange, rangeCutoff, rangeSummary, milestoneCrossings, rangeLabel, type HistoryPoint } from './history';

const p = (date: string, value: number, estimated = false): HistoryPoint => ({ date, value, estimated });
const NOW = new Date(2026, 9, 15); // 15 Oct 2026, local time

describe('rangeCutoff', () => {
  it('counts months back from today', () => {
    expect(rangeCutoff('1M', NOW)).toBe('2026-09-15');
    expect(rangeCutoff('6M', NOW)).toBe('2026-04-15');
    expect(rangeCutoff('1Y', NOW)).toBe('2025-10-15');
  });
  it('starts YTD on January 1st', () => expect(rangeCutoff('YTD', NOW)).toBe('2026-01-01'));
  it('has no cutoff for all time', () => expect(rangeCutoff('ALL', NOW)).toBeNull());
});

describe('filterRange', () => {
  const pts = [p('2025-05-31', 18250, true), p('2026-03-31', 40000, true), p('2026-10-10', 46000)];
  it('keeps points on or after the cutoff', () => {
    expect(filterRange(pts, '1M', NOW)).toEqual([p('2026-10-10', 46000)]);
    expect(filterRange(pts, 'ALL', NOW)).toEqual(pts);
  });
  it('keeps the estimated flag', () => {
    expect(filterRange(pts, '1Y', NOW)[0].estimated).toBe(true);
  });
  it('falls back to the latest point when nothing is in range (e.g. YTD in early January)', () => {
    const jan = new Date(2027, 0, 2);
    expect(filterRange(pts, 'YTD', jan)).toEqual([p('2026-10-10', 46000)]);
  });
});

describe('rangeSummary', () => {
  it('reports start, end, growth and percent', () => {
    expect(rangeSummary([p('2025-05-31', 18250), p('2026-10-10', 46588.63)]))
      .toEqual({ start: 18250, end: 46588.63, growth: 28338.63, pct: 155.3 });
  });
  it('hides the percent when the start is zero or negative', () => {
    expect(rangeSummary([p('2026-01-31', -500), p('2026-10-10', 1000)])?.pct).toBeNull();
    expect(rangeSummary([p('2026-01-31', 0), p('2026-10-10', 1000)])?.pct).toBeNull();
  });
  it('returns null with no points', () => expect(rangeSummary([])).toBeNull());
});

describe('milestoneCrossings', () => {
  it('marks the first point at or above each threshold', () => {
    const out = milestoneCrossings([p('2025-05-31', 18250), p('2025-08-31', 25100), p('2025-11-30', 30000)]);
    expect(out.map((c) => [c.level.short, c.date])).toEqual([['$25K', '2025-08-31']]);
  });
  it('marks a crossing only once, even after dipping back below', () => {
    const out = milestoneCrossings([p('a1', 24000), p('a2', 26000), p('a3', 23000), p('a4', 27000)]);
    expect(out.filter((c) => c.level.short === '$25K').map((c) => c.date)).toEqual(['a2']);
  });
  it('does not mark levels already passed at the first point', () => {
    expect(milestoneCrossings([p('a1', 12000), p('a2', 13000)])).toEqual([]);
  });
  it('can cross several levels in one step', () => {
    const out = milestoneCrossings([p('a1', 4000), p('a2', 26000)]);
    expect(out.map((c) => c.level.short)).toEqual(['$5K', '$10K', '$25K']);
  });
});

describe('rangeLabel', () => {
  it('spans first to last month', () => expect(rangeLabel([p('2025-05-31', 1), p('2026-10-10', 2)])).toBe('May 2025 – Oct 2026'));
  it('shows one month for a single point', () => expect(rangeLabel([p('2026-10-10', 2)])).toBe('Oct 2026'));
});
