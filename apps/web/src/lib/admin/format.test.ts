import { describe, it, expect } from 'vitest';
import { relativeTime, money } from './format';

const NOW = new Date('2026-10-13T12:00:00Z');

describe('relativeTime', () => {
  it('handles never, just now, minutes, hours and days', () => {
    expect(relativeTime(null, NOW)).toBe('Never');
    expect(relativeTime('2026-10-13T11:59:30Z', NOW)).toBe('Just now');
    expect(relativeTime('2026-10-13T11:15:00Z', NOW)).toBe('45m ago');
    expect(relativeTime('2026-10-13T07:00:00Z', NOW)).toBe('5h ago');
    expect(relativeTime('2026-10-10T12:00:00Z', NOW)).toBe('3d ago');
  });
  it('falls back to a date after 30 days', () => {
    expect(relativeTime('2026-08-01T12:00:00Z', NOW)).toBe('Aug 1, 2026');
  });
});

describe('money', () => {
  it('formats dollars with cents', () => {
    expect(money(11.38)).toBe('$11.38');
    expect(money(1234.5)).toBe('$1,234.50');
  });
});
