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

## Suggested order

Quick wins (privacy, export) → savings goals + reports (reuse existing patterns)
→ mobile responsive → bills + safe-to-spend (together) → i18n & billing last.
