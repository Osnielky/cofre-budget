import { describe, it, expect } from 'vitest';
import { periodLabel, resetsIn } from './usage';

describe('resetsIn', () => {
  const now = new Date('2026-10-14T18:47:00Z');
  it('shows hours and minutes', () => {
    expect(resetsIn('2026-10-15T00:00:00.000Z', now)).toBe('5h 13m');
  });
  it('shows only minutes under an hour', () => {
    expect(resetsIn('2026-10-14T19:05:00.000Z', now)).toBe('18m');
  });
  it('never goes below 1 minute', () => {
    expect(resetsIn('2026-10-14T18:46:00.000Z', now)).toBe('1m');
  });
  it('shows whole days for a monthly reset', () => {
    expect(resetsIn('2026-11-01T00:00:00.000Z', now)).toBe('18d');
  });
});

describe('periodLabel', () => {
  it('words the window', () => {
    expect(periodLabel('day')).toBe('today');
    expect(periodLabel('month')).toBe('this month');
  });
});
