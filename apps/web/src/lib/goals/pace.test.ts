import { describe, it, expect } from 'vitest';
import { monthlyPace, projectReach, requiredMonthly, addMonths } from './pace';
import type { HistoryPoint } from './history';

const pts = (rows: [string, number][]): HistoryPoint[] => rows.map(([date, value]) => ({ date, value, estimated: false }));

describe('monthlyPace', () => {
  it('averages the change per month over the last 90 days of history', () => {
    const h = pts([['2026-06-01', 40000], ['2026-07-01', 42000], ['2026-08-01', 44000], ['2026-09-01', 46000], ['2026-10-01', 48000], ['2026-10-20', 49000]]);
    const pace = monthlyPace(h, new Date('2026-10-20T12:00:00Z'));
    expect(pace).not.toBeNull();
    // From 2026-07-22 (90 days back → first point on/after is 08-01, 44000) to 10-20 (49000): +5000 over ~2.6 months.
    expect(pace!).toBeGreaterThan(1800);
    expect(pace!).toBeLessThan(2000);
  });
  it('needs at least two points at least 14 days apart', () => {
    expect(monthlyPace(pts([['2026-10-20', 1000]]), new Date('2026-10-20'))).toBeNull();
    expect(monthlyPace(pts([['2026-10-15', 1000], ['2026-10-20', 1200]]), new Date('2026-10-20'))).toBeNull();
  });
  it('can be negative when net worth is falling', () => {
    const h = pts([['2026-08-01', 50000], ['2026-10-01', 46000]]);
    expect(monthlyPace(h, new Date('2026-10-20'))!).toBeLessThan(0);
  });
});

describe('projectReach', () => {
  it('gives the month a target is reached at a given pace', () => {
    expect(projectReach(55000, 100000, 2000, new Date('2026-10-20T12:00:00Z'))).toBe('2028-09');
  });
  it('is null when the pace is zero or negative', () => {
    expect(projectReach(55000, 100000, 0, new Date('2026-10-20'))).toBeNull();
    expect(projectReach(55000, 100000, -100, new Date('2026-10-20'))).toBeNull();
  });
  it('is the current month when the target is already met', () => {
    expect(projectReach(120000, 100000, 500, new Date('2026-10-20T12:00:00Z'))).toBe('2026-10');
  });
});

describe('requiredMonthly', () => {
  it('spreads the gap over the months until the target date', () => {
    expect(requiredMonthly(55000, 100000, '2027-12-20', new Date('2026-10-20T12:00:00Z'))).toBeCloseTo(45000 / 14, 0);
  });
  it('is null for a date in the past or the same month', () => {
    expect(requiredMonthly(55000, 100000, '2026-10-25', new Date('2026-10-20'))).toBeNull();
    expect(requiredMonthly(55000, 100000, '2025-01-01', new Date('2026-10-20'))).toBeNull();
  });
});

describe('addMonths', () => {
  it('returns a YYYY-MM key', () => {
    expect(addMonths(new Date('2026-10-20T12:00:00Z'), 14)).toBe('2027-12');
    expect(addMonths(new Date('2026-01-31T12:00:00Z'), 1)).toBe('2026-02');
  });
});
