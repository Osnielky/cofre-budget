import { describe, it, expect } from 'vitest';
import { monthRange, monthWithin, sliceMonth } from './monthSlice';

describe('monthRange', () => {
  it('first to last day, leap years included', () => {
    expect(monthRange('2026-11')).toEqual({ from: '2026-11-01', to: '2026-11-30' });
    expect(monthRange('2028-02')).toEqual({ from: '2028-02-01', to: '2028-02-29' });
  });
});

describe('monthWithin', () => {
  const yearFrom = '2026-01-01', today = '2026-11-07';
  it('a past month of this year is fully inside the year-to-date list', () => {
    expect(monthWithin('2026-03', yearFrom, today)).toBe(true);
  });
  it('the current month is inside it (the list runs to today)', () => {
    expect(monthWithin('2026-11', yearFrom, today)).toBe(true);
  });
  it('last year and next month are not', () => {
    expect(monthWithin('2025-12', yearFrom, today)).toBe(false);
    expect(monthWithin('2026-12', yearFrom, today)).toBe(false);
  });
});

describe('sliceMonth', () => {
  it('keeps the rows dated in the month', () => {
    const rows = [{ date: '2026-10-31' }, { date: '2026-11-01' }, { date: '2026-11-30T12:00:00.000Z' }, { date: '2026-12-01' }];
    expect(sliceMonth(rows, '2026-11').map((r) => r.date)).toEqual(['2026-11-01', '2026-11-30T12:00:00.000Z']);
  });
});
