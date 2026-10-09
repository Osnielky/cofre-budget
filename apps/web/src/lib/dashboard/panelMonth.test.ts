import { describe, it, expect } from 'vitest';
import { monthOptionKeys, nextOverride } from './panelMonth';

describe('monthOptionKeys', () => {
  it('lists distinct months with transactions, newest first', () => {
    expect(monthOptionKeys(['2026-08-03', '2026-10-01', '2026-08-20', '2026-09-15']))
      .toEqual(['2026-10', '2026-09', '2026-08']);
  });
  it('always includes the header and selected months, even with no transactions', () => {
    expect(monthOptionKeys(['2026-08-03'], '2026-10', '2026-07'))
      .toEqual(['2026-10', '2026-08', '2026-07']);
  });
  it('does not duplicate a month that is both header and data', () => {
    expect(monthOptionKeys(['2026-10-01'], '2026-10', '2026-10')).toEqual(['2026-10']);
  });
});

describe('nextOverride', () => {
  it('keeps a month that differs from the header', () => {
    expect(nextOverride('2026-08', '2026-10')).toBe('2026-08');
  });
  it('clears the override when the header month is picked again', () => {
    expect(nextOverride('2026-10', '2026-10')).toBeNull();
  });
});
