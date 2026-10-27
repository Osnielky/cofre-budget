import { describe, it, expect } from 'vitest';
import { resolveRange, monthKeysBetween, dayCount } from './range';

const now = new Date(2026, 9, 27); // Oct 27, 2026

describe('resolveRange', () => {
  it('this month runs from the 1st to today and compares to the whole previous month', () => {
    const r = resolveRange('this-month', now);
    expect(r.from).toBe('2026-10-01'); expect(r.to).toBe('2026-10-27');
    expect(r.prevFrom).toBe('2026-09-01'); expect(r.prevTo).toBe('2026-09-30');
    expect(r.months).toEqual(['2026-10']); expect(r.days).toBe(27);
    expect(r.label).toBe('Oct 1 – Oct 27, 2026'); expect(r.prevLabel).toBe('Sep 2026');
  });
  it('last month is a whole month compared to the month before', () => {
    const r = resolveRange('last-month', now);
    expect([r.from, r.to, r.prevFrom, r.prevTo]).toEqual(['2026-09-01', '2026-09-30', '2026-08-01', '2026-08-31']);
    expect(r.label).toBe('Sep 2026');
  });
  it('6M spans six months and the previous six, crossing the year boundary', () => {
    const r = resolveRange('6m', new Date(2026, 1, 10));
    expect(r.from).toBe('2025-09-01'); expect(r.to).toBe('2026-02-10');
    expect(r.prevFrom).toBe('2025-03-01'); expect(r.prevTo).toBe('2025-08-31');
    expect(r.months).toEqual(['2025-09', '2025-10', '2025-11', '2025-12', '2026-01', '2026-02']);
  });
  it('YTD starts Jan 1 and compares to the same number of months before', () => {
    const r = resolveRange('ytd', now);
    expect(r.from).toBe('2026-01-01'); expect(r.prevFrom).toBe('2025-03-01'); expect(r.prevTo).toBe('2025-12-31');
    expect(r.months).toHaveLength(10);
  });
  it('custom compares to the same number of days immediately before', () => {
    const r = resolveRange('custom', now, { from: '2026-10-10', to: '2026-10-19' });
    expect(r.days).toBe(10); expect(r.prevFrom).toBe('2026-09-30'); expect(r.prevTo).toBe('2026-10-09');
  });
  it('an invalid custom range falls back to this month', () => {
    const r = resolveRange('custom', now, { from: '2026-10-19', to: '2026-10-10' });
    expect(r.preset).toBe('this-month'); expect(r.from).toBe('2026-10-01');
  });
});

describe('helpers', () => {
  it('monthKeysBetween is inclusive', () => {
    expect(monthKeysBetween('2026-11-15', '2027-01-02')).toEqual(['2026-11', '2026-12', '2027-01']);
  });
  it('dayCount is inclusive', () => {
    expect(dayCount('2026-10-01', '2026-10-01')).toBe(1);
    expect(dayCount('2026-02-27', '2026-03-02')).toBe(4);
  });
});
