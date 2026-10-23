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
- **Spending reports** — medium. Dedicated reports page (by category, by month,
  trends). Today only the dashboard chart exists; "View Reports" links to Budgets.
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
