# Goals page redesign — design

Date: 2026-10-02
Status: approved in conversation, pending written-spec review

## Goal

Rebuild `/goals` to match the user's "Your road to $1,000,000" mock: four stat cards,
a "Net worth over time" chart from the first record to today, the wealth-journey
ladder, and a "Your next step" card. The chart needs net-worth history, which the
app does not store today — so this adds daily snapshots plus a clearly labelled
estimate for the time before the first snapshot.

Success:
- The page matches the mock's structure and reads correctly on 360px, 768px and 1280px.
- The chart shows a full history on day one (estimated where needed, and visibly so)
  and becomes exact over time as snapshots accumulate.
- No number on the page is presented as real when it is estimated.

## Decisions made with the user

- **History source: snapshots + estimate (A).** Real daily snapshots from now on; months
  before the first snapshot are estimated from transactions and drawn as estimated.
- **Removed: Momentum card, Next-moves checklist, Asset mix card (A).** "Plan my next
  milestone" opens the existing target-date planner.
- **Snapshot capture: on visit (1).** No scheduler; days without a visit have no point.
- **"Update assets"** links to Settings → Bank Accounts.

## Data and API (apps/api)

### Entity `NetWorthSnapshot` → table `net_worth_snapshots`

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `userId` | varchar, indexed | matches how other user-owned tables store it |
| `date` | date | day only (`YYYY-MM-DD`) |
| `value` | numeric(14,2) | net worth on that day |
| `updatedAt` | timestamp | |

Unique `(userId, date)`. Added to `config/entities.ts` and a generated migration
listed in `migrations/index.ts`; `npm run migration:check` must pass.

### Capture

`NetWorthGoalService.get(userId)` already computes `currentNetWorth`. After computing
it, upsert today's snapshot (`ON CONFLICT (userId, date) DO UPDATE SET value`).
Last value of the day wins. A failed upsert is logged and does not fail the goal
request — the page still loads.

### `GET /net-worth-goal/history`

JWT-guarded, scoped to `req.user.id`. Response:
```json
{ "points": [{ "date": "2025-05-31", "value": 18250.00, "estimated": true }, …],
  "firstRealDate": "2026-10-02" }
```
- **Real points:** every snapshot for the user, ascending.
- **Today:** the live current net worth is always the last point (and is upserted).
- **Estimated points:** monthly, one per calendar month from the month of the user's
  earliest transaction up to the month before the first real snapshot. Computed by
  walking backward from the first real value (the earliest snapshot, or today's value
  when none exist), subtracting each month's net cash flow. Each estimated point is
  dated the last day of its month.
- **Cash-flow rule** (same as the web's `inCashFlow`): exclude transfers
  (`categoryRef.type === 'transfer'` or a `debtId`) and transactions on tracking
  accounts (`isTrackingType`).
- Estimates are computed per request and never stored. Pure function in
  `net-worth-history.math.ts`, unit-tested.

### Tests (Vitest, apps/api)
- Estimate math: months with no transactions carry the value flat; negative net worth;
  handover from estimate to the first real snapshot has no duplicate month; transfers
  and tracking-account transactions are ignored; a user with no transactions gets only
  real points.
- Service: upsert replaces same-day value; history only returns the caller's rows.
- Existing `migrations.test.ts` covers entity/migration agreement.

## Page (apps/web) — top to bottom

1. **Header** — "Your road to $1,000,000", subtitle "See how far you've come. Keep
   building what's next.", **Update assets** button → `/settings` Bank Accounts tab.
2. **Four stat cards** (4 → 2 → 1 columns):
   - Net worth — value + this month's change (▲ green / ▼ red).
   - Million goal — `% of $1,000,000` + progress bar.
   - Current level — ring with level number, "Level N · Name", "$X milestone reached".
   - Next milestone — threshold + "$X to go".
3. **Net worth over time** — range tabs 1M · 3M · 6M · YTD · 1Y · All time (default
   All time); a text label of the visible date range (no custom-date dropdown);
   recharts area chart; estimated segment dashed and lighter with legend "Estimated from
   your transactions"; green markers where a level threshold was first crossed
   ("$25K reached"); a few value labels (start, end, milestones) to avoid clutter;
   tooltip with month, net worth, change vs previous point. Summary row for the visible
   range: starting net worth, growth since start, change since start % (hidden when the
   starting value ≤ 0).
4. **Your wealth journey** — the existing 8-level ladder restyled: green ✓ for reached
   levels, blue "$46.59K · YOU" marker, padlocks for future levels, gold trophy at $1M;
   horizontal scroll on phones.
5. **Your next step** — "$X until Level N · Name", "% through this level" bar with band
   endpoints, **Plan my next milestone** opening the existing target-date input in the
   card.

Removed: `MomentumCard`, `NextMove`, `AssetMixCard` (files deleted if no other importer).

Edge states: no history → "Your history starts today" with one point; net worth < 0
→ "Level 0 · Getting started"; ≥ $1M → next-step card celebrates instead of counting.

Colours: theme variables only. The chart series uses `--color-green` (via
`useThemeColors()`), not the mock's blue — CLAUDE.md forbids `--color-primary` as a
chart series. Milestone markers use green; level ring and progress bars follow the
existing level colours.

### Web structure
- `src/lib/goals/history.ts` (pure, tested): `filterRange(points, range, now)`,
  `rangeSummary(points)`, `milestoneCrossings(points)` (first point at/above each level
  threshold), `rangeLabel(points)`.
- `src/hooks/useNetWorthHistory.ts` — fetches `/net-worth-goal/history`.
- `src/app/goals/components/`: `GoalStatCards`, `NetWorthHistoryChart`,
  `WealthJourney` (restyled), `NextStepCard`; `page.tsx` composes them.
- `vitest.config.ts` include list gains `src/lib/goals/**/*.test.ts`.

### Web tests
- `history.ts`: each range filter (incl. YTD across a year boundary), summary with
  start ≤ 0, milestone crossings only on first crossing and not for dips back below,
  estimated/real flag preserved.
- Browser check at 360×740, 768×1024, 1280×800: no horizontal page scroll, chart and
  tooltip readable, ladder scrolls on phones, planner opens.

## Out of scope

Custom date-range picker, nightly snapshot job, backfilling real history from Plaid
balance history, asset-value changes inside estimates, projections to $1M on the chart.

## 2026-10-21 restyle

The four stat tiles were replaced by one hero band (`GoalsHero`): net worth and this
month's change, a thin $0 → $1M progress line, and a level ring with the distance to
the next level, over the login night-sky art (`.goals-hero-art`). The chart keeps its
data but de-duplicates axis ticks, marks milestone crossings with small amber chips and
shows "start → today" in its subtitle. `NextStepCard` now projects: pace = average
net-worth change over the last 90 days of history (`lib/goals/pace.ts`, tested), the
month the next level and $1M are reached at that pace, and, with a target date, the
monthly growth it needs. `WealthJourney` shows the artwork clearly (`.journey-art-clear`)
with level names under each node; on phones it becomes a vertical ladder
(`.journey-art-tall`) instead of a sideways scroll. Layout: hero → chart beside next
step (xl) → journey. `JourneyStats` and the unused `HeroGoalCard` were removed.

### Wide screens (2026-10-21)

The page no longer caps its width at 1280px — on a 2560px monitor it left a third of
the screen empty. `MilestonesCard` lists every level with the month it was reached
(from history crossings, "Reached" when history starts above it) or the month it lands
at the current pace (`projectReach`; "Not at this pace" when pace is ≤ 0). Layout:
below xl it stacks; at xl it spans the chart + next-step row as a two-column list; at
2xl it becomes a third column (`minmax(0,1fr)_380px_360px`) with a one-column list.
The other pages already fill the width (audited at 2560px: dashboard, transactions,
budgets, cards, debts, projects, Ask Cofre).

### What makes up your net worth (2026-10-21)

`NetWorthMixCard` sits under "Your next step" (same column at xl and 2xl; stacked on
phones). It answers "which accounts add to the total and which take away": a donut of
asset accounts (net worth in the centre), an "Adds up" list with each account's share of
all assets, a "Takes away" list in red (liability accounts, debts you owe, overdrawn asset
accounts) with liabilities as a share of assets on a thin bar, and the sum line
`assets − liabilities = net worth`. `lib/goals/mix.ts` (`netWorthMix`, tested) does the
sorting, percentages and folds two or more slices under 3% into "Other". Slices take the
CVD-safe chart palette in order rather than the accounts' own colours (two blues
clashed). Empty state links to Settings → Accounts.

### Balanced columns (2026-10-21, later the same day)

The three-column 2xl layout left a hole under the chart while the middle column ran
long. Replaced from xl by two columns balanced by height: left (1fr) chart over the
net-worth mix in a wide form (donut beside the lists; lists two-up only at 2xl, since at
1440px they truncated names), right (380px) next step over milestones. Below xl the
wrappers dissolve (`display: contents`) and `order-*` keeps reading order: chart, next
step, mix, milestones.
