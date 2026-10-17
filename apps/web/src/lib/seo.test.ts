import { describe, it, expect } from 'vitest';
import {
  SITE_URL, INDEXABLE_PATHS, PRIVATE_PATH_PREFIXES,
  robotsConfig, sitemapEntries, softwareAppJsonLd, serializeJsonLd,
} from './seo';
import { PLAN_PRICES } from './plans';

describe('robotsConfig', () => {
  const rules = robotsConfig().rules;
  const rule = Array.isArray(rules) ? rules[0] : rules;

  it('points crawlers at the sitemap', () => {
    expect(robotsConfig().sitemap).toBe(`${SITE_URL}/sitemap.xml`);
  });

  it('disallows every signed-in area and the API', () => {
    const disallow = ([] as string[]).concat(rule.disallow ?? []);
    for (const p of ['/dashboard', '/transactions', '/budgets', '/goals', '/debts', '/projects', '/receipts', '/settings', '/ask-cofre', '/api/']) {
      expect(disallow).toContain(p);
    }
  });

  it('never disallows a page it also lists in the sitemap', () => {
    for (const p of INDEXABLE_PATHS) {
      expect(PRIVATE_PATH_PREFIXES.some((prefix) => p.startsWith(prefix))).toBe(false);
    }
  });
});

describe('sitemapEntries', () => {
  it('lists exactly the public pages as absolute URLs', () => {
    const urls = sitemapEntries(new Date('2026-10-01')).map((e) => e.url);
    expect(urls).toEqual([
      `${SITE_URL}/`, `${SITE_URL}/pricing`, `${SITE_URL}/signup`,
      `${SITE_URL}/login`, `${SITE_URL}/privacy`, `${SITE_URL}/terms`,
    ]);
  });
});

describe('softwareAppJsonLd', () => {
  it('offers the same prices checkout charges', () => {
    const offers = softwareAppJsonLd().offers as { name: string; price: string }[];
    expect(offers).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: 'Free', price: '0' }),
      expect.objectContaining({ name: 'Pro (monthly)', price: String(PLAN_PRICES.pro.month) }),
      expect.objectContaining({ name: 'Elite (monthly)', price: String(PLAN_PRICES.elite.month) }),
    ]));
  });
});

describe('serializeJsonLd', () => {
  it('cannot close the surrounding script tag', () => {
    const out = serializeJsonLd({ name: '</script><script>alert(1)</script>' });
    expect(out).not.toContain('</script>');
    expect(JSON.parse(out).name).toBe('</script><script>alert(1)</script>');
  });
});
