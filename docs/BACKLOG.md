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
- **English / Spanish (i18n)** — large. i18n infra (e.g. next-intl) + translating
  every page. Touches everything; do deliberately.
- **Premium plan structure** — large. `user.plan` field exists; needs free/pro
  limits + gating + upgrade UI + billing (Stripe is its own mini-project).

## Suggested order

Quick wins (privacy, export) → savings goals + reports (reuse existing patterns)
→ mobile responsive → bills + safe-to-spend (together) → i18n & billing last.
