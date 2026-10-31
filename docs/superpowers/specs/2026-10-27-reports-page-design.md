# Reports page — design

**Date:** 2026-10-27 · **Status:** approved in conversation, built the same day
**Route:** `/reports` (protected) · **Nav:** sidebar "Reports" after Transactions;
the dashboard's "View reports" buttons point here (they pointed at Budgets).

## Goal

Answer "where did my money go, and how is that changing?" for any period, in
one place, with the same cash-flow rules as the dashboard and budgets
(`inCashFlow`: no transfers, no savings moves, no tracking accounts; project
rows bucket by project category). Everything is computed client-side in pure,
tested code (`lib/reports/`); no AI call, no new API.

What makes it better than the usual reports tab:

1. **Money flow (Sankey)** — income sources → Cash → spending categories →
   Saved, in one picture. A deficit shows as a "Savings & credit" source.
2. **Plain-language insights** — rule-based sentences computed from the period
   vs the previous one: savings-rate change, biggest category rise/fall, new
   merchants, top-merchant share, largest expense, weekend share, no-spend
   days, uncategorized money. Each is a fact with its number, never a guess.
3. **Pace line** — cumulative spending by day of period, this period vs the
   previous one, so "am I ahead of last month" is visible on day 10.
4. **Merchant intelligence** — totals, counts, average ticket, change vs
   previous period, a per-month sparkline and a "New" badge.
5. **Drill-down without leaving the page** — click a category to open its
   monthly trend, its merchants and its transactions inline.
6. **Export** — the current table (categories, merchants, months, or the
   period's transactions) downloads as CSV.
7. **Phone-first** — the same page works at 375px: scrollable tabs, stacked
   charts, rows instead of tables.

## Period model (`lib/reports/range.ts`)

Presets: This month · Last month · 3M · 6M · YTD · 12M · Custom (two dates).
`resolveRange(preset, now, custom?)` returns `from`, `to` (YYYY-MM-DD,
inclusive), the month keys spanned, the day count, a label, and the previous
period (`prevFrom`/`prevTo`): the same number of whole months immediately
before for month presets, the same number of days for custom. Every delta on
the page is "vs previous period" and says so.

## Data (`hooks/useReportsData.ts`)

One request for transactions from `prevFrom` to `to` (`limit=20000`), split
client-side into current and previous; plus accounts, projects and the net
worth history (`/net-worth-goal/history`, already used by Goals). Reloads
when the range changes.

## Calculations (`lib/reports/compute.ts`, all pure, all tested)

| Function | Output |
|---|---|
| `summarize(cur, prev, days)` | income, spending, net, savings rate, transaction count, average daily spend, and the previous period's values |
| `monthlySeries(txs, months)` | income / spending / net per month key (spans years) |
| `categoryRows(cur, prev, dir, projects)` | per bucket: value, share, count, previous value, % change |
| `categoryStack(txs, months, dir, projects, topN)` | per-month values for the top N buckets + Other, for the stacked chart |
| `merchantRows(cur, prev, months, dir)` | per merchant (case/space-normalised name): total, count, average, previous total, % change, new flag, per-month series |
| `moneyFlow(cur, projects, maxCats)` | Sankey nodes and links |
| `insights(cur, prev, range, projects)` | ordered list of `{ tone, text }` facts |
| `weekdayProfile(txs, range)` | spend per weekday with the average per occurrence |
| `cumulativeSpend(cur, prev, range, now)` | day-of-period cumulative series for both periods; current stops at today |
| `largestTransactions(cur, n)` | biggest expenses in the period |
| `csv.ts: toCsv(columns, rows)` | RFC-4180 quoting, BOM for Excel |

## Page (`app/reports/page.tsx`, `components/reports/`)

```
 Reports                              [This month][Last month][3M][6M][YTD][12M][Custom]
 Oct 1 – Oct 27, 2026 · vs Sep 2026                        [Export CSV] [Ask Cofre]
 ┌ Income ─┐ ┌ Spending ┐ ┌ Net ──────┐ ┌ Savings rate ┐   KPI tiles, delta vs prev, sparkline
 [Overview] [Spending] [Income] [Merchants] [Cash flow] [Net worth]
```

- **Overview:** Money flow Sankey · Insights list · Pace line.
- **Spending:** category list (bar, share, delta chip; click → inline drill:
  monthly trend, merchants, transactions) · stacked monthly chart (top 6 +
  Other) · weekday profile · largest expenses.
- **Income:** same list + stacked chart for income buckets.
- **Merchants:** searchable table (phone: rows) with sparklines and New badges.
- **Cash flow:** income vs spending bars with net line across the range, and
  a month table.
- **Net worth:** the Goals history line for the period with start/end/change.

Charts use `useThemeColors()` and the CVD-safe identity palette; category
colours come from the categories themselves (as on the dashboard).

## Controls added 2026-10-29 (`lib/reports/state.ts`, tested)

- **URL state.** Tab, period, custom dates, account, grouping, sort and the
  open row live in the query string (`tab`, `period`, `from`, `to`,
  `account`, `by`, `sort`, `open`); defaults are omitted so `/reports` stays
  clean. Back works inside the page, a view can be shared, and other pages
  can deep-link (`/reports?tab=spending&period=3m&by=wantNeed`). Unknown
  values fall back to defaults.
- **Account filter.** A select beside the period presets; it filters the
  transactions before every calculation, so KPIs, Sankey, insights and
  exports describe just that account. The Net worth tab ignores it and says
  so. The Ask Cofre prompt and the CSV file names carry the account.
- **Grouping ("View by").** Spending rows and the stacked chart group by
  category (dashboard bucketing), account, needs vs wants (`wantNeed` on the
  category) or fixed vs flexible (`isFixed`); rows without a category land in
  "Not classified yet". Income offers category and account.
  `makeGrouper(by, projects)` builds the bucketer; `categoryRows` and
  `categoryStack` accept it.
- **Sort.** By amount (default) or by change — biggest absolute move vs the
  previous period first, up or down (`sortRows`).
- **Question chips.** "Where did my money go?", "What changed?", "Who do I pay
  the most?", "Needs or wants?", "Fixed or flexible?", "Am I saving?". Each
  only sets tab/grouping/sort and keeps the period and account; the chip
  shows as active while the state matches it.
- **Deep link to Transactions.** The open row's drill-down ends in "See all N
  transactions in Transactions →" with `from`, `to`, `account` and, for a
  budget category, `category` (Uncategorized → `filter=uncategorized`). The
  Transactions page reads those parameters once on mount.

## Out of scope (follow-ups)

Saved/custom report presets, PDF export, scheduled email reports, comparing
two arbitrary periods, budget-vs-actual history (Budgets page owns that).
