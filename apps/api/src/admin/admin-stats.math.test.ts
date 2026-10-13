import { describe, it, expect } from 'vitest';
import { weekStartUtc, weeklyBuckets } from './admin-stats.math';

describe('weekStartUtc', () => {
  it('returns the Monday of the week in UTC', () => {
    expect(weekStartUtc(new Date('2026-10-13T08:00:00Z'))).toBe('2026-10-12'); // Tue → Mon
    expect(weekStartUtc(new Date('2026-10-12T00:00:00Z'))).toBe('2026-10-12'); // Mon
    expect(weekStartUtc(new Date('2026-10-18T23:59:59Z'))).toBe('2026-10-12'); // Sun
  });
});

describe('weeklyBuckets', () => {
  const now = new Date('2026-10-13T12:00:00Z');
  it('returns `weeks` zero-filled buckets ending with the current week', () => {
    const out = weeklyBuckets([], now, 12);
    expect(out).toHaveLength(12);
    expect(out[11]).toEqual({ week: '2026-10-12', count: 0 });
    expect(out[0].week).toBe('2026-07-27');
  });
  it('counts dates into their week and ignores ones outside the window', () => {
    const out = weeklyBuckets([
      new Date('2026-10-12T01:00:00Z'), new Date('2026-10-13T01:00:00Z'), // this week ×2
      new Date('2026-10-05T01:00:00Z'),                                   // last week
      new Date('2025-01-01T00:00:00Z'),                                   // too old
    ], now, 12);
    expect(out[11].count).toBe(2);
    expect(out[10].count).toBe(1);
    expect(out.reduce((s, b) => s + b.count, 0)).toBe(3);
  });
});
