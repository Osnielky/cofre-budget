# Net Worth Goal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the arbitrary `savingsGoal` cash-flow tracker with a single, fixed mission — track progress toward $1,000,000 net worth, computed from real account balances, with a user-settable target date for pacing.

**Architecture:** Backend: a new `net-worth-goal` NestJS module adds three nullable columns to `User` (target date + baseline snapshot), computes current net worth by reusing the existing `BankAccountsService`/`DebtsService`, and exposes `GET`/`PATCH /net-worth-goal`. Frontend: a new `useNetWorthGoal` hook backs a compact dashboard panel (replacing the old `SavingsGrowthPanel`) and a new dedicated `/goals` page.

**Tech Stack:** NestJS 11 + TypeORM (Postgres, `synchronize: true` — no migrations needed), Next.js 16 / React 19 / Tailwind v4, Vitest for unit tests.

## Global Constraints

- All new backend routes are guarded by `@UseGuards(JwtAuthGuard)` and scoped to `req.user.id`, matching every existing module (see `apps/api/src/categorization-rules/categorization-rules.controller.ts`).
- `synchronize: true` in `apps/api/src/config/database.config.ts` means new/changed columns on an already-registered entity (`User`) apply automatically on next API start — no migration files.
- Frontend data fetching uses plain `fetch(..., { credentials: 'include' })` against `process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3333/api'` — no react-query (see `apps/web/src/hooks/useDashboardData.ts`).
- Components must only consume theme CSS variables (`--color-surface`, `--color-text-muted`, etc.) and the six chart accent colors from `useThemeColors()` (`green`, `rose`, `amber`, `orange`, `sky`, `violet`) — never hardcode colors.
- Backend unit tests: Vitest, run with `npm run test:api` (globs `apps/api/src/**/*.test.ts`). Frontend unit tests: Vitest, run with `npm run test:dashboard` (globs `apps/web/src/lib/dashboard/**/*.test.ts` among others — see `apps/web/vitest.config.ts`).
- Every page must be responsive (mobile + desktop) and correct in both light and dark themes — verify manually, no visual regression tooling exists.

---

### Task 1: `User` entity — replace `savingsGoal` with net-worth-goal columns

**Files:**
- Modify: `apps/api/src/users/user.entity.ts`
- Modify: `apps/api/src/users/users.service.ts`
- Modify: `apps/api/src/auth/auth.controller.ts`

**Interfaces:**
- Produces: `User.netWorthGoalTargetDate: string | null`, `User.netWorthGoalBaselineValue: string | null`, `User.netWorthGoalBaselineDate: string | null` — consumed by Task 3's `NetWorthGoalService`.

- [ ] **Step 1: Remove `savingsGoal` and add the three new columns on `User`**

In `apps/api/src/users/user.entity.ts`, replace:

```ts
  /* Yearly savings goal in dollars; null = not set */
  @Column({ type: 'decimal', precision: 12, scale: 2, nullable: true, default: null })
  savingsGoal: string | null;
```

with:

```ts
  /* User-set date for reaching the $1,000,000 net-worth mission; null = not set */
  @Column({ type: 'date', nullable: true, default: null })
  netWorthGoalTargetDate: string | null;

  /* Net worth snapshot captured the moment netWorthGoalTargetDate was first set */
  @Column({ type: 'decimal', precision: 12, scale: 2, nullable: true, default: null })
  netWorthGoalBaselineValue: string | null;

  /* Date netWorthGoalBaselineValue was captured */
  @Column({ type: 'date', nullable: true, default: null })
  netWorthGoalBaselineDate: string | null;
```

- [ ] **Step 2: Remove `savingsGoal` handling from `UsersService.updateProfile`**

In `apps/api/src/users/users.service.ts`, replace the whole method:

```ts
  async updateProfile(id: string, data: { name?: string; savingsGoal?: number | null }): Promise<User> {
    const patch: Partial<User> = {};
    if (typeof data.name === 'string') patch.name = data.name.trim();
    if (data.savingsGoal !== undefined) {
      if (data.savingsGoal === null) {
        patch.savingsGoal = null;
      } else {
        const n = Number(data.savingsGoal);
        if (!Number.isFinite(n) || n < 0) throw new BadRequestException('savingsGoal must be a non-negative number');
        patch.savingsGoal = n.toFixed(2);
      }
    }
    if (Object.keys(patch).length) await this.repo.update(id, patch);
    return this.repo.findOneByOrFail({ id });
  }
```

with:

```ts
  async updateProfile(id: string, data: { name?: string }): Promise<User> {
    const patch: Partial<User> = {};
    if (typeof data.name === 'string') patch.name = data.name.trim();
    if (Object.keys(patch).length) await this.repo.update(id, patch);
    return this.repo.findOneByOrFail({ id });
  }
```

`BadRequestException` is no longer used in this file after this change — remove it from the `import { Injectable, BadRequestException } from '@nestjs/common';` line at the top, leaving `import { Injectable } from '@nestjs/common';`.

- [ ] **Step 3: Drop `savingsGoal` from the profile-update endpoint**

In `apps/api/src/auth/auth.controller.ts`, replace:

```ts
  @SkipThrottle()
  @UseGuards(JwtAuthGuard)
  @Patch('profile')
  updateProfile(@Request() req: any, @Body() body: { name?: string; savingsGoal?: number | null }) {
    return this.usersService.updateProfile(req.user.id, { name: body.name, savingsGoal: body.savingsGoal });
  }
```

with:

```ts
  @SkipThrottle()
  @UseGuards(JwtAuthGuard)
  @Patch('profile')
  updateProfile(@Request() req: any, @Body() body: { name?: string }) {
    return this.usersService.updateProfile(req.user.id, { name: body.name });
  }
```

- [ ] **Step 4: Verify the API still builds**

Run: `npm run build:api`
Expected: build succeeds with no TypeScript errors (confirms no other file still references `savingsGoal` on the API side — Task 2 hasn't run yet, so this only checks Tasks 1's own edits are self-consistent).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/users/user.entity.ts apps/api/src/users/users.service.ts apps/api/src/auth/auth.controller.ts
git commit -m "feat(api): replace savingsGoal with net-worth-goal columns on User"
```

---

### Task 2: Net-worth-goal pacing math (pure functions, TDD)

**Files:**
- Create: `apps/api/src/net-worth-goal/net-worth-goal.math.ts`
- Test: `apps/api/src/net-worth-goal/net-worth-goal.math.test.ts`

**Interfaces:**
- Produces: `NET_WORTH_TARGET: number`, `computeGoalProgress(input: GoalProgressInput): GoalProgress` — consumed by Task 3's `NetWorthGoalService`.
  - `GoalProgressInput = { current: number; targetDate: string | null; baselineValue: number | null; baselineDate: string | null; now: Date }`
  - `GoalProgress = { onTrackPct: number | null; projectedDate: string | null }`

- [ ] **Step 1: Write the failing tests**

Create `apps/api/src/net-worth-goal/net-worth-goal.math.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { NET_WORTH_TARGET, computeGoalProgress } from './net-worth-goal.math';

describe('computeGoalProgress', () => {
  it('reports 100% and today when the target is already met', () => {
    const now = new Date(2026, 5, 1);
    const out = computeGoalProgress({
      current: NET_WORTH_TARGET + 500,
      targetDate: '2030-01-01', baselineValue: 200_000, baselineDate: '2025-01-01', now,
    });
    expect(out.onTrackPct).toBe(100);
    expect(out.projectedDate).toBe('2026-06-01');
  });

  it('returns nulls when no target date is set', () => {
    const out = computeGoalProgress({
      current: 50_000, targetDate: null, baselineValue: null, baselineDate: null, now: new Date(2026, 5, 1),
    });
    expect(out.onTrackPct).toBeNull();
    expect(out.projectedDate).toBeNull();
  });

  it('returns nulls when the baseline was captured today (not enough elapsed time to judge pace)', () => {
    const now = new Date(2026, 5, 1);
    const out = computeGoalProgress({
      current: 100_000, targetDate: '2030-01-01', baselineValue: 100_000, baselineDate: '2026-06-01', now,
    });
    expect(out.onTrackPct).toBeNull();
    expect(out.projectedDate).toBeNull();
  });

  it('computes on-track percentage and a projected date for steady progress', () => {
    // Baseline $0 on 2025-01-01, target $1,000,000 by 2030-01-01 (5 years = 1826 days).
    // 1 year elapsed (2026-01-01), current $200,000 — required pace at 1/5 elapsed = $200,000. Exactly on track.
    const out = computeGoalProgress({
      current: 200_000, targetDate: '2030-01-01', baselineValue: 0, baselineDate: '2025-01-01', now: new Date(2026, 0, 1),
    });
    expect(out.onTrackPct).toBeCloseTo(100, 0);
    expect(out.projectedDate).not.toBeNull();
  });

  it('flags off-track progress without clamping to zero', () => {
    // Same timeline as above but only $50,000 saved instead of the $200,000 required pace.
    const out = computeGoalProgress({
      current: 50_000, targetDate: '2030-01-01', baselineValue: 0, baselineDate: '2025-01-01', now: new Date(2026, 0, 1),
    });
    expect(out.onTrackPct).toBeCloseTo(25, 0);
  });

  it('returns a null projected date when losing ground (no positive rate to project from)', () => {
    const out = computeGoalProgress({
      current: 40_000, targetDate: '2030-01-01', baselineValue: 50_000, baselineDate: '2025-01-01', now: new Date(2026, 0, 1),
    });
    expect(out.projectedDate).toBeNull();
    expect(out.onTrackPct).toBeLessThan(0);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run --root apps/api src/net-worth-goal/net-worth-goal.math.test.ts`
Expected: FAIL — `Cannot find module './net-worth-goal.math'`

- [ ] **Step 3: Write the implementation**

Create `apps/api/src/net-worth-goal/net-worth-goal.math.ts`:

```ts
const MS_PER_DAY = 86_400_000;

export const NET_WORTH_TARGET = 1_000_000;

export interface GoalProgressInput {
  current: number;
  targetDate: string | null;
  baselineValue: number | null;
  baselineDate: string | null;
  now: Date;
}

export interface GoalProgress {
  onTrackPct: number | null;
  projectedDate: string | null;
}

function toDateOnly(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Pacing math for the fixed $1,000,000 net-worth goal.
 * - Already met: 100% on track, projected date = today.
 * - No target date, or baseline captured today (not enough elapsed time to
 *   judge pace): both fields null.
 * - Otherwise: onTrackPct compares actual progress since baseline against the
 *   progress required at this point in time to hit the target by targetDate.
 *   projectedDate extrapolates the current linear rate forward; null when the
 *   rate is zero or negative (losing ground can't be projected to a date).
 */
export function computeGoalProgress(input: GoalProgressInput): GoalProgress {
  const { current, targetDate, baselineValue, baselineDate, now } = input;

  if (current >= NET_WORTH_TARGET) {
    return { onTrackPct: 100, projectedDate: toDateOnly(now) };
  }
  if (targetDate == null || baselineValue == null || baselineDate == null) {
    return { onTrackPct: null, projectedDate: null };
  }

  const baseline = new Date(`${baselineDate}T00:00:00`);
  const target = new Date(`${targetDate}T00:00:00`);
  const elapsedMs = now.getTime() - baseline.getTime();
  const elapsedDays = elapsedMs / MS_PER_DAY;
  if (elapsedDays < 1) {
    return { onTrackPct: null, projectedDate: null };
  }

  const progressSoFar = current - baselineValue;
  const rate = progressSoFar / elapsedDays; // dollars per day
  const projectedDate = rate > 0
    ? toDateOnly(new Date(now.getTime() + ((NET_WORTH_TARGET - current) / rate) * MS_PER_DAY))
    : null;

  const totalMs = target.getTime() - baseline.getTime();
  let onTrackPct: number | null = null;
  if (totalMs > 0) {
    const elapsedFraction = Math.min(1, elapsedMs / totalMs);
    const requiredProgress = (NET_WORTH_TARGET - baselineValue) * elapsedFraction;
    onTrackPct = requiredProgress !== 0 ? +((progressSoFar / requiredProgress) * 100).toFixed(1) : null;
  }

  return { onTrackPct, projectedDate };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run --root apps/api src/net-worth-goal/net-worth-goal.math.test.ts`
Expected: PASS (6 tests)

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/net-worth-goal/net-worth-goal.math.ts apps/api/src/net-worth-goal/net-worth-goal.math.test.ts
git commit -m "feat(api): add pacing math for the net-worth goal"
```

---

### Task 3: `NetWorthGoalService`, controller, module — wire up `GET`/`PATCH /net-worth-goal`

**Files:**
- Create: `apps/api/src/net-worth-goal/net-worth-goal.service.ts`
- Create: `apps/api/src/net-worth-goal/net-worth-goal.controller.ts`
- Create: `apps/api/src/net-worth-goal/net-worth-goal.module.ts`
- Modify: `apps/api/src/app/app.module.ts`

**Interfaces:**
- Consumes: `User` entity fields from Task 1; `NET_WORTH_TARGET`, `computeGoalProgress` from Task 2; `BankAccountsService.findAllByUser(userId): Promise<(BankAccount & { txCount: number })[]>` (`apps/api/src/bank-accounts/bank-accounts.service.ts`); `isLiabilityType(t: string): boolean` (`apps/api/src/bank-accounts/account-types.ts`); `DebtsService.findAll(userId, direction?): Promise<DebtWithBalance[]>` where `DebtWithBalance` has `.status` and `.remaining` (`apps/api/src/debts/debts.service.ts`).
- Produces: `GET /net-worth-goal` → `{ target, current, targetDate, baselineValue, baselineDate, onTrackPct, projectedDate }`; `PATCH /net-worth-goal` with body `{ targetDate: string | null }` → same shape. Consumed by Task 6's `useNetWorthGoal` hook.

- [ ] **Step 1: Write `NetWorthGoalService`**

Create `apps/api/src/net-worth-goal/net-worth-goal.service.ts`:

```ts
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../users/user.entity';
import { BankAccountsService } from '../bank-accounts/bank-accounts.service';
import { isLiabilityType } from '../bank-accounts/account-types';
import { DebtsService } from '../debts/debts.service';
import { NET_WORTH_TARGET, computeGoalProgress } from './net-worth-goal.math';

@Injectable()
export class NetWorthGoalService {
  constructor(
    @InjectRepository(User) private users: Repository<User>,
    private bankAccounts: BankAccountsService,
    private debts: DebtsService,
  ) {}

  private async currentNetWorth(userId: string): Promise<number> {
    const [accounts, debts] = await Promise.all([
      this.bankAccounts.findAllByUser(userId),
      this.debts.findAll(userId),
    ]);
    const assetAccts = accounts.filter((a) => !isLiabilityType(a.accountType));
    const liabAccts = accounts.filter((a) => isLiabilityType(a.accountType));
    const receivables = debts.filter((d) => d.status === 'open').reduce((s, d) => s + Number(d.remaining), 0);
    const assets = assetAccts.reduce((s, a) => s + Number(a.balance), 0) + receivables;
    const liabilities = liabAccts.reduce((s, a) => s + Math.abs(Number(a.balance)), 0);
    return +(assets - liabilities).toFixed(2);
  }

  async get(userId: string) {
    const user = await this.users.findOneByOrFail({ id: userId });
    const current = await this.currentNetWorth(userId);
    const baselineValue = user.netWorthGoalBaselineValue != null ? Number(user.netWorthGoalBaselineValue) : null;
    const progress = computeGoalProgress({
      current,
      targetDate: user.netWorthGoalTargetDate,
      baselineValue,
      baselineDate: user.netWorthGoalBaselineDate,
      now: new Date(),
    });
    return {
      target: NET_WORTH_TARGET,
      current,
      targetDate: user.netWorthGoalTargetDate,
      baselineValue,
      baselineDate: user.netWorthGoalBaselineDate,
      onTrackPct: progress.onTrackPct,
      projectedDate: progress.projectedDate,
    };
  }

  async setTargetDate(userId: string, targetDate: string | null) {
    const user = await this.users.findOneByOrFail({ id: userId });
    if (targetDate === null) {
      user.netWorthGoalTargetDate = null;
      user.netWorthGoalBaselineValue = null;
      user.netWorthGoalBaselineDate = null;
    } else {
      if (user.netWorthGoalTargetDate == null) {
        const current = await this.currentNetWorth(userId);
        user.netWorthGoalBaselineValue = current.toFixed(2);
        user.netWorthGoalBaselineDate = new Date().toISOString().slice(0, 10);
      }
      user.netWorthGoalTargetDate = targetDate;
    }
    await this.users.save(user);
    return this.get(userId);
  }
}
```

- [ ] **Step 2: Write `NetWorthGoalController`**

Create `apps/api/src/net-worth-goal/net-worth-goal.controller.ts`:

```ts
import { Controller, Get, Patch, Body, UseGuards, Request } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { NetWorthGoalService } from './net-worth-goal.service';

@UseGuards(JwtAuthGuard)
@Controller('net-worth-goal')
export class NetWorthGoalController {
  constructor(private service: NetWorthGoalService) {}

  @Get()
  get(@Request() req: any) {
    return this.service.get(req.user.id);
  }

  @Patch()
  setTargetDate(@Request() req: any, @Body() body: { targetDate: string | null }) {
    return this.service.setTargetDate(req.user.id, body.targetDate ?? null);
  }
}
```

- [ ] **Step 3: Write `NetWorthGoalModule`**

Create `apps/api/src/net-worth-goal/net-worth-goal.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../users/user.entity';
import { BankAccountsModule } from '../bank-accounts/bank-accounts.module';
import { DebtsModule } from '../debts/debts.module';
import { NetWorthGoalService } from './net-worth-goal.service';
import { NetWorthGoalController } from './net-worth-goal.controller';

@Module({
  imports: [TypeOrmModule.forFeature([User]), BankAccountsModule, DebtsModule],
  providers: [NetWorthGoalService],
  controllers: [NetWorthGoalController],
})
export class NetWorthGoalModule {}
```

- [ ] **Step 4: Register the module in `AppModule`**

In `apps/api/src/app/app.module.ts`, add the import statement after the `CategorizationRulesModule` import (line 19):

```ts
import { NetWorthGoalModule } from '../net-worth-goal/net-worth-goal.module';
```

And add `NetWorthGoalModule` to the `imports` array, after `CategorizationRulesModule,` (line 43):

```ts
    CategorizationRulesModule,
    NetWorthGoalModule,
```

- [ ] **Step 5: Verify the API builds and the endpoint responds**

Run: `npm run build:api`
Expected: build succeeds with no TypeScript errors.

Run: `node dist/apps/api/main.js` (in one terminal, with a valid `.env` present per `CLAUDE.md`), then in another terminal, after logging in via the web app to get a valid `access_token` cookie, hit the endpoint manually via the browser at `http://localhost:3333/api/net-worth-goal` (or via the Network tab once Task 6's hook is wired up) — this task's automated verification is the build; end-to-end behavior is confirmed once the frontend hook (Task 6) can call it.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/net-worth-goal/net-worth-goal.service.ts apps/api/src/net-worth-goal/net-worth-goal.controller.ts apps/api/src/net-worth-goal/net-worth-goal.module.ts apps/api/src/app/app.module.ts
git commit -m "feat(api): add GET/PATCH /net-worth-goal endpoints"
```

---

### Task 4: Remove `savingsGoal`/`savingsSeries` from the frontend

**Files:**
- Modify: `apps/web/src/components/UserProvider.tsx`
- Modify: `apps/web/src/lib/dashboard/derive.ts`
- Modify: `apps/web/src/lib/dashboard/derive.test.ts`

**Interfaces:**
- None produced — this is pure removal. Task 5 removes the last remaining consumer (`dashboard/page.tsx` and `SavingsGrowthPanel.tsx`).

- [ ] **Step 1: Remove `savingsGoal` from the `User` type**

In `apps/web/src/components/UserProvider.tsx`, delete this line (currently line 16):

```ts
  savingsGoal?: string | number | null;
```

- [ ] **Step 2: Remove the `savingsSeries` test block and its import**

In `apps/web/src/lib/dashboard/derive.test.ts`:
1. Remove `savingsSeries` from the import list on line 2 (it currently reads `... spendingPace, fixedVariable, savingsSeries, netWorthBreakdown, ...` — delete `savingsSeries, `).
2. Delete the entire `describe('savingsSeries', ...)` block (lines 208–229).

- [ ] **Step 3: Run the frontend tests to verify they still pass**

Run: `npm run test:dashboard`
Expected: PASS — all remaining tests green, no reference to `savingsSeries` left.

- [ ] **Step 4: Remove `savingsSeries` and its types from `derive.ts`**

In `apps/web/src/lib/dashboard/derive.ts`, delete this block (currently lines 207–223):

```ts
export interface SavingsPoint { month: string; actual: number; goal: number | null }
export interface SavingsStats { points: SavingsPoint[]; current: number; goal: number | null; onTrackPct: number | null }

export function savingsSeries(yearTx: Transaction[], now: Date, goal: number | null): SavingsStats {
  const flow = monthlyCashFlow(yearTx, now);
  let cum = 0;
  const points: SavingsPoint[] = flow.map((m, i) => {
    cum = +(cum + m.net).toFixed(2);
    return { month: m.month, actual: cum, goal: goal != null ? +((goal * (i + 1)) / 12).toFixed(2) : null };
  });
  const current = points.length ? points[points.length - 1].actual : 0;
  const goalNow = points.length && goal != null ? points[points.length - 1].goal! : null;
  return {
    points, current, goal,
    onTrackPct: goalNow && goalNow > 0 ? +((current / goalNow) * 100).toFixed(1) : null,
  };
}
```

- [ ] **Step 5: Run the frontend tests again to confirm nothing broke**

Run: `npm run test:dashboard`
Expected: PASS — `derive.ts` still exports everything `derive.test.ts` and `dashboard/page.tsx` need (the latter is fixed in Task 5).

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/components/UserProvider.tsx apps/web/src/lib/dashboard/derive.ts apps/web/src/lib/dashboard/derive.test.ts
git commit -m "feat(web): remove savingsGoal cash-flow tracker in favor of the net-worth goal"
```

---

### Task 5: `useNetWorthGoal` hook + `NetWorthGoalPanel` dashboard panel

**Files:**
- Create: `apps/web/src/hooks/useNetWorthGoal.ts`
- Delete: `apps/web/src/components/dashboard/panels/SavingsGrowthPanel.tsx`
- Create: `apps/web/src/components/dashboard/panels/NetWorthGoalPanel.tsx`
- Modify: `apps/web/src/app/dashboard/page.tsx`

**Interfaces:**
- Consumes: `GET`/`PATCH /net-worth-goal` from Task 3; `Panel`, `PanelEmpty` from `apps/web/src/components/dashboard/Panel.tsx`; `fmt` from `apps/web/src/components/dashboard/chartTheme.ts`; `useThemeColors` from `apps/web/src/components/ThemeProvider.tsx`.
- Produces: `useNetWorthGoal(): { data: NetWorthGoal | null; loading: boolean; error: string | null; reload: () => void; setTargetDate: (targetDate: string | null) => Promise<boolean> }` where `NetWorthGoal = { target: number; current: number; targetDate: string | null; baselineValue: number | null; baselineDate: string | null; onTrackPct: number | null; projectedDate: string | null }`. Consumed by Task 6's `/goals` page.

- [ ] **Step 1: Write the hook**

Create `apps/web/src/hooks/useNetWorthGoal.ts`:

```ts
'use client';

import { useState, useEffect, useCallback } from 'react';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3333/api';

export interface NetWorthGoal {
  target: number;
  current: number;
  targetDate: string | null;
  baselineValue: number | null;
  baselineDate: string | null;
  onTrackPct: number | null;
  projectedDate: string | null;
}

export function useNetWorthGoal() {
  const [data, setData] = useState<NetWorthGoal | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API}/net-worth-goal`, { credentials: 'include' });
      if (!res.ok) throw new Error('request failed');
      setData(await res.json());
    } catch {
      setError('Could not load your net worth goal.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { reload(); }, [reload]);

  const setTargetDate = useCallback(async (targetDate: string | null): Promise<boolean> => {
    const res = await fetch(`${API}/net-worth-goal`, {
      method: 'PATCH',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ targetDate }),
    });
    if (res.ok) setData(await res.json());
    return res.ok;
  }, []);

  return { data, loading, error, reload, setTargetDate };
}
```

- [ ] **Step 2: Delete the old panel**

Run: `git rm apps/web/src/components/dashboard/panels/SavingsGrowthPanel.tsx`

- [ ] **Step 3: Write the new compact dashboard panel**

Create `apps/web/src/components/dashboard/panels/NetWorthGoalPanel.tsx`:

```tsx
'use client';

import Link from 'next/link';
import { useThemeColors } from '@/components/ThemeProvider';
import Panel, { PanelEmpty } from '../Panel';
import { fmt } from '../chartTheme';
import { useNetWorthGoal } from '@/hooks/useNetWorthGoal';

function fmtMonthYear(iso: string) {
  const [y, m] = iso.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
}

export default function NetWorthGoalPanel() {
  const { data, loading } = useNetWorthGoal();
  const tc = useThemeColors();

  const pct = data ? Math.min(100, Math.max(0, (data.current / data.target) * 100)) : 0;

  return (
    <Panel title="Progress to $1M" subtitle="Net worth" loading={loading}>
      {!data ? (
        <PanelEmpty message="Couldn't load your net worth goal." />
      ) : (
        <div className="flex flex-col gap-3">
          <div className="flex items-baseline gap-2">
            <p className="text-2xl font-bold tabular-nums">${fmt(data.current)}</p>
            <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>of $1,000,000</span>
          </div>
          <div className="h-2.5 rounded-full overflow-hidden" style={{ background: 'var(--color-elevated)' }}>
            <div className="h-full rounded-full" style={{ width: `${pct}%`, background: tc.green }} />
          </div>
          <div className="grid grid-cols-3 gap-2 text-center text-xs">
            <div>
              <p className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>Complete</p>
              <p className="font-bold">{pct.toFixed(1)}%</p>
            </div>
            <div>
              <p className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>Target date</p>
              {data.targetDate ? (
                <p className="font-bold">{fmtMonthYear(data.targetDate)}</p>
              ) : (
                <Link href="/goals" className="font-bold underline decoration-dotted underline-offset-2">Set a date</Link>
              )}
            </div>
            <div>
              <p className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>On track</p>
              <p className="font-bold" style={{
                color: data.onTrackPct == null ? 'var(--color-text-muted)' : data.onTrackPct >= 100 ? tc.green : tc.amber,
              }}>
                {data.onTrackPct != null ? `${data.onTrackPct.toFixed(0)}%` : '—'}
              </p>
            </div>
          </div>
          <Link href="/goals" className="text-xs font-semibold text-center underline decoration-dotted underline-offset-2"
            style={{ color: 'var(--color-text-secondary)' }}>
            View details →
          </Link>
        </div>
      )}
    </Panel>
  );
}
```

- [ ] **Step 4: Wire the new panel into the dashboard, removing the old one**

In `apps/web/src/app/dashboard/page.tsx`:

1. Replace the import on line 26:
   ```ts
   import SavingsGrowthPanel from '@/components/dashboard/panels/SavingsGrowthPanel';
   ```
   with:
   ```ts
   import NetWorthGoalPanel from '@/components/dashboard/panels/NetWorthGoalPanel';
   ```

2. Remove `savingsSeries` from the import on line 12 (it currently reads `... calendarDays, spendingPace, fixedVariable, savingsSeries, netWorthBreakdown, ...` — delete `savingsSeries, `).

3. In the `d = useMemo(...)` block, remove line 70 (`const goal = user?.savingsGoal != null ? Number(user.savingsGoal) : null;`) and remove the `savings: savingsSeries(yearTx, now, goal),` line (currently line 85) from the returned object.

4. Remove `user?.savingsGoal` from the `useMemo` dependency array (currently line 92): change
   ```ts
   }, [yearTx, month, budgets, accounts, debts, user?.savingsGoal]);
   ```
   to
   ```ts
   }, [yearTx, month, budgets, accounts, debts]);
   ```

5. Replace the panel usage on line 220:
   ```tsx
   <SavingsGrowthPanel stats={d.savings} loading={loading} onGoalSaved={refetch} />
   ```
   with:
   ```tsx
   <NetWorthGoalPanel />
   ```

- [ ] **Step 5: Run the frontend build to catch any leftover references**

Run: `npm run build:web`
Expected: build succeeds — confirms no remaining import of `SavingsGrowthPanel`, `savingsSeries`, or `user?.savingsGoal` anywhere in the dashboard.

- [ ] **Step 6: Manually verify in the browser**

Run: `npm run dev:web` and `npm run dev:api` (per `CLAUDE.md`), log in, open `/dashboard`.
Expected: the panel where "Savings Growth" used to be now shows "Progress to $1M" with your current net worth, a progress bar, and a "Set a date" link (since no target date is set yet). No console errors. Check both light and dark themes and at a mobile viewport width.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/hooks/useNetWorthGoal.ts apps/web/src/components/dashboard/panels/NetWorthGoalPanel.tsx apps/web/src/app/dashboard/page.tsx
git commit -m "feat(web): replace SavingsGrowthPanel with the net-worth goal panel"
```

---

### Task 6: Dedicated `/goals` page + sidebar navigation entry

**Files:**
- Create: `apps/web/src/app/goals/page.tsx`
- Modify: `apps/web/src/components/Sidebar.tsx`

**Interfaces:**
- Consumes: `useNetWorthGoal` from Task 5; `netWorthBreakdown(accounts, debts, yearTx, monthKey): NetWorthBreakdown` from `apps/web/src/lib/dashboard/derive.ts` (already exists — see `NetWorthBreakdown` shape at `apps/web/src/lib/dashboard/derive.ts:226-229`); `fmt` from `apps/web/src/components/dashboard/chartTheme.ts`; `useThemeColors` from `apps/web/src/components/ThemeProvider.tsx`; `Sidebar` from `apps/web/src/components/Sidebar.tsx`.

- [ ] **Step 1: Write the `/goals` page**

Create `apps/web/src/app/goals/page.tsx`:

```tsx
'use client';

import { useState, useEffect } from 'react';
import Sidebar from '@/components/Sidebar';
import { useThemeColors } from '@/components/ThemeProvider';
import { useNetWorthGoal } from '@/hooks/useNetWorthGoal';
import { netWorthBreakdown } from '@/lib/dashboard/derive';
import type { BankAccount, Debt } from '@/lib/dashboard/types';
import { fmt } from '@/components/dashboard/chartTheme';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3333/api';

function currentMonth() { return new Date().toISOString().slice(0, 7); }
function fmtDate(iso: string) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

const cardStyle: React.CSSProperties = {
  background: 'var(--color-surface)',
  border: 'var(--glass-border)',
  boxShadow: 'var(--glass-shadow)',
};

export default function GoalsPage() {
  const { data, loading, setTargetDate } = useNetWorthGoal();
  const tc = useThemeColors();
  const [accounts, setAccounts] = useState<BankAccount[]>([]);
  const [debts, setDebts] = useState<Debt[]>([]);
  const [editingDate, setEditingDate] = useState(false);
  const [dateValue, setDateValue] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    Promise.all([
      fetch(`${API}/bank-accounts`, { credentials: 'include' }).then((r) => r.json()),
      fetch(`${API}/debts`, { credentials: 'include' }).then((r) => r.json()),
    ]).then(([accs, dbts]) => {
      setAccounts(Array.isArray(accs) ? accs : []);
      setDebts(Array.isArray(dbts) ? dbts : []);
    });
  }, []);

  const breakdown = netWorthBreakdown(accounts, debts, [], currentMonth());
  const pct = data ? Math.min(100, Math.max(0, (data.current / data.target) * 100)) : 0;

  async function saveDate() {
    setSaving(true);
    try {
      await setTargetDate(dateValue || null);
      setEditingDate(false);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex h-dvh overflow-hidden">
      <Sidebar />
      <main className="flex-1 overflow-y-auto pt-14 md:pt-0">
        <div className="px-6 md:px-8 py-6 flex flex-col gap-6 max-w-3xl">
          <div>
            <h1 className="font-bold tracking-tight" style={{ fontSize: 'clamp(28px, 3vw, 40px)' }}>Net Worth Goal</h1>
            <p className="mt-2" style={{ color: 'var(--color-text-secondary)' }}>
              Cofre&apos;s mission: help you reach $1,000,000 in net worth.
            </p>
          </div>

          {loading || !data ? (
            <p style={{ color: 'var(--color-text-muted)' }}>Loading…</p>
          ) : (
            <>
              <div className="card-lift rounded-2xl p-6 flex flex-col gap-4" style={cardStyle}>
                <div className="flex items-baseline gap-2">
                  <p className="text-4xl font-bold tabular-nums">${fmt(data.current)}</p>
                  <span style={{ color: 'var(--color-text-muted)' }}>of $1,000,000</span>
                </div>
                <div className="h-3 rounded-full overflow-hidden" style={{ background: 'var(--color-elevated)' }}>
                  <div className="h-full rounded-full" style={{ width: `${pct}%`, background: tc.green }} />
                </div>
                <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>{pct.toFixed(1)}% of the way there</p>

                <div className="flex items-center gap-3 flex-wrap pt-4" style={{ borderTop: '1px solid var(--color-border)' }}>
                  <span className="text-xs uppercase tracking-wider" style={{ color: 'var(--color-text-muted)' }}>Target date</span>
                  {editingDate ? (
                    <span className="flex items-center gap-2">
                      <input type="date" value={dateValue} onChange={(e) => setDateValue(e.target.value)}
                        className="px-3 py-1.5 text-sm rounded-lg outline-none"
                        style={{ background: 'var(--color-elevated)', border: '1px solid var(--color-border)', color: 'var(--color-text-primary)' }} />
                      <button onClick={saveDate} disabled={saving} className="text-sm font-semibold cursor-pointer" style={{ color: tc.green }}>Save</button>
                      <button onClick={() => setEditingDate(false)} className="text-sm cursor-pointer" style={{ color: 'var(--color-text-muted)' }}>Cancel</button>
                    </span>
                  ) : (
                    <button onClick={() => { setDateValue(data.targetDate ?? ''); setEditingDate(true); }}
                      className="text-sm font-semibold underline decoration-dotted underline-offset-2 cursor-pointer">
                      {data.targetDate ? fmtDate(data.targetDate) : 'Set a target date'}
                    </button>
                  )}
                </div>

                {data.targetDate && (
                  <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
                    {data.onTrackPct == null
                      ? 'Just getting started — check back in a few days to see your pace.'
                      : data.onTrackPct >= 100
                        ? "You're on track to hit $1M by your target date."
                        : "You're currently off pace for your target date."}
                    {data.projectedDate && ` At this rate, you'll reach $1M around ${fmtDate(data.projectedDate)}.`}
                  </p>
                )}
              </div>

              <div className="card-lift rounded-2xl p-6 grid grid-cols-1 sm:grid-cols-2 gap-6" style={cardStyle}>
                <div className="flex flex-col gap-2 min-w-0">
                  <p className="text-xs font-semibold flex justify-between" style={{ color: 'var(--color-text-muted)' }}>
                    Assets <span style={{ color: tc.green }}>${fmt(breakdown.assets)}</span>
                  </p>
                  {breakdown.assetItems.map((it) => (
                    <p key={it.label} className="flex justify-between gap-2 text-sm">
                      <span className="truncate" style={{ color: 'var(--color-text-secondary)' }}>{it.label}</span>
                      <span className="tabular-nums font-semibold shrink-0">${fmt(it.value)}</span>
                    </p>
                  ))}
                </div>
                <div className="flex flex-col gap-2 min-w-0">
                  <p className="text-xs font-semibold flex justify-between" style={{ color: 'var(--color-text-muted)' }}>
                    Liabilities <span style={{ color: tc.rose }}>${fmt(breakdown.liabilities)}</span>
                  </p>
                  {breakdown.liabilityItems.length === 0
                    ? <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>None</p>
                    : breakdown.liabilityItems.map((it) => (
                      <p key={it.label} className="flex justify-between gap-2 text-sm">
                        <span className="truncate" style={{ color: 'var(--color-text-secondary)' }}>{it.label}</span>
                        <span className="tabular-nums font-semibold shrink-0">${fmt(it.value)}</span>
                      </p>
                    ))}
                </div>
              </div>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
```

- [ ] **Step 2: Add a "Goals" entry to the sidebar navigation**

In `apps/web/src/components/Sidebar.tsx`:

1. Add `GoalsIcon` to the `NAV` array (currently lines 12–18), after the `Dashboard` entry:
   ```ts
   const NAV = [
     { label: 'Dashboard',    href: '/dashboard',    icon: DashboardIcon },
     { label: 'Goals',        href: '/goals',        icon: GoalsIcon },
     { label: 'Transactions', href: '/transactions', icon: TransactionsIcon },
     { label: 'Budgets',      href: '/budgets',      icon: BudgetsIcon },
     { label: 'Projects',     href: '/projects',     icon: ProjectsIcon },
     { label: 'Debts',        href: '/debts',        icon: DebtsIcon },
   ];
   ```

2. Add the `GoalsIcon` component next to the other icon components (after `DashboardIcon`, currently ending at line 232):
   ```tsx
   function GoalsIcon() {
     return (
       <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
         <circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.2" fill="currentColor" stroke="none"/>
       </svg>
     );
   }
   ```

- [ ] **Step 3: Run the frontend build**

Run: `npm run build:web`
Expected: build succeeds with no TypeScript errors.

- [ ] **Step 4: Manually verify in the browser**

Run: `npm run dev:web` and `npm run dev:api`, log in, click "Goals" in the sidebar.
Expected:
- `/goals` shows current net worth, progress bar, and a "Set a target date" prompt.
- Clicking it, picking a date, and saving updates the page to show the on-track message and (once at least a day has passed) a percentage — immediately after saving it should show "Just getting started…" since the baseline was captured moments ago.
- The dashboard panel's "Target date" now reflects the same date.
- Assets/Liabilities breakdown matches what's shown on the dashboard's existing "Net Worth" panel.
- Check both light/dark themes and a mobile viewport width; confirm the sidebar's mobile drawer includes "Goals" and closes on navigation (existing `Sidebar` behavior).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/goals/page.tsx apps/web/src/components/Sidebar.tsx
git commit -m "feat(web): add dedicated /goals page and sidebar entry"
```

---

### Task 7: End-to-end verification against the spec

**Files:** none (verification only).

- [ ] **Step 1: Fresh-user baseline**

On an account with no target date set, confirm `GET /net-worth-goal` (via the dashboard panel and `/goals` page) shows `onTrackPct: null` / `projectedDate: null` and a call-to-action to set a date, per the spec's "No target date set" edge case.

- [ ] **Step 2: Baseline-just-set edge case**

Set a target date for the first time. Confirm the response shows `onTrackPct: null` (per the spec's "Target date just set" edge case — `computeGoalProgress` returns null when `elapsedDays < 1`), not a misleading percentage.

- [ ] **Step 3: Changing vs. clearing the date**

Change the target date to a different value — confirm the baseline (`baselineValue`/`baselineDate`) is unchanged (only `targetDate` moves). Then clear the date (submit empty) — confirm `targetDate`, `baselineValue`, and `baselineDate` all return to `null`. Set a new date afterward and confirm a fresh baseline is captured.

- [ ] **Step 4: Goal-met case**

If feasible, temporarily adjust a bank account's balance (via Settings) to push net worth at/above $1,000,000 and confirm both the panel and `/goals` page show 100% / today's date, then revert the balance.

- [ ] **Step 5: Cross-check totals**

Confirm the net worth shown on the goals panel/page matches the "Total Balance" stat card and the existing "Net Worth" panel on the dashboard (same underlying formula, computed independently server-side vs. client-side).

- [ ] **Step 6: Theme and responsive check**

View the dashboard panel and `/goals` page in both light and dark themes (Settings → Appearance) and at a mobile browser width, per the project's responsive-design requirement.

No commit for this task — it's a verification pass. If any step surfaces a bug, fix it in the relevant task's files and commit there.
