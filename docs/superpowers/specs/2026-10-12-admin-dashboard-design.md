# Admin dashboard — design

Date: 2026-10-12 · Status: approved in chat, pending spec review

## Goal

Give the app owner a private `/admin` page that shows how Cofre is doing: user
count and growth, plans and revenue, engagement, and system health, plus a
searchable user list. Read-only — no editing, impersonation or deletion.

Success: an allowlisted admin opens `/admin` and sees current numbers in one
load; every other user (and anonymous visitor) gets a 404 from the API and no
sign the page exists.

## Decisions (from the brainstorm)

| Question | Decision |
|---|---|
| Stats scope | Users & growth, revenue & plans, engagement, system health — all four |
| Who is admin | `ADMIN_EMAILS` env var allowlist (no DB role, no UI to grant) |
| Individual users | List **without finances** — no balances, amounts or transaction detail |
| Architecture | Live SQL aggregates on request (approach A); no snapshot table, no external BI |
| Revenue | Estimated MRR from local `subscriptions` × list prices; Stripe discounts not reflected |

## 1. Access control

- `ADMIN_EMAILS`: comma-separated, trimmed, compared lowercase. Unset or empty
  means **no admins**.
- `isAdminEmail(email, raw)` — pure helper in `apps/api/src/admin/admin-emails.ts`.
- `AdminGuard` (`apps/api/src/admin/admin.guard.ts`) runs after `JwtAuthGuard`
  and throws `NotFoundException` for non-admins, so admin routes are
  indistinguishable from missing routes.
- `GET /api/auth/me` adds `isAdmin: boolean`. The web `UserProvider` type gains
  it; `Sidebar` shows an **Admin** nav item only when true. The `/admin` page
  shows a "Not found" state when the API answers 404 — the API is the boundary,
  the hidden link is cosmetic.
- Admin routes keep the global throttle.

## 2. Activity tracking

- New column `users.lastSeenAt timestamptz NULL` + migration (generated, added to
  `migrations/index.ts`).
- `UsersService.touchLastSeen(id)` runs
  `UPDATE users SET "lastSeenAt" = now() WHERE id = $1 AND ("lastSeenAt" IS NULL OR "lastSeenAt" < now() - interval '1 hour')`.
  Called from `JwtStrategy.validate` without `await`; failures are logged
  (no user data) and swallowed. At most one write per user per hour.
- `lastSeenAt` is not touched by `updatedAt` semantics — it's a raw query, so
  `@UpdateDateColumn` does not change.
- Active-user metrics start at zero on deploy. Growth series built from
  `createdAt` columns work immediately.

## 3. `GET /api/admin/stats`

`AdminService.stats(now)` returns one JSON object. All counts are SQL aggregates
(`COUNT`, `GROUP BY`), never loading full rows into memory; the only row-level
read is signup timestamps for the 12-week series.

**users**
- `total`, `new7d`, `new30d`
- `verified`, `unverified`
- `bySignup`: `{ google, email }` (`googleId IS NOT NULL` → google)
- `weeklySignups`: last 12 ISO weeks, `{ week: 'YYYY-MM-DD', count }`, zero-filled

**revenue**
- `plans`: `{ free, pro, elite }` from `users.plan`
- `subscriptions`: count by status `{ trialing, active, past_due, canceled }`
- `cancelingAtPeriodEnd`: active/trialing with `cancelAtPeriodEnd = true`
- `mrrEstimate`: sum over `active` subscriptions only (trials excluded — they
  have not paid) of `month` price, or `year / 12`, rounded to cents
- `new30d`, `canceled30d`: subscriptions created / moved to `canceled`
  (`updatedAt`) in the last 30 days
- Prices live in `apps/api/src/admin/plan-prices.ts`, mirroring
  `apps/web/src/lib/plans.ts` (pro 4.99/47.90, elite 7.99/76.70), with a comment
  pointing at both copies.

**engagement**
- `active1d`, `active7d`, `active30d` from `lastSeenAt`
- `withBankLink`: distinct users with a `plaid_items` row
- `avgTransactionsPerActiveUser`: transactions created in last 30 days ÷ `active30d`
  (0 when no active users)
- `withBudgets`, `withProjects`, `withNetWorthGoal`
  (`netWorthGoalTargetDate IS NOT NULL`)
- `aiConversations30d`, `aiMessages30d`
- `receiptsTotal`

**health**
- `plaidErrors`: `{ total, byCode: [{ code, count }] }` for `plaid_items.status = 'error'`
- `pastDueSubscriptions`
- `generatedAt` ISO timestamp

API errors stay in Cloud Logging; the page links to the Logs Explorer
`severity>=ERROR` query for `cofre-api` described in `docs/observability.md`.

## 4. `GET /api/admin/users?search=&page=`

- 50 per page, `createdAt DESC`. `page` ≥ 1, clamped. `search` matches
  `email ILIKE` or `name ILIKE`, parameterised, trimmed, max 100 chars.
- Row: `id, email, name, plan, subscriptionStatus | null, signupMethod
  ('google'|'email'), emailVerified, createdAt, lastSeenAt, bankLinks,
  transactions`.
- Response: `{ rows, total, page, pageSize }`.
- Built with an explicit `select` list — no entity spread — so no financial or
  secret column can leak. A test asserts the exact key set of a row.
- Logging: the request line only (route, status, latency). Search text and
  emails are never logged.

## 5. Web `/admin`

`apps/web/src/app/admin/page.tsx`, client component, `Sidebar` layout like other
pages, responsive at every width.

1. Header "Admin" + "Updated <time>" + refresh button.
2. Stat cards row: Total users · New (30d) · Active (7d) · Est. MRR · Paying subs.
3. Signups per week — recharts bar chart (12 weeks), single series.
4. Plans & subscriptions panel — plan counts, subscription status counts,
   canceling, new/canceled 30d.
5. Engagement panel — active 1/7/30d, bank links, budgets/projects/goals,
   AI usage, receipts.
6. Health panel — Plaid errors by code, past-due subs, link to Cloud Logging.
7. Users table with search (debounced 300 ms) and prev/next paging. Below `md`
   it renders as stacked cards.

Uses `Panel`, the stat-card styling and theme variables only (no hardcoded
colors). Route guard: `/admin` is a protected route in `route-access.ts` (needs a
session like `/dashboard`).

## 6. Error handling

- 404 from the API → "Not found" page state (no redirect, no hint).
- Other failures → existing error-banner pattern with Retry.
- `touchLastSeen` failure never fails the request.

## 7. Testing (Vitest)

- `isAdminEmail`: case, whitespace, empty/unset env, non-listed email.
- `AdminGuard`: admin passes, non-admin → `NotFoundException`, no user → 404.
- `AdminService.stats` against in-memory sqlite seed: counts, verified split,
  signup method, plan and status counts, MRR with monthly + yearly + trialing
  (excluded), Plaid error grouping, zero-filled weeks. To stay sqlite-testable,
  cutoffs are computed in TypeScript and passed as parameters (no `interval` /
  `now()` in stats SQL), and the weekly series is bucketed in TypeScript from a
  `SELECT "createdAt" … WHERE "createdAt" >= :cutoff` query.
- `AdminService.users`: paging, search, and exact row key set (no finance fields).
- `touchLastSeen`: writes when null/stale, skips when fresh.
- `migrations.test.ts` covers the new column.

## Out of scope

Editing users, impersonation, refunds, exact Stripe revenue, historical
active-user charts (needs snapshots), email exports.
