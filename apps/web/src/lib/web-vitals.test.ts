import { describe, it, expect } from 'vitest';
import { parseVital, normalizePage, pagePath } from './web-vitals';

describe('parseVital', () => {
  it('accepts a known metric', () => {
    expect(parseVital({ name: 'LCP', value: 2400.5, rating: 'good', page: '/dashboard' }))
      .toEqual({ name: 'LCP', value: 2400.5, rating: 'good', page: '/dashboard' });
  });

  it('rejects junk and unknown metrics', () => {
    expect(parseVital(null)).toBeNull();
    expect(parseVital('x')).toBeNull();
    expect(parseVital({ name: 'Next.js-hydration', value: 1, rating: 'good', page: '/' })).toBeNull();
    expect(parseVital({ name: 'LCP', value: 'fast', rating: 'good', page: '/' })).toBeNull();
    expect(parseVital({ name: 'LCP', value: 1, rating: 'amazing', page: '/' })).toBeNull();
    expect(parseVital({ name: 'LCP', value: 1, rating: 'good', page: 'https://evil.example' })).toBeNull();
  });

  it('rejects an oversized page', () => {
    expect(parseVital({ name: 'LCP', value: 1, rating: 'good', page: '/' + 'a'.repeat(5000) })).toBeNull();
  });

  it('normalises the page so ids do not fragment it', () => {
    expect(parseVital({ name: 'INP', value: 90, rating: 'good', page: '/projects/123e4567-e89b-42d3-a456-426614174000?tab=1' })!.page)
      .toBe('/projects/:id');
  });
});

describe('normalizePage', () => {
  it('replaces uuid and numeric segments', () => {
    expect(normalizePage('/budgets/2026/9')).toBe('/budgets/:id/:id');
    expect(normalizePage('/transactions')).toBe('/transactions');
  });
});

describe('pagePath', () => {
  it('keeps only the path of a full url', () => {
    expect(pagePath('https://cofre.app/reset-password?token=abc')).toBe('/reset-password');
    expect(pagePath(42)).toBeUndefined();
  });
});
