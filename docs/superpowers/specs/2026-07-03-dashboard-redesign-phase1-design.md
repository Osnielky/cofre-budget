# Dashboard Redesign — Phase 1 Design

**Date:** 2026-07-03
**Status:** Approved pending user spec review
**Scope:** Phase 1 of 2. Phase 2 (recurring-expense detection + subscription tracking) is a separate spec.

## Goal

Rebuild the cofre dashboard as a dense multi-panel grid modeled on the user's 15-panel
reference screenshot, keeping cofre's existing design language (glassmorphism cards,
OLED navy, IBM Plex Sans, established accent tokens). Phase 1 ships all 18 panels;
the two panels that depend on recurring-expense detection (Recurring Timeline,
Subscription Overview) render as final-chrome empty states until Phase 2.

## Decisions (from brainstorm)

| Question | Decision |
|---|---|
| Scope | Full build toward the 15-panel reference, decomposed into 2 phases |
| Visual style | Cofre design language, screenshot's layout/density |
| Recurring/subscriptions | Auto-detect + user confirm (Phase 2) |
| Savings definition | Cumulative net surplus (income − expenses) YTD vs. a stored yearly goal |
| Fixed vs variable | `isFixed` boolean flag on Category |
| Existing panels (Projects, Accounts, Recent Transactions) | Kept, restyled — total 18 panels |
| Testing | Add vitest scoped to `apps/web/src/lib/dashboard/` (pure derivation functions only) |

## Layout

4-column CSS grid at `xl`, 2 columns at `md`, 1 column on mobile. Cards keep the
glass surface (`rgba` + `backdrop-filter`) at higher density: `p-5` padding,
compact titles + muted context line ("This month", "Last 6 months"). No numbered
panel titles.

| Row | Panels (col-span at xl) |
|---|---|
| 0 | Topbar greeting + 4 stat cards — kept as-is |
| 1 | Income vs Expenses (1) · Cash-Flow Trend (1) · Expenses by Category (1) · Category Ranking (1) |
| 2 | Budget vs Actual (1) · Daily Spending Calendar (1) · Spending Pace (1) · Income Sources (1) |
| 3 | Fixed vs Variable (1) · Recurring Timeline (1) · Savings Growth (1) · Net Worth (1) |
| 4 | Expense Change (1) · Top Merchants (1) · Subscription Overview (2) |
| 5 | Projects (2) · Accounts (1) · Recent Transactions (1) |

The current standalone Daily Spending area chart is replaced by the calendar
heatmap (panel 6); its trend story lives in panel 2.

## Per-panel data mapping

All panels derive from data the page already fetches — `transactions` (selected
month), `yearTx`, `accounts`, `budgets`, `projects`, `debts` — plus the two new
fields below. Transfer/debt-repayment and tracking-account exclusions
(`isTransfer` / `inCashFlow`) apply everywhere and move into `derive.ts` as the
single source of truth.

| # | Panel | Data → visual |
|---|---|---|
| 1 | Income vs Expenses | Existing rebuilt stacked chart (personal/project income + personal/project expense stacks, per-month net line, single $ axis) + stat strip: YTD income, expenses, net |
| 2 | Cash-Flow Trend | Last 6 months from `yearTx` → three lines (income, expenses, net) on one shared axis; zero reference line since net may go negative |
| 3 | Expenses by Category | Selected month's expenses grouped by `categoryRef` → donut with center total, legend with % + $; top 6 categories + "Other" |
| 4 | Category Ranking | Same aggregation → horizontal bars sorted desc, direct value labels |
| 5 | Budget vs Actual | `budgets` → table: category, budget, actual, progress bar. Status colors: green on-track, amber ≥ 80%, rose over 100% |
| 6 | Daily Spending Calendar | Month expenses summed per day → true calendar grid (Sun–Sat), sequential sky ramp by spend intensity, neutral cells for $0 days |
| 7 | Spending Pace | Two ring gauges: day-of-month/days-in-month vs total-spent/total-budgeted, plus projected over/under message (rose/green) |
| 8 | Income Sources | Existing Revenue Sources donut restyled with % + $ legend |
| 9 | Fixed vs Variable | Month expenses split by `category.isFixed` → proportion bar + two itemized lists. Unflagged categories count as variable |
| 10 | Recurring Timeline | Phase 1: designed empty state. Phase 2: upcoming 30 days of confirmed recurring items + "$X over next N days" strip |
| 11 | Savings Growth | Cumulative monthly net from `yearTx` → line vs dashed goal line (linear ramp to `savingsGoal` by Dec 31). Stat strip: current, goal, on-track %. Goal unset → line only + "Set a goal" affordance |
| 12 | Net Worth | `accounts` + `debts` → hero number, assets/liabilities proportion bar + itemized lists. Month delta is **approximated** as current net worth vs (current net worth − this month's net cash flow) — no balance snapshots exist in Phase 1; labeled "≈ vs last month" |
| 13 | Expense Change | Per-category month-over-month delta → diverging bars (rose = spent more, green = spent less). Rows with \|Δ\| < $5 and < 2% are collapsed under a "no meaningful change" count |
| 14 | Top Merchants | Month expenses grouped by case-insensitively normalized transaction `name` → top 5 horizontal bars |
| 15 | Subscription Overview | Phase 1: designed empty state. Phase 2: monthly total, active count, price-increase flags, 6-month trend mini-bars |
| 16 | Projects | Current logic, restyled |
| 17 | Accounts | Current logic, restyled |
| 18 | Recent Transactions | Current logic, restyled |

### Chart rules (dataviz method)

- Single dollar axis per chart; never dual-axis.
- Categorical identity uses the validated theme tokens (green, sky, orange, amber,
  violet — CVD separation validated: worst adjacent pair ΔE 16.2 deutan / 14.4
  tritan, both above the 12 target).
- Sequential (calendar heatmap): one hue (sky), dark→bright on the dark surface.
- Diverging (expense change): green/rose with neutral midpoint.
- Status colors (budget health) reserved for state, shipped with label, never
  reused as series colors.
- Legends present for ≥ 2 series; direct labels selective; tooltips on all charts.

## Backend changes (entirety of Phase 1 backend)

1. **`Category.isFixed`** — `boolean, default false` on the Category entity.
   Included in create/update DTOs and category responses. UI: "Fixed expense"
   toggle in the existing category edit form.
2. **`User.savingsGoal`** — `decimal, nullable` on the User entity. Exposed via
   the existing `/auth/me` → `useUser()` path. New endpoint
   `PATCH /api/users/me` accepting `{ savingsGoal }` (validated ≥ 0; JWT-scoped
   to the caller — no id parameter, no IDOR surface). Edited inline on the
   Savings Growth panel.

`synchronize: true` applies both columns locally on boot. **Deploy check:** the
hosted app uses a different Supabase DB than the repo `.env` — verifying both
columns exist after deploy is an explicit plan step.

## Component architecture

```
apps/web/src/
├─ lib/dashboard/
│  ├─ types.ts        # shared entity interfaces (moved out of page.tsx) + panel prop types
│  └─ derive.ts       # PURE derivation functions: raw data in → panel props out
│     monthlyCashFlow(), trendSeries(), categorySpend(), calendarDays(),
│     spendingPace(), fixedVariable(), savingsSeries(), netWorthBreakdown(),
│     expenseChanges(), topMerchants()
├─ hooks/
│  └─ useDashboardData.ts   # all fetching (6 existing endpoints + user), month state, loading
├─ components/dashboard/
│  ├─ Panel.tsx             # shared card chrome: glass surface, title, subtitle, legend slot
│  ├─ chartTheme.ts         # shared recharts axis/tooltip/grid props built from theme colors
│  └─ panels/               # 18 files, one per panel
└─ app/dashboard/page.tsx   # composition only: topbar + stat cards + grid (~200 lines)
```

**Rules:**
- Panels are presentational — props in, JSX out. No fetching, no aggregation.
- `derive.ts` is pure: no React, no ambient dates (current date passed as an
  argument). All money-classification logic lives here and only here.
- Every panel has a designed empty state; a failed fetch or empty month degrades
  card-by-card, never blanks the dashboard.

## Error handling

- `useDashboardData` keeps the existing pattern: failed fetch → empty arrays +
  `loading=false`; panels then show their empty states.
- `PATCH /api/users/me` rejects negative/non-numeric goals with 400.
- Derivations guard against divide-by-zero (no budgets → pace gauge shows
  "no budgets set" state; zero income → percentages render as 0%).

## Testing & verification

- **vitest** added to the web app, scoped to `apps/web/src/lib/dashboard/`.
  Unit tests for every derivation function: classification (transfer/tracking
  exclusions, project vs personal splits, fixed vs variable), month bucketing,
  edge cases (empty data, negative net, unset goal, single-day months of data).
- Typecheck (`tsc --noEmit`) for both changed apps.
- Visual pass: gstack screenshot of the dashboard against seeded data; check
  label collisions, overflow, dark-surface contrast.

## Out of scope (Phase 2 spec)

- Recurring-expense auto-detection (pattern scan over transaction history),
  confirm/dismiss endpoints and review UI.
- Subscription entity/panel data, price-increase tracking.
- Any balance-snapshot history.
