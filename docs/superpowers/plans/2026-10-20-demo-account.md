# Demo account + public demo sandbox — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A permanent Rockefeller/demo account with a full year of realistic data, plus a landing-page "Try the demo" link that gives each visitor a private throwaway copy that is deleted when they leave.

**Architecture:** One deterministic seed generator (`demo-seed.ts`, pure) feeds one writer (`DemoService.populate`). Rockefeller is a normal user populated once; visitors are `isDemo` users populated on `POST /demo/start` and wiped on logout or after 24 h. A global `DemoGuard` blocks a decorated set of routes for `isDemo` users. Web adds `/demo`, a bottom banner, and landing links.

**Tech Stack:** NestJS 11, TypeORM (Postgres; sqlite in tests), Vitest, Next.js 16.

**Spec:** `docs/superpowers/specs/2026-10-20-demo-account-design.md`

## Global Constraints

- Entities and migrations are explicit lists (`config/entities.ts`, `migrations/index.ts`); `migrations.test.ts` fails if the entity schema and migrations diverge.
- Never `Object.assign` a request body onto an entity.
- Rockefeller email `rockefeller@demo.cofre`; login `Rockefeller` / `demo`; `plan = 'pro'`; `isDemo = false`.
- Visitor: `isDemo = true`, `plan = 'pro'`, 4-hour cookie, swept after 24 h; Ask Cofre limit 5.
- `/demo/start` throttled 10 per 15 min per IP.
- Seed is deterministic for a given `{ year, today }`.

## Review Focus

1. A visitor who lets the 4-hour cookie expire and clicks "Try the demo" again gets a fresh sandbox, not a 401 loop — `/demo` page clears state and calls start (Task 7).
2. A real signed-in user clicking "Try the demo" must not lose their session — `/demo` checks `/auth/me` first (Task 7).
3. `/demo/start` under throttle returns 429; the page shows a sign-up fallback, not a spinner forever (Task 7).
4. Wipe must leave zero rows in every user-owned table, including ones without a `userId` column reachable only through a parent (debt payments, AI messages, project categories) — `demo.service.test.ts` asserts every table (Task 3).
5. Recurring rules seeded with transactions must not double-materialise on the next transactions list call — rules carry `lastRunDate`/`runCount` for the last seeded occurrence (Task 2 test).

---

### Task 1: `users.isDemo` column, migration, demo AI limit

**Files:** Modify `users/user.entity.ts`, create `migrations/1792200000000-UserIsDemo.ts`, modify `migrations/index.ts`, modify `ai-agent/ai-usage.ts`, test `ai-agent/ai-usage.test.ts`.

**Produces:** `User.isDemo: boolean`; `dailyMessageLimit('demo') === 5`; `messageUsage(plan, used, now, isDemo?)` treats `isDemo` as plan `'demo'`.

- [ ] Test: `dailyMessageLimit('demo')` is 5; `messageUsage('pro', 2, now, true).limit` is 5. Run, see fail.
- [ ] Implement; run, pass. Add column `@Column({ default: false }) isDemo: boolean` and migration `ALTER TABLE "users" ADD "isDemo" boolean NOT NULL DEFAULT false`.
- [ ] Thread `isDemo` through `ai-chat.controller.ts` and `ai-conversations.controller.ts` (`req.user.isDemo`).

### Task 2: Seed generator

**Files:** Create `demo/demo-seed.ts`, test `demo/demo-seed.test.ts`.

**Produces:** `generateDemoData({ year, today }): DemoData` with `accounts[]` (key, bankName, accountName, accountType, openingBalance, balance, color, last4), `categories[]` (name, icon, color, type, isFixed, wantNeed), `transactions[]` (key?, date, name, merchantName, amount, accountKey, category name | null, transferPairKey?, projectKey?, projectCategoryName?, note?), `budgets[]`, `recurringRules[]`, `categorizationRules[]`, `debts[]` with payments, `projects[]` with categories and purchase/sale, `cardDetails[]`, `cardProfile`, `netWorthSnapshots[]`, `goalTargetDate`, `conversation`.

- [ ] Tests: deterministic (two calls deep-equal); ≥ 900 transactions all within the year; every transfer pair sums to zero; each account's `balance` equals opening + signed effect of its transactions dated ≤ today; 12 months × ≥ 9 budgets; 5 recurring rules each with `lastRunDate` ≤ Dec 31 and `runCount` = occurrences in year; snapshots on the 1st of each month up to `today`'s month, strictly increasing.
- [ ] Implement with a mulberry32 PRNG; run, pass.

### Task 3: DemoService (populate, wipe, visitors, owner)

**Files:** Create `demo/demo.service.ts`, `demo/demo.module.ts`, test `demo/demo.service.test.ts`. Modify `app/app.module.ts`.

**Produces:**
- `populate(userId, data)`; `wipe(userId)` (all owned rows, user row only if `isDemo`); `startVisitor(now): Promise<User>`; `sweepStaleVisitors(now, maxAge = 24h, limit = 50): Promise<number>`; `ensureOwner(): Promise<User>` (create + populate if missing); `resetOwner(): Promise<User>` (wipe + populate); `onApplicationBootstrap()` → `ensureOwner` + sweep (errors logged, never crash boot).
- Constants `DEMO_OWNER_EMAIL`, `DEMO_OWNER_NAME = 'Rockefeller'`, `DEMO_OWNER_PASSWORD = 'demo'`.

- [ ] Tests (sqlite, all entities): startVisitor creates `isDemo` pro user with > 900 transactions and 6 accounts; wipe leaves 0 rows for the user in transactions, budgets, categories, bank_accounts, recurring_rules, categorization_rules, debts, debt_payments, projects, project_categories, credit_card_details, card_profiles, net_worth_snapshots, ai_conversations, ai_messages; wipe of a visitor deletes the user, wipe of Rockefeller keeps the user; sweep deletes a 25 h old visitor, keeps a 1 h old one; `ensureOwner` twice → one Rockefeller with password `demo` (bcrypt compare); `resetOwner` restores the transaction count after a deletion.
- [ ] Implement; run, pass.

### Task 4: DemoGuard + decorator; route coverage

**Files:** Create `common/demo/blocked-in-demo.decorator.ts`, `common/demo/demo.guard.ts`, test `common/demo/demo.guard.test.ts`. Modify controllers: plaid (`link-token`, `exchange/preview`, `exchange/confirm`, `sync/:itemId`, `reconnect-token/:itemId`, `reconnect/:itemId/complete`, `liabilities-token/:itemId`, `liabilities/:itemId/complete`), billing (`checkout`, PATCH `subscription`, `cancel`, `resume`, `portal-link`), gmail (`connect`, `callback`, `disconnect`), auth (`change-password`, PATCH `profile`, `resend-verification`). Register guard as `APP_GUARD` in `app.module.ts`.

- [ ] Test: guard with handler metadata throws `ForbiddenException` code `DEMO_READ_ONLY` for `{ isDemo: true }`, passes for `{ isDemo: false }` and for handlers without metadata. Run, fail; implement; pass.

### Task 5: Auth changes

**Files:** Modify `auth/auth.service.ts` (`validateUser`: identifier without `@` → `${lower}@demo.cofre`), `auth/auth.controller.ts` (logout: if `req.user.isDemo` → `demo.wipe(user.id)` before clearing cookie), `auth/auth.module.ts` imports `DemoModule`. Test: `auth/demo-login.test.ts` for the normalisation (pure helper `normaliseLoginIdentifier`).

### Task 6: Demo + admin endpoints

**Files:** Create `demo/demo.controller.ts` (`POST /demo/start`, `@Throttle({ default: { ttl: 900_000, limit: 10 } })`, signs access token via `AuthService.login`, sets cookie `cookieOptions(undefined, 4h)`), modify `admin/admin.controller.ts` (`POST admin/demo/reset-owner`), `admin/admin.module.ts` imports `DemoModule`.

### Task 7: Web

**Files:** `lib/route-access.ts` (+`/demo`), test; `app/demo/page.tsx`; `components/UserProvider.tsx` (`isDemo?: boolean`); `components/DemoBanner.tsx` + mount in `app/layout.tsx`; `components/Sidebar.tsx` (Leave demo, hide Upgrade); `lib/demo-error.ts` (`isDemoBlocked(status, body)`), used by `connect-bank-error.ts`; landing nav/hero/CTA links; `app/admin/page.tsx` reset button; `hooks/useAdmin.ts` `resetDemoOwner()`.

### Task 8: Docs + verification

CLAUDE.md module row + route row; BACKLOG follow-ups; spec status. Browser check: `/demo` on phone + desktop, banner, logout deletes visitor, Rockefeller login by name, admin reset.
