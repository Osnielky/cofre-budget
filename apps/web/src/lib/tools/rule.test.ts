import { describe, it, expect } from 'vitest';
import { splitIncome, compareToRule } from './rule';

describe('splitIncome', () => {
  it('splits take-home pay 50/30/20 in cents', () => {
    expect(splitIncome(5_000)).toEqual({ needs: 250_000, wants: 150_000, savings: 100_000 });
  });

  it('puts rounding leftovers on savings so the three parts always add up', () => {
    const s = splitIncome(33.33); // 3333 cents: 1666.5 / 999.9 / 666.6
    expect(s.needs + s.wants + s.savings).toBe(3_333);
    expect(s).toEqual({ needs: 1_666, wants: 999, savings: 668 });
  });

  it('treats bad input as zero', () => {
    expect(splitIncome(Number.NaN)).toEqual({ needs: 0, wants: 0, savings: 0 });
    expect(splitIncome(-10)).toEqual({ needs: 0, wants: 0, savings: 0 });
  });
});

describe('compareToRule', () => {
  it('shows how far each bucket is from its target and what is left for savings', () => {
    const c = compareToRule(5_000, 2_800, 1_200);
    expect(c.needs).toEqual({ target: 250_000, actual: 280_000, delta: 30_000 });
    expect(c.wants).toEqual({ target: 150_000, actual: 120_000, delta: -30_000 });
    expect(c.savings).toEqual({ target: 100_000, actual: 100_000, delta: 0 });
  });

  it('reports negative savings when spending exceeds income', () => {
    const c = compareToRule(3_000, 2_500, 800);
    expect(c.savings.actual).toBe(-30_000);
    expect(c.savings.delta).toBe(-90_000);
  });

  it('leaves actuals null when they were not given', () => {
    const c = compareToRule(4_000, null, null);
    expect(c.needs.actual).toBeNull();
    expect(c.savings.actual).toBeNull();
    expect(c.needs.target).toBe(200_000);
  });
});
