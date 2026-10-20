# Landing page + SEO basics — design

Date: 2026-09-30
Status: approved in conversation, pending written-spec review

## Goal

Make https://budgetcofre.com understandable to a first-time visitor and findable by
search engines, so the launch channels (Product Hunt, Reddit, Search Console) have
somewhere worth sending people. Today `/` redirects straight to `/login`, there is no
`robots.txt`, no sitemap, no link-preview image, and the site title is "Cofre — Budget".

Success:
- A logged-out visitor at `/` sees a homepage that explains Cofre and leads to `/signup`.
- A logged-in visitor at `/` goes to `/dashboard`, as before.
- Google can crawl the public pages; shared links show a title, description and image.
- Every claim on the page is true of the product today.

## Decisions made with the user

- **Headline angle: automation + AI** (bank sync and Ask Cofre lead). Wasteful-spend
  and the $1M path are supporting sections.
- **Product imagery: coded mockups**, not screenshots — built from theme variables so
  they match every theme and stay sharp at any size.
- **Approach: a server-rendered page at `/` inside the existing Next.js app** (not a
  separate marketing site, not `/pricing` as the homepage), so it shares the domain,
  theme, fonts and pricing cards with the app.

## Page structure

Top to bottom; every section collapses to one column on phones.

1. **Top bar** — chest logo + "Cofre" left; Pricing, Log in, and a **Start free**
   button right. On narrow screens only the logo, Log in and Start free stay visible.
2. **Hero** — headline along the lines of "Your bank, synced. Your money questions,
   answered." One line of subtext. Buttons: **Start free** → `/signup`, **See pricing**
   → `#pricing`. Beside it (below it on phones): a coded mockup of an Ask Cofre chat
   answering "How much did I spend on dining this month?", layered over a
   synced-accounts card.
3. **Three feature blocks**, each copy + mockup, alternating sides on desktop:
   - Automatic bank sync (Plaid) — account list with "synced 2 min ago".
   - Ask Cofre AI — a chat exchange, including a proposed change the user confirms.
   - Spot wasteful spending — category breakdown with one item flagged.
4. **Path to $1M** — a band with a rising projection line and the gold script-font
   treatment from the login page.
5. **Security & trust** — only claims below under "Allowed claims".
6. **Pricing** (`id="pricing"`) — the existing `PricingCards` component, so prices always
   match checkout. Logged-out visitors: every button goes to `/signup`.
7. **FAQ** — Is it free? How does bank sync work? Is my data safe? Can I cancel? What
   does the AI see? Native `<details>` elements (no JS needed).
8. **Footer** — Privacy, Terms, Pricing, Log in, support@budgetcofre.com, ©.

### Allowed claims (verified against code and the privacy policy on 2026-09-30)

- Bank connections go through Plaid; Cofre never sees or stores bank passwords.
- Bank access tokens and Gmail tokens are encrypted at rest (AES-256-GCM); all traffic
  is HTTPS; passwords are bcrypt-hashed.
- Cofre does not sell data or use it for advertising.
- Bank or Gmail can be disconnected at any time from Settings.
- Ask Cofre is powered by Anthropic's Claude. When you ask a question it reads your
  transactions, categories, budgets, accounts, debts and net-worth goal to answer. It
  can only *propose* changes (categorize, create a category, set a budget, set the goal
  date) that you confirm; it cannot move money or pay bills.
- Free plan is free forever; Pro/Elite have a 15-day free trial, cancel any time.

Not allowed: user counts, testimonials, ratings, "bank-level security", or any number
we can't back up.

### Privacy policy fix (required by the claims above)

The privacy policy's third-party list omits **Anthropic** (Ask Cofre) and **Stripe**
(payments). Add both to section 4, and add a short paragraph to section 1 describing
what Ask Cofre sends to Anthropic. Without this, the FAQ answer contradicts the policy.

## SEO and link previews

- **Metadata** — root `layout.tsx` gets `metadataBase: https://budgetcofre.com`, a
  title template (`%s · Cofre`) and default title/description; the homepage sets its
  own title ("Cofre — Budgeting on autopilot, with an AI that answers your money
  questions") and a ~155-character description; canonical URL; Open Graph + Twitter
  card tags.
- **`app/robots.ts`** — allow `/`, `/pricing`, `/privacy`, `/terms`, `/signup`,
  `/login`; disallow the app routes and `/api/`; link the sitemap.
- **`app/sitemap.ts`** — the six public pages.
- **`app/opengraph-image.tsx`** — generated 1200×630 image: chest logo, "Cofre",
  headline, navy background. No static file to maintain.
- **JSON-LD** — a `SoftwareApplication` block (category FinanceApplication) with the
  Free/Pro/Elite offers, rendered in the homepage.

## Routing

- `middleware.ts`: add `/` to `PUBLIC_PATHS`; when the session token is valid and the
  path is `/`, redirect to `/dashboard` (same as `/login` today).
- `app/page.tsx`: replace the redirect with the landing page. It stays a server
  component; interactive bits (the pricing cards' click handlers) live in a small
  client wrapper.
- `robots.txt`, `sitemap.xml` and the OG image already bypass the middleware (its
  matcher skips paths containing a dot, and Next serves `opengraph-image` under a
  hashed path handled the same way — verify during implementation).

## Components

New, under `apps/web/src/components/landing/`:
- `LandingNav`, `LandingHero`, `FeatureBlock`, `WealthPathBand`, `TrustSection`,
  `LandingPricing` (client wrapper around `PricingCards`), `LandingFaq`, `LandingFooter`.
- `mockups/` — `ChatMockup`, `AccountsMockup`, `SpendingMockup`, `ProjectionMockup`.
  Pure presentational, fake data, `aria-hidden` wrappers with a text alternative on the
  figure.

Theme rules from CLAUDE.md apply: consume only CSS variables, no hardcoded theme colors;
chart-like mockups use the identity palette (green/sky/orange/amber/violet), never
blue/indigo as series colors.

## Testing

- Vitest unit tests for the middleware routing: logged-out `/` passes through,
  logged-in `/` → `/dashboard`, a protected route still redirects to `/login`.
- Vitest checks on `robots.ts` and `sitemap.ts` output.
- `npm run build:web` passes; `robots.txt`, `sitemap.xml` and the OG image render.
- Browser check at 360px, 768px, 1280px and a short landscape viewport: no horizontal
  scroll, mockups scale down.
- Lighthouse on `/`: SEO and Accessibility ≥ 90.
- After deploy (user): submit the sitemap in Search Console; test a shared link in a
  preview tool.

## Out of scope

Analytics (Phase 1 item 4, separate change), blog/content pages, screenshots,
testimonials, a CMS, internationalization.

## 2026-10-20 restyle (Monarch-inspired)

The user asked for the page to follow monarch.com's structure and rhythm while
keeping Cofre's dark Cobalt palette and glass cards. Changes, all in
`components/landing/` and `app/page.tsx`:

- **Type.** Landing headlines use Fraunces (serif, weight 300) via `next/font`,
  loaded in `app/page.tsx` only and exposed as `--font-display`; the app keeps
  Inter. Small uppercase eyebrows in the brand blue label each section.
- **Hero.** Full-bleed night-sky artwork (the auth page's three crops, swapped by
  viewport in `.landing-art`), a glass headline card bottom-left with one CTA, and
  a coded dashboard mockup on the right with the Ask Cofre card overlapping its
  bottom-left corner. Headline: "The calm way to run your money" (`HOME_HEADLINE`,
  also used by the OG image).
- **Structure.** Nav as a floating glass bar (Features, Pricing, FAQ anchors) →
  hero → four pillars (Track, Budget, Ask, Grow; each with the colour its charts
  use) → seven feature sections with floating product cards (Accounts + net-worth
  chip, Transactions, Ask Cofre, Recurring, Budgets, Goals with the gold script
  line, Cards) → trust → pricing teaser band + the real pricing cards → FAQ →
  closing CTA on the artwork → four-column footer.
- **Mockups.** New `DashboardMockup`, `TransactionsMockup`, `RecurringMockup`,
  `CardMockup`, `NetWorthChip`; the others were restyled onto `.landing-mock`.
  Still coded, fake data, `aria-hidden` with a figure label. `WealthPathBand` was
  folded into the Goals feature section and deleted.
- **Claims.** Unchanged from "Allowed claims". The recurring section says Cofre
  spots repeating charges and totals what is due; it does not claim price-increase
  alerts (the dashboard panel still marks those as coming soon).
- Faint vertical guide lines (`.landing-lines`) sit behind the pillars and trust
  sections, drawn in the theme border colour so every theme keeps them subtle.
