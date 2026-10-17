import { describe, it, expect } from 'vitest';
import { NET_WORTH_TARGET, computeGoalProgress } from './net-worth-goal.math';

describe('computeGoalProgress', () => {
  it('reports 100% and today when the target is already met', () => {
    const now = new Date(2026, 5, 1);
    const out = computeGoalProgress({
      current: NET_WORTH_TARGET + 500,
      targetDate: '2030-01-01', baselineValue: 200_000, baselineDate: '2025-01-01', now,
    });
    expect(out.onTrackPct).toBe(100);
    expect(out.projectedDate).toBe('2026-06-01');
  });

  it('returns nulls when no target date is set', () => {
    const out = computeGoalProgress({
      current: 50_000, targetDate: null, baselineValue: null, baselineDate: null, now: new Date(2026, 5, 1),
    });
    expect(out.onTrackPct).toBeNull();
    expect(out.projectedDate).toBeNull();
  });

  it('returns nulls when the baseline was captured today (not enough elapsed time to judge pace)', () => {
    const now = new Date(2026, 5, 1);
    const out = computeGoalProgress({
      current: 100_000, targetDate: '2030-01-01', baselineValue: 100_000, baselineDate: '2026-06-01', now,
    });
    expect(out.onTrackPct).toBeNull();
    expect(out.projectedDate).toBeNull();
  });

  it('computes on-track percentage and a projected date for steady progress', () => {
    // Baseline $0 on 2025-01-01, target $1,000,000 by 2030-01-01 (5 years = 1826 days).
    // 1 year elapsed (2026-01-01), current $200,000 — required pace at 1/5 elapsed = $200,000. Exactly on track.
    const out = computeGoalProgress({
      current: 200_000, targetDate: '2030-01-01', baselineValue: 0, baselineDate: '2025-01-01', now: new Date(2026, 0, 1),
    });
    expect(out.onTrackPct).toBeCloseTo(100, 0);
    expect(out.projectedDate).not.toBeNull();
  });

  it('flags off-track progress without clamping to zero', () => {
    // Same timeline as above but only $50,000 saved instead of the $200,000 required pace.
    const out = computeGoalProgress({
      current: 50_000, targetDate: '2030-01-01', baselineValue: 0, baselineDate: '2025-01-01', now: new Date(2026, 0, 1),
    });
    expect(out.onTrackPct).toBeCloseTo(25, 0);
  });

  it('returns a null projected date when losing ground (no positive rate to project from)', () => {
    const out = computeGoalProgress({
      current: 40_000, targetDate: '2030-01-01', baselineValue: 50_000, baselineDate: '2025-01-01', now: new Date(2026, 0, 1),
    });
    expect(out.projectedDate).toBeNull();
    expect(out.onTrackPct).toBeLessThan(0);
  });

  it('returns a null projected date when a near-zero positive rate would produce an absurd/invalid far-future date', () => {
    // Baseline $0 on 2025-01-01, one year elapsed, only $0.01 gained — the naive
    // extrapolation would land thousands of years out (or overflow Date entirely).
    const out = computeGoalProgress({
      current: 0.01, targetDate: '2030-01-01', baselineValue: 0, baselineDate: '2025-01-01', now: new Date(2026, 0, 1),
    });
    expect(out.projectedDate).toBeNull();
  });
});
