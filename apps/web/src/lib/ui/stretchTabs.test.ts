import { describe, it, expect } from 'vitest';
import { measureEdges, leadTrail, edgesAt, STRETCH, easeOutCubic, easeInOutCubic } from './stretchTabs';

describe('measureEdges', () => {
  it('frames the tab from both sides of the wrapper', () => {
    expect(measureEdges(400, { left: 100, width: 80 })).toEqual({ l: 100, r: 220 });
  });
  it('shrinks the frame by the pad on each side (the underline sits inside the tab)', () => {
    expect(measureEdges(400, { left: 100, width: 80 }, 8)).toEqual({ l: 108, r: 228 });
  });
  it('never returns a negative right inset when the tab overflows the wrapper', () => {
    expect(measureEdges(100, { left: 60, width: 80 }).r).toBe(0);
  });
});

describe('leadTrail', () => {
  it('moving right: the right inset leads, the left trails', () => {
    expect(leadTrail({ l: 0, r: 300 }, { l: 100, r: 200 })).toEqual({ lead: 'r', trail: 'l' });
  });
  it('moving left: the left inset leads, the right trails', () => {
    expect(leadTrail({ l: 200, r: 100 }, { l: 50, r: 250 })).toEqual({ lead: 'l', trail: 'r' });
  });
  it('a wider tab at the same centre grows to the right', () => {
    expect(leadTrail({ l: 100, r: 100 }, { l: 100, r: 60 })).toEqual({ lead: 'r', trail: 'l' });
  });
});

describe('edgesAt', () => {
  const from = { l: 0, r: 300 }, to = { l: 200, r: 100 };
  it('starts where it was and ends where it should', () => {
    expect(edgesAt(from, to, 0)).toEqual(from);
    expect(edgesAt(from, to, 1)).toEqual(to);
  });
  it('the lead edge is ahead of the trail edge mid-way, so the pill is stretched', () => {
    const mid = edgesAt(from, to, 0.2);
    const leadProgress = (from.r - mid.r) / (from.r - to.r);
    const trailProgress = (mid.l - from.l) / (to.l - from.l);
    expect(leadProgress).toBeGreaterThan(trailProgress);
    // stretched: wider than either the start or the end tab
    const width = (n: { l: number; r: number }, total = 400) => total - n.l - n.r;
    expect(width(mid)).toBeGreaterThan(width(from));
    expect(width(mid)).toBeGreaterThan(width(to));
  });
  it('the lead has fully arrived before the trail finishes', () => {
    const t = STRETCH.lead.duration;
    const at = edgesAt(from, to, t);
    expect(at.r).toBeCloseTo(to.r, 6);
    expect(at.l).toBeLessThan(to.l);
  });
  it('never overshoots: the pill never gets narrower than the destination while moving', () => {
    for (let t = 0; t <= 0.6; t += 0.02) {
      const e = edgesAt(from, to, t);
      expect(e.l).toBeGreaterThanOrEqual(from.l);
      expect(e.l).toBeLessThanOrEqual(to.l);
      expect(e.r).toBeGreaterThanOrEqual(to.r);
      expect(e.r).toBeLessThanOrEqual(from.r);
    }
  });
});

describe('easings', () => {
  it('both run 0 → 1', () => {
    expect(easeOutCubic(0)).toBe(0); expect(easeOutCubic(1)).toBe(1);
    expect(easeInOutCubic(0)).toBe(0); expect(easeInOutCubic(1)).toBe(1);
    expect(easeInOutCubic(0.5)).toBeCloseTo(0.5, 6);
  });
  it('ease-out is ahead of ease-in-out early on', () => {
    expect(easeOutCubic(0.25)).toBeGreaterThan(easeInOutCubic(0.25));
  });
});
