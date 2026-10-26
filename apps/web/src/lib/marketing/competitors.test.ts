import { describe, it, expect } from 'vitest';
import { COMPETITORS, COFRE_FACTS, competitorBySlug, pricesCheckedOn, pricesCheckedLabel } from './competitors';
import { COMPARE_PATHS } from '@/lib/seo';
import { PLAN_PRICES } from '@/lib/plans';

const DAY = 86_400_000;

describe('competitors', () => {
  it('has a compare page in the sitemap for every competitor, and nothing else', () => {
    expect(COMPETITORS.map((c) => `/compare/${c.slug}`).sort()).toEqual([...COMPARE_PATHS].sort());
  });

  it('links every price to its source and keeps the copy honest in both directions', () => {
    for (const c of COMPETITORS) {
      expect(c.sourceUrl).toMatch(/^https:\/\//);
      expect(c.switchReasons.length).toBeGreaterThanOrEqual(2);
      expect(c.stayReasons.length).toBeGreaterThanOrEqual(1);
    }
  });

  // A stale price is a false claim. Bump pricesCheckedOn after re-checking.
  it('was price-checked within the last 120 days', () => {
    const checked = Date.parse(`${pricesCheckedOn}T00:00:00Z`);
    expect(Number.isNaN(checked)).toBe(false);
    expect(Date.now() - checked).toBeLessThan(120 * DAY);
    expect(pricesCheckedLabel()).toMatch(/^[A-Z][a-z]{2} \d{1,2}, \d{4}$/);
  });

  it('quotes the same Pro prices checkout charges', () => {
    expect(COFRE_FACTS.monthly).toContain(PLAN_PRICES.pro.month.toFixed(2));
    expect(COFRE_FACTS.yearly).toContain(PLAN_PRICES.pro.year.toFixed(2));
  });

  it('looks competitors up by slug', () => {
    expect(competitorBySlug('ynab')?.name).toBe('YNAB');
    expect(competitorBySlug('mint')).toBeUndefined();
  });
});
