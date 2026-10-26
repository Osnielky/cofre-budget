import { describe, it, expect } from 'vitest';
import { projectMillionaire, MAX_MONTHS } from './millionaire';

const NOW = new Date('2026-10-26T12:00:00Z');

describe('projectMillionaire', () => {
  it('reaches the target with contributions and compounding', () => {
    // $50K + $1,000/mo at 7%/yr → about 24 years.
    const r = projectMillionaire({ netWorth: 50_000, monthly: 1_000, annualReturnPct: 7, target: 1_000_000, now: NOW });
    expect(r.months).not.toBeNull();
    expect(r.months!).toBeGreaterThan(280);
    expect(r.months!).toBeLessThan(300);
    expect(r.reachDate).toMatch(/^20(50|51)-\d\d$/);
  });

  it('with no growth it is plain division, rounded up to whole months', () => {
    const r = projectMillionaire({ netWorth: 0, monthly: 10_000, annualReturnPct: 0, target: 100_000, now: NOW });
    expect(r.months).toBe(10);
    expect(r.reachDate).toBe('2027-08');
  });

  it('is reached already when net worth is at or above the target', () => {
    const r = projectMillionaire({ netWorth: 1_000_000, monthly: 0, annualReturnPct: 7, target: 1_000_000, now: NOW });
    expect(r.months).toBe(0);
    expect(r.reachDate).toBe('2026-10');
  });

  it('never reaches the target without contributions or growth', () => {
    const r = projectMillionaire({ netWorth: 10_000, monthly: 0, annualReturnPct: 0, target: 1_000_000, now: NOW });
    expect(r.months).toBeNull();
    expect(r.reachDate).toBeNull();
    expect(r.milestones.every((m) => m.month === null || m.threshold <= 10_000)).toBe(true);
  });

  it('gives up after the cap instead of looping forever', () => {
    const r = projectMillionaire({ netWorth: -5_000, monthly: 1, annualReturnPct: 0, target: 1_000_000, now: NOW });
    expect(r.months).toBeNull();
    expect(r.series[r.series.length - 1].monthIndex).toBeLessThanOrEqual(MAX_MONTHS);
  });

  it('dates every ladder level, in order, and marks levels already passed', () => {
    const r = projectMillionaire({ netWorth: 12_000, monthly: 2_000, annualReturnPct: 5, target: 1_000_000, now: NOW });
    expect(r.milestones[0]).toMatchObject({ threshold: 5_000, reached: true, month: '2026-10' });
    expect(r.milestones[1]).toMatchObject({ threshold: 10_000, reached: true });
    expect(r.milestones[2]).toMatchObject({ threshold: 25_000, reached: false });
    expect(r.milestones[2].month).toMatch(/^\d{4}-\d{2}$/);
    const dated = r.milestones.filter((m) => !m.reached).map((m) => m.month!);
    expect([...dated].sort()).toEqual(dated);
    expect(r.milestones[r.milestones.length - 1].month).toBe(r.reachDate);
  });

  it('samples the series once a year starting at month 0', () => {
    const r = projectMillionaire({ netWorth: 1_000, monthly: 500, annualReturnPct: 7, target: 1_000_000, now: NOW });
    expect(r.series[0]).toEqual({ monthIndex: 0, value: 1_000 });
    expect(r.series[1].monthIndex).toBe(12);
    expect(r.series[1].value).toBeGreaterThan(7_000);
  });

  it('treats a negative return as decay, not a crash', () => {
    const r = projectMillionaire({ netWorth: 100_000, monthly: 100, annualReturnPct: -50, target: 1_000_000, now: NOW });
    expect(r.months).toBeNull();
  });
});
