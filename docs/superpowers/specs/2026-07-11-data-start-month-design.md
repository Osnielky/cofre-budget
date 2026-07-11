# Data Start Month (Analysis Window) — Design

**Status: PENDING — approved design, not yet implemented.**

## Problem

Users importing historical transactions want to start their measurements from a
chosen month (e.g. May) and cut the noise of earlier months. Older transactions
and their categorizations must NOT be deleted — only hidden from every view and
excluded from every calculation. If the user later moves the boundary back (or
clears it), the old data is taken into consideration again.

## Decision (user-approved)

Server-enforced cutoff. Scope: **everything derived from transactions** —
dashboard charts, transactions list, budget "spent", project income/expense
totals. Point-in-time state (bank-account balances, debt paid/balances) and
category-suggestion hints stay untouched.

## Data model

- New nullable column `users.dataStartMonth` — `varchar(7)`, format `YYYY-MM`
  (e.g. `"2026-05"`); `null` = no cutoff, show everything.
- `synchronize: true` creates the column locally on next API start.
  **Deployed DB is a different Supabase instance** (see memory: deployed DB
  differs from repo `.env`) — column must be added there on deploy.
- No changes to transactions: no deletes, no flags. The boundary is one user
  preference; moving it back instantly restores old data everywhere.

## API enforcement points

1. `TransactionsService.findByUser` (apps/api/src/transactions/transactions.service.ts)
   — clamp `from` to `max(from, cutoff + '-01')`. This one query feeds the
   dashboard and transactions page, which derive everything client-side.
2. `BudgetsService` spent queries (apps/api/src/budgets/budgets.service.ts,
   the `tx.date >= :startDate` aggregations ~L35–46 and ~L74–89) — clamp
   `startDate`; months entirely before the cutoff show zero spent.
3. `ProjectsService` transaction totals (apps/api/src/projects/projects.service.ts
   ~L126, ~L165) — add `date >= cutoff` to the aggregations.
4. Deliberately untouched:
   - Bank-account balances and debt paid/balances (point-in-time, not period
     measures — hiding May's rent must not change what you owe).
   - `getCategoryHints` / `getProjectHints` (typing aids; also keeps old
     categorizations useful the moment the range widens).

Reading the cutoff: services load the user row (indexed PK lookup) — do NOT
read it from the JWT (stale after change).

## Settings API

- Extend existing `PATCH` profile flow: `auth.controller.ts updateProfile` +
  `UsersService.updateProfile` (same pattern as `savingsGoal`). Validate
  `null | /^\d{4}-(0[1-9]|1[0-2])$/`.
- Return `dataStartMonth` from `/auth/me`.

## Web UI

- Settings → **Data** tab: "Analysis start month" card — native
  `<input type="month">`, Save + Clear buttons, caption: "Transactions before
  this month are hidden from views and calculations — nothing is deleted;
  clear this to bring them back."
- Dashboard month navigation: clamp the `‹` lower bound (`isEarliestMonth` in
  apps/web/src/app/dashboard/page.tsx) to the cutoff so hidden months can't be
  navigated into.
- Optional (not committed to): "N transactions hidden" badge on the
  transactions page.

## Verification plan

No test runner configured. Build the API, then Playwright against the dev
server (existing pattern: forge `access_token` cookie — middleware doesn't
verify signatures — and mock `**/api/**` routes for pure-UI checks; for
end-to-end, use a real login + seeded data):

1. Seed mock transactions Jan–Jul; set cutoff to May.
2. Dashboard totals/charts start at May; transactions page shows nothing older.
3. Budget spent for pre-cutoff months is zero; project totals shrink accordingly.
4. Clear the cutoff → old months return everywhere.
