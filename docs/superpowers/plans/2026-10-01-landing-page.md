# Landing Page + SEO Basics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the `/` → `/login` redirect with a public, server-rendered landing page, and add the SEO basics (metadata, robots.txt, sitemap, link-preview image, JSON-LD) so budgetcofre.com can be found and shared.

**Architecture:** Routing decisions move out of `middleware.ts` into a pure, tested `routeDecision()` in `src/lib/route-access.ts`. All SEO data (site URL, titles, indexable paths, JSON-LD) lives in a pure, tested `src/lib/seo.ts`; Next's file conventions (`app/robots.ts`, `app/sitemap.ts`, `app/opengraph-image.tsx`) are thin wrappers over it. The landing page is a server component at `app/page.tsx` composed from presentational components in `src/components/landing/`; the only client component is the pricing wrapper.

**Tech Stack:** Next.js 16 (App Router, Turbopack), React 19, Tailwind v4, `next/og` for the OG image, Vitest (node environment) for the pure modules.

**Spec:** `docs/superpowers/specs/2026-09-30-landing-page-design.md`

## Global Constraints

- Components consume theme CSS variables only (`--color-surface`, `--color-text-primary`, `--glass-border`, …) — no hardcoded theme colors. The one exception is `app/opengraph-image.tsx`, which renders to a PNG through `next/og` (Satori) where CSS variables do not exist; it hardcodes the Cobalt values.
- `--color-primary` / `--color-indigo` are UI accents only, never chart/series colors. Mockup data series use green / sky / orange / amber / violet (`--color-card-*`).
- Every claim on the page must appear in the spec's **Allowed claims** list. No user counts, testimonials, ratings, "bank-level security", or unbackable numbers.
- Bank sync and Ask Cofre are **Pro/Elite** features (Free has neither — see `PricingCards.tsx` `PLANS`). Every place that presents them labels them "Pro"; the hero's sub-CTA line reads "Free forever plan · Pro includes a 15-day free trial".
- Responsive at 360px, 768px, 1280px and a short landscape viewport; no horizontal scroll.
- Site URL: `https://budgetcofre.com`. Homepage title: `Cofre — Budgeting on autopilot, with an AI that answers your money questions`. Title template: `%s · Cofre`.
- Vitest's web config uses an explicit `include` list (`apps/web/vitest.config.ts`) — every new test file must be added to it or it silently never runs.
- Commit locally after each task; **do not push** (the user pushes in batches).

## Review Focus

- **Stale or expired session cookie at `/`** — the visitor should see the landing page (not a redirect loop, not a dead dashboard). Pinned in Task 1 (`routeDecision('/', false)` → `allow`).
- **Link-preview image fetched by a logged-out crawler** — `/opengraph-image` has no dot, so the middleware matcher catches it; it must not redirect to `/login`, or every shared link loses its image. Pinned in Task 1.
- **App pages leaking into search results** — robots.txt must disallow every signed-in route. Pinned in Task 2 (test checks every protected route prefix is disallowed).
- **JSON-LD price drift / script injection** — prices in structured data must equal what checkout charges, and serialized JSON must not be able to close the `<script>` tag. Pinned in Task 2.
- **Phone-width layout of the mockups** — fixed-width mockup cards forcing horizontal scroll at 360px. Pinned by the explicit browser check in Task 6 (no component-test harness exists in this repo).

---

## File structure

| File | Responsibility |
|---|---|
| `src/lib/route-access.ts` (new) | `PUBLIC_PATHS`, `routeDecision(pathname, signedIn)` — the pure route-guard rule |
| `src/lib/route-access.test.ts` (new) | Tests for the above |
| `src/middleware.ts` (modify) | Calls `routeDecision`; keeps canonical-host and `/api` proxy logic |
| `src/lib/plans.ts` (new) | `PLAN_PRICES`, `TRIAL_DAYS` — single source for prices (server-importable) |
| `src/components/PricingCards.tsx` (modify) | Imports `PLAN_PRICES` instead of its local `PRICES` |
| `src/lib/seo.ts` (new) | Site constants, `robotsConfig()`, `sitemapEntries()`, `softwareAppJsonLd()`, `serializeJsonLd()` |
| `src/lib/seo.test.ts` (new) | Tests for the above |
| `src/app/robots.ts`, `src/app/sitemap.ts` (new) | Thin wrappers over `seo.ts` |
| `src/app/layout.tsx` (modify) | `metadataBase`, title template, default OG/Twitter metadata |
| `src/app/opengraph-image.tsx` (new) | Generated 1200×630 preview image |
| `src/components/landing/mockups/*.tsx` (new) | `ChatMockup`, `AccountsMockup`, `SpendingMockup`, `ProjectionMockup` — fake-data visuals |
| `src/components/landing/*.tsx` (new) | `LandingNav`, `LandingHero`, `FeatureBlock`, `WealthPathBand`, `TrustSection`, `LandingPricing`, `LandingFaq`, `LandingFooter`, `landing-styles.ts` |
| `src/app/page.tsx` (modify) | Assembles the landing page + homepage metadata + JSON-LD |
| `src/app/privacy/page.tsx` (modify) | Adds Anthropic and Stripe |
| `apps/web/vitest.config.ts` (modify) | Adds the two new test files |

All paths below are relative to `apps/web/` unless they start with `docs/`.

---

### Task 1: Route access rule + middleware

**Files:**
- Create: `src/lib/route-access.ts`
- Create: `src/lib/route-access.test.ts`
- Modify: `src/middleware.ts`
- Modify: `vitest.config.ts`

**Interfaces:**
- Produces: `PUBLIC_PATHS: readonly string[]`; `type RouteDecision = 'allow' | 'to-login' | 'to-dashboard'`; `routeDecision(pathname: string, signedIn: boolean): RouteDecision`.

- [ ] **Step 1: Write the failing test**

`src/lib/route-access.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { routeDecision } from './route-access';

describe('routeDecision', () => {
  it('shows the landing page to signed-out visitors, including ones with a stale cookie', () => {
    expect(routeDecision('/', false)).toBe('allow');
  });

  it('sends signed-in visitors from / and /login to the dashboard', () => {
    expect(routeDecision('/', true)).toBe('to-dashboard');
    expect(routeDecision('/login', true)).toBe('to-dashboard');
  });

  it('keeps marketing and legal pages public', () => {
    for (const p of ['/pricing', '/privacy', '/terms', '/signup', '/login', '/forgot-password', '/reset-password']) {
      expect(routeDecision(p, false)).toBe('allow');
    }
  });

  // No dot in the path, so the middleware matcher sees it. Crawlers have no
  // cookie; redirecting them to /login would strip the image from every shared link.
  it('lets crawlers fetch the generated link-preview image', () => {
    expect(routeDecision('/opengraph-image', false)).toBe('allow');
  });

  it('still requires a session for app pages', () => {
    for (const p of ['/dashboard', '/settings', '/transactions', '/ask-cofre']) {
      expect(routeDecision(p, false)).toBe('to-login');
      expect(routeDecision(p, true)).toBe('allow');
    }
  });

  it('does not treat a prefix of a public path as public', () => {
    expect(routeDecision('/pricing-admin', false)).toBe('to-login');
  });
});
```

Add `'src/lib/route-access.test.ts'` to the end of the `include` array in `vitest.config.ts`.

- [ ] **Step 2: Run test to verify it fails**

Run (from repo root): `npm run test:dashboard -- route-access`
Expected: FAIL — cannot resolve `./route-access`.

- [ ] **Step 3: Write the implementation**

`src/lib/route-access.ts`:
```ts
/**
 * The route guard's rule, kept pure so it can be tested without a request.
 * `signedIn` means the access_token cookie is present and usable
 * (isUsableSessionToken) — the API still verifies the signature itself.
 */
export const PUBLIC_PATHS: readonly string[] = [
  '/', '/login', '/signup', '/forgot-password', '/reset-password',
  '/privacy', '/terms', '/pricing', '/report-error', '/report-vitals',
  '/opengraph-image',
];

export type RouteDecision = 'allow' | 'to-login' | 'to-dashboard';

export function routeDecision(pathname: string, signedIn: boolean): RouteDecision {
  if (signedIn && (pathname === '/' || pathname === '/login')) return 'to-dashboard';
  if (!signedIn && !PUBLIC_PATHS.includes(pathname)) return 'to-login';
  return 'allow';
}
```

Replace the route-guard part of `src/middleware.ts` (everything from `const PUBLIC_PATHS` down to the end of `middleware`, keeping `config` unchanged) so the file reads:
```ts
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { isUsableSessionToken } from './lib/session-token';
import { proxyRequestHeaders } from './lib/proxy-headers';
import { canonicalRedirect } from './lib/canonical-host';
import { routeDecision } from './lib/route-access';

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  const canonical = canonicalRedirect(req.headers.get('host'), pathname, req.nextUrl.search);
  if (canonical) return NextResponse.redirect(canonical, 308);

  // /api/* is rewritten to the API service (next.config.js). The API authenticates
  // on its own; this only tells it which client the request came from.
  if (pathname.startsWith('/api/')) {
    return NextResponse.next({
      request: { headers: proxyRequestHeaders(req.headers, process.env.PROXY_SHARED_SECRET) },
    });
  }

  const token = req.cookies.get('access_token')?.value;
  const decision = routeDecision(pathname, !!token && isUsableSessionToken(token));

  if (decision === 'to-login') {
    const res = NextResponse.redirect(new URL('/login', req.url));
    // Clear stale cookie
    if (token) res.cookies.delete('access_token');
    return res;
  }
  if (decision === 'to-dashboard') {
    return NextResponse.redirect(new URL('/dashboard', req.url));
  }
  return NextResponse.next();
}
```
(Leave the existing `export const config = { matcher: [...] }` block as it is.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test:dashboard`
Expected: all suites PASS, including the 6 new `routeDecision` tests.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/route-access.ts apps/web/src/lib/route-access.test.ts apps/web/src/middleware.ts apps/web/vitest.config.ts
git commit -m "refactor(web): move the route guard rule into a tested routeDecision, make / public"
```

---

### Task 2: Shared prices, SEO module, robots.txt, sitemap, site metadata

**Files:**
- Create: `src/lib/plans.ts`
- Modify: `src/components/PricingCards.tsx:8-11` and every use of `PRICES`
- Create: `src/lib/seo.ts`
- Create: `src/lib/seo.test.ts`
- Create: `src/app/robots.ts`
- Create: `src/app/sitemap.ts`
- Modify: `src/app/layout.tsx:10-14`
- Modify: `vitest.config.ts`

**Interfaces:**
- Produces (`plans.ts`): `PLAN_PRICES: { pro: { month: number; year: number }; elite: { month: number; year: number } }`, `TRIAL_DAYS = 15`.
- Produces (`seo.ts`): `SITE_URL`, `SITE_NAME`, `HOME_TITLE`, `HOME_DESCRIPTION`, `HOME_HEADLINE`, `INDEXABLE_PATHS`, `PRIVATE_PATH_PREFIXES`, `robotsConfig(): MetadataRoute.Robots`, `sitemapEntries(lastModified: Date): MetadataRoute.Sitemap`, `softwareAppJsonLd(): Record<string, unknown>`, `serializeJsonLd(data: unknown): string`.

- [ ] **Step 1: Extract prices to a server-importable module**

`PricingCards.tsx` is a `'use client'` module, so a server component importing `PRICES` from it would get a client reference, not the numbers. Move them.

`src/lib/plans.ts`:
```ts
/** What checkout charges. Must match the live Stripe Price amounts
 *  (deploy/cloudbuild.yaml _STRIPE_PRICE_*); shown on the pricing cards and in
 *  the homepage's structured data. */
export const PLAN_PRICES = {
  pro: { month: 4.99, year: 47.9 },
  elite: { month: 7.99, year: 76.7 },
} as const;

/** Mirrors trial_period_days in apps/api/src/billing/billing.service.ts. */
export const TRIAL_DAYS = 15;
```

In `src/components/PricingCards.tsx`: delete the local `const PRICES: Record<...> = { ... };` block (lines 8–11), add `import { PLAN_PRICES } from '@/lib/plans';` under the `useState` import, and rename every remaining `PRICES[` to `PLAN_PRICES[` (one occurrence, in `PlanCard`: `const prices = plan.tier === 'free' ? null : PLAN_PRICES[plan.tier];`).

- [ ] **Step 2: Write the failing SEO tests**

`src/lib/seo.test.ts`:
```ts
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
```

Add `'src/lib/seo.test.ts'` to the `include` array in `vitest.config.ts`.

- [ ] **Step 3: Run test to verify it fails**

Run: `npm run test:dashboard -- seo`
Expected: FAIL — cannot resolve `./seo`.

- [ ] **Step 4: Write `seo.ts`**

`src/lib/seo.ts`:
```ts
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
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm run test:dashboard`
Expected: all suites PASS.

- [ ] **Step 6: Wire Next's file conventions and site metadata**

`src/app/robots.ts`:
```ts
import { robotsConfig } from '@/lib/seo';

export default robotsConfig;
```

`src/app/sitemap.ts`:
```ts
import type { MetadataRoute } from 'next';
import { sitemapEntries } from '@/lib/seo';

export default function sitemap(): MetadataRoute.Sitemap {
  return sitemapEntries(new Date());
}
```

In `src/app/layout.tsx`, add `import type { Metadata } from 'next';` and `import { SITE_URL, SITE_NAME, HOME_TITLE, HOME_DESCRIPTION } from '@/lib/seo';`, and replace the `metadata` export with:
```ts
export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: HOME_TITLE, template: `%s · ${SITE_NAME}` },
  description: HOME_DESCRIPTION,
  openGraph: { type: 'website', siteName: SITE_NAME, url: SITE_URL, title: HOME_TITLE, description: HOME_DESCRIPTION },
  twitter: { card: 'summary_large_image', title: HOME_TITLE, description: HOME_DESCRIPTION },
  // Favicon comes from app/icon.svg (the golden chest, matching the in-app logo).
};
```

The new title template appends ` · Cofre`, so drop the hand-written suffix from the two pages that have one, or they render as "Privacy Policy — Cofre · Cofre":
- `src/app/privacy/page.tsx:4`: `title: 'Privacy Policy — Cofre',` → `title: 'Privacy Policy',`
- `src/app/terms/page.tsx:4`: `title: 'Terms of Service — Cofre',` → `title: 'Terms of Service',`

- [ ] **Step 7: Verify robots and sitemap render**

Run `npm run dev:web`, then:
```bash
curl -s http://localhost:3000/robots.txt
curl -s http://localhost:3000/sitemap.xml | head -20
```
Expected: robots.txt lists `Disallow: /dashboard` … `Disallow: /api/` and `Sitemap: https://budgetcofre.com/sitemap.xml`; the sitemap has 6 `<url>` entries. Also open `/pricing` in the browser and confirm the cards still show $4.99 / $7.99 (monthly) and $47.90 / $76.70 (annual toggle), and that the `/privacy` tab title reads "Privacy Policy · Cofre".

- [ ] **Step 8: Commit**

```bash
git add apps/web/src/lib/plans.ts apps/web/src/lib/seo.ts apps/web/src/lib/seo.test.ts apps/web/src/app/robots.ts apps/web/src/app/sitemap.ts apps/web/src/app/layout.tsx apps/web/src/components/PricingCards.tsx apps/web/src/app/privacy/page.tsx apps/web/src/app/terms/page.tsx apps/web/vitest.config.ts
git commit -m "feat(web): robots.txt, sitemap and site metadata from a tested seo module"
```

---

### Task 3: Generated link-preview image

**Files:**
- Create: `src/app/opengraph-image.tsx`

**Interfaces:**
- Consumes: `HOME_HEADLINE`, `SITE_NAME` from `@/lib/seo`.

No unit test: the output is a PNG and there is no image-diff harness. Verified by fetching it.

- [ ] **Step 1: Write the image route**

`src/app/opengraph-image.tsx`:
```tsx
import { ImageResponse } from 'next/og';
import { HOME_HEADLINE, SITE_NAME } from '@/lib/seo';

// Satori renders this to a PNG and has no CSS variables, so the Cobalt theme's
// values are written out here. Keep them in step with globals.css :root.
export const alt = `${SITE_NAME} — ${HOME_HEADLINE}`;
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'center',
          padding: '80px', color: '#E6EDF7',
          background: 'linear-gradient(165deg, #0F1B33 0%, #0B1220 55%, #090E1C 100%)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '24px' }}>
          <svg width="96" height="96" viewBox="0 0 24 24" fill="none" stroke="#FBBF24" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3.5 10.5V9A5.5 5.5 0 0 1 9 3.5h6A5.5 5.5 0 0 1 20.5 9v1.5" />
            <rect x="3.5" y="10.5" width="17" height="10" rx="1.8" />
            <rect x="10" y="8.6" width="4" height="4.8" rx="1.1" />
            <path d="M12 14.8v1.7" />
          </svg>
          <div style={{ fontSize: 64, fontWeight: 800, letterSpacing: '0.06em' }}>{SITE_NAME}</div>
        </div>
        <div style={{ marginTop: 48, fontSize: 64, fontWeight: 700, lineHeight: 1.15, maxWidth: 980 }}>
          {HOME_HEADLINE}
        </div>
        <div style={{ marginTop: 28, fontSize: 30, color: '#94A3B8' }}>
          Bank sync · AI answers · Your path to $1M
        </div>
      </div>
    ),
    size,
  );
}
```

- [ ] **Step 2: Verify the image and its meta tags**

With `npm run dev:web` running, in a private window (signed out):
```bash
curl -s -o /tmp/og.png -w '%{http_code} %{content_type}\n' http://localhost:3000/opengraph-image
curl -s http://localhost:3000/ | grep -o '<meta property="og:image"[^>]*>'
```
Expected: `200 image/png`, and the homepage HTML has an `og:image` tag pointing at `https://budgetcofre.com/opengraph-image…`. Open `/tmp/og.png` and check the logo, name, headline and tagline are visible and not clipped. If curl returns a 307 to `/login`, Task 1's `/opengraph-image` public entry is missing — fix it there.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/opengraph-image.tsx
git commit -m "feat(web): generated link-preview image for shared links"
```

---

### Task 4: Product mockups

**Files:**
- Create: `src/components/landing/landing-styles.ts`
- Create: `src/components/landing/mockups/ChatMockup.tsx`
- Create: `src/components/landing/mockups/AccountsMockup.tsx`
- Create: `src/components/landing/mockups/SpendingMockup.tsx`
- Create: `src/components/landing/mockups/ProjectionMockup.tsx`

**Interfaces:**
- Produces: `glassCard: React.CSSProperties`, `tint(color: string, pct: number): string` from `landing-styles.ts`; default-exported components `ChatMockup`, `AccountsMockup`, `SpendingMockup`, `ProjectionMockup`, each taking `{ className?: string }`.

Presentational, fake data, no state. Each root is a `<figure>` with an `aria-label` describing what it shows; inner content is `aria-hidden`. Widths are fluid (`w-full max-w-[…]`), never fixed — that is what keeps phones free of horizontal scroll.

- [ ] **Step 1: Shared styles**

`src/components/landing/landing-styles.ts`:
```ts
import type React from 'react';

export const glassCard: React.CSSProperties = {
  background: 'var(--color-surface)',
  backdropFilter: 'var(--glass-blur)',
  WebkitBackdropFilter: 'var(--glass-blur)',
  border: 'var(--glass-border)',
  boxShadow: 'var(--glass-shadow)',
};

export const tint = (color: string, pct: number) => `color-mix(in srgb, ${color} ${pct}%, transparent)`;
```

- [ ] **Step 2: `ChatMockup`**

`src/components/landing/mockups/ChatMockup.tsx`:
```tsx
import { glassCard, tint } from '../landing-styles';

export default function ChatMockup({ className = '' }: { className?: string }) {
  return (
    <figure aria-label="Ask Cofre answering how much was spent on dining this month" className={`w-full max-w-md rounded-[var(--radius-card)] p-4 sm:p-5 ${className}`} style={glassCard}>
      <div aria-hidden="true" className="flex flex-col gap-3 text-sm">
        <div className="flex items-center gap-2 text-xs font-semibold" style={{ color: 'var(--color-text-secondary)' }}>
          <span className="w-2 h-2 rounded-full" style={{ background: 'var(--color-card-green)' }} />
          Ask Cofre
        </div>
        <p className="self-end max-w-[85%] px-3.5 py-2 rounded-2xl rounded-br-md" style={{ background: tint('var(--color-primary)', 22), color: 'var(--color-text-primary)' }}>
          How much did I spend on dining this month?
        </p>
        <div className="self-start max-w-[92%] px-3.5 py-2.5 rounded-2xl rounded-bl-md" style={{ background: 'var(--color-elevated)', color: 'var(--color-text-primary)' }}>
          <p>You&rsquo;ve spent <strong>$412.60</strong> on dining so far — <strong style={{ color: 'var(--color-card-orange)' }}>38% more</strong> than last month. Most of it is weekday lunch delivery.</p>
          <div className="mt-2.5 flex items-center justify-between gap-3 px-3 py-2 rounded-xl text-xs" style={{ border: '1px solid var(--color-border)' }}>
            <span style={{ color: 'var(--color-text-secondary)' }}>Proposed: set a $300 dining budget</span>
            <span className="shrink-0 px-2.5 py-1 rounded-full font-semibold btn-gold">Confirm</span>
          </div>
        </div>
      </div>
    </figure>
  );
}
```

- [ ] **Step 3: `AccountsMockup`**

`src/components/landing/mockups/AccountsMockup.tsx`:
```tsx
import { glassCard } from '../landing-styles';

const ACCOUNTS = [
  { name: 'Everyday Checking', mask: '4821', balance: '$3,248.17', accent: 'var(--color-card-green)' },
  { name: 'High-Yield Savings', mask: '0937', balance: '$12,560.00', accent: 'var(--color-card-sky)' },
  { name: 'Rewards Credit Card', mask: '1174', balance: '−$684.32', accent: 'var(--color-card-orange)' },
];

export default function AccountsMockup({ className = '' }: { className?: string }) {
  return (
    <figure aria-label="Three bank accounts synced automatically two minutes ago" className={`w-full max-w-md rounded-[var(--radius-card)] p-4 sm:p-5 ${className}`} style={glassCard}>
      <div aria-hidden="true">
        <div className="flex items-center justify-between text-xs mb-3">
          <span className="font-semibold" style={{ color: 'var(--color-text-secondary)' }}>Linked accounts</span>
          <span className="flex items-center gap-1.5" style={{ color: 'var(--color-card-green)' }}>
            <span className="w-1.5 h-1.5 rounded-full" style={{ background: 'var(--color-card-green)' }} />
            Synced 2 min ago
          </span>
        </div>
        <ul className="flex flex-col gap-2">
          {ACCOUNTS.map((a) => (
            <li key={a.mask} className="flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl text-sm" style={{ background: 'var(--color-elevated)', borderLeft: `3px solid ${a.accent}` }}>
              <span className="min-w-0 truncate" style={{ color: 'var(--color-text-primary)' }}>
                {a.name} <span style={{ color: 'var(--color-text-muted)' }}>••{a.mask}</span>
              </span>
              <span className="shrink-0 font-semibold tabular-nums" style={{ color: 'var(--color-text-primary)' }}>{a.balance}</span>
            </li>
          ))}
        </ul>
      </div>
    </figure>
  );
}
```

- [ ] **Step 4: `SpendingMockup`**

`src/components/landing/mockups/SpendingMockup.tsx`:
```tsx
import { glassCard, tint } from '../landing-styles';

const ROWS = [
  { label: 'Groceries', amount: 486, pct: 78, color: 'var(--color-card-green)' },
  { label: 'Dining & delivery', amount: 412, pct: 66, color: 'var(--color-card-orange)', flag: '38% over last month' },
  { label: 'Transport', amount: 198, pct: 32, color: 'var(--color-card-sky)' },
  { label: 'Subscriptions', amount: 87, pct: 14, color: 'var(--color-card-violet)', flag: '2 unused' },
];

export default function SpendingMockup({ className = '' }: { className?: string }) {
  return (
    <figure aria-label="Spending by category with dining and unused subscriptions flagged" className={`w-full max-w-md rounded-[var(--radius-card)] p-4 sm:p-5 ${className}`} style={glassCard}>
      <div aria-hidden="true" className="flex flex-col gap-3.5">
        <span className="text-xs font-semibold" style={{ color: 'var(--color-text-secondary)' }}>This month</span>
        {ROWS.map((r) => (
          <div key={r.label} className="text-sm">
            <div className="flex items-center justify-between gap-2 mb-1.5">
              <span className="min-w-0 truncate" style={{ color: 'var(--color-text-primary)' }}>{r.label}</span>
              <span className="shrink-0 tabular-nums" style={{ color: 'var(--color-text-secondary)' }}>${r.amount}</span>
            </div>
            <div className="h-2 rounded-full overflow-hidden" style={{ background: 'var(--color-elevated)' }}>
              <div className="h-full rounded-full" style={{ width: `${r.pct}%`, background: r.color }} />
            </div>
            {r.flag && (
              <span className="inline-block mt-1.5 text-[11px] font-semibold px-2 py-0.5 rounded-full" style={{ background: tint('var(--color-card-orange)', 16), color: 'var(--color-card-orange)' }}>
                {r.flag}
              </span>
            )}
          </div>
        ))}
      </div>
    </figure>
  );
}
```

- [ ] **Step 5: `ProjectionMockup`**

`src/components/landing/mockups/ProjectionMockup.tsx`:
```tsx
import { glassCard } from '../landing-styles';

// A rising net-worth path: past (solid) then projection (dashed) to $1M.
const PAST = 'M10 150 C 60 146, 100 138, 150 128';
const FUTURE = 'M150 128 C 220 110, 280 70, 330 18';

export default function ProjectionMockup({ className = '' }: { className?: string }) {
  return (
    <figure aria-label="Net worth projection rising toward one million dollars" className={`w-full max-w-md rounded-[var(--radius-card)] p-4 sm:p-5 ${className}`} style={glassCard}>
      <div aria-hidden="true">
        <div className="flex items-baseline justify-between text-xs mb-2">
          <span className="font-semibold" style={{ color: 'var(--color-text-secondary)' }}>Net worth</span>
          <span style={{ color: 'var(--color-card-green)' }}>On pace for $1M</span>
        </div>
        <svg viewBox="0 0 340 160" className="w-full h-auto">
          <line x1="10" y1="18" x2="330" y2="18" stroke="var(--color-border)" strokeDasharray="4 6" />
          <text x="12" y="12" fontSize="11" fill="var(--color-card-amber)">$1,000,000</text>
          <path d={PAST} fill="none" stroke="var(--color-card-green)" strokeWidth="3" strokeLinecap="round" />
          <path d={FUTURE} fill="none" stroke="var(--color-card-green)" strokeWidth="3" strokeLinecap="round" strokeDasharray="6 7" opacity="0.75" />
          <circle cx="150" cy="128" r="5" fill="var(--color-card-green)" />
          <circle cx="330" cy="18" r="6" fill="var(--color-card-amber)" />
        </svg>
      </div>
    </figure>
  );
}
```

- [ ] **Step 6: Type-check and commit**

Run: `npx tsc --noEmit -p apps/web/tsconfig.json`
Expected: no errors in `src/components/landing/`.

```bash
git add apps/web/src/components/landing
git commit -m "feat(web): coded product mockups for the landing page"
```

---

### Task 5: Landing page — nav, hero, features, wealth band

**Files:**
- Create: `src/components/landing/LandingNav.tsx`
- Create: `src/components/landing/LandingHero.tsx`
- Create: `src/components/landing/FeatureBlock.tsx`
- Create: `src/components/landing/WealthPathBand.tsx`
- Modify: `src/app/page.tsx` (full replacement)

**Interfaces:**
- Consumes: mockups and `glassCard`/`tint` from Task 4; `HOME_HEADLINE`, `HOME_TITLE`, `HOME_DESCRIPTION` from `@/lib/seo`; `TRIAL_DAYS` from `@/lib/plans`; `Logo` from `@/components/Logo`.
- Produces: `FeatureBlock` props `{ eyebrow: string; title: string; body: string; proBadge?: boolean; reverse?: boolean; children: React.ReactNode }`.

- [ ] **Step 1: `LandingNav`**

`src/components/landing/LandingNav.tsx`:
```tsx
import Link from 'next/link';
import Logo from '@/components/Logo';

export default function LandingNav() {
  return (
    <header className="sticky top-0 z-40" style={{ background: 'var(--header-bg)', borderBottom: '1px solid var(--color-border)', backdropFilter: 'var(--glass-blur)', WebkitBackdropFilter: 'var(--glass-blur)' }}>
      <nav aria-label="Main" className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-3">
        <Link href="/" className="flex items-center gap-2 shrink-0" style={{ color: 'var(--color-card-amber)' }}>
          <Logo size={28} />
          <span className="brand-name" style={{ color: 'var(--color-text-primary)' }}>Cofre</span>
        </Link>
        <div className="flex items-center gap-1 sm:gap-2 text-sm font-medium">
          <Link href="#pricing" className="hidden sm:inline-block px-3 py-2 rounded-lg" style={{ color: 'var(--color-text-secondary)' }}>Pricing</Link>
          <Link href="/login" className="px-3 py-2 rounded-lg" style={{ color: 'var(--color-text-secondary)' }}>Log in</Link>
          <Link href="/signup" className="btn-gold px-4 py-2 rounded-xl font-semibold whitespace-nowrap">Start free</Link>
        </div>
      </nav>
    </header>
  );
}
```

- [ ] **Step 2: `LandingHero`**

`src/components/landing/LandingHero.tsx`:
```tsx
import Link from 'next/link';
import { HOME_HEADLINE } from '@/lib/seo';
import { TRIAL_DAYS } from '@/lib/plans';
import ChatMockup from './mockups/ChatMockup';
import AccountsMockup from './mockups/AccountsMockup';

export default function LandingHero() {
  return (
    <section className="max-w-6xl mx-auto px-4 sm:px-6 pt-12 sm:pt-20 pb-16 grid lg:grid-cols-2 gap-12 items-center">
      <div>
        <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight leading-[1.08]" style={{ color: 'var(--color-text-primary)' }}>
          {HOME_HEADLINE}
        </h1>
        <p className="mt-5 text-lg max-w-xl" style={{ color: 'var(--color-text-secondary)' }}>
          Cofre pulls in every transaction automatically and lets you ask about your money in plain English —
          so you can cut the waste and see your path to $1M.
        </p>
        <div className="mt-8 flex flex-col sm:flex-row gap-3">
          <Link href="/signup" className="btn-gold px-6 py-3.5 rounded-xl font-semibold text-center">Start free</Link>
          <Link href="#pricing" className="px-6 py-3.5 rounded-xl font-semibold text-center" style={{ border: '1px solid var(--color-border)', color: 'var(--color-text-primary)', background: 'var(--color-elevated)' }}>
            See pricing
          </Link>
        </div>
        <p className="mt-4 text-sm" style={{ color: 'var(--color-text-muted)' }}>
          Free forever plan · Pro includes a {TRIAL_DAYS}-day free trial
        </p>
      </div>
      <div className="relative flex flex-col items-center lg:items-end gap-4">
        <AccountsMockup className="lg:mr-16" />
        <ChatMockup className="lg:-mt-6" />
      </div>
    </section>
  );
}
```

- [ ] **Step 3: `FeatureBlock`**

`src/components/landing/FeatureBlock.tsx`:
```tsx
import { tint } from './landing-styles';

interface FeatureBlockProps {
  eyebrow: string;
  title: string;
  body: string;
  /** Bank sync and Ask Cofre are Pro/Elite only — say so wherever they're pitched. */
  proBadge?: boolean;
  /** Mockup on the left on desktop. */
  reverse?: boolean;
  children: React.ReactNode;
}

export default function FeatureBlock({ eyebrow, title, body, proBadge, reverse, children }: FeatureBlockProps) {
  return (
    <section className="max-w-6xl mx-auto px-4 sm:px-6 py-12 sm:py-16 grid lg:grid-cols-2 gap-10 items-center">
      <div className={reverse ? 'lg:order-2' : undefined}>
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em]" style={{ color: 'var(--color-text-muted)' }}>
          {eyebrow}
          {proBadge && (
            <span className="normal-case tracking-normal px-2 py-0.5 rounded-full" style={{ background: tint('var(--color-primary)', 16), color: 'var(--color-primary)' }}>Pro</span>
          )}
        </div>
        <h2 className="mt-3 text-3xl sm:text-4xl font-bold tracking-tight" style={{ color: 'var(--color-text-primary)' }}>{title}</h2>
        <p className="mt-4 text-base sm:text-lg max-w-xl" style={{ color: 'var(--color-text-secondary)' }}>{body}</p>
      </div>
      <div className={`flex justify-center ${reverse ? 'lg:order-1 lg:justify-start' : 'lg:justify-end'}`}>{children}</div>
    </section>
  );
}
```

- [ ] **Step 4: `WealthPathBand`**

`src/components/landing/WealthPathBand.tsx`:
```tsx
import ProjectionMockup from './mockups/ProjectionMockup';
import { glassCard } from './landing-styles';

// Same gold-foil treatment the user approved on the login quote (AuthShell).
const goldText: React.CSSProperties = {
  background: 'linear-gradient(160deg, #BF953F 0%, #FCF6BA 25%, #D4A94C 50%, #FBF5B7 68%, #B38728 100%)',
  WebkitBackgroundClip: 'text',
  backgroundClip: 'text',
  color: 'transparent',
};

export default function WealthPathBand() {
  return (
    <section className="max-w-6xl mx-auto px-4 sm:px-6 py-12 sm:py-16">
      <div className="rounded-[var(--radius-card)] p-6 sm:p-10 grid lg:grid-cols-2 gap-10 items-center" style={glassCard}>
        <div>
          <p style={{ fontFamily: 'var(--font-script), cursive', fontSize: 'clamp(40px, 6vw, 64px)', lineHeight: 1.15, color: 'var(--color-text-primary)' }}>
            Every dollar, <span style={goldText}>on the way to a million.</span>
          </p>
          <p className="mt-4 text-base sm:text-lg max-w-xl" style={{ color: 'var(--color-text-secondary)' }}>
            Set a net-worth goal and Cofre shows whether you&rsquo;re ahead or behind pace — and what the money you
            stop wasting does to the date you get there.
          </p>
        </div>
        <div className="flex justify-center lg:justify-end"><ProjectionMockup /></div>
      </div>
    </section>
  );
}
```

The gold gradient stops are hardcoded because they are the approved login-page foil (copied from `AuthShell.tsx`), not a theme color — same exception AuthShell already makes.

- [ ] **Step 5: Assemble `app/page.tsx` (first half of the page)**

Replace `src/app/page.tsx` entirely:
```tsx
import type { Metadata } from 'next';
import { HOME_TITLE, HOME_DESCRIPTION, SITE_URL } from '@/lib/seo';
import LandingNav from '@/components/landing/LandingNav';
import LandingHero from '@/components/landing/LandingHero';
import FeatureBlock from '@/components/landing/FeatureBlock';
import WealthPathBand from '@/components/landing/WealthPathBand';
import AccountsMockup from '@/components/landing/mockups/AccountsMockup';
import ChatMockup from '@/components/landing/mockups/ChatMockup';
import SpendingMockup from '@/components/landing/mockups/SpendingMockup';

export const metadata: Metadata = {
  title: { absolute: HOME_TITLE },
  description: HOME_DESCRIPTION,
  alternates: { canonical: SITE_URL },
};

// Signed-in visitors never get here — middleware sends them to /dashboard.
export default function HomePage() {
  return (
    <div className="min-h-dvh overflow-x-hidden">
      <LandingNav />
      <main>
        <LandingHero />
        <FeatureBlock
          eyebrow="Automatic bank sync"
          proBadge
          title="Every transaction, without lifting a finger"
          body="Connect your banks and cards through Plaid. New transactions arrive on their own and get categorized by your rules — no spreadsheets, no CSV exports."
        >
          <AccountsMockup />
        </FeatureBlock>
        <FeatureBlock
          eyebrow="Ask Cofre"
          proBadge
          reverse
          title="Ask about your money in plain English"
          body="“Where did my money go this month?” “Can I afford this trip?” Ask Cofre looks up your real numbers to answer, and can suggest a budget or a category — nothing changes until you confirm."
        >
          <ChatMockup />
        </FeatureBlock>
        <FeatureBlock
          eyebrow="Spot the waste"
          title="See the spending you don’t need"
          body="Budgets and category trends show where your money actually goes, so the delivery habit and the forgotten subscriptions stand out."
        >
          <SpendingMockup />
        </FeatureBlock>
        <WealthPathBand />
      </main>
    </div>
  );
}
```

- [ ] **Step 6: Look at it**

Run `npm run dev:web`; open `http://localhost:3000/` in a private window (signed out). Expected: nav, hero with both mockups, three feature blocks (first two with a "Pro" badge, mockups alternating sides on desktop), wealth band. Then sign in and open `/` — expected: redirect to `/dashboard`. Copy check: every sentence matches the spec's Allowed claims.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/components/landing apps/web/src/app/page.tsx
git commit -m "feat(web): landing page hero, feature blocks and wealth band"
```

---

### Task 6: Landing page — trust, pricing, FAQ, footer, JSON-LD

**Files:**
- Create: `src/components/landing/TrustSection.tsx`
- Create: `src/components/landing/LandingPricing.tsx`
- Create: `src/components/landing/LandingFaq.tsx`
- Create: `src/components/landing/LandingFooter.tsx`
- Modify: `src/app/page.tsx`

**Interfaces:**
- Consumes: `PricingCards` default export (`{ onSelectFree: () => void; onSelectPaid: (tier, interval) => void; currentTier?: Tier }`); `softwareAppJsonLd`, `serializeJsonLd` from `@/lib/seo`; `TRIAL_DAYS`; `glassCard`, `tint`.

- [ ] **Step 1: `TrustSection`**

`src/components/landing/TrustSection.tsx`:
```tsx
import { glassCard } from './landing-styles';

// Every line here is in the spec's "Allowed claims" — don't add one that isn't.
const POINTS = [
  { title: 'Bank passwords never reach us', body: 'Banks connect through Plaid. Cofre never sees or stores your bank login.' },
  { title: 'Encrypted', body: 'Bank and Gmail access tokens are encrypted at rest (AES-256-GCM), and all traffic uses HTTPS.' },
  { title: 'Your data isn’t for sale', body: 'We don’t sell your data or use it for advertising.' },
  { title: 'You stay in control', body: 'Disconnect a bank or Gmail any time from Settings. The AI only suggests changes — you confirm them.' },
];

export default function TrustSection() {
  return (
    <section aria-labelledby="trust-heading" className="max-w-6xl mx-auto px-4 sm:px-6 py-12 sm:py-16">
      <h2 id="trust-heading" className="text-3xl sm:text-4xl font-bold tracking-tight text-center" style={{ color: 'var(--color-text-primary)' }}>
        Built to be trusted with your money data
      </h2>
      <div className="mt-10 grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {POINTS.map((p) => (
          <div key={p.title} className="rounded-[var(--radius-card)] p-5" style={glassCard}>
            <h3 className="font-semibold" style={{ color: 'var(--color-text-primary)' }}>{p.title}</h3>
            <p className="mt-2 text-sm" style={{ color: 'var(--color-text-secondary)' }}>{p.body}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
```

- [ ] **Step 2: `LandingPricing` (the only client component)**

`src/components/landing/LandingPricing.tsx`:
```tsx
'use client';

import { useRouter } from 'next/navigation';
import PricingCards from '@/components/PricingCards';
import { TRIAL_DAYS } from '@/lib/plans';

// Only signed-out visitors see the homepage, so every plan starts at signup.
// The trial itself is started from /pricing or Settings once they have an account.
export default function LandingPricing() {
  const router = useRouter();
  return (
    <section id="pricing" aria-labelledby="pricing-heading" className="max-w-6xl mx-auto px-4 sm:px-6 py-12 sm:py-16 scroll-mt-20">
      <h2 id="pricing-heading" className="text-3xl sm:text-4xl font-bold tracking-tight text-center" style={{ color: 'var(--color-text-primary)' }}>
        Simple pricing
      </h2>
      <p className="mt-3 mb-10 text-center" style={{ color: 'var(--color-text-secondary)' }}>
        Start free. Pro and Elite come with a {TRIAL_DAYS}-day free trial — cancel any time.
      </p>
      <PricingCards onSelectFree={() => router.push('/signup')} onSelectPaid={() => router.push('/signup')} />
    </section>
  );
}
```

- [ ] **Step 3: `LandingFaq`**

`src/components/landing/LandingFaq.tsx`:
```tsx
import { glassCard } from './landing-styles';
import { TRIAL_DAYS } from '@/lib/plans';

const FAQS: { q: string; a: string }[] = [
  {
    q: 'Is Cofre free?',
    a: `Yes — the Free plan is free forever and covers budgets, manual accounts, CSV import, goals and more. Automatic bank sync and Ask Cofre are part of Pro and Elite, which start with a ${TRIAL_DAYS}-day free trial.`,
  },
  {
    q: 'How does bank sync work?',
    a: 'You connect your bank through Plaid, the service many finance apps use. Plaid sends Cofre your accounts, balances and recent transactions; your bank login goes to Plaid, never to us.',
  },
  {
    q: 'Is my data safe?',
    a: 'Bank and Gmail access tokens are encrypted at rest (AES-256-GCM), passwords are hashed, and all traffic uses HTTPS. We don’t sell your data or use it for ads. You can disconnect a bank or Gmail any time.',
  },
  {
    q: 'Can I cancel?',
    a: `Any time, from Settings. Cancel during the ${TRIAL_DAYS}-day trial and you’re never charged.`,
  },
  {
    q: 'What does the AI see?',
    a: 'Ask Cofre is powered by Anthropic’s Claude. When you ask a question, it reads your transactions, categories, budgets, accounts, debts and net-worth goal to answer. It can suggest changes — like a budget or a category — but nothing changes until you confirm, and it can’t move money or pay bills.',
  },
];

export default function LandingFaq() {
  return (
    <section aria-labelledby="faq-heading" className="max-w-3xl mx-auto px-4 sm:px-6 py-12 sm:py-16">
      <h2 id="faq-heading" className="text-3xl sm:text-4xl font-bold tracking-tight text-center" style={{ color: 'var(--color-text-primary)' }}>
        Questions
      </h2>
      <div className="mt-8 flex flex-col gap-3">
        {FAQS.map((f) => (
          <details key={f.q} className="group rounded-2xl px-5 py-4" style={glassCard}>
            <summary className="cursor-pointer list-none flex items-center justify-between gap-4 font-semibold" style={{ color: 'var(--color-text-primary)' }}>
              {f.q}
              <span aria-hidden="true" className="shrink-0 transition-transform group-open:rotate-45" style={{ color: 'var(--color-text-muted)' }}>+</span>
            </summary>
            <p className="mt-3 text-sm leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>{f.a}</p>
          </details>
        ))}
      </div>
    </section>
  );
}
```

- [ ] **Step 4: `LandingFooter`**

`src/components/landing/LandingFooter.tsx`:
```tsx
import Link from 'next/link';

const LINKS = [
  { href: '/pricing', label: 'Pricing' },
  { href: '/privacy', label: 'Privacy' },
  { href: '/terms', label: 'Terms' },
  { href: '/login', label: 'Log in' },
];

export default function LandingFooter() {
  return (
    <footer className="mt-8" style={{ borderTop: '1px solid var(--color-border)' }}>
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-sm" style={{ color: 'var(--color-text-muted)' }}>
        <span>© {new Date().getFullYear()} Cofre · Osmio Services</span>
        <nav aria-label="Footer" className="flex flex-wrap justify-center gap-x-5 gap-y-2">
          {LINKS.map((l) => (
            <Link key={l.href} href={l.href} style={{ color: 'var(--color-text-secondary)' }}>{l.label}</Link>
          ))}
          <a href="mailto:support@budgetcofre.com" style={{ color: 'var(--color-text-secondary)' }}>support@budgetcofre.com</a>
        </nav>
      </div>
    </footer>
  );
}
```

- [ ] **Step 5: Finish `app/page.tsx`**

In `src/app/page.tsx`:
- Change the seo import to `import { HOME_TITLE, HOME_DESCRIPTION, SITE_URL, softwareAppJsonLd, serializeJsonLd } from '@/lib/seo';`
- Add imports:
```tsx
import TrustSection from '@/components/landing/TrustSection';
import LandingPricing from '@/components/landing/LandingPricing';
import LandingFaq from '@/components/landing/LandingFaq';
import LandingFooter from '@/components/landing/LandingFooter';
```
- After `<WealthPathBand />` inside `<main>`, add:
```tsx
        <TrustSection />
        <LandingPricing />
        <LandingFaq />
```
- After `</main>`, add:
```tsx
      <LandingFooter />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(softwareAppJsonLd()) }} />
```

- [ ] **Step 6: Responsive and behavior check**

With `npm run dev:web` running, signed out, open `/` with Chrome DevTools device toolbar at **360×740**, **740×360** (phone landscape), **768×1024** and **1280×800**. At each size:
- run in the console: `document.documentElement.scrollWidth > window.innerWidth` → must be `false` (no horizontal scroll);
- mockups shrink inside their column, no clipped text;
- nav shows logo, Log in, Start free (Pricing link hidden below 640px).
Then: click **See pricing** → scrolls to the pricing section below the sticky nav; click a plan button → `/signup`; open each FAQ item; view source and confirm one `application/ld+json` script whose offers show 4.99 / 47.9 / 7.99 / 76.7.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/components/landing apps/web/src/app/page.tsx
git commit -m "feat(web): landing page trust, pricing, FAQ, footer and structured data"
```

---

### Task 7: Privacy policy — add Anthropic and Stripe

**Files:**
- Modify: `src/app/privacy/page.tsx`

- [ ] **Step 1: Describe Ask Cofre's data use in section 1**

In `src/app/privacy/page.tsx`, after the `<p>` that starts `<strong …>Bank account data (Plaid)</strong>` (ends `…readable form.</p>`), insert:
```tsx
      <p><strong style={{ color: 'var(--color-text-primary)' }}>Ask Cofre (AI assistant)</strong> — when you use
        Ask Cofre, your question and the data it looks up to answer it (transactions, categories, budgets, accounts,
        debts and your net-worth goal) are sent to Anthropic, which provides the Claude model that writes the reply.
        Your conversations are saved in your Cofre account so you can return to them. Ask Cofre can only propose
        changes, which you must confirm; it cannot move money.</p>
      <p><strong style={{ color: 'var(--color-text-primary)' }}>Payments (Stripe)</strong> — if you subscribe to a
        paid plan, Stripe processes the payment. Your card details go directly to Stripe; Cofre never sees or stores
        your card number. We keep your Stripe customer id and subscription status.</p>
```

- [ ] **Step 2: Add both to the third-party list in section 4**

In the `<ul>` under section 4, after the `Plaid` `<li>`, insert:
```tsx
        <li><strong style={{ color: 'var(--color-text-primary)' }}>Anthropic</strong> — provides the AI model behind
          Ask Cofre, as described above.</li>
        <li><strong style={{ color: 'var(--color-text-primary)' }}>Stripe</strong> — subscription payments and
          billing.</li>
```

- [ ] **Step 3: Bump the date**

Change `<LegalPageShell title="Privacy Policy" updated="July 23, 2026">` to `updated="October 1, 2026"`.

- [ ] **Step 4: Check and commit**

Open `http://localhost:3000/privacy`; confirm the two new paragraphs and two new list items render and the date reads October 1, 2026.

```bash
git add apps/web/src/app/privacy/page.tsx
git commit -m "docs(privacy): disclose Anthropic (Ask Cofre) and Stripe (payments)"
```

---

### Task 8: Final verification

**Files:** none (fix-forward in the owning task's files if anything fails).

- [ ] **Step 1: Unit tests**

Run: `npm run test:dashboard && npm run test:api`
Expected: all PASS (`test:api` is unaffected but confirms nothing shared broke).

- [ ] **Step 2: Production build**

Run: `npm run build:web`
Expected: build succeeds; route list includes `/`, `/robots.txt`, `/sitemap.xml`, `/opengraph-image`.

- [ ] **Step 3: Lighthouse**

With the production build served (`npx nx start web` or the dev server), run Lighthouse on `http://localhost:3000/` (Chrome DevTools → Lighthouse → Mobile → SEO + Accessibility + Best practices).
Expected: SEO ≥ 90, Accessibility ≥ 90. Fix any contrast or missing-label findings in the landing components and re-run.

- [ ] **Step 4: Report**

Summarize for the user: commits made (not pushed), test/build/Lighthouse results, and the post-deploy steps they own — submit `https://budgetcofre.com/sitemap.xml` in Search Console, and paste the homepage URL into a link-preview checker (e.g. opengraph.xyz) to confirm the image.
