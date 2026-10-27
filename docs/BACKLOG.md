# Cofre — Backlog (Version 1)

Pending work toward the v1 feature list. Items already shipped (login,
manual income/expense, categories, monthly budget, dashboard, dark/light themes,
plus extras: bank accounts, Plaid, CSV import, projects, debts) are not listed.

## Designed & ready to build

- **Mobile-first responsive design** — spec approved, pending implementation.
  Bottom tab bar + "More" sheet on mobile, shared `AppShell`, per-page passes.
  Spec: [docs/superpowers/specs/2026-06-17-mobile-first-responsive-design.md](superpowers/specs/2026-06-17-mobile-first-responsive-design.md)

- **Credit card expert** — spec approved; phase 1 (card data: Plaid Liabilities
  sync, manual entry, `/cards` page, card goals) shipped 2026-10-15. Remaining,
  each with its own plan:
  2. Card catalog — `card_products`, seed of popular US cards, admin editing,
     account↔product linking, reward-category mapping.
  3. Advisor — rewards / payoff / balance-transfer / offer math + Ask Cofre tools
     (best card per category, debt payoff plan, new-card recommendations).
  4. Offer analysis — attach a mailer (image/PDF) or paste text in Ask Cofre,
     AI term extraction, confirm, analyze.
  5. Affiliate links — disclosed apply links on winning cards only (ranking never
     sees commission), click tracking, network feed import.

  Shipped early from phase 3 (2026-10-16): Ask Cofre `get_credit_cards` tool and
  per-account transactions, so it can compare cards on APR, interest cost,
  utilization and spend per card. It still can't compare rewards — that needs the
  phase 2 catalog.

  Cards page redesign shipped 2026-10-16 (stat tiles, Credit/Debit/All tabs,
  payment-strategy tips). Its "Coming soon" panels still need: a daily snapshot of
  card balances for the utilization-trend chart, and the phase 2 catalog for
  rewards. Debit tiles link to /transactions without an account filter — add
  `?account=` support to the Transactions page.

  Phase 1 follow-ups: card edit drawer accessibility (dialog role, Escape,
  focus, scroll lock, confirm before discarding edits); a sync landing within
  milliseconds of a manual edit can overwrite it; editing only the promo APR
  marks the purchase APR as hand-entered too; `useBankData` should 400 when no
  bank snapshot exists; tests for the `LIABILITIES` webhook branch and
  `syncLiabilitiesByExternalItemId`.
  Spec: [docs/superpowers/specs/2026-10-15-credit-card-expert-design.md](superpowers/specs/2026-10-15-credit-card-expert-design.md)

## Not started (rough effort)

- **Privacy policy** — small. Static `/privacy` page + footer link.
- **Export data** — small/medium. Endpoint to dump transactions (+ budgets/debts)
  as CSV/JSON + a download button.
- **Savings goals** — medium. New module + page; mirrors the Debts/Projects pattern.
- ~~**Spending reports**~~ — shipped 2026-10-27 as `/reports` (spec
  `docs/superpowers/specs/2026-10-27-reports-page-design.md`). Follow-ups: saved
  report presets, PDF export, scheduled email reports, comparing two arbitrary
  periods, `?account=` filter.
- **Weekly safe-to-spend number** — medium. Calc (income − bills − budgeted/spent,
  ÷ weeks left) surfaced on the dashboard. Partly depends on Bills existing.
- **Bills / reminders** — medium/large. Recurring-bill model + due dates;
  in-app/email reminders are easy, but *automatic scheduled* reminders need
  Cloud Scheduler (deferred infra).
- **Personal tax preparation** — large. Help users prepare personal taxes from
  their Cofre data: tax-category tagging of transactions, deductible-expense
  summaries, income totals, year-end report/export. Needs its own brainstorm +
  spec. When built, request "Personal tax preparation" as an added use case in
  the Plaid dashboard (approval currently filed under "Personal budgeting and
  financial advice"); investment cost basis would need the Plaid Investments product.
- **English / Spanish (i18n)** — large. i18n infra (e.g. next-intl) + translating
  every page. Touches everything; do deliberately.
- **Premium plan structure** — large. `user.plan` field exists; needs free/pro
  limits + gating + upgrade UI + billing (Stripe is its own mini-project).

## UI follow-ups (from the 2026-10-19 responsive + theme pass)

- **Insights column at `lg`** — small. The Transactions "Financial Intelligence"
  column now only renders at `xl` (below that it squeezed the list to ~250px).
  At 1024–1279px a collapsible toggle would bring it back without the squeeze.
- **Theme coverage on public pages** — small. The auth shell, landing page and
  pricing page still hardcode Cobalt blues/gold; they ignore `data-theme`.
- **Recharts container warnings** — small. Every `ResponsiveContainer` logs a
  "width(-1)/height(-1)" warning on first paint; a `minWidth={0}` or an initial
  size on the wrapper would silence it.
- **`nx lint web` fails on `dev`** — small. Pre-existing: `react-hooks/exhaustive-deps`
  "definition not found" (plugin not registered in the flat config) and several
  `no-empty-function` hits in `ThemeProvider`/`UserProvider`.

## Suggested order

Quick wins (privacy, export) → savings goals + reports (reuse existing patterns)
→ mobile responsive → bills + safe-to-spend (together) → i18n & billing last.

## Category merge follow-ups (2026-10-20)

- **Undo for a merge** — medium. Merging is one-way today. An undo would need a
  snapshot of the old category plus every row it owned (transactions, budgets,
  rules), like the AI pending-action undo payload.
- **Merge from the transactions category picker** — small. Today merge lives only
  in Settings → Categories; the row picker could offer "merge into…" when two
  near-identical names show up side by side.
- **Suggest duplicates** — medium. Flag categories with near-identical names
  (case, plural, "&" vs "and") on the Categories tab and offer merge in one click.

## Demo follow-ups (2026-10-20)

- **Billing tab in the demo** — small. Checkout shows a plain alert for demo
  visitors; a styled inline notice would match the rest of the app.
- **Demo persona switcher** — medium. One seed today (Rockefeller). A second,
  leaner persona (student / single account) would show the Free plan path.
- **Scheduled sweep** — small. Stale sandboxes are swept on `/demo/start` and at
  boot; a Cloud Scheduler ping would keep the table tidy on quiet days.
- **Hide demo users from admin stats** — small. Visitor sandboxes count as
  users in `/admin` totals until they are swept; filter `isDemo` out.

## Traffic analytics follow-ups (2026-10-21)

- **Country / device breakdown** — small. The beacon could send the viewport class; the
  API could map IP → country before hashing (no IP stored). Only worth it with volume.
- **Weekly email digest** — small. Visitors, signups and demo starts for the week, sent
  to ADMIN_EMAILS via Resend.

## Problem reports follow-ups (2026-10-21)

- Comment thread per ticket (user replies to the admin's reply) instead of one reply field.
- More than one image per report; short screen recordings.
- Slack / Discord webhook on new tickets, besides the admin email.
- Move `support_screenshots` to Cloud Storage behind the same endpoint if volume grows.
- Let signed-out visitors report from the landing page (today: the support email).
- Sidebar label could show the count of open replies the user has not read yet.

## Prospect analytics follow-ups (2026-10-23)

- Returning-visitor tracking (first-party visitor id in localStorage) to see new vs returning prospects and which pre-signup visits became customers — needs a consent notice for EU visitors and a privacy-policy change; offered and parked.
- Time on site is first-to-last view within a day; a leave beacon (`visibilitychange`) would make single-page visits measurable.
- Refresh the GeoLite2 data on a schedule (geoip-lite ships a snapshot; `npm update geoip-lite` picks up newer data).

## Growth follow-ups (2026-10-26)

Phase 1 of the go-to-market plan shipped: three free calculators under `/tools`,
compare pages under `/compare/<slug>`, `/mint-alternative`, and trial starts /
paying customers in the admin funnel. Plan:
[docs/marketing/2026-10-26-go-to-market-plan.md](marketing/2026-10-26-go-to-market-plan.md),
spec: [docs/superpowers/specs/2026-10-26-growth-pages-design.md](superpowers/specs/2026-10-26-growth-pages-design.md).

- **Monthly price check** — recurring chore. `competitors.test.ts` fails when
  `pricesCheckedOn` is 120 days old; re-check the four pricing pages and bump it.
- **Blog route** — medium. `/blog` on the same domain with MDX or plain TSX posts,
  OG image per post, sitemap entries; first ten titles are in the plan.
- **Referral program** — medium. `referrals` table, code on Settings, Stripe
  coupon at checkout, one free month of Pro for both sides.
- **Milestone share image** — small/medium. Generated 1200×630 card when a Road
  to $1M level is reached, with a share button on Goals.
- **Onboarding drip** — medium. Day 0 / 2 / 7 / 13 emails through `MailService`;
  needs a scheduler (Cloud Scheduler → admin endpoint).
- **Trial-end banner** — small. In-app notice three days before `trialEnd`.
- **Calculator chart** — small. The millionaire calculator returns a yearly
  `series`; draw it (recharts, CVD-safe palette) above the milestones.
- **Testimonials** — once real quotes exist, add them to the landing spec's
  allowed claims and to the landing page.

## International readiness (2026-10-26)

Visitors are arriving from Germany, France and India as well as the US. What
limits them today, and what was done:

- **Bank sync is US-only** — Plaid Link is pinned to the US. Now configurable:
  `PLAID_COUNTRY_CODES` (default `US`, parsed by `plaid/plaid-countries.ts`).
  To add Canada / UK / EU: enable the country for the client in the Plaid
  dashboard first, then add it to the env var in `deploy/ci-deploy.sh`. Copy on
  the landing page, pricing cards, billing tab, settings and compare pages now
  says "US banks" and points everyone else at manual accounts + CSV import.
- **Display currency** — medium/large. Accounts store a `currency` (Plaid or
  `USD`), but about 80 formatting sites in the web app print `$` with `en-US`.
  Proposed: one `currency` + `locale` preference on the user (Settings →
  Account), a single `formatMoney(cents)` in `lib/money.ts` that reads them from
  a provider, and a sweep replacing the inline templates. No conversion between
  currencies in v1: one display currency per user; a Plaid account in another
  currency shows its own code beside the amount. Needs its own spec.
- **Language (Spanish first)** — large; already listed above under i18n.
- **Dates** — `en-US` month/day order everywhere; falls out of the locale
  preference above.
- **Pricing** — Stripe charges in USD and accepts international cards; fine for
  now. Local prices (EUR, INR) are a Stripe Prices change plus `PLAN_PRICES`
  per currency, later.

## Monarch gap list (2026-10-27)

What Monarch Money offers that Cofre does not, from monarchmoney.com/features
and 2026 reviews, in the order worth closing them. Cofre already matches
Monarch on bank sync, category budgets with rollover, rules, recurring
detection, net worth, goals (Road to $1M) and beats it on AI (Ask Cofre),
credit-card expertise, projects, debts and Gmail receipts.

1. **Data export** — small. CSV/JSON of transactions, budgets, accounts, debts
   from Settings → Account. Table-stakes trust feature; also a landing claim.
2. ~~**Reports page**~~ — shipped 2026-10-27 (`/reports`): money-flow Sankey,
   insights, pace line, categories with drill-down, merchants, cash flow, net
   worth, CSV export. Data export (item 1) is partly covered by its export menu;
   a Settings-level "export everything" (accounts, budgets, debts) is still open.
3. **Recurring calendar + upcoming bills** — small/medium. Month calendar of
   expected charges (from recurring rules + detection) and an "Upcoming this
   week" strip on the dashboard. Data already exists.
4. **Savings goals** — medium. Named goals funded from an account with a target
   and date; progress from balances/transfers; separate from the $1M ladder.
5. **Alerts / notifications** — medium. Budget overspend, large transaction,
   bill due, sync broken. Email first (MailService), in-app bell second (it is
   a placeholder today). Scheduled ones need Cloud Scheduler.
6. **Light theme** — small. Every registry theme is dark; add one light entry.
7. **Two-factor auth** — small/medium. TOTP on password accounts.
8. **Household sharing** — large. Invite a partner to one budget, personal /
   partner / shared views, advisor read-only access.
9. **Investment holdings** — large. Per-holding positions, allocation and
   performance via the Plaid Investments product (needs dashboard approval);
   today only balances are tracked.
10. **Native mobile apps** — large. Cheap bridge first: PWA install prompt +
    web push (manifest already ships). Native wrappers (Capacitor) later.
11. **Flex budgeting** — medium. Monarch's second method: fixed / flexible /
    non-monthly buckets instead of per-category lines.
12. **Transaction tags** — small. Free-form tags beside categories; filter by tag.
Not worth copying: Zillow/vehicle auto-valuation (no public API; manual asset
accounts already cover it), Amazon order matching.
