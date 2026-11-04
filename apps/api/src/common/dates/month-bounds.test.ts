import { describe, it, expect } from 'vitest';
import { monthBounds } from './month-bounds';

describe('monthBounds', () => {
  it('ends on the real last day of a 30-day month (Postgres rejects 2026-11-31)', () => {
    expect(monthBounds(new Date(2026, 10, 4))).toEqual({ start: '2026-11-01', end: '2026-11-30' });
  });
  it('handles 31-day months and February, leap or not', () => {
    expect(monthBounds(new Date(2026, 9, 16)).end).toBe('2026-10-31');
    expect(monthBounds(new Date(2026, 1, 10)).end).toBe('2026-02-28');
    expect(monthBounds(new Date(2028, 1, 10)).end).toBe('2028-02-29');
  });
  it('uses the local calendar month', () => {
    expect(monthBounds(new Date(2026, 0, 1, 0, 30)).start).toBe('2026-01-01');
  });
});
