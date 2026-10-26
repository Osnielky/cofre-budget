import type { MetadataRoute } from 'next';
import { PLAN_PRICES } from './plans';

export const SITE_URL = 'https://budgetcofre.com';
export const SITE_NAME = 'Cofre';
export const HOME_HEADLINE = 'The calm way to run your money';
/** Under 65 characters so Google shows it whole; the longer tagline lives in the description. */
export const HOME_TITLE = 'Cofre: free budget app with an AI you can ask about your money';
export const HOME_DESCRIPTION =
  'Cofre helps you cut wasteful spending and see your path to $1M. Pro adds automatic bank sync and an AI that answers your money questions.';

/** Free calculators (no login). Paths are also the sitemap entries. */
export const TOOL_PATHS = [
  '/tools/millionaire-calculator',
  '/tools/credit-card-payoff-calculator',
  '/tools/50-30-20-budget-calculator',
] as const;

/** Competitor comparison pages; slugs match `lib/marketing/competitors.ts`. */
export const COMPARE_PATHS = [
  '/compare/monarch-money', '/compare/ynab', '/compare/copilot-money', '/compare/rocket-money',
] as const;

/** Public pages, in sitemap order. */
export const INDEXABLE_PATHS = [
  '/', '/pricing', '/signup', '/login', '/privacy', '/terms',
  '/tools', ...TOOL_PATHS, '/mint-alternative', ...COMPARE_PATHS,
] as const;

/** Signed-in areas (app/ route folders) plus the API — kept out of search results. */
export const PRIVATE_PATH_PREFIXES = [
  '/dashboard', '/transactions', '/budgets', '/goals', '/debts', '/projects',
  '/receipts', '/settings', '/ask-cofre', '/api/',
] as const;

export function robotsConfig(): MetadataRoute.Robots {
  return {
    rules: { userAgent: '*', allow: '/', disallow: [...PRIVATE_PATH_PREFIXES] },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}

export function sitemapEntries(lastModified: Date): MetadataRoute.Sitemap {
  return INDEXABLE_PATHS.map((path) => ({
    url: `${SITE_URL}${path}`,
    lastModified,
    changeFrequency: 'monthly',
    priority: path === '/' ? 1 : 0.5,
  }));
}

export function softwareAppJsonLd(): Record<string, unknown> {
  const offer = (name: string, price: number) => ({
    '@type': 'Offer', name, price: String(price), priceCurrency: 'USD',
  });
  return {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: SITE_NAME,
    url: SITE_URL,
    applicationCategory: 'FinanceApplication',
    operatingSystem: 'Web',
    description: HOME_DESCRIPTION,
    offers: [
      offer('Free', 0),
      offer('Pro (monthly)', PLAN_PRICES.pro.month),
      offer('Pro (yearly)', PLAN_PRICES.pro.year),
      offer('Elite (monthly)', PLAN_PRICES.elite.month),
      offer('Elite (yearly)', PLAN_PRICES.elite.year),
    ],
  };
}

/** Who publishes the site: feeds Google's brand panel. `sameAs` grows as profiles are created. */
export function organizationJsonLd(): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: SITE_NAME,
    legalName: 'Osmio Services',
    url: SITE_URL,
    logo: `${SITE_URL}/icon-512.png`,
    email: 'support@budgetcofre.com',
    sameAs: ['https://www.youtube.com/@budgetcofre'],
  };
}

export interface Crumb { name: string; path?: string }

/** Breadcrumb trail for a public page; the home crumb is added here. Items without a path are plain text. */
export function breadcrumbJsonLd(crumbs: Crumb[]): Record<string, unknown> {
  const all: Crumb[] = [{ name: 'Home', path: '/' }, ...crumbs];
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: all.map((c, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: c.name,
      ...(c.path ? { item: `${SITE_URL}${c.path}` } : {}),
    })),
  };
}

/** JSON for an inline <script type="application/ld+json">. Escaping `<` keeps a
 *  string value from closing the tag; JSON.parse reads < back as `<`. */
export function serializeJsonLd(data: unknown): string {
  return JSON.stringify(data).replace(/</g, '\\u003c');
}
