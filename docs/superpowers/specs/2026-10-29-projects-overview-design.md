# Projects overview — design

Date: 2026-10-29
Status: built

## Problem

The Projects page was a master/detail split: a 384px list of small cards on the
left (five projects, then empty space) and the detail squeezed into the rest, with
a 12-tile category grid that was mostly "No transactions". Each list card showed
one number. The owner asked for a layout that saves space and shows more about each
project, especially now that trading projects carry a Performance section with
tables and charts that need width.

## Decision

One view at a time.

### Overview (landing)

- **Portfolio strip**: active / closed count, cost basis, income and net across
  every project. `lib/projects/overview.ts` → `portfolioTotals()` (a sold project's
  sale price counts as income; its purchase price counts as a cost).
- **One card per project** in a grid (1 column on phones, 2 from `sm`, 3 from `xl`,
  4 from `2xl`): icon or image, name, type chip, status, three headline figures
  chosen by type (`headlineFigures()`), a six-month sparkline of cumulative net
  (`sparklinePoints()` over `monthly` from the API), transaction count, description
  and when it last moved (`relativeDay(lastActivity)`).

  | Type | Figures |
  |---|---|
  | vehicle / property / other, held | Cost basis · Income · Held since |
  | sold | Net gain · Sold for · ROI |
  | business / service | Net · Income · ROI on cost basis |
  | trading, accounts linked | Realized P&L · Win rate · Accounts + closed trades (from `/investments/performance?projectId=`, fetched once per card and cached) |
  | trading, no accounts | Net result · Payouts & profits · Costs |

- Cards sort active first, then by last activity. Closed projects hide behind a
  "Show sold & terminated" toggle, as before.
- Clicking a card opens the detail.

### Detail (full width)

- A **back bar**: "← All projects" plus a horizontal strip of the other projects,
  so switching stays one click. Works at every width; the phone-only back button is
  gone.
- The header, KPI tiles, charts, Performance section, categories and linked
  transactions are unchanged except for the **category grid**: only categories with
  transactions render as tiles; the rest fold into one "+N unused categories" chip
  (`showUnusedCats` per project). All show when none is used yet or while the Add
  form is open. The grid goes to 4 columns from `lg` and 6 from `2xl`.

### API

`ProjectWithStats` gains `lastActivity` (latest linked transaction date) and
`monthly` (trailing six calendar months, every month present, income / expenses /
net) from `projects/activity.ts` (`activitySummary()`, pure, tested). The list
endpoint computes it from the transactions it already loads in one query.

## Not done

- Per-type sort or filter chips on the overview.
- Drag to reorder cards.
