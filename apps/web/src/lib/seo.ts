import type { MetadataRoute } from 'next';
import { PLAN_PRICES } from './plans';

export const SITE_URL = 'https://budgetcofre.com';
export const SITE_NAME = 'Cofre';
export const HOME_HEADLINE = 'Your bank, synced. Your money questions, answered.';
export const HOME_TITLE = 'Cofre — Budgeting on autopilot, with an AI that answers your money questions';
export const HOME_DESCRIPTION =
  'Cofre syncs your bank transactions automatically and answers your money questions with AI, so you can cut wasteful spending and see your path to $1M.';

/** Public pages, in sitemap order. */
export const INDEXABLE_PATHS = ['/', '/pricing', '/signup', '/login', '/privacy', '/terms'] as const;

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

/** JSON for an inline <script type="application/ld+json">. Escaping `<` keeps a
 *  string value from closing the tag; JSON.parse reads < back as `<`. */
export function serializeJsonLd(data: unknown): string {
  return JSON.stringify(data).replace(/</g, '\\u003c');
}
