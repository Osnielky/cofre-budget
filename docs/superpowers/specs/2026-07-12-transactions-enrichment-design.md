# Transactions Page Enrichment — Design

**Status: APPROVED — scope: data-backed + recurring (no flags/priority/times).**

## Data

One extra fetch: the previous window's transactions (previous month, or the
same-length window immediately before a custom range), via the existing
`GET /transactions?from&to`. Powers stat-strip deltas and the insight card.

`recurringMap` is now built from current + previous window transactions
(two months minimum), so `buildRecurringMap`'s ≥2-months rule can actually
fire inside a one-month view — strictly better than the current
single-window map.

## Components

1. **StatStrip** (`apps/web/src/app/transactions/StatStrip.tsx`, new) —
   six tiles: Net cash flow (sky), Expenses (orange), Income (green),
   Total transactions (violet, count), Uncategorized (amber, count),
   Recurring (violet, $/mo of merchants active this month). Money deltas
   in %, count deltas absolute, direction-aware colors (expenses/recurring
   up = red; uncategorized down = green). Replaces the small summary chips.
2. **Controls** — Sort select (Date newest/oldest, Amount high/low; amount
   sorts within day groups) and Account select (All accounts / one account)
   beside the search box. Native `<select>` styled with theme tokens.
3. **Filter pills** — add `recurring` to the `Filter` union; pill order
   All · Expenses · Income · Uncategorized · Recurring. A transaction is
   recurring when `amount < 0` and `recurringMap.has(normalize(t.name))`.
4. **InsightsPanel** (existing) — new `prevTransactions` prop; DigestView
   gains, at the top: an **Insight card** (biggest category spend change vs
   previous period, links to /budgets when up) and **Spending by category**
   (mini donut + top-5 legend with $ and %, hand-rolled grouping — the
   dashboard derive helpers expect a different Transaction shape).
5. **Row polish** — the 4px income/expense bar becomes a rounded icon chip
   in the category color (category emoji; direction glyph fallback).

## Explicitly out (no data)

Flagged pill, High/Medium priority, time-of-day, bank "verified" badge.

## Verification

Playwright vs dev server, API mocked with two months of transactions
including a repeating merchant; screenshots of strip, pills, rail, rows.
