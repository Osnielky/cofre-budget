import { describe, it, expect } from 'vitest';
import {
  SITE_URL, HOME_TITLE, INDEXABLE_PATHS, PRIVATE_PATH_PREFIXES,
  robotsConfig, sitemapEntries, softwareAppJsonLd, organizationJsonLd, breadcrumbJsonLd, serializeJsonLd,
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
      `${SITE_URL}/tools`,
      `${SITE_URL}/tools/millionaire-calculator`,
      `${SITE_URL}/tools/credit-card-payoff-calculator`,
      `${SITE_URL}/tools/50-30-20-budget-calculator`,
      `${SITE_URL}/mint-alternative`,
      `${SITE_URL}/compare/monarch-money`, `${SITE_URL}/compare/ynab`,
      `${SITE_URL}/compare/copilot-money`, `${SITE_URL}/compare/rocket-money`,
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

describe('titles and structured data', () => {
  it('keeps the homepage title short enough to show whole in results', () => {
    expect(HOME_TITLE.length).toBeLessThanOrEqual(65);
  });

  it('names the publisher with an absolute logo URL', () => {
    const org = organizationJsonLd();
    expect(org['@type']).toBe('Organization');
    expect(org.logo).toBe(`${SITE_URL}/icon-512.png`);
  });

  it('builds a breadcrumb trail from Home, linking only crumbs with a path', () => {
    const items = breadcrumbJsonLd([{ name: 'Compare' }, { name: 'Cofre vs YNAB', path: '/compare/ynab' }]).itemListElement as Record<string, unknown>[];
    expect(items.map((i) => i.position)).toEqual([1, 2, 3]);
    expect(items[0]).toMatchObject({ name: 'Home', item: `${SITE_URL}/` });
    expect(items[1]).not.toHaveProperty('item');
    expect(items[2]).toMatchObject({ item: `${SITE_URL}/compare/ynab` });
  });
});

describe('serializeJsonLd', () => {
  it('cannot close the surrounding script tag', () => {
    const out = serializeJsonLd({ name: '</script><script>alert(1)</script>' });
    expect(out).not.toContain('</script>');
    expect(JSON.parse(out).name).toBe('</script><script>alert(1)</script>');
  });
});
