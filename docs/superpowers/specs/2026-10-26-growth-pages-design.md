# Growth pages: free calculators, comparison pages, conversion funnel

Written 2026-10-26. Part of the go-to-market plan
(`docs/marketing/2026-10-26-go-to-market-plan.md`). This is the first batch of
code that plan needs: public pages that earn search traffic without a login,
and the two funnel numbers the admin panel is missing.

## Goals

1. Three free calculators that answer a search query on their own and end in a
   demo link. No login, no API call.
2. One comparison page per major competitor plus a "Mint alternative" page,
   driven by one data file so prices are updated in one place and dated.
3. The admin funnel shows trial starts and paying customers for the last 30
   days, so paid channels can be judged on cost per paid user.

Non-goals: a blog, referral codes, share images, onboarding email. Those are
later phases of the plan.

## Claims

Every sentence on these pages must be true today and either appear in the
landing spec's allowed claims or be a competitor's public price with the date
it was checked. Competitor prices come from their public pricing pages and are
stored once in `lib/marketing/competitors.ts` with `pricesCheckedOn`. Pages
render "Prices checked <date>" next to every competitor price. No user counts,
no testimonials, no ratings.

## Routing and SEO

- New public prefixes `/tools` and `/compare`, plus `/mint-alternative`. The
  route guard gains prefix support (`PUBLIC_PATH_PREFIXES`), so a signed-out
  visitor reaches them and a signed-in one stays (the pages are useful either
  way; only `/` and `/login` bounce to the dashboard).
- `INDEXABLE_PATHS` in `lib/seo.ts` lists every new page so the sitemap and the
  "never disallow a sitemap page" test cover them. `robots` already allows `/`.
- Each page sets `title`, `description`, canonical and Open Graph through Next
  metadata; the root template appends "· Cofre".
- No extra JSON-LD on these pages; the one `SoftwareApplication` block on the
  homepage is enough. Structured data stays honest and small.
- The landing nav gains "Free tools" and its anchors become `/#features` so
  they work from any page. The footer gains a "Free tools" column linking the
  three calculators and the compare pages.

## Shared shell

`components/marketing/MarketingShell.tsx`: `LandingNav` on top, `LandingFooter`
at the bottom, children in `max-w-3xl` (articles) or `max-w-5xl` (tools).
Everything reads theme variables only. Checked at 375, 768 and 1440.

A `DemoCta` block ("See this with your real accounts": Start free + Try the
demo) closes every page; the demo link carries
`?utm_source=tools&utm_medium=cta&utm_campaign=<page>` so the admin panel can
attribute the entry.

## Calculators

All math lives in `apps/web/src/lib/tools/`, pure and tested with Vitest
(added to `vitest.config.ts`). Pages are client components that hold the form
state and call the pure functions. Inputs are plain numbers; invalid or empty
input shows a hint, never NaN.

### `/tools/millionaire-calculator` (`lib/tools/millionaire.ts`)

Inputs: current net worth (can be negative), monthly contribution, expected
annual return (default 7%), target (default $1,000,000).

`projectMillionaire({ netWorth, monthly, annualReturnPct, target, now })` returns
`{ months, reachDate: 'YYYY-MM' | null, milestones: { level, threshold, name, month: 'YYYY-MM' }[], series: { month, value }[] }`.
Monthly compounding at `annualReturnPct / 12`. Stops at 100 years (`null` when
never reached, e.g. zero contribution and non-positive growth). Milestones reuse
`LEVELS` from `lib/goals/levels.ts`, so the page shows the same ladder as the
Goals page. `series` is sampled yearly for the chart.

Page: result headline ("You reach $1M in Jun 2041, at 38"), the milestone table,
a sentence on what one extra $100 a month changes (computed by calling the
function twice), the demo CTA.

### `/tools/credit-card-payoff-calculator` (`lib/tools/payoff.ts`)

Inputs: balance, APR, monthly payment; optional credit limit.

`payoffPlan({ balance, aprPct, payment })` returns
`{ months, totalInterest, totalPaid, schedule: { month, interest, principal, balance }[] } | { never: true, minimumToMakeProgress }`
with monthly interest `balance * apr / 12`, payment applied after interest,
capped at 600 months. `minimumToMakeProgress` is the first month's interest plus
one dollar. `utilization(balance, limit)` is reused from `lib/cards/utilization.ts`
and rated with `utilizationRating` from `lib/cards/overview.ts`.

Page: months and total interest, a line comparing +$50 a month, utilization with
the rating and the "under 30%, ideally under 10%" guidance already used on the
Cards page, the demo CTA.

### `/tools/50-30-20-budget-calculator` (`lib/tools/rule.ts`)

Input: monthly take-home pay; optional "needs" and "wants" you already spend.

`splitIncome(takeHome)` returns `{ needs, wants, savings }` as integer cents
(50/30/20, rounding leftover onto savings). `compareToRule(takeHome, needs,
wants)` returns per bucket `{ target, actual, delta }` plus the implied savings.

Page: three tiles, an "over by $X" line per bucket when actuals are given, the
demo CTA ("Cofre computes this from your transactions every month").

## Comparison pages

`lib/marketing/competitors.ts` exports `COMPETITORS: Competitor[]` and
`COFRE_FACTS`. A `Competitor` has `slug`, `name`, `monthly`, `yearly`,
`freePlan` (string or null), `trialDays`, `platforms`, `notes` (short, factual),
`sourceUrl` (their pricing page), and the page copy fields `headline`, `intro`,
`switchReasons: string[]`, `stayReasons: string[]` (honest reasons the other app
may suit someone better). `pricesCheckedOn = '2026-10-26'`.

`app/compare/[slug]/page.tsx` is a static route (`generateStaticParams` from
`COMPETITORS`, `dynamicParams = false`, `generateMetadata`). It renders the
headline, the intro, a comparison table (price monthly, price yearly, free
plan, trial, bank sync, AI assistant, platforms, net worth tracking), the two
reason lists, the price-checked note with a link to the competitor's pricing
page, and the demo CTA.

`app/mint-alternative/page.tsx` lists every competitor and Cofre in one table
with the same data, a short "how to import your Mint CSV" paragraph (Cofre has
CSV import on the free plan), and the demo CTA.

Initial competitors and the prices checked on 2026-10-26:

| Slug | Monthly | Yearly | Free plan | Trial | Platforms |
|---|---|---|---|---|---|
| monarch-money | $14.99 | $99.99 | none | 7 days | Web, iOS, Android |
| ynab | $14.99 | $109 | none | 34 days | Web, iOS, Android |
| copilot-money | $13 | $95 | none | 30 days | iOS, macOS, web (no Android) |
| rocket-money | $7 to $14 slider | n/a | yes (limited) | none | Web, iOS, Android |

Cofre: Free forever; Pro $4.99 / $47.90; Elite $7.99 / $76.70; 15-day trial.

## Admin funnel

`AnalyticsService.traffic()` adds `funnel.trialStarts` (subscriptions created
in the last 30 days, any status) and `funnel.paying` (subscriptions currently
`active` or `past_due`, any age). Both come from the `subscriptions` table with
a raw query builder, the same way signups come from `users`. The Prospects
tiles show "Trial starts (30 days)" and the Customers tiles show "Paying
customers". Types in `lib/admin/types.ts` and the analytics test gain the two
numbers.

## Tests

- `lib/tools/*.test.ts`: the math, including never-reached, negative net
  worth, zero payment, rounding of the 50/30/20 split.
- `lib/marketing/competitors.test.ts`: every competitor has a slug, a source
  URL, and `pricesCheckedOn` is a valid date within the last 120 days (so a
  stale file fails CI instead of lying on the page).
- `lib/seo.test.ts` and `lib/route-access.test.ts`: the new paths are public
  and in the sitemap, and still not treated as prefixes of private ones.
- `analytics.service.test.ts`: trial starts and paying counts.

## Follow-ups (not in this batch)

Blog route, referral codes, milestone share image, onboarding drip, Spanish,
app store wrapper. Listed in the go-to-market plan phases 2 to 4.
