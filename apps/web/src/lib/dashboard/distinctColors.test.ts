import { describe, it, expect } from 'vitest';
import { distinctColors, MIN_COLOR_DISTANCE } from './distinctColors';

const PALETTE = ['#4FBF7F', '#4BA8D8', '#F5C842', '#F07A3E', '#9B6DFF', '#E879A0'];

describe('distinctColors', () => {
  it('leaves already-distinct colours alone', () => {
    expect(distinctColors(['#4FBF7F', '#E879A0', '#6B6B8A'], PALETTE)).toEqual(['#4FBF7F', '#E879A0', '#6B6B8A']);
  });

  it('recolours exact duplicates after the first, largest slice', () => {
    const out = distinctColors(['#4FBF7F', '#4FBF7F', '#4FBF7F'], PALETTE);
    expect(out[0]).toBe('#4FBF7F');
    expect(new Set(out).size).toBe(3);
  });

  it('catches near-duplicate shades of the same hue', () => {
    // Salary green vs a project's slightly different green
    const out = distinctColors(['#4FBF7F', '#22C55E'], PALETTE);
    expect(out[1]).not.toBe('#22C55E');
  });

  it('never picks a replacement that clashes with a later original colour already used', () => {
    const out = distinctColors(['#4FBF7F', '#4BA8D8', '#4FBF7F'], PALETTE);
    expect(out).toEqual(['#4FBF7F', '#4BA8D8', '#F5C842']);
  });

  it('accepts rgb() strings from computed styles', () => {
    const out = distinctColors(['rgb(79, 191, 127)', '#4FBF7F'], PALETTE);
    expect(out[1]).not.toBe('#4FBF7F');
  });

  it('falls back to any unused palette entry when nothing is far enough', () => {
    const out = distinctColors(Array(8).fill('#4FBF7F'), PALETTE);
    expect(out.slice(0, 6)).toEqual(expect.arrayContaining(PALETTE));
    expect(MIN_COLOR_DISTANCE).toBeGreaterThan(0);
  });
});
