# Net Worth Goal ($1,000,000)

**Date:** 2026-08-14
**Status:** Approved for planning

## Problem

Cofre's mission is to help users grow net worth toward $1,000,000 (see product mission). Today the only "goal" concept is `User.savingsGoal` — an arbitrary dollar figure the user types into `SavingsGrowthPanel`, tracked against *cumulative income-minus-expenses this calendar year* (a cash-flow measure that resets every January and has nothing to do with actual account balances). It doesn't reflect real net worth, doesn't persist across years, and isn't the app's actual mission target.

## Goal

Replace the arbitrary savings-goal concept with a single, fixed mission: track progress toward **$1,000,000 net worth**, computed from real account balances (the same assets − liabilities + receivables math that already powers `NetWorthPanel`). The user can set/change a target *date* for pacing, but not the target *amount* — there is only one goal in the app.

## Non-goals

- Multiple concurrent goals, or goals for anything other than net worth (no per-category goals, no debt-payoff goals) — that's what `Budget` already covers for categories.
- A configurable target amount — it's always $1,000,000.
- Historical net worth snapshots/charting over time — out of scope for this pass; pacing math uses a single baseline point (see below), not a full time series.

## Data model

Extend `User` (`apps/api/src/users/user.entity.ts`), removing `savingsGoal` and adding:

| Field | Type | Notes |
|---|---|---|
| `netWorthGoalTargetDate` | `date \| null` | User-set target date for reaching $1,000,000 |
| `netWorthGoalBaselineValue` | `decimal \| null` | Net worth snapshot captured the moment a target date is first set |
| `netWorthGoalBaselineDate` | `date \| null` | When that snapshot was taken |

Baseline is captured once, when `netWorthGoalTargetDate` transitions from `null` to a value. Changing the date afterward does not move the baseline — pacing stays measured against the original starting point. Clearing the date (`null`) wipes the baseline too, so setting a new date later starts a fresh baseline.

## API

New module `apps/api/src/net-worth-goal/` (service + controller), guarded by `JwtAuthGuard`, scoped to `req.user.id`:

- **`GET /net-worth-goal`** — returns:
  ```
  {
    target: 1000000,
    current: number,        // reuses the existing assets − liabilities + receivables calc
    targetDate: string | null,
    baselineValue: number | null,
    baselineDate: string | null,
    onTrackPct: number | null,     // null when no targetDate set
    projectedDate: string | null,  // null when no targetDate set or no progress yet
  }
  ```
  `current` is computed server-side from the user's `BankAccount` and `Debt` records, mirroring `netWorthBreakdown()` in `apps/web/src/lib/dashboard/derive.ts` (assets − liabilities, liabilities by magnitude, open debts counted as receivables).

  `onTrackPct` = (actual progress since baseline) / (required progress at this point in time to hit target by `targetDate`) × 100, i.e. `(current - baselineValue) / ((target - baselineValue) * elapsedFraction)`, where `elapsedFraction` is time-since-baseline over total-time-to-target. `projectedDate` extrapolates the current linear rate `(current - baselineValue) / daysSinceBaseline` forward to reach `target`.

  Edge cases: `current >= target` → `onTrackPct: 100`, `projectedDate` = today. `elapsedFraction` of 0 (baseline set today) → `onTrackPct: null` (not enough time elapsed to judge pace). Zero or negative progress rate → `projectedDate: null` (can't project reaching the goal).

- **`PATCH /net-worth-goal`** — body `{ targetDate: string | null }`.
  - Setting a date for the first time (previous value `null`): stamps `netWorthGoalBaselineValue` = current net worth, `netWorthGoalBaselineDate` = today.
  - Changing an already-set date: updates `targetDate` only, baseline untouched.
  - Setting to `null`: clears `targetDate`, `netWorthGoalBaselineValue`, and `netWorthGoalBaselineDate` together.

## Frontend

### Dashboard (`apps/web/src/components/dashboard/panels/SavingsGrowthPanel.tsx`)

Replaced by a compact **"Progress to $1M"** panel:
- Current net worth, % of $1,000,000, on-track badge (green/amber, same visual language as today's "On track" stat).
- Target date shown if set, otherwise a prompt to set one.
- Clicking through navigates to the new `/goals` page.

`apps/web/src/app/dashboard/page.tsx` drops its `savingsSeries`/`user?.savingsGoal` wiring (lines ~70, ~92) in favor of fetching `GET /net-worth-goal`.

### New page `apps/web/src/app/goals/page.tsx`

- Net worth breakdown (reuses the existing assets/liabilities visualization pattern from `NetWorthPanel`).
- Large progress bar/stat: current vs. $1,000,000.
- Target date picker (inline edit, same interaction style as the old goal-editing UI in `SavingsGrowthPanel`) → `PATCH /net-worth-goal`.
- On-track % and projected reach date, with plain-language framing (e.g. "At this pace, you'll hit $1M around March 2041").

### Cleanup

- Remove `savingsGoal` from `User` entity, `UsersService.updateProfile`, `AuthController.updateProfile`, `UserProvider.tsx`'s user type, and all `savingsGoal` references in `dashboard/page.tsx` and `SavingsGrowthPanel.tsx`.
- Delete `savingsSeries()`/`SavingsStats`/`SavingsPoint` from `derive.ts` (and their test cases in `derive.test.ts`) — no longer used once the cash-flow-based panel is gone.

## Edge cases

- **No target date set:** `onTrackPct`/`projectedDate` are `null`; UI shows current net worth and % complete only, with a call-to-action to set a date.
- **Target date just set (baseline is today):** `onTrackPct` is `null` until at least a day has elapsed — UI shows "just started" rather than a misleading percentage.
- **Net worth already ≥ $1,000,000:** goal shown as achieved (100%, no projection needed) regardless of target date.
- **Net worth below baseline (lost ground):** `onTrackPct` can go below 0 or the rate can be negative — show as clearly off-track rather than clamping/hiding the number.
- **New user, no accounts yet:** current net worth is 0; setting a target date is still allowed, baseline is simply 0.

## Testing plan

No automated test runner is configured for e2e/UI flows in this repo. Plan:
1. Unit tests (Jest, matching `derive.test.ts` conventions) for the pacing/projection math — cover on-track, off-track, goal-already-met, and no-target-date cases.
2. Manual verification in the running app:
   - Set a target date with a fresh/low net worth → confirm baseline captured and on-track % renders sensibly.
   - Add/edit bank account balances → confirm current net worth and % complete update.
   - Change the target date → confirm baseline is preserved, only the date/pacing changes.
   - Clear the target date → confirm baseline clears; setting a new date later starts a fresh baseline.
   - Check dashboard panel and `/goals` page in both light and dark themes, desktop and mobile widths (per the project's responsive-design requirement).
