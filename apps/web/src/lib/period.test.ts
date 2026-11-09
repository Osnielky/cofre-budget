import { describe, it, expect } from 'vitest';
import {
  monthKey, shiftMonth, monthEnd, monthName, normalizePeriod, resolvePeriod, periodLabel, stepPeriod,
  periodFromRangeState, rangeStateFromPeriod, samePeriod, monthsOfYear, thisMonth, type Period,
} from './period';

const now = new Date(2026, 10, 9); // Nov 9, 2026

describe('month helpers', () => {
  it('keys, shifts and ends are local calendar months', () => {
    expect(monthKey(now)).toBe('2026-11');
    expect(shiftMonth('2026-01', -1)).toBe('2025-12');
    expect(shiftMonth('2026-11', 2)).toBe('2027-01');
    expect(monthEnd('2026-02')).toBe('2026-02-28');
    expect(monthEnd('2028-02')).toBe('2028-02-29');
    expect(monthName('2026-11')).toBe('November 2026');
    expect(monthName('2026-11', 'short')).toBe('Nov 2026');
    expect(monthsOfYear(2026)[0]).toBe('2026-01');
    expect(monthsOfYear(2026)[11]).toBe('2026-12');
  });
  it('a one-month custom range normalizes to that month, others stay custom', () => {
    expect(normalizePeriod({ kind: 'custom', from: '2026-09-01', to: '2026-09-30' })).toEqual({ kind: 'month', month: '2026-09' });
    expect(normalizePeriod({ kind: 'custom', from: '2026-09-01', to: '2026-10-31' })).toEqual({ kind: 'custom', from: '2026-09-01', to: '2026-10-31' });
    expect(normalizePeriod({ kind: 'custom', from: '2026-09-02', to: '2026-09-30' }).kind).toBe('custom');
  });
});

describe('resolvePeriod + periodLabel', () => {
  it('a month is the whole month and compares to the month before', () => {
    const r = resolvePeriod({ kind: 'month', month: '2026-11' }, now);
    expect([r.from, r.to, r.prevFrom, r.prevTo]).toEqual(['2026-11-01', '2026-11-30', '2026-10-01', '2026-10-31']);
    expect(r.prevLabel).toBe('Oct 2026');
    expect(periodLabel({ kind: 'month', month: '2026-11' }, now)).toBe('November 2026');
  });
  it('presets read as sentences and end today', () => {
    expect(periodLabel({ kind: 'preset', preset: '3m' }, now)).toBe('Last 3 months');
    expect(resolvePeriod({ kind: 'preset', preset: '3m' }, now).to).toBe('2026-11-09');
    expect(periodLabel({ kind: 'preset', preset: 'ytd' }, now)).toBe('Year to date');
  });
  it('a custom range reads as its dates', () => {
    expect(periodLabel({ kind: 'custom', from: '2026-09-03', to: '2026-11-09' }, now)).toBe('Sep 3 – Nov 9, 2026');
  });
});

describe('stepPeriod', () => {
  const m = (month: string): Period => ({ kind: 'month', month });
  it('a month steps a month inside the bounds', () => {
    expect(stepPeriod(m('2026-11'), -1, now)).toEqual(m('2026-10'));
    expect(stepPeriod(m('2026-11'), 1, now, { max: '2026-11' })).toBeNull();
    expect(stepPeriod(m('2026-11'), 1, now, { max: null })).toEqual(m('2026-12'));
    expect(stepPeriod(m('2026-01'), -1, now, { min: '2026-01' })).toBeNull();
  });
  it('a preset steps back to its previous period and cannot step into the future', () => {
    expect(stepPeriod({ kind: 'preset', preset: '3m' }, -1, now)).toEqual({ kind: 'custom', from: '2026-06-01', to: '2026-08-31' });
    expect(stepPeriod({ kind: 'preset', preset: 'last-month' }, -1, now)).toEqual(m('2026-09'));
    expect(stepPeriod({ kind: 'preset', preset: '6m' }, 1, now, { max: '2026-11' })).toBeNull();
  });
  it('whole-month ranges step by their month count and clamp to the max month', () => {
    const q: Period = { kind: 'custom', from: '2026-04-01', to: '2026-06-30' };
    expect(stepPeriod(q, 1, now, { max: '2026-11' })).toEqual({ kind: 'custom', from: '2026-07-01', to: '2026-09-30' });
    expect(stepPeriod({ kind: 'custom', from: '2026-07-01', to: '2026-09-30' }, 1, now, { max: '2026-11' })).toEqual({ kind: 'custom', from: '2026-10-01', to: '2026-11-30' });
    expect(stepPeriod(q, -1, now)).toEqual({ kind: 'custom', from: '2026-01-01', to: '2026-03-31' });
    expect(stepPeriod(q, -1, now, { min: '2026-03' })).toEqual(m('2026-03'));
  });
  it('day ranges step by their length and stop at today', () => {
    const d: Period = { kind: 'custom', from: '2026-10-10', to: '2026-10-19' };
    expect(stepPeriod(d, 1, now)).toEqual({ kind: 'custom', from: '2026-10-20', to: '2026-10-29' });
    expect(stepPeriod(d, -1, now)).toEqual({ kind: 'custom', from: '2026-09-30', to: '2026-10-09' });
    expect(stepPeriod({ kind: 'custom', from: '2026-11-01', to: '2026-11-09' }, 1, now)).toBeNull();
    expect(stepPeriod({ kind: 'custom', from: '2026-10-25', to: '2026-11-03' }, 1, now)).toEqual({ kind: 'custom', from: '2026-11-04', to: '2026-11-09' });
  });
});

describe('Reports state mapping', () => {
  it('round-trips presets, the current month and a custom range', () => {
    expect(periodFromRangeState({ preset: 'this-month', from: '', to: '' }, now)).toEqual(thisMonth(now));
    expect(rangeStateFromPeriod(thisMonth(now), now)).toEqual({ preset: 'this-month', from: '', to: '' });
    expect(rangeStateFromPeriod({ kind: 'month', month: '2026-09' }, now)).toEqual({ preset: 'custom', from: '2026-09-01', to: '2026-09-30' });
    expect(periodFromRangeState({ preset: 'custom', from: '2026-09-01', to: '2026-09-30' }, now)).toEqual({ kind: 'month', month: '2026-09' });
    expect(periodFromRangeState({ preset: '6m', from: '', to: '' }, now)).toEqual({ kind: 'preset', preset: '6m' });
    expect(rangeStateFromPeriod({ kind: 'custom', from: '2026-01-05', to: '2026-02-07' }, now)).toEqual({ preset: 'custom', from: '2026-01-05', to: '2026-02-07' });
  });
  it('a broken custom state falls back to this month', () => {
    expect(periodFromRangeState({ preset: 'custom', from: '2026-03-31', to: '2026-01-01' }, now)).toEqual(thisMonth(now));
  });
  it('samePeriod treats a month and its whole-month range alike', () => {
    expect(samePeriod({ kind: 'month', month: '2026-09' }, { kind: 'custom', from: '2026-09-01', to: '2026-09-30' })).toBe(true);
    expect(samePeriod({ kind: 'preset', preset: '3m' }, { kind: 'preset', preset: '6m' })).toBe(false);
  });
});
