# Admin Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A private, read-only `/admin` page that shows user growth, plans and revenue, engagement and system health, plus a searchable user list without finances, visible only to emails in `ADMIN_EMAILS`.

**Architecture:** A new NestJS `admin/` module exposes `GET /api/admin/stats` and `GET /api/admin/users`, both behind `JwtAuthGuard` + `AdminGuard`. `AdminGuard` answers 404 to non-admins. Stats are live SQL aggregates through the `DataSource`. A new `users.lastSeenAt` column, refreshed at most hourly from `JwtStrategy`, feeds active-user counts. The web app gains an `isAdmin` flag on `/auth/me`, a conditional sidebar link, and an `/admin` page built from the dashboard's `Panel` and theme tokens.

**Tech Stack:** NestJS 11, TypeORM (Postgres in prod, better-sqlite3 in tests), Vitest, Next.js 16 / React 19, Tailwind v4, recharts.

**Spec:** `docs/superpowers/specs/2026-10-12-admin-dashboard-design.md`

## Global Constraints

- Admin allowlist: `ADMIN_EMAILS`, comma-separated, trimmed, compared lowercase; unset/empty → no admins.
- Non-admins (and anonymous users) get **404** from every `/api/admin/*` route.
- Read-only. No endpoint mutates another user.
- User list never returns balances, amounts, transaction details, password, `googleId`, `stripeCustomerId`, `plaidUserId`, or net-worth fields. Rows are built from an explicit field list, never by spreading an entity.
- Never log request bodies, search text, emails or amounts (CLAUDE.md logging rule).
- `lastSeenAt` is written at most once per user per hour, never awaited by the request, and never bumps `updatedAt`.
- MRR estimate = `active` subscriptions only (trials excluded); monthly price, or yearly ÷ 12; prices pro 4.99/47.90, elite 7.99/76.70.
- Stats SQL must run on both Postgres and better-sqlite3. Time cutoffs are computed in TypeScript and bound as parameters (no `now()` / `interval`). Use `LOWER(x) LIKE` instead of `ILIKE`. Quote camelCase columns as `"createdAt"`.
- `ai_messages` and `receipts` use `jsonb`, which better-sqlite3 rejects. The admin service queries them **by table name** (`.from('ai_messages', 'm')`), and tests create minimal stand-in tables with `ds.query('CREATE TABLE …')`.
- Web components consume theme variables only. No hardcoded theme colors. Blue/indigo/violet are never chart series. Every page is responsive (phone → desktop).
- Deploy wiring only in `deploy/ci-deploy.sh` (live pipeline). Root `cloudbuild.dev.yaml` is not touched. The `ADMIN_EMAILS` secret already exists in `cofre-dev`.
- Commit locally after each task; **do not push** (the user batches pushes).

## Review Focus

1. **Search text with `%`, `_` or `\`.** Expected: matched literally, not as wildcards. Test in Task 5.
2. **`page` query param that is missing, `0`, negative, non-numeric or huge.** Expected: clamps to a valid page and never throws. Test in Task 5.
3. **Admin email with different case or extra spaces in the env var** (e.g. `" Info@OsmioServices.com ,"`). Expected: still an admin. Test in Task 1.
4. **A brand-new deploy where nobody has `lastSeenAt` yet.** Expected: active counts are 0, the average transactions per active user is 0 (no divide-by-zero / NaN), and the page renders. Test in Task 4.
5. **A user with no subscription, no bank link and no transactions.** Expected: the row shows `subscriptionStatus: null`, `bankLinks: 0`, `transactions: 0`, not a missing user. Test in Task 5.

---

## File Structure

**API — create**
- `apps/api/src/admin/admin-emails.ts`: `isAdminEmail()` pure helper.
- `apps/api/src/admin/admin.guard.ts`: `AdminGuard` (404 for non-admins).
- `apps/api/src/admin/plan-prices.ts`: list prices + `estimateMrr()`.
- `apps/api/src/admin/admin-stats.math.ts`: `weekStartUtc()`, `weeklyBuckets()` pure helpers.
- `apps/api/src/admin/admin.types.ts`: `AdminStats`, `AdminUserRow`, `AdminUsersPage`.
- `apps/api/src/admin/admin.service.ts`: `stats(now)`, `users({ search, page })`.
- `apps/api/src/admin/admin.controller.ts`: routes.
- `apps/api/src/admin/admin.module.ts`.
- `apps/api/src/admin/admin.test-db.ts`: `makeDs()` sqlite fixture shared by the admin service tests (not a `*.test.ts`, so Vitest does not collect it and webpack never imports it).
- `apps/api/src/admin/*.test.ts`: tests per unit.
- `apps/api/src/migrations/<ts>-UserLastSeen.ts`.

**API — modify**
- `apps/api/src/users/user.entity.ts`: `lastSeenAt` column.
- `apps/api/src/users/users.service.ts`: `touchLastSeen()`.
- `apps/api/src/auth/strategies/jwt.strategy.ts`: call `touchLastSeen`.
- `apps/api/src/auth/auth.controller.ts`: `isAdmin` on `/auth/me`.
- `apps/api/src/migrations/index.ts`, `apps/api/src/app/app.module.ts`.
- `deploy/ci-deploy.sh`, `CLAUDE.md`.

**Web — create**
- `apps/web/src/lib/admin/types.ts`: response types (mirror of API).
- `apps/web/src/lib/admin/format.ts` + `format.test.ts`: `relativeTime()`, `money()`.
- `apps/web/src/hooks/useAdmin.ts`: `useAdminStats()`, `useAdminUsers()`.
- `apps/web/src/app/admin/page.tsx`.
- `apps/web/src/app/admin/components/AdminStatTiles.tsx`, `SignupsChart.tsx`, `PlansPanel.tsx`, `EngagementPanel.tsx`, `HealthPanel.tsx`, `UsersTable.tsx`.

**Web — modify**
- `apps/web/src/components/UserProvider.tsx`: `isAdmin?: boolean`.
- `apps/web/src/components/Sidebar.tsx`: Admin link.
- `apps/web/vitest.config.ts`: include `src/lib/admin/**/*.test.ts`.

Commands (from repo root): API tests `npm run test:api`; single file `npx vitest run --root apps/api src/admin/admin.service.test.ts`; web tests `npm run test:dashboard`; typecheck `npx tsc --noEmit -p apps/api/tsconfig.app.json` and `npx tsc --noEmit -p apps/web/tsconfig.json`.

---

### Task 1: Admin allowlist helper and AdminGuard

**Files:**
- Create: `apps/api/src/admin/admin-emails.ts`
- Create: `apps/api/src/admin/admin.guard.ts`
- Test: `apps/api/src/admin/admin-emails.test.ts`, `apps/api/src/admin/admin.guard.test.ts`

**Interfaces:**
- Produces: `isAdminEmail(email: string | null | undefined, raw: string | null | undefined): boolean`; `class AdminGuard implements CanActivate` with `constructor(config: ConfigService)`, which throws `NotFoundException` when `request.user?.email` is not an admin.

- [ ] **Step 1: Write the failing tests**

`apps/api/src/admin/admin-emails.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { isAdminEmail } from './admin-emails';

describe('isAdminEmail', () => {
  it('matches a listed email', () => {
    expect(isAdminEmail('info@osmioservices.com', 'info@osmioservices.com')).toBe(true);
  });
  it('ignores case and surrounding whitespace on both sides', () => {
    expect(isAdminEmail('  INFO@osmioservices.com ', ' a@x.com , Info@OsmioServices.com ,')).toBe(true);
  });
  it('rejects an email that is not listed', () => {
    expect(isAdminEmail('someone@else.com', 'a@x.com,b@y.com')).toBe(false);
  });
  it('treats an unset or empty list as no admins', () => {
    expect(isAdminEmail('a@x.com', undefined)).toBe(false);
    expect(isAdminEmail('a@x.com', '')).toBe(false);
    expect(isAdminEmail('a@x.com', ' , ,')).toBe(false);
  });
  it('rejects a missing email even if the list has an empty entry', () => {
    expect(isAdminEmail('', 'a@x.com,,')).toBe(false);
    expect(isAdminEmail(undefined, 'a@x.com')).toBe(false);
  });
  it('does not match on a substring', () => {
    expect(isAdminEmail('a@x.co', 'a@x.com')).toBe(false);
  });
});
```

`apps/api/src/admin/admin.guard.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { NotFoundException, type ExecutionContext } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { AdminGuard } from './admin.guard';

function config(value?: string): ConfigService {
  return { get: (key: string) => (key === 'ADMIN_EMAILS' ? value : undefined) } as unknown as ConfigService;
}
function ctx(user: unknown): ExecutionContext {
  return { switchToHttp: () => ({ getRequest: () => ({ user }) }) } as unknown as ExecutionContext;
}

describe('AdminGuard', () => {
  it('lets an allowlisted user through', () => {
    expect(new AdminGuard(config('boss@cofre.dev')).canActivate(ctx({ email: 'Boss@cofre.dev' }))).toBe(true);
  });
  it('answers 404 to a signed-in non-admin', () => {
    expect(() => new AdminGuard(config('boss@cofre.dev')).canActivate(ctx({ email: 'user@cofre.dev' })))
      .toThrow(NotFoundException);
  });
  it('answers 404 when there is no user', () => {
    expect(() => new AdminGuard(config('boss@cofre.dev')).canActivate(ctx(undefined))).toThrow(NotFoundException);
  });
  it('answers 404 to everyone when ADMIN_EMAILS is unset', () => {
    expect(() => new AdminGuard(config(undefined)).canActivate(ctx({ email: 'boss@cofre.dev' })))
      .toThrow(NotFoundException);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run --root apps/api src/admin/`
Expected: FAIL, cannot resolve `./admin-emails` / `./admin.guard`.

- [ ] **Step 3: Implement**

`apps/api/src/admin/admin-emails.ts`:
```ts
/**
 * Whether `email` is in the ADMIN_EMAILS allowlist (comma-separated, case- and
 * whitespace-insensitive). An unset or empty list means nobody is an admin.
 */
export function isAdminEmail(email: string | null | undefined, raw: string | null | undefined): boolean {
  const target = (email ?? '').trim().toLowerCase();
  if (!target || !raw) return false;
  return raw.split(',').some((e) => e.trim().toLowerCase() === target);
}
```

`apps/api/src/admin/admin.guard.ts`:
```ts
import { CanActivate, ExecutionContext, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { isAdminEmail } from './admin-emails';

/**
 * Runs after JwtAuthGuard. Non-admins get a 404, not a 403, so admin routes
 * look exactly like routes that do not exist.
 */
@Injectable()
export class AdminGuard implements CanActivate {
  constructor(private config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const { user } = context.switchToHttp().getRequest();
    if (!isAdminEmail(user?.email, this.config.get<string>('ADMIN_EMAILS'))) throw new NotFoundException();
    return true;
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run --root apps/api src/admin/`
Expected: PASS (10 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/admin/admin-emails.ts apps/api/src/admin/admin.guard.ts apps/api/src/admin/admin-emails.test.ts apps/api/src/admin/admin.guard.test.ts
git commit -m "feat(admin): ADMIN_EMAILS allowlist and 404 AdminGuard"
```

---

### Task 2: `lastSeenAt` column, migration and hourly touch

**Files:**
- Modify: `apps/api/src/users/user.entity.ts` (add column before `createdAt`)
- Modify: `apps/api/src/users/users.service.ts` (add `touchLastSeen`)
- Modify: `apps/api/src/auth/strategies/jwt.strategy.ts:25-30`
- Create: `apps/api/src/migrations/<timestamp>-UserLastSeen.ts` (generated)
- Modify: `apps/api/src/migrations/index.ts`
- Test: `apps/api/src/users/last-seen.test.ts`

**Interfaces:**
- Produces: `User.lastSeenAt: Date | null`; `UsersService.touchLastSeen(id: string, now?: Date): Promise<void>`, which never rejects.

- [ ] **Step 1: Write the failing test**

`apps/api/src/users/last-seen.test.ts`:
```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { DataSource } from 'typeorm';
import { User } from './user.entity';
import { UsersService } from './users.service';

const HOUR = 60 * 60 * 1000;
let ds: DataSource;
let users: UsersService;
let user: User;

beforeEach(async () => {
  ds = new DataSource({ type: 'better-sqlite3', database: ':memory:', dropSchema: true, synchronize: true, entities: [User] });
  await ds.initialize();
  users = new UsersService(ds.getRepository(User));
  user = await ds.getRepository(User).save({ email: 'a@cofre.dev', name: 'A' });
});

const reload = () => ds.getRepository(User).findOneByOrFail({ id: user.id });

describe('UsersService.touchLastSeen', () => {
  it('sets lastSeenAt when it was never set', async () => {
    const now = new Date('2026-10-13T12:00:00Z');
    await users.touchLastSeen(user.id, now);
    expect((await reload()).lastSeenAt?.getTime()).toBe(now.getTime());
  });

  it('skips the write when the last touch is under an hour old', async () => {
    const first = new Date('2026-10-13T12:00:00Z');
    await users.touchLastSeen(user.id, first);
    await users.touchLastSeen(user.id, new Date(first.getTime() + HOUR - 1000));
    expect((await reload()).lastSeenAt?.getTime()).toBe(first.getTime());
  });

  it('writes again once the last touch is over an hour old', async () => {
    const first = new Date('2026-10-13T12:00:00Z');
    const later = new Date(first.getTime() + HOUR + 1000);
    await users.touchLastSeen(user.id, first);
    await users.touchLastSeen(user.id, later);
    expect((await reload()).lastSeenAt?.getTime()).toBe(later.getTime());
  });

  it('does not change updatedAt', async () => {
    const before = (await reload()).updatedAt.getTime();
    await users.touchLastSeen(user.id, new Date('2030-01-01T00:00:00Z'));
    expect((await reload()).updatedAt.getTime()).toBe(before);
  });

  it('never rejects, even when the database fails', async () => {
    await ds.destroy();
    await expect(users.touchLastSeen(user.id)).resolves.toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run --root apps/api src/users/last-seen.test.ts`
Expected: FAIL, `touchLastSeen is not a function`.

- [ ] **Step 3: Add the column**

In `apps/api/src/users/user.entity.ts`, insert just above `@CreateDateColumn()`:
```ts
  /* Last authenticated request, refreshed at most hourly (UsersService.touchLastSeen).
     Null until the user's first request after this column shipped. */
  @Column({ type: 'timestamptz', nullable: true, default: null })
  lastSeenAt: Date | null;
```
better-sqlite3 maps `timestamptz` to `datetime`. If the sqlite test errors with `DataTypeNotSupportedError` for `timestamptz`, use `@Column({ type: Date, nullable: true, default: null })` instead (as `Subscription.currentPeriodEnd` does) and regenerate the migration in Step 6.

- [ ] **Step 4: Add `touchLastSeen`**

In `apps/api/src/users/users.service.ts`, change the import line to `import { Injectable, Logger } from '@nestjs/common';`, add `private readonly logger = new Logger(UsersService.name);` as the first class member, and add this method after `findById`:
```ts
  /**
   * Records activity for admin "active users" counts. At most one write per user
   * per hour (the WHERE skips fresh rows), never bumps updatedAt, and never
   * rejects: callers fire and forget it.
   */
  async touchLastSeen(id: string, now: Date = new Date()): Promise<void> {
    try {
      await this.repo.createQueryBuilder()
        .update(User)
        .set({ lastSeenAt: now, updatedAt: () => '"updatedAt"' })
        .where('id = :id', { id })
        .andWhere('("lastSeenAt" IS NULL OR "lastSeenAt" < :stale)', { stale: new Date(now.getTime() - 60 * 60 * 1000) })
        .execute();
    } catch (err) {
      this.logger.warn(`touchLastSeen failed: ${(err as Error).message}`);
    }
  }
```

- [ ] **Step 5: Call it from the JWT strategy**

In `apps/api/src/auth/strategies/jwt.strategy.ts`, replace the `validate` body's last three lines with:
```ts
    const user = await this.usersService.findById(payload.sub);
    if (user) {
      setRequestUser(user.id);
      void this.usersService.touchLastSeen(user.id);
    }
    return user;
```

- [ ] **Step 6: Run tests, then generate the migration**

Run: `npx vitest run --root apps/api src/users/last-seen.test.ts src/auth/`
Expected: PASS.

Make sure local Postgres is running and migrated (`npm run migration:run`), then:
Run: `npm run migration:generate -- UserLastSeen`
Expected: creates `apps/api/src/migrations/<timestamp>-UserLastSeen.ts` whose `up` is `ALTER TABLE "users" ADD "lastSeenAt" TIMESTAMP WITH TIME ZONE` and whose `down` drops it. If it contains anything else, stop: the local DB has drifted. Run `npm run migration:run` and regenerate.

Append the class to `apps/api/src/migrations/index.ts`:
```ts
import { UserLastSeen<timestamp> } from './<timestamp>-UserLastSeen';
// …
export const MIGRATIONS = [Baseline1790610365591, NetWorthSnapshots1790968124309, InvestmentsAsSavings1791301606403, UserLastSeen<timestamp>];
```

Run: `npm run migration:run && npm run migration:check`
Expected: the migration applies; `migration:check` exits 0 ("No changes in database schema were found").

- [ ] **Step 7: Run the full API suite**

Run: `npm run test:api`
Expected: all pass, including `migrations/migrations.test.ts` (when Postgres is reachable).

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/users apps/api/src/auth/strategies/jwt.strategy.ts apps/api/src/migrations
git commit -m "feat(users): lastSeenAt, refreshed at most hourly per user"
```

---

### Task 3: `isAdmin` on `/auth/me`

**Files:**
- Modify: `apps/api/src/auth/auth.controller.ts:18-21` (constructor), `:84-88` (`me`)
- Test: `apps/api/src/auth/me-is-admin.test.ts`

**Interfaces:**
- Consumes: `isAdminEmail` (Task 1).
- Produces: `GET /api/auth/me` → the existing user JSON plus `isAdmin: boolean`; `AuthController.me(req)` is synchronous.

- [ ] **Step 1: Write the failing test**

`apps/api/src/auth/me-is-admin.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import type { ConfigService } from '@nestjs/config';
import { AuthController } from './auth.controller';

function controller(adminEmails?: string) {
  const config = { get: (k: string) => (k === 'ADMIN_EMAILS' ? adminEmails : undefined) } as unknown as ConfigService;
  return new AuthController({} as any, {} as any, config);
}

describe('GET /auth/me isAdmin', () => {
  it('is true for an allowlisted user and keeps the user fields', () => {
    const out = controller('boss@cofre.dev').me({ user: { id: 'u1', email: 'boss@cofre.dev', plan: 'pro' } });
    expect(out).toMatchObject({ id: 'u1', email: 'boss@cofre.dev', plan: 'pro', isAdmin: true });
  });
  it('is false for everyone else', () => {
    expect(controller('boss@cofre.dev').me({ user: { id: 'u2', email: 'x@cofre.dev' } }).isAdmin).toBe(false);
  });
  it('is false when ADMIN_EMAILS is unset', () => {
    expect(controller(undefined).me({ user: { id: 'u1', email: 'boss@cofre.dev' } }).isAdmin).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run --root apps/api src/auth/me-is-admin.test.ts`
Expected: FAIL, `isAdmin` is undefined.

- [ ] **Step 3: Implement**

In `apps/api/src/auth/auth.controller.ts` add imports:
```ts
import { ConfigService } from '@nestjs/config';
import { isAdminEmail } from '../admin/admin-emails';
```
Constructor becomes:
```ts
  constructor(
    private authService: AuthService,
    private usersService: UsersService,
    private config: ConfigService,
  ) {}
```
`me` becomes:
```ts
  @UseGuards(JwtAuthGuard)
  @Get('me')
  me(@Request() req: any) {
    return { ...req.user, isAdmin: isAdminEmail(req.user?.email, this.config.get<string>('ADMIN_EMAILS')) };
  }
```
`ConfigModule` is global (`isGlobal: true`), so `AuthModule` needs no import change.

- [ ] **Step 4: Run tests**

Run: `npx vitest run --root apps/api src/auth/`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/auth/auth.controller.ts apps/api/src/auth/me-is-admin.test.ts
git commit -m "feat(auth): expose isAdmin on /auth/me"
```

---

### Task 4: Stats: prices, week buckets and `AdminService.stats`

**Files:**
- Create: `apps/api/src/admin/plan-prices.ts`, `admin-stats.math.ts`, `admin.types.ts`, `admin.service.ts`
- Create: `apps/api/src/admin/admin.test-db.ts`
- Test: `apps/api/src/admin/plan-prices.test.ts`, `admin-stats.math.test.ts`, `admin.service.test.ts`

**Interfaces:**
- Consumes: `User.lastSeenAt` (Task 2).
- Produces:
  - `PLAN_PRICES`, `estimateMrr(subs: { tier: 'pro' | 'elite'; interval: 'month' | 'year' }[]): number`
  - `weekStartUtc(d: Date): string` (Monday, `YYYY-MM-DD`), `weeklyBuckets(dates: Date[], now: Date, weeks: number): { week: string; count: number }[]`
  - `AdminStats` type (below), `class AdminService { constructor(ds: DataSource); stats(now: Date): Promise<AdminStats> }`

- [ ] **Step 1: Write the failing pure-helper tests**

`apps/api/src/admin/plan-prices.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { estimateMrr } from './plan-prices';

describe('estimateMrr', () => {
  it('adds monthly prices and spreads yearly ones over 12 months', () => {
    expect(estimateMrr([
      { tier: 'pro', interval: 'month' },   // 4.99
      { tier: 'elite', interval: 'month' }, // 7.99
      { tier: 'pro', interval: 'year' },    // 47.90 / 12 = 3.9917
      { tier: 'elite', interval: 'year' },  // 76.70 / 12 = 6.3917
    ])).toBe(23.36);
  });
  it('is 0 with no subscriptions', () => {
    expect(estimateMrr([])).toBe(0);
  });
});
```

`apps/api/src/admin/admin-stats.math.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { weekStartUtc, weeklyBuckets } from './admin-stats.math';

describe('weekStartUtc', () => {
  it('returns the Monday of the week in UTC', () => {
    expect(weekStartUtc(new Date('2026-10-13T08:00:00Z'))).toBe('2026-10-12'); // Tue → Mon
    expect(weekStartUtc(new Date('2026-10-12T00:00:00Z'))).toBe('2026-10-12'); // Mon
    expect(weekStartUtc(new Date('2026-10-18T23:59:59Z'))).toBe('2026-10-12'); // Sun
  });
});

describe('weeklyBuckets', () => {
  const now = new Date('2026-10-13T12:00:00Z');
  it('returns `weeks` zero-filled buckets ending with the current week', () => {
    const out = weeklyBuckets([], now, 12);
    expect(out).toHaveLength(12);
    expect(out[11]).toEqual({ week: '2026-10-12', count: 0 });
    expect(out[0].week).toBe('2026-07-27');
  });
  it('counts dates into their week and ignores ones outside the window', () => {
    const out = weeklyBuckets([
      new Date('2026-10-12T01:00:00Z'), new Date('2026-10-13T01:00:00Z'), // this week ×2
      new Date('2026-10-05T01:00:00Z'),                                   // last week
      new Date('2025-01-01T00:00:00Z'),                                   // too old
    ], now, 12);
    expect(out[11].count).toBe(2);
    expect(out[10].count).toBe(1);
    expect(out.reduce((s, b) => s + b.count, 0)).toBe(3);
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run --root apps/api src/admin/plan-prices.test.ts src/admin/admin-stats.math.test.ts`
Expected: FAIL, modules not found.

- [ ] **Step 3: Implement the helpers**

`apps/api/src/admin/plan-prices.ts`:
```ts
/* List prices in USD. Mirrors apps/web/src/lib/plans.ts (PLAN_PRICES); change both
   together. Stripe discounts are not reflected, so MRR built from these is an estimate. */
export const PLAN_PRICES = {
  pro: { month: 4.99, year: 47.9 },
  elite: { month: 7.99, year: 76.7 },
} as const;

export type PaidTier = keyof typeof PLAN_PRICES;
export type BillingInterval = 'month' | 'year';

/** Monthly recurring revenue: monthly price, or yearly price ÷ 12, summed and rounded to cents. */
export function estimateMrr(subs: { tier: PaidTier; interval: BillingInterval }[]): number {
  const total = subs.reduce((s, x) => {
    const p = PLAN_PRICES[x.tier];
    return p ? s + (x.interval === 'year' ? p.year / 12 : p.month) : s;
  }, 0);
  return Math.round(total * 100) / 100;
}
```

`apps/api/src/admin/admin-stats.math.ts`:
```ts
const DAY = 24 * 60 * 60 * 1000;

/** Monday (UTC) of the week containing `d`, as YYYY-MM-DD. */
export function weekStartUtc(d: Date): string {
  const day = (d.getUTCDay() + 6) % 7; // Mon=0 … Sun=6
  const monday = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - day * DAY);
  return monday.toISOString().slice(0, 10);
}

/** `weeks` zero-filled weekly counts, oldest first, ending with the week containing `now`. */
export function weeklyBuckets(dates: Date[], now: Date, weeks: number): { week: string; count: number }[] {
  const current = new Date(`${weekStartUtc(now)}T00:00:00Z`).getTime();
  const buckets = Array.from({ length: weeks }, (_, i) => ({
    week: new Date(current - (weeks - 1 - i) * 7 * DAY).toISOString().slice(0, 10),
    count: 0,
  }));
  const index = new Map(buckets.map((b, i) => [b.week, i]));
  for (const d of dates) {
    const i = index.get(weekStartUtc(d));
    if (i != null) buckets[i].count++;
  }
  return buckets;
}

/** Cutoff `days` before `now`. */
export function daysAgo(now: Date, days: number): Date {
  return new Date(now.getTime() - days * DAY);
}
```

- [ ] **Step 4: Run helper tests**

Run: `npx vitest run --root apps/api src/admin/plan-prices.test.ts src/admin/admin-stats.math.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the types**

`apps/api/src/admin/admin.types.ts`:
```ts
export interface AdminStats {
  generatedAt: string;
  users: {
    total: number; new7d: number; new30d: number;
    verified: number; unverified: number;
    bySignup: { google: number; email: number };
    weeklySignups: { week: string; count: number }[];
  };
  revenue: {
    plans: { free: number; pro: number; elite: number };
    subscriptions: { trialing: number; active: number; past_due: number; canceled: number };
    cancelingAtPeriodEnd: number;
    mrrEstimate: number;
    new30d: number;
    canceled30d: number;
  };
  engagement: {
    active1d: number; active7d: number; active30d: number;
    withBankLink: number;
    avgTransactionsPerActiveUser: number;
    withBudgets: number; withProjects: number; withNetWorthGoal: number;
    aiConversations30d: number; aiMessages30d: number;
    receiptsTotal: number;
  };
  health: {
    plaidErrors: { total: number; byCode: { code: string; count: number }[] };
    pastDueSubscriptions: number;
  };
}

export interface AdminUserRow {
  id: string;
  email: string;
  name: string | null;
  plan: 'free' | 'pro' | 'elite';
  subscriptionStatus: 'trialing' | 'active' | 'past_due' | 'canceled' | null;
  signupMethod: 'google' | 'email';
  emailVerified: boolean;
  createdAt: string;
  lastSeenAt: string | null;
  bankLinks: number;
  transactions: number;
}

export interface AdminUsersPage { rows: AdminUserRow[]; total: number; page: number; pageSize: number }
```

- [ ] **Step 6: Write the failing service test**

`apps/api/src/admin/admin.test-db.ts`:
```ts
import { DataSource } from 'typeorm';
import { User } from '../users/user.entity';
import { Subscription } from '../billing/subscription.entity';
import { PlaidItem } from '../plaid/plaid-item.entity';
import { Transaction } from '../transactions/transaction.entity';
import { Category } from '../categories/category.entity';
import { BankAccount } from '../bank-accounts/bank-account.entity';
import { Budget } from '../budgets/budget.entity';
import { Project } from '../projects/project.entity';
import { ProjectCategory } from '../projects/project-category.entity';
import { CategorizationRule } from '../categorization-rules/categorization-rule.entity';

/** In-memory sqlite with every table AdminService reads. Test-only. */
export async function makeDs(): Promise<DataSource> {
  const ds = new DataSource({
    type: 'better-sqlite3', database: ':memory:', dropSchema: true, synchronize: true,
    entities: [User, Subscription, PlaidItem, Transaction, Category, BankAccount, Budget, Project, ProjectCategory, CategorizationRule],
  });
  await ds.initialize();
  // ai_conversations / ai_messages / receipts use jsonb, which sqlite rejects;
  // AdminService reads them by table name, so minimal stand-ins are enough.
  await ds.query('CREATE TABLE ai_conversations (id varchar PRIMARY KEY, "userId" varchar, "createdAt" datetime)');
  await ds.query('CREATE TABLE ai_messages (id varchar PRIMARY KEY, "conversationId" varchar, "createdAt" datetime)');
  await ds.query('CREATE TABLE receipts (id varchar PRIMARY KEY, "userId" varchar, "createdAt" datetime)');
  return ds;
}
```

`apps/api/src/admin/admin.service.test.ts`:
```ts
import { describe, it, expect, beforeEach } from 'vitest';
import type { DataSource } from 'typeorm';
import { User } from '../users/user.entity';
import { Subscription } from '../billing/subscription.entity';
import { PlaidItem } from '../plaid/plaid-item.entity';
import { Transaction } from '../transactions/transaction.entity';
import { AdminService } from './admin.service';
import { makeDs } from './admin.test-db';

const NOW = new Date('2026-10-13T12:00:00Z');
const DAY = 24 * 60 * 60 * 1000;
const ago = (days: number) => new Date(NOW.getTime() - days * DAY);

let ds: DataSource;
let service: AdminService;

async function user(p: Partial<User>): Promise<User> {
  const repo = ds.getRepository(User);
  return repo.save(repo.create({ name: 'U', emailVerified: true, ...p }));
}

beforeEach(async () => {
  ds = await makeDs();
  service = new AdminService(ds);
});

describe('AdminService.stats', () => {
  it('handles an empty database without NaN', async () => {
    const s = await service.stats(NOW);
    expect(s.users.total).toBe(0);
    expect(s.engagement.avgTransactionsPerActiveUser).toBe(0);
    expect(s.revenue.mrrEstimate).toBe(0);
    expect(s.users.weeklySignups).toHaveLength(12);
  });

  it('counts users, growth, verification and signup method', async () => {
    await user({ email: 'g@x.com', googleId: 'g1', createdAt: ago(2) });
    await user({ email: 'e@x.com', createdAt: ago(10), emailVerified: false });
    await user({ email: 'old@x.com', createdAt: ago(200) });
    const s = await service.stats(NOW);
    expect(s.users).toMatchObject({ total: 3, new7d: 1, new30d: 2, verified: 2, unverified: 1, bySignup: { google: 1, email: 2 } });
    expect(s.users.weeklySignups.reduce((a, w) => a + w.count, 0)).toBe(2); // ago(200) is outside 12 weeks
  });

  it('computes plans, subscription statuses and MRR from active subscriptions only', async () => {
    const a = await user({ email: 'a@x.com', plan: 'pro' });
    const b = await user({ email: 'b@x.com', plan: 'elite' });
    const c = await user({ email: 'c@x.com', plan: 'pro' });
    const d = await user({ email: 'd@x.com', plan: 'free' });
    const subs = ds.getRepository(Subscription);
    await subs.save(subs.create({ userId: a.id, stripeSubscriptionId: 's1', tier: 'pro', interval: 'month', status: 'active', cancelAtPeriodEnd: true }));
    await subs.save(subs.create({ userId: b.id, stripeSubscriptionId: 's2', tier: 'elite', interval: 'year', status: 'active' }));
    await subs.save(subs.create({ userId: c.id, stripeSubscriptionId: 's3', tier: 'pro', interval: 'month', status: 'trialing' }));
    await subs.save(subs.create({ userId: d.id, stripeSubscriptionId: 's4', tier: 'pro', interval: 'month', status: 'past_due' }));
    const s = await service.stats(NOW);
    expect(s.revenue.plans).toEqual({ free: 1, pro: 2, elite: 1 });
    expect(s.revenue.subscriptions).toEqual({ trialing: 1, active: 2, past_due: 1, canceled: 0 });
    expect(s.revenue.cancelingAtPeriodEnd).toBe(1);
    expect(s.revenue.mrrEstimate).toBe(11.38); // 4.99 + 76.70/12
    expect(s.health.pastDueSubscriptions).toBe(1);
  });

  it('counts active users and average transactions per active user', async () => {
    const a = await user({ email: 'a@x.com', lastSeenAt: ago(0.5) });
    await user({ email: 'b@x.com', lastSeenAt: ago(5) });
    await user({ email: 'c@x.com', lastSeenAt: ago(60) });
    const tx = ds.getRepository(Transaction);
    for (let i = 0; i < 4; i++) {
      await tx.save(tx.create({ userId: a.id, name: `t${i}`, amount: -1, date: '2026-10-01', source: 'manual' } as Partial<Transaction>));
    }
    const s = await service.stats(NOW);
    expect(s.engagement).toMatchObject({ active1d: 1, active7d: 2, active30d: 2 });
    expect(s.engagement.avgTransactionsPerActiveUser).toBe(2); // 4 tx ÷ 2 active
  });

  it('groups Plaid connections in error by code and counts bank-linked users', async () => {
    const a = await user({ email: 'a@x.com' });
    const b = await user({ email: 'b@x.com' });
    const items = ds.getRepository(PlaidItem);
    const base = { accessToken: 'x', institutionId: 'i', institutionName: 'Bank' };
    await items.save(items.create({ ...base, userId: a.id, itemId: 'i1', status: 'error', errorCode: 'ITEM_LOGIN_REQUIRED' } as Partial<PlaidItem>));
    await items.save(items.create({ ...base, userId: a.id, itemId: 'i2', status: 'error', errorCode: 'ITEM_LOGIN_REQUIRED' } as Partial<PlaidItem>));
    await items.save(items.create({ ...base, userId: b.id, itemId: 'i3', status: 'active' } as Partial<PlaidItem>));
    const s = await service.stats(NOW);
    expect(s.engagement.withBankLink).toBe(2);
    expect(s.health.plaidErrors).toEqual({ total: 2, byCode: [{ code: 'ITEM_LOGIN_REQUIRED', count: 2 }] });
  });

  it('counts AI usage in the last 30 days and receipts overall', async () => {
    const a = await user({ email: 'a@x.com' });
    await ds.query('INSERT INTO ai_conversations VALUES (?, ?, ?), (?, ?, ?)', ['c1', a.id, ago(3), 'c2', a.id, ago(90)]);
    await ds.query('INSERT INTO ai_messages VALUES (?, ?, ?), (?, ?, ?), (?, ?, ?)', ['m1', 'c1', ago(3), 'm2', 'c1', ago(3), 'm3', 'c2', ago(90)]);
    await ds.query('INSERT INTO receipts VALUES (?, ?, ?)', ['r1', a.id, ago(100)]);
    const s = await service.stats(NOW);
    expect(s.engagement).toMatchObject({ aiConversations30d: 1, aiMessages30d: 2, receiptsTotal: 1 });
  });
});
```
The `PlaidItem` field names (`accessToken`, `itemId`, `institutionId`, `institutionName`) must match `apps/api/src/plaid/plaid-item.entity.ts`. Read the entity and adjust `base` to its required non-null columns before running. Do the same for `Transaction` required columns (check `transaction.entity.ts`; other tests such as `transactions/transactions.delete.test.ts` show a valid minimal row). When `ds.query` binds `Date` objects, better-sqlite3 needs strings: if it throws "can only bind numbers, strings…", pass `ago(n).toISOString().replace('T', ' ').replace('Z', '')` instead.

- [ ] **Step 7: Run to verify it fails**

Run: `npx vitest run --root apps/api src/admin/admin.service.test.ts`
Expected: FAIL, `./admin.service` not found.

- [ ] **Step 8: Implement `AdminService.stats`**

`apps/api/src/admin/admin.service.ts`:
```ts
import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { daysAgo, weeklyBuckets } from './admin-stats.math';
import { estimateMrr, type BillingInterval, type PaidTier } from './plan-prices';
import type { AdminStats } from './admin.types';

const num = (v: unknown) => Number(v ?? 0) || 0;

/**
 * Read-only, app-wide aggregates for the admin page. Everything is computed on
 * request with COUNTs. Tables are addressed by name so the same SQL runs on
 * Postgres and on the sqlite test database (some entities use jsonb, which
 * sqlite cannot load). Time cutoffs are bound as parameters.
 */
@Injectable()
export class AdminService {
  constructor(private ds: DataSource) {}

  private async count(table: string, where?: string, params: Record<string, unknown> = {}, expr = 'COUNT(*)'): Promise<number> {
    const qb = this.ds.createQueryBuilder().select(expr, 'n').from(table, 't');
    if (where) qb.where(where, params);
    return num((await qb.getRawOne())?.n);
  }

  async stats(now: Date): Promise<AdminStats> {
    const d1 = daysAgo(now, 1), d7 = daysAgo(now, 7), d30 = daysAgo(now, 30), d84 = daysAgo(now, 7 * 12);
    const distinctUsers = 'COUNT(DISTINCT t."userId")';

    const [
      total, new7d, new30d, verified, google,
      planRows, subRows, canceling, activeSubs, subs30d, canceled30d,
      active1d, active7d, active30d, withBankLink, tx30d,
      withBudgets, withProjects, withGoal, aiConv30d, aiMsg30d, receiptsTotal,
      plaidRows, signupRows,
    ] = await Promise.all([
      this.count('users'),
      this.count('users', 't."createdAt" >= :c', { c: d7 }),
      this.count('users', 't."createdAt" >= :c', { c: d30 }),
      this.count('users', 't."emailVerified" = :v', { v: true }),
      this.count('users', 't."googleId" IS NOT NULL'),
      this.ds.createQueryBuilder().select('t.plan', 'plan').addSelect('COUNT(*)', 'n').from('users', 't').groupBy('t.plan').getRawMany(),
      this.ds.createQueryBuilder().select('t.status', 'status').addSelect('COUNT(*)', 'n').from('subscriptions', 't').groupBy('t.status').getRawMany(),
      this.count('subscriptions', 't."cancelAtPeriodEnd" = :v AND t.status IN (:...s)', { v: true, s: ['active', 'trialing'] }),
      this.ds.createQueryBuilder().select('t.tier', 'tier').addSelect('t.interval', 'interval').from('subscriptions', 't').where('t.status = :s', { s: 'active' }).getRawMany(),
      this.count('subscriptions', 't."createdAt" >= :c', { c: d30 }),
      this.count('subscriptions', 't.status = :s AND t."updatedAt" >= :c', { s: 'canceled', c: d30 }),
      this.count('users', 't."lastSeenAt" >= :c', { c: d1 }),
      this.count('users', 't."lastSeenAt" >= :c', { c: d7 }),
      this.count('users', 't."lastSeenAt" >= :c', { c: d30 }),
      this.count('plaid_items', undefined, {}, distinctUsers),
      this.count('transactions', 't."createdAt" >= :c', { c: d30 }),
      this.count('budgets', undefined, {}, distinctUsers),
      this.count('projects', undefined, {}, distinctUsers),
      this.count('users', 't."netWorthGoalTargetDate" IS NOT NULL'),
      this.count('ai_conversations', 't."createdAt" >= :c', { c: d30 }),
      this.count('ai_messages', 't."createdAt" >= :c', { c: d30 }),
      this.count('receipts'),
      this.ds.createQueryBuilder().select('t."errorCode"', 'code').addSelect('COUNT(*)', 'n').from('plaid_items', 't')
        .where('t.status = :s', { s: 'error' }).groupBy('t."errorCode"').getRawMany(),
      this.ds.createQueryBuilder().select('t."createdAt"', 'createdAt').from('users', 't').where('t."createdAt" >= :c', { c: d84 }).getRawMany(),
    ]);

    const byKey = (rows: { n: unknown }[], key: string) =>
      Object.fromEntries(rows.map((r) => [(r as Record<string, unknown>)[key] as string, num(r.n)]));
    const plans = byKey(planRows, 'plan');
    const statuses = byKey(subRows, 'status');
    const byCode = plaidRows
      .map((r) => ({ code: (r.code as string | null) ?? 'UNKNOWN', count: num(r.n) }))
      .sort((a, b) => b.count - a.count);

    return {
      generatedAt: now.toISOString(),
      users: {
        total, new7d, new30d, verified, unverified: total - verified,
        bySignup: { google, email: total - google },
        weeklySignups: weeklyBuckets(signupRows.map((r) => new Date(r.createdAt)), now, 12),
      },
      revenue: {
        plans: { free: plans.free ?? 0, pro: plans.pro ?? 0, elite: plans.elite ?? 0 },
        subscriptions: {
          trialing: statuses.trialing ?? 0, active: statuses.active ?? 0,
          past_due: statuses.past_due ?? 0, canceled: statuses.canceled ?? 0,
        },
        cancelingAtPeriodEnd: canceling,
        mrrEstimate: estimateMrr(activeSubs as { tier: PaidTier; interval: BillingInterval }[]),
        new30d: subs30d,
        canceled30d,
      },
      engagement: {
        active1d, active7d, active30d, withBankLink,
        avgTransactionsPerActiveUser: active30d > 0 ? Math.round((tx30d / active30d) * 10) / 10 : 0,
        withBudgets, withProjects, withNetWorthGoal: withGoal,
        aiConversations30d: aiConv30d, aiMessages30d: aiMsg30d, receiptsTotal,
      },
      health: {
        plaidErrors: { total: byCode.reduce((s, x) => s + x.count, 0), byCode },
        pastDueSubscriptions: statuses.past_due ?? 0,
      },
    };
  }
}
```
Notes: sqlite returns `createdAt` as a `'YYYY-MM-DD HH:MM:SS.sss'` string, which `new Date()` parses as **local** time. If the weekly-bucket assertion is off by a timezone, normalise with `new Date(String(r.createdAt).replace(' ', 'T') + (String(r.createdAt).includes('Z') || r.createdAt instanceof Date ? '' : 'Z'))` in a small `toDate()` helper. On Postgres the driver returns a `Date`.

- [ ] **Step 9: Run tests**

Run: `npx vitest run --root apps/api src/admin/`
Expected: PASS.

- [ ] **Step 10: Commit**

```bash
git add apps/api/src/admin
git commit -m "feat(admin): app-wide stats service"
```

---

### Task 5: `AdminService.users` (searchable list, no finances)

**Files:**
- Modify: `apps/api/src/admin/admin.service.ts` (add method)
- Test: `apps/api/src/admin/admin.users.test.ts`

**Interfaces:**
- Consumes: `makeDs()` from `admin.test-db.ts`; `AdminUserRow`, `AdminUsersPage` (Task 4).
- Produces: `AdminService.users(q: { search?: string; page?: string | number }): Promise<AdminUsersPage>`; `ADMIN_PAGE_SIZE = 50`.

- [ ] **Step 1: Write the failing test**

`apps/api/src/admin/admin.users.test.ts`:
```ts
import { describe, it, expect, beforeEach } from 'vitest';
import type { DataSource } from 'typeorm';
import { User } from '../users/user.entity';
import { Subscription } from '../billing/subscription.entity';
import { PlaidItem } from '../plaid/plaid-item.entity';
import { Transaction } from '../transactions/transaction.entity';
import { AdminService, ADMIN_PAGE_SIZE } from './admin.service';
import { makeDs } from './admin.test-db';

let ds: DataSource;
let service: AdminService;

async function user(email: string, p: Partial<User> = {}): Promise<User> {
  const repo = ds.getRepository(User);
  return repo.save(repo.create({ email, name: email.split('@')[0], emailVerified: true, ...p }));
}

beforeEach(async () => {
  ds = await makeDs();
  service = new AdminService(ds);
});

describe('AdminService.users', () => {
  it('returns exactly the allowed fields, with zero counts for an empty account', async () => {
    await user('lonely@x.com', { stripeCustomerId: 'cus_secret', plaidUserId: 'plaid_secret', googleId: 'g-secret' });
    const { rows } = await service.users({});
    expect(Object.keys(rows[0]).sort()).toEqual([
      'bankLinks', 'createdAt', 'email', 'emailVerified', 'id', 'lastSeenAt',
      'name', 'plan', 'signupMethod', 'subscriptionStatus', 'transactions',
    ]);
    expect(rows[0]).toMatchObject({ subscriptionStatus: null, bankLinks: 0, transactions: 0, signupMethod: 'google' });
  });

  it('attaches subscription status, bank links and transaction counts per user', async () => {
    const a = await user('a@x.com');
    const subs = ds.getRepository(Subscription);
    await subs.save(subs.create({ userId: a.id, stripeSubscriptionId: 's1', tier: 'pro', interval: 'month', status: 'active' }));
    const items = ds.getRepository(PlaidItem);
    await items.save(items.create({ userId: a.id, accessToken: 'x', itemId: 'i1', institutionId: 'i', institutionName: 'B' } as Partial<PlaidItem>));
    const tx = ds.getRepository(Transaction);
    await tx.save(tx.create({ userId: a.id, name: 't', amount: -5, date: '2026-10-01', source: 'manual' } as Partial<Transaction>));
    const { rows } = await service.users({});
    expect(rows[0]).toMatchObject({ email: 'a@x.com', subscriptionStatus: 'active', bankLinks: 1, transactions: 1, signupMethod: 'email' });
  });

  it('pages 50 at a time, newest first, and clamps bad page values', async () => {
    for (let i = 0; i < 55; i++) await user(`u${i}@x.com`, { createdAt: new Date(Date.UTC(2026, 0, 1, 0, i)) });
    const p1 = await service.users({ page: '1' });
    expect(p1).toMatchObject({ total: 55, page: 1, pageSize: ADMIN_PAGE_SIZE });
    expect(p1.rows).toHaveLength(50);
    expect(p1.rows[0].email).toBe('u54@x.com');
    expect((await service.users({ page: 2 })).rows).toHaveLength(5);
    for (const bad of ['0', '-3', 'abc', undefined]) expect((await service.users({ page: bad })).page).toBe(1);
    expect((await service.users({ page: '999' })).page).toBe(2); // clamps to last page
  });

  it('searches email and name case-insensitively', async () => {
    await user('Alice@x.com', { name: 'Alice' });
    await user('bob@x.com', { name: 'Robert Smith' });
    expect((await service.users({ search: 'ALICE' })).rows.map((r) => r.email)).toEqual(['Alice@x.com']);
    expect((await service.users({ search: 'smith' })).rows.map((r) => r.email)).toEqual(['bob@x.com']);
  });

  it('treats %, _ and \\ in search as literal characters', async () => {
    await user('a_b@x.com');
    await user('axb@x.com');
    await user('pct@x.com', { name: '100%' });
    expect((await service.users({ search: 'a_b' })).rows.map((r) => r.email)).toEqual(['a_b@x.com']);
    expect((await service.users({ search: '%' })).rows.map((r) => r.email)).toEqual(['pct@x.com']);
    expect((await service.users({ search: '\\' })).rows).toEqual([]);
  });
});
```
Use the same `PlaidItem` / `Transaction` required fields you settled on in Task 4.

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run --root apps/api src/admin/admin.users.test.ts`
Expected: FAIL, `ADMIN_PAGE_SIZE` / `users` missing.

- [ ] **Step 3: Implement**

Add to `apps/api/src/admin/admin.service.ts`. Extend the type import to `import type { AdminStats, AdminUserRow, AdminUsersPage } from './admin.types';`, then add above the class:
```ts
export const ADMIN_PAGE_SIZE = 50;

/** LIKE pattern that matches `s` literally (escape char: backslash). */
function likeContains(s: string): string {
  return `%${s.toLowerCase().replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}

const iso = (v: unknown): string | null => {
  if (v == null) return null;
  if (v instanceof Date) return v.toISOString();
  const s = String(v);
  return new Date(s.includes('T') ? s : `${s.replace(' ', 'T')}Z`).toISOString();
};
```
and this method inside the class:
```ts
  async users(q: { search?: string; page?: string | number }): Promise<AdminUsersPage> {
    const search = (q.search ?? '').trim().slice(0, 100);
    const base = () => {
      const qb = this.ds.createQueryBuilder().from('users', 'u');
      if (search) {
        qb.where(`(LOWER(u.email) LIKE :q ESCAPE '\\' OR LOWER(COALESCE(u.name, '')) LIKE :q ESCAPE '\\')`, { q: likeContains(search) });
      }
      return qb;
    };

    const total = num((await base().select('COUNT(*)', 'n').getRawOne())?.n);
    const lastPage = Math.max(1, Math.ceil(total / ADMIN_PAGE_SIZE));
    const asked = Math.floor(Number(q.page));
    const page = Number.isFinite(asked) && asked >= 1 ? Math.min(asked, lastPage) : 1;

    // Explicit column list: nothing financial or secret can reach the response.
    const users = await base()
      .select(['u.id AS id', 'u.email AS email', 'u.name AS name', 'u.plan AS plan',
        'u."googleId" IS NOT NULL AS "isGoogle"', 'u."emailVerified" AS "emailVerified"',
        'u."createdAt" AS "createdAt"', 'u."lastSeenAt" AS "lastSeenAt"'])
      .orderBy('u."createdAt"', 'DESC')
      .offset((page - 1) * ADMIN_PAGE_SIZE)
      .limit(ADMIN_PAGE_SIZE)
      .getRawMany();

    const ids = users.map((u) => u.id as string);
    const perUser = async (table: string) => {
      if (!ids.length) return new Map<string, number>();
      const rows = await this.ds.createQueryBuilder().select('t."userId"', 'userId').addSelect('COUNT(*)', 'n')
        .from(table, 't').where('t."userId" IN (:...ids)', { ids }).groupBy('t."userId"').getRawMany();
      return new Map(rows.map((r) => [r.userId as string, num(r.n)]));
    };
    const [bankLinks, txCounts, subRows] = await Promise.all([
      perUser('plaid_items'),
      perUser('transactions'),
      ids.length
        ? this.ds.createQueryBuilder().select('t."userId"', 'userId').addSelect('t.status', 'status')
            .from('subscriptions', 't').where('t."userId" IN (:...ids)', { ids }).getRawMany()
        : Promise.resolve([] as { userId: string; status: string }[]),
    ]);
    const subStatus = new Map(subRows.map((r) => [r.userId as string, r.status as AdminUserRow['subscriptionStatus']]));

    const rows: AdminUserRow[] = users.map((u) => ({
      id: u.id,
      email: u.email,
      name: u.name ?? null,
      plan: u.plan,
      subscriptionStatus: subStatus.get(u.id) ?? null,
      signupMethod: num(u.isGoogle) || u.isGoogle === true ? 'google' : 'email',
      emailVerified: u.emailVerified === true || num(u.emailVerified) === 1,
      createdAt: iso(u.createdAt) as string,
      lastSeenAt: iso(u.lastSeenAt),
      bankLinks: bankLinks.get(u.id) ?? 0,
      transactions: txCounts.get(u.id) ?? 0,
    }));
    return { rows, total, page, pageSize: ADMIN_PAGE_SIZE };
  }
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run --root apps/api src/admin/`
Expected: PASS. If sqlite returns `isGoogle` as `0/1` and Postgres as a boolean, the `signupMethod` line already handles both.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/admin
git commit -m "feat(admin): paginated user list without financial fields"
```

---

### Task 6: Controller, module, deploy wiring, docs

**Files:**
- Create: `apps/api/src/admin/admin.controller.ts`, `apps/api/src/admin/admin.module.ts`
- Test: `apps/api/src/admin/admin.controller.test.ts`
- Modify: `apps/api/src/app/app.module.ts` (imports list), `deploy/ci-deploy.sh:12-14,28`, `CLAUDE.md` (Environment block)

**Interfaces:**
- Consumes: `AdminGuard` (Task 1), `AdminService.stats/users` (Tasks 4–5), `JwtAuthGuard`.
- Produces: `GET /api/admin/stats` → `AdminStats`; `GET /api/admin/users?search=&page=` → `AdminUsersPage`.

- [ ] **Step 1: Write the failing test**

`apps/api/src/admin/admin.controller.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { AdminController } from './admin.controller';
import { AdminGuard } from './admin.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

describe('AdminController', () => {
  it('protects every route with JwtAuthGuard then AdminGuard', () => {
    expect(Reflect.getMetadata(GUARDS_METADATA, AdminController)).toEqual([JwtAuthGuard, AdminGuard]);
  });

  it('passes search and page through to the service', async () => {
    const calls: unknown[] = [];
    const svc = { users: async (q: unknown) => { calls.push(q); return { rows: [], total: 0, page: 1, pageSize: 50 }; } };
    await new AdminController(svc as any).users('bob', '2');
    expect(calls).toEqual([{ search: 'bob', page: '2' }]);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run --root apps/api src/admin/admin.controller.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement controller and module**

`apps/api/src/admin/admin.controller.ts`:
```ts
import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AdminGuard } from './admin.guard';
import { AdminService } from './admin.service';

/* Read-only. Non-admins get 404 from AdminGuard. Search text is never logged. */
@Controller('admin')
@UseGuards(JwtAuthGuard, AdminGuard)
export class AdminController {
  constructor(private admin: AdminService) {}

  @Get('stats')
  stats() {
    return this.admin.stats(new Date());
  }

  @Get('users')
  users(@Query('search') search?: string, @Query('page') page?: string) {
    return this.admin.users({ search, page });
  }
}
```

`apps/api/src/admin/admin.module.ts`:
```ts
import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { AdminGuard } from './admin.guard';

@Module({
  providers: [AdminService, AdminGuard],
  controllers: [AdminController],
})
export class AdminModule {}
```
`DataSource` and `ConfigService` are injectable app-wide (TypeORM root module, global ConfigModule).

In `apps/api/src/app/app.module.ts` add `import { AdminModule } from '../admin/admin.module';` and append `AdminModule,` after `BillingModule,` in `imports`.

- [ ] **Step 4: Deploy wiring and docs**

In `deploy/ci-deploy.sh`:
- In the header comment's secret list, add `ADMIN_EMAILS (API: comma-separated admin login emails)` after `PROXY_SHARED_SECRET … matches)`.
- In the **API** `--set-secrets` string (line ~28), append `,ADMIN_EMAILS=ADMIN_EMAILS:latest` before the closing quote. Do not touch the web service's `--set-secrets`.

In `CLAUDE.md` Environment block, after the `PROXY_SHARED_SECRET` lines add:
```
ADMIN_EMAILS               # comma-separated login emails allowed into /admin (Secret Manager
                            # in Cloud Run); unset = nobody is an admin
```

Add `ADMIN_EMAILS=info@osmioservices.com` to your local repo-root `.env` (not committed).

- [ ] **Step 5: Run tests, typecheck and build**

Run: `npm run test:api && npx tsc --noEmit -p apps/api/tsconfig.app.json && npm run build:api`
Expected: all pass, build succeeds.

- [ ] **Step 6: Smoke-test against the local API**

Run `node dist/apps/api/main.js`, then log in through the web app as the admin and as a normal user:
- `curl -s -b 'access_token=<admin token>' localhost:3333/api/admin/stats | head -c 400` → JSON with `users.total`.
- Same with a non-admin token → `{"statusCode":404,...}`.
- No cookie → 401 (JwtAuthGuard runs first).

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/admin apps/api/src/app/app.module.ts deploy/ci-deploy.sh CLAUDE.md
git commit -m "feat(admin): /api/admin stats and users endpoints"
```

---

### Task 7: Web plumbing: types, formatting, hooks, sidebar link

**Files:**
- Create: `apps/web/src/lib/admin/types.ts`, `apps/web/src/lib/admin/format.ts`, `apps/web/src/lib/admin/format.test.ts`, `apps/web/src/hooks/useAdmin.ts`
- Modify: `apps/web/vitest.config.ts` (include list), `apps/web/src/components/UserProvider.tsx:8-17`, `apps/web/src/components/Sidebar.tsx` (Account section, ~line 160)

**Interfaces:**
- Consumes: API shapes from Task 4 (`AdminStats`, `AdminUserRow`, `AdminUsersPage`).
- Produces: `relativeTime(iso: string | null, now?: Date): string`; `money(n: number): string`; `useAdminStats(): { data: AdminStats | null; loading: boolean; notFound: boolean; error: string | null; reload: () => void }`; `useAdminUsers(search: string, page: number): { data: AdminUsersPage | null; loading: boolean; error: string | null }`; `User.isAdmin?: boolean`.

- [ ] **Step 1: Write the failing test**

`apps/web/src/lib/admin/format.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { relativeTime, money } from './format';

const NOW = new Date('2026-10-13T12:00:00Z');

describe('relativeTime', () => {
  it('handles never, just now, minutes, hours and days', () => {
    expect(relativeTime(null, NOW)).toBe('Never');
    expect(relativeTime('2026-10-13T11:59:30Z', NOW)).toBe('Just now');
    expect(relativeTime('2026-10-13T11:15:00Z', NOW)).toBe('45m ago');
    expect(relativeTime('2026-10-13T07:00:00Z', NOW)).toBe('5h ago');
    expect(relativeTime('2026-10-10T12:00:00Z', NOW)).toBe('3d ago');
  });
  it('falls back to a date after 30 days', () => {
    expect(relativeTime('2026-08-01T12:00:00Z', NOW)).toBe('Aug 1, 2026');
  });
});

describe('money', () => {
  it('formats dollars with cents', () => {
    expect(money(11.38)).toBe('$11.38');
    expect(money(1234.5)).toBe('$1,234.50');
  });
});
```

Add `'src/lib/admin/**/*.test.ts'` to the `include` array in `apps/web/vitest.config.ts`.

- [ ] **Step 2: Run to verify it fails**

Run: `npm run test:dashboard`
Expected: FAIL, `./format` not found.

- [ ] **Step 3: Implement types and format**

`apps/web/src/lib/admin/types.ts`: copy `AdminStats`, `AdminUserRow`, `AdminUsersPage` **verbatim** from `apps/api/src/admin/admin.types.ts` (Task 4, Step 5), with this header comment:
```ts
/* Mirrors apps/api/src/admin/admin.types.ts — keep the two in sync. */
```

`apps/web/src/lib/admin/format.ts`:
```ts
const MIN = 60_000, HOUR = 60 * MIN, DAY = 24 * HOUR;

/** "Never" / "Just now" / "45m ago" / "5h ago" / "3d ago", then a short date. */
export function relativeTime(iso: string | null, now: Date = new Date()): string {
  if (!iso) return 'Never';
  const t = new Date(iso);
  const diff = now.getTime() - t.getTime();
  if (diff < MIN) return 'Just now';
  if (diff < HOUR) return `${Math.floor(diff / MIN)}m ago`;
  if (diff < DAY) return `${Math.floor(diff / HOUR)}h ago`;
  if (diff < 30 * DAY) return `${Math.floor(diff / DAY)}d ago`;
  return t.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
}

export function money(n: number): string {
  return `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
```

- [ ] **Step 4: Run tests**

Run: `npm run test:dashboard`
Expected: PASS.

- [ ] **Step 5: Hooks**

`apps/web/src/hooks/useAdmin.ts`:
```ts
'use client';

import { useCallback, useEffect, useState } from 'react';
import type { AdminStats, AdminUsersPage } from '@/lib/admin/types';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3333/api';

export function useAdminStats() {
  const [data, setData] = useState<AdminStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(() => {
    setLoading(true);
    setError(null);
    fetch(`${API}/admin/stats`, { credentials: 'include' })
      .then(async (r) => {
        if (r.status === 404) { setNotFound(true); return; }
        if (!r.ok) throw new Error(`Could not load stats (${r.status}).`);
        setData(await r.json());
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { reload(); }, [reload]);
  return { data, loading, notFound, error, reload };
}

export function useAdminUsers(search: string, page: number) {
  const [data, setData] = useState<AdminUsersPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const ctrl = new AbortController();
    setLoading(true);
    setError(null);
    const qs = new URLSearchParams({ page: String(page) });
    if (search.trim()) qs.set('search', search.trim());
    fetch(`${API}/admin/users?${qs}`, { credentials: 'include', signal: ctrl.signal })
      .then(async (r) => {
        if (!r.ok) throw new Error(`Could not load users (${r.status}).`);
        setData(await r.json());
      })
      .catch((e: Error) => { if (e.name !== 'AbortError') setError(e.message); })
      .finally(() => { if (!ctrl.signal.aborted) setLoading(false); });
    return () => ctrl.abort();
  }, [search, page]);

  return { data, loading, error };
}
```

- [ ] **Step 6: `isAdmin` on the user, sidebar link**

In `apps/web/src/components/UserProvider.tsx`, add `isAdmin?: boolean;` to `interface User` after `createdAt?`.

In `apps/web/src/components/Sidebar.tsx`, inside the Account section `<div className="px-4 pb-2 flex flex-col gap-1.5">`, insert this **before** the Settings IIFE:
```tsx
        {user?.isAdmin && (() => {
          const active = pathname === '/admin';
          return (
            <Link href="/admin"
              className="flex items-center gap-3.5 px-3.5 py-3 rounded-xl text-[15px] transition-all relative"
              style={{
                color: active ? 'var(--nav-active-fg, var(--color-text-primary))' : 'var(--color-text-secondary)',
                background: active ? 'var(--nav-active-bg)' : 'transparent',
                border: active ? 'var(--nav-active-border, 1px solid transparent)' : '1px solid transparent',
                letterSpacing: '0.03em',
                fontWeight: active ? 500 : 400,
              }}
              onMouseEnter={(e) => { if (!active) e.currentTarget.style.background = 'var(--color-elevated)'; }}
              onMouseLeave={(e) => { if (!active) e.currentTarget.style.background = 'transparent'; }}
            >
              {active && (
                <span className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 rounded-r-full"
                  style={{ background: 'var(--nav-active-bar)' }} />
              )}
              <span style={{ color: active ? 'var(--nav-icon-active)' : 'var(--color-text-muted)' }}><AdminIcon /></span>
              Admin
            </Link>
          );
        })()}
```
and add next to `SettingsIcon` at the bottom of the file:
```tsx
function AdminIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 3l8 3v6c0 4.5-3.4 8.2-8 9-4.6-.8-8-4.5-8-9V6l8-3z" />
      <path d="M9 12l2 2 4-4" />
    </svg>
  );
}
```
Match `SettingsIcon`'s width/height/strokeWidth if they differ from 18/1.8.

- [ ] **Step 7: Typecheck**

Run: `npx tsc --noEmit -p apps/web/tsconfig.json 2>&1 | grep -E "admin|Sidebar|UserProvider|useAdmin"`
Expected: no output.

- [ ] **Step 8: Commit**

```bash
git add apps/web/src/lib/admin apps/web/src/hooks/useAdmin.ts apps/web/vitest.config.ts apps/web/src/components/UserProvider.tsx apps/web/src/components/Sidebar.tsx
git commit -m "feat(web): admin data hooks and sidebar link for admins"
```

---

### Task 8: `/admin` page

**Files:**
- Create: `apps/web/src/app/admin/page.tsx`
- Create: `apps/web/src/app/admin/components/AdminStatTiles.tsx`, `SignupsChart.tsx`, `PlansPanel.tsx`, `EngagementPanel.tsx`, `HealthPanel.tsx`, `UsersTable.tsx`

**Interfaces:**
- Consumes: `useAdminStats`, `useAdminUsers`, `relativeTime`, `money`, types (Task 7); `Panel`, `PanelEmpty` from `@/components/dashboard/Panel`; `makeChartTheme` from `@/components/dashboard/chartTheme`; `useThemeColors` from `@/components/ThemeProvider`; `Sidebar`.
- Produces: the page. No exports used elsewhere.

- [ ] **Step 1: Shared row helper and stat tiles**

`apps/web/src/app/admin/components/AdminStatTiles.tsx`:
```tsx
'use client';

import type { AdminStats } from '@/lib/admin/types';
import { money } from '@/lib/admin/format';

const glass: React.CSSProperties = {
  background: 'var(--color-surface)', backdropFilter: 'var(--glass-blur)', WebkitBackdropFilter: 'var(--glass-blur)',
  border: 'var(--glass-border)', boxShadow: 'var(--glass-shadow)',
};

/** Label/value line used by every admin panel. */
export function Row({ label, value, tone }: { label: string; value: React.ReactNode; tone?: string }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1.5 text-sm" style={{ borderBottom: '1px solid var(--color-border)' }}>
      <span style={{ color: 'var(--color-text-secondary)' }}>{label}</span>
      <span className="font-semibold tabular-nums" style={{ color: tone ?? 'var(--color-text-primary)' }}>{value}</span>
    </div>
  );
}

export default function AdminStatTiles({ s }: { s: AdminStats }) {
  const paying = s.revenue.subscriptions.active;
  const tiles = [
    { label: 'Total users', value: s.users.total.toLocaleString(), sub: `${s.users.verified} verified` },
    { label: 'New (30 days)', value: s.users.new30d.toLocaleString(), sub: `${s.users.new7d} this week` },
    { label: 'Active (7 days)', value: s.engagement.active7d.toLocaleString(), sub: `${s.engagement.active1d} today` },
    { label: 'Est. MRR', value: money(s.revenue.mrrEstimate), sub: 'list prices, active subs' },
    { label: 'Paying subs', value: paying.toLocaleString(), sub: `${s.revenue.subscriptions.trialing} trialing` },
  ];
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 gap-4">
      {tiles.map((t) => (
        <div key={t.label} className="card-lift rounded-2xl p-5 min-w-0" style={glass}>
          <p className="text-xs truncate" style={{ color: 'var(--color-text-secondary)' }}>{t.label}</p>
          <p className="text-2xl font-bold tabular-nums mt-1 truncate">{t.value}</p>
          <p className="text-[11px] mt-0.5 truncate" style={{ color: 'var(--color-text-muted)' }}>{t.sub}</p>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Signups chart**

`apps/web/src/app/admin/components/SignupsChart.tsx`:
```tsx
'use client';

import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { useThemeColors } from '@/components/ThemeProvider';
import Panel from '@/components/dashboard/Panel';
import { makeChartTheme } from '@/components/dashboard/chartTheme';
import type { AdminStats } from '@/lib/admin/types';

const label = (week: string) =>
  new Date(`${week}T00:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });

export default function SignupsChart({ weeks }: { weeks: AdminStats['users']['weeklySignups'] }) {
  const tc = useThemeColors();
  const th = makeChartTheme(tc);
  const data = weeks.map((w) => ({ ...w, label: label(w.week) }));
  return (
    <Panel title="Signups per week" subtitle="Last 12 weeks" colSpan={2}>
      <div className="h-56">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data}>
            <CartesianGrid {...th.grid} strokeDasharray="3 6" />
            <XAxis dataKey="label" {...th.xAxis} interval="preserveStartEnd" />
            <YAxis {...th.yAxis} tickFormatter={(v: number) => String(v)} allowDecimals={false} width={32} />
            <Tooltip {...th.tooltip} formatter={(v: unknown) => [String(v), 'Signups']} />
            <Bar dataKey="count" fill={tc.green} radius={[6, 6, 0, 0]} maxBarSize={32} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </Panel>
  );
}
```

- [ ] **Step 3: Plans, engagement and health panels**

`apps/web/src/app/admin/components/PlansPanel.tsx`:
```tsx
'use client';

import Panel from '@/components/dashboard/Panel';
import { useThemeColors } from '@/components/ThemeProvider';
import type { AdminStats } from '@/lib/admin/types';
import { money } from '@/lib/admin/format';
import { Row } from './AdminStatTiles';

export default function PlansPanel({ r }: { r: AdminStats['revenue'] }) {
  const tc = useThemeColors();
  return (
    <Panel title="Plans & subscriptions">
      <div className="flex flex-col">
        <Row label="Free" value={r.plans.free} />
        <Row label="Pro" value={r.plans.pro} />
        <Row label="Elite" value={r.plans.elite} />
        <Row label="Active subscriptions" value={r.subscriptions.active} />
        <Row label="Trialing" value={r.subscriptions.trialing} />
        <Row label="Past due" value={r.subscriptions.past_due} tone={r.subscriptions.past_due ? tc.amber : undefined} />
        <Row label="Canceling at period end" value={r.cancelingAtPeriodEnd} />
        <Row label="New subscriptions (30d)" value={r.new30d} />
        <Row label="Canceled (30d)" value={r.canceled30d} />
        <Row label="Est. MRR" value={money(r.mrrEstimate)} />
      </div>
    </Panel>
  );
}
```

`apps/web/src/app/admin/components/EngagementPanel.tsx`:
```tsx
'use client';

import Panel from '@/components/dashboard/Panel';
import type { AdminStats } from '@/lib/admin/types';
import { Row } from './AdminStatTiles';

export default function EngagementPanel({ e, total }: { e: AdminStats['engagement']; total: number }) {
  const pct = (n: number) => (total > 0 ? ` · ${Math.round((n / total) * 100)}%` : '');
  return (
    <Panel title="Engagement">
      <div className="flex flex-col">
        <Row label="Active today" value={e.active1d} />
        <Row label="Active 7 days" value={e.active7d} />
        <Row label="Active 30 days" value={e.active30d} />
        <Row label="Linked a bank" value={`${e.withBankLink}${pct(e.withBankLink)}`} />
        <Row label="Use budgets" value={`${e.withBudgets}${pct(e.withBudgets)}`} />
        <Row label="Use projects" value={`${e.withProjects}${pct(e.withProjects)}`} />
        <Row label="Set a $1M goal" value={`${e.withNetWorthGoal}${pct(e.withNetWorthGoal)}`} />
        <Row label="Transactions / active user (30d)" value={e.avgTransactionsPerActiveUser} />
        <Row label="AI conversations (30d)" value={e.aiConversations30d} />
        <Row label="AI messages (30d)" value={e.aiMessages30d} />
        <Row label="Receipts imported" value={e.receiptsTotal} />
      </div>
    </Panel>
  );
}
```

`apps/web/src/app/admin/components/HealthPanel.tsx`:
```tsx
'use client';

import Panel from '@/components/dashboard/Panel';
import { useThemeColors } from '@/components/ThemeProvider';
import type { AdminStats } from '@/lib/admin/types';
import { Row } from './AdminStatTiles';

const LOGS_URL =
  'https://console.cloud.google.com/logs/query;query=resource.labels.service_name%3D%22cofre-api%22%0Aseverity%3E%3DERROR?project=cofre-dev';

export default function HealthPanel({ h }: { h: AdminStats['health'] }) {
  const tc = useThemeColors();
  return (
    <Panel title="System health">
      <div className="flex flex-col">
        <Row label="Bank connections in error" value={h.plaidErrors.total} tone={h.plaidErrors.total ? tc.rose : tc.green} />
        {h.plaidErrors.byCode.map((c) => (
          <Row key={c.code} label={`· ${c.code}`} value={c.count} />
        ))}
        <Row label="Past-due subscriptions" value={h.pastDueSubscriptions} tone={h.pastDueSubscriptions ? tc.amber : undefined} />
      </div>
      <a href={LOGS_URL} target="_blank" rel="noopener noreferrer"
        className="text-xs font-semibold mt-1 hover:underline" style={{ color: 'var(--color-primary)' }}>
        Open API errors in Cloud Logging ↗
      </a>
    </Panel>
  );
}
```

- [ ] **Step 4: Users table (cards below md)**

`apps/web/src/app/admin/components/UsersTable.tsx`:
```tsx
'use client';

import { useEffect, useState } from 'react';
import Panel, { PanelEmpty } from '@/components/dashboard/Panel';
import { useAdminUsers } from '@/hooks/useAdmin';
import { relativeTime } from '@/lib/admin/format';
import type { AdminUserRow } from '@/lib/admin/types';

const PLAN = { free: 'Basic', pro: 'Pro', elite: 'Elite' } as const;
const date = (iso: string) => new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
const sub = (u: AdminUserRow) => `${PLAN[u.plan]}${u.subscriptionStatus ? ` · ${u.subscriptionStatus.replace('_', ' ')}` : ''}`;

export default function UsersTable() {
  const [input, setInput] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const { data, loading, error } = useAdminUsers(search, page);

  // Debounce typing; a new search always starts on page 1.
  useEffect(() => {
    const t = setTimeout(() => { setSearch(input); setPage(1); }, 300);
    return () => clearTimeout(t);
  }, [input]);

  const lastPage = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  return (
    <Panel colSpan={2} title="Users" subtitle={data ? `${data.total.toLocaleString()} total` : undefined}
      legend={
        <input value={input} onChange={(e) => setInput(e.target.value)} placeholder="Search email or name"
          aria-label="Search users" maxLength={100}
          className="px-3 py-1.5 rounded-lg text-sm outline-none w-full sm:w-64"
          style={{ background: 'var(--color-elevated)', border: '1px solid var(--color-border)', color: 'var(--color-text-primary)' }} />
      }>
      {error ? <PanelEmpty message={error} />
        : !data || (loading && !data.rows.length) ? <PanelEmpty message="Loading…" />
        : data.rows.length === 0 ? <PanelEmpty message="No users match." />
        : (
          <div className="flex flex-col gap-3" style={{ opacity: loading ? 0.6 : 1 }}>
            {/* Desktop table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-[11px] uppercase tracking-wider" style={{ color: 'var(--color-text-muted)' }}>
                    {['User', 'Plan', 'Sign-up', 'Joined', 'Last seen', 'Banks', 'Transactions'].map((h) => (
                      <th key={h} className="py-2 pr-4 font-semibold">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.rows.map((u) => (
                    <tr key={u.id} style={{ borderTop: '1px solid var(--color-border)' }}>
                      <td className="py-2.5 pr-4 min-w-0">
                        <p className="font-semibold truncate max-w-64">{u.name || '—'}</p>
                        <p className="text-xs truncate max-w-64" style={{ color: 'var(--color-text-muted)' }}>
                          {u.email}{u.emailVerified ? '' : ' · unverified'}
                        </p>
                      </td>
                      <td className="py-2.5 pr-4 whitespace-nowrap">{sub(u)}</td>
                      <td className="py-2.5 pr-4 capitalize">{u.signupMethod}</td>
                      <td className="py-2.5 pr-4 whitespace-nowrap">{date(u.createdAt)}</td>
                      <td className="py-2.5 pr-4 whitespace-nowrap">{relativeTime(u.lastSeenAt)}</td>
                      <td className="py-2.5 pr-4 tabular-nums">{u.bankLinks}</td>
                      <td className="py-2.5 pr-4 tabular-nums">{u.transactions.toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Phone cards */}
            <div className="md:hidden flex flex-col gap-2">
              {data.rows.map((u) => (
                <div key={u.id} className="rounded-xl p-3 text-sm" style={{ border: 'var(--glass-border)' }}>
                  <p className="font-semibold truncate">{u.name || '—'}</p>
                  <p className="text-xs truncate" style={{ color: 'var(--color-text-muted)' }}>{u.email}{u.emailVerified ? '' : ' · unverified'}</p>
                  <p className="text-xs mt-1.5" style={{ color: 'var(--color-text-secondary)' }}>
                    {sub(u)} · {u.signupMethod} · joined {date(u.createdAt)}
                  </p>
                  <p className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>
                    Seen {relativeTime(u.lastSeenAt)} · {u.bankLinks} banks · {u.transactions.toLocaleString()} tx
                  </p>
                </div>
              ))}
            </div>

            <div className="flex items-center justify-between text-xs" style={{ color: 'var(--color-text-secondary)' }}>
              <span>Page {data.page} of {lastPage}</span>
              <div className="flex gap-2">
                {[{ label: '‹ Prev', to: data.page - 1, off: data.page <= 1 }, { label: 'Next ›', to: data.page + 1, off: data.page >= lastPage }].map((b) => (
                  <button key={b.label} type="button" disabled={b.off} onClick={() => setPage(b.to)}
                    className="px-3 py-1.5 rounded-lg font-semibold cursor-pointer disabled:opacity-30 disabled:cursor-default"
                    style={{ background: 'var(--color-elevated)', border: '1px solid var(--color-border)' }}>
                    {b.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
    </Panel>
  );
}
```

- [ ] **Step 5: Page**

`apps/web/src/app/admin/page.tsx`:
```tsx
'use client';

import Sidebar from '@/components/Sidebar';
import { useAdminStats } from '@/hooks/useAdmin';
import AdminStatTiles from './components/AdminStatTiles';
import SignupsChart from './components/SignupsChart';
import PlansPanel from './components/PlansPanel';
import EngagementPanel from './components/EngagementPanel';
import HealthPanel from './components/HealthPanel';
import UsersTable from './components/UsersTable';

export default function AdminPage() {
  const { data, loading, notFound, error, reload } = useAdminStats();

  return (
    <div className="flex h-dvh overflow-hidden">
      <Sidebar />
      <main className="flex-1 overflow-y-auto pt-14 md:pt-0">
        <div className="px-4 sm:px-6 md:px-8 py-6 flex flex-col gap-5">
          {notFound ? (
            <div className="flex-1 min-h-[50vh] flex flex-col items-center justify-center text-center gap-2">
              <p className="text-2xl font-bold">Not found</p>
              <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>This page does not exist.</p>
            </div>
          ) : (
            <>
              <div className="flex items-end justify-between gap-3 flex-wrap">
                <div>
                  <h1 className="font-bold tracking-tight" style={{ fontSize: 'clamp(26px, 3vw, 38px)' }}>Admin</h1>
                  <p className="text-sm mt-1" style={{ color: 'var(--color-text-secondary)' }}>
                    {data ? `Updated ${new Date(data.generatedAt).toLocaleTimeString()}` : 'How Cofre is doing'}
                  </p>
                </div>
                <button type="button" onClick={reload} disabled={loading}
                  className="px-4 py-2 rounded-xl text-sm font-semibold cursor-pointer disabled:opacity-40"
                  style={{ background: 'var(--color-elevated)', border: '1px solid var(--color-border)' }}>
                  {loading ? 'Refreshing…' : 'Refresh'}
                </button>
              </div>

              {error && (
                <div className="flex items-center justify-between gap-4 rounded-2xl px-5 py-3.5 flex-wrap"
                  style={{ background: 'color-mix(in srgb, var(--color-rose) 8%, transparent)', border: '1px solid color-mix(in srgb, var(--color-rose) 25%, transparent)' }}>
                  <span className="text-sm" style={{ color: 'var(--color-rose)' }}>{error}</span>
                  <button onClick={reload} className="text-xs font-semibold uppercase cursor-pointer" style={{ color: 'var(--color-rose)' }}>Retry</button>
                </div>
              )}

              {data && (
                <>
                  <AdminStatTiles s={data} />
                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-5">
                    <SignupsChart weeks={data.users.weeklySignups} />
                    <PlansPanel r={data.revenue} />
                    <HealthPanel h={data.health} />
                    <EngagementPanel e={data.engagement} total={data.users.total} />
                    <UsersTable />
                  </div>
                </>
              )}
            </>
          )}
        </div>
      </main>
    </div>
  );
}
```
On `md` (2 columns) `SignupsChart` and `UsersTable` take a full row because `Panel colSpan={2}` only spans at `xl`. Add `md:col-span-2` to those two by wrapping each in `<div className="md:col-span-2 xl:col-span-2 min-w-0 flex">…</div>` if they render half-width at `md`. Check at 900px wide in Step 7.

- [ ] **Step 6: Typecheck, lint, tests, build**

Run: `npx tsc --noEmit -p apps/web/tsconfig.json 2>&1 | grep -E "admin|useAdmin"; npx eslint apps/web/src/app/admin apps/web/src/hooks/useAdmin.ts apps/web/src/lib/admin; npm run test:dashboard && npm run build:web`
Expected: no type errors in these files; no lint errors (the pre-existing `react-hooks/exhaustive-deps` rule-not-found error elsewhere is not ours); tests pass; build succeeds.

- [ ] **Step 7: See it in the browser**

Run `npm run dev:api` and `npm run dev:web`, log in as the admin (`ADMIN_EMAILS` in `.env`):
- Sidebar shows **Admin**; `/admin` loads tiles, chart, three panels and the user table.
- Type in search → list filters after ~300 ms; Prev/Next work.
- Check widths 375px, 768px, 900px, 1440px: no horizontal page scroll, table becomes cards below 768px.
- Log in as a non-admin: no Admin link; visiting `/admin` shows "Not found".

- [ ] **Step 8: Commit**

```bash
git add apps/web/src/app/admin
git commit -m "feat(web): /admin page with stats, panels and user list"
```

---

### Task 9: Final verification

- [ ] **Step 1: Full suites and builds**

Run: `npm run test:api && npm run test:dashboard && npm run build:api && npm run build:web && npm run migration:check`
Expected: everything passes; `migration:check` reports no pending schema changes.

- [ ] **Step 2: Check the deploy script change**

Run: `git diff main -- deploy/ci-deploy.sh`
Expected: only `ADMIN_EMAILS=ADMIN_EMAILS:latest` added to the **cofre-api** `--set-secrets`, plus the header comment line.

- [ ] **Step 3: Report**

Do not push. Tell the user the work is committed locally, that the `ADMIN_EMAILS` secret must hold `info@osmioservices.com` as its latest enabled version before pushing, and that active-user counts start at zero after deploy.
