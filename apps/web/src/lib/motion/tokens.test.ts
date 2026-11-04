import { describe, it, expect } from 'vitest';
import { springs, slideVariants, fadeUp, DOT_WIDTH } from './tokens';

describe('motion tokens', () => {
  it('ships a soft and a snappy spring', () => {
    expect(springs.soft.type).toBe('spring');
    expect(springs.snappy.stiffness).toBeGreaterThan(springs.soft.stiffness);
  });
});

describe('slideVariants', () => {
  it('enters from the side the user moved toward and leaves the other way', () => {
    const v = slideVariants(1);
    expect(v.initial.x).toBeGreaterThan(0);
    expect(v.exit.x).toBeLessThan(0);
    expect(v.animate.x).toBe(0);
    const back = slideVariants(-1);
    expect(back.initial.x).toBeLessThan(0);
    expect(back.exit.x).toBeGreaterThan(0);
  });
  it('stays still, only fading, when motion is reduced', () => {
    const v = slideVariants(1, true);
    expect(v.initial.x).toBe(0);
    expect(v.exit.x).toBe(0);
    expect(v.initial.opacity).toBe(0);
  });
});

describe('fadeUp', () => {
  it('rises in with a per-item delay', () => {
    expect(fadeUp(2).initial.y).toBeGreaterThan(0);
    expect(fadeUp(2).transition.delay).toBeGreaterThan(fadeUp(0).transition.delay);
  });
  it('does not travel when motion is reduced', () => {
    expect(fadeUp(2, true).initial.y).toBe(0);
  });
});

describe('DOT_WIDTH', () => {
  it('stretches the active dot', () => {
    expect(DOT_WIDTH.active).toBeGreaterThan(DOT_WIDTH.idle);
  });
});
