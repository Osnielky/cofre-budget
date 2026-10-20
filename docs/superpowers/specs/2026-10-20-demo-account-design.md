# Demo account + public demo sandbox — design

Date: 2026-10-20
Status: built 2026-10-20 (see docs/superpowers/plans/2026-10-20-demo-account.md)

## Goal

Two things, sharing one body of fake data for the whole current year (Jan 1 → Dec 31):

1. **Rockefeller** — a permanent, realistic account the owner logs into for videos and
   for showing friends. Login `Rockefeller` / `demo`. Nothing resets it unless the owner
   asks (one click in `/admin`).
2. **Public demo sandbox** — a "Try the demo" link on the landing page. Each visitor gets
   their own private copy of the same data, can change anything (categorize, budget,
   merge, add transactions…), and the copy is thrown away when they leave. Visitors never
   touch Rockefeller and never see each other.

Decisions made with the user: two accounts not one; per-visitor copies that die on exit
(not a shared nightly reset); visitors get Pro features, with Ask Cofre capped and bank
linking / billing disabled.

## Data

### `users.isDemo` (new column, migration)

`boolean NOT NULL DEFAULT false`. True only for **visitor sandboxes**. Rockefeller is a
normal persistent account (`isDemo = false`, `plan = 'pro'`, `emailVerified = true`),
identified by the constant email `rockefeller@demo.cofre`.

### Login by name

`AuthService.validateUser` keeps working on email; if the identifier contains no `@` it is
normalised to `<name>@demo.cofre` (lower-cased). That makes `Rockefeller` / `demo` work on
the normal login form. Password `demo` is set directly by the seeder (bcrypt), bypassing
the 8-character rule that applies to self-registration.

> Note for the owner: the password will be visible to anyone who watches a video, so anyone
> can log in and change Rockefeller's data. Because of that, Rockefeller gets the **same
> route blocks as visitors** (no bank linking, billing, Gmail, password or profile
> changes, no outbound email) — a stranger can rearrange the demo but cannot attach real
> data, spend money or lock the owner out. The admin "Reset Rockefeller" button restores
> the data, the name and the `demo` password in one click.

### Seed generator — `apps/api/src/demo/demo-seed.ts`

A pure, deterministic generator (`seedrandom`-style PRNG with a fixed seed) that returns a
plain object graph for a given year; a writer (`DemoService.populate(userId, year)`) saves
it. Deterministic so Rockefeller and every visitor get identical data and tests can assert
exact counts. Content for the current year:

- **Accounts (6)**: Chase Total Checking, Ally High-Yield Savings, Amex Blue Cash (credit),
  Chase Sapphire Preferred (credit), Fidelity Brokerage (investment), Toyota car loan
  (other_liability). Balances consistent with the transactions.
- **Categories**: the app's defaults plus `Coffee`, `Pets`, `Kids activities`, `Side gigs`.
- **Transactions (~900)**: salary on the 1st and 15th, freelance payouts, rent on the
  1st, utilities, phone, insurance, weekly groceries, 2–3 dining a week, coffee, transport,
  gas, monthly subscriptions (Netflix, Spotify, iCloud, gym), shopping, a few travel
  spikes (March, July, November), car loan payment, credit card payments as linked
  transfer pairs, monthly transfers to savings and brokerage, one tax refund, a couple of
  refunds, two or three uncategorized per month so the "to review" flow has something to
  show. Merchant names are realistic; amounts jitter deterministically.
- **Budgets**: every month Jan→Dec for 9 expense categories plus a Salary income target,
  with carry-forward flags set like a real plan; a couple of months intentionally over.
- **Recurring rules (5)**: rent, Netflix, Spotify, gym, car loan. Seeded with
  `lastRunDate` = the December occurrence and `runCount` so the materialiser does not
  write duplicates on top of the seeded transactions.
- **Categorization rules (6)**: merchant → category, e.g. `WHOLE FOODS → Groceries`.
- **Debts**: two lent (one half-repaid with payments), one owed.
- **Projects**: "2016 Honda Civic flip" (sold in June, profit) and "Etsy print shop"
  (active), each with type categories and 10–20 linked transactions.
- **Credit card details** for both cards: limit, purchase APR, statement balance/date,
  minimum payment, next due date, `manualFields` set (no Plaid). A card profile.
- **Net worth**: snapshots on the 1st of each month Jan → current month, rising; goal
  target date 2041-01-01 with baseline = January's value.
- **Ask Cofre**: one saved conversation with two exchanges so History isn't empty.

Dates after today exist (the user asked for the full year) but net-worth snapshots stop
at today and recurring rules are marked fully run.

## API — `apps/api/src/demo/`

| Route | Who | What |
|---|---|---|
| `POST /api/demo/start` | public, throttled 10 / 15 min per IP, `@SkipThrottle` off | Creates a visitor user (`demo-<uuid>@visitor.cofre.demo`, `isDemo = true`, `plan = 'pro'`, name "Demo"), populates it, signs a **4-hour** access cookie, returns `{ ok: true }`. Also deletes any visitor user older than 24 h (cheap sweep, bounded to 50 per call). |
| `POST /api/auth/logout` | existing | If `req.user.isDemo`, delete the user and everything they own before clearing the cookie. |
| `POST /api/admin/demo/reset-owner` | admin | Wipes Rockefeller's data and re-populates from the seed. Creates the account if missing. |
| `onApplicationBootstrap` (`DemoService`) | — | Ensures Rockefeller exists (create + populate once; never resets on boot). Runs the stale-visitor sweep. |

**Deleting a user's data** (`DemoService.wipe(userId)`): explicit deletes in FK-safe order
(transactions, receipts, debt payments, debts, budgets, categorization rules, recurring
rules, project categories, projects, credit card details, card profile, plaid items,
bank accounts, categories, net-worth snapshots, AI messages/actions/conversations,
connected apps, subscriptions), then for visitors the user row. Not relying on DB
cascades because several entities have none.

**Visitor restrictions** — a `@BlockedInDemo()` decorator plus a global `DemoGuard`
(`APP_GUARD`) that throws `403 { code: 'DEMO_READ_ONLY' }` when `req.user.isDemo`:
- Plaid: `link-token`, `exchange/*`, `reconnect-*`, `liabilities-*`, `sync/:itemId`.
- Billing: `checkout`, `subscription` (PATCH), `cancel`, `resume`, `portal-link`.
- Gmail: connect / callback / disconnect.
- Auth: `change-password`, `profile` (PATCH), `resend-verification`.
- Ask Cofre: not blocked, but `messageUsage` treats a demo user as a **5-message** plan
  (`dailyMessageLimit('demo')`) so strangers can't run up the Anthropic bill.

Rockefeller is restricted the same way (`isDemoRestricted` = `isDemo` or the owner email): its password is public. Also blocked: debts `send-statement`; `emailReceipt` on debt payments is forced off. Receipts import only works through Gmail, which is already blocked. Ask Cofre keeps the Pro limit for Rockefeller (25/day) so the owner can demo it.

**Tests** (sqlite unless noted):
- `demo-seed.test.ts`: deterministic (same seed → same JSON), every transaction date within
  the year, transfer pairs balance, account balances equal the sum of their transactions'
  effect from the seeded opening balance, counts (≥ 1,000 transactions, 12 months of
  budgets, 5 recurring rules).
- `demo.service.test.ts`: `start` creates an `isDemo` Pro user with data; `wipe` leaves no
  rows for that user in any table; logout of a visitor deletes the user; stale sweep
  deletes a 25-hour-old visitor and keeps a fresh one; `reset-owner` is idempotent and
  leaves exactly one Rockefeller.
- `demo.guard.test.ts`: blocked route 403s for a visitor, passes for Rockefeller and
  normal users.
- `ai-usage.test.ts`: demo limit is 5.
- `migrations.test.ts` already enforces the new column has a migration.

## Web

- **`/demo` page** (public, added to `PUBLIC_PATHS`): "Setting up your demo…" spinner;
  calls `GET /api/auth/me` first — a signed-in non-demo user is sent to `/dashboard`
  untouched; otherwise `POST /api/demo/start` then `router.replace('/dashboard')`. On
  failure (throttled): a short message with a link to sign up.
- **Landing**: nav gets "Try the demo"; the hero gets a second, quiet button "Explore the
  demo" beside Start free; the closing CTA band gets the same link under its button.
- **Demo banner**: `UserProvider` exposes `user.isDemo`; a small fixed bottom bar
  (`components/DemoBanner.tsx`, rendered from the root layout so no page changes):
  "You're in the demo. Changes are discarded when you leave. **Create your free
  account**". Sidebar: the sign-out button reads "Leave demo" and the Upgrade link is
  hidden for visitors.
- **Blocked actions**: the Connect Bank / billing / Gmail buttons stay visible but a
  403 `DEMO_READ_ONLY` response surfaces as "Not available in the demo — create an
  account to connect your bank." (one shared helper in `lib/demo-error.ts`).
- **Admin**: a "Reset Rockefeller demo data" button with a confirm step on `/admin`.

## Routing / middleware

`/demo` joins `PUBLIC_PATHS`. Visitor sessions use the same `access_token` cookie, so the
middleware needs no change beyond that. `route-access.test.ts` gets a `/demo` case.

## Out of scope

Multiple demo personas; localisation of seed data; a scheduler (sweeps run on
`/demo/start` and at boot, which is enough for the traffic involved); restoring a
visitor's session after the 4-hour cookie expires (they just start a fresh demo).
