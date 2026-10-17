# Stripe billing — Free / Pro / Elite subscriptions

**Date:** 2026-08-31
**Status:** Approved, pending implementation

## Context

Cofre has a `User.plan: 'free' | 'pro'` field (`apps/api/src/users/user.entity.ts:26-27`)
and a working `PlanGuard`/`RequiresPlan` mechanism (`apps/api/src/auth/guards/plan.guard.ts`,
`apps/api/src/auth/decorators/require-plan.decorator.ts`) that already gates the entire
`PlaidController` behind `'pro'` (`apps/api/src/plaid/plaid.controller.ts:7-9`). Nothing in
the codebase ever sets `plan` to `'pro'` — there is no billing system, so bank-linking is
currently unreachable in production without a manual DB edit.

This spec adds real subscription billing via Stripe so the product can charge money:

- **Free** — manual accounts, CSV import, budgets, debts/loans, goals, net-worth tracking.
  No Plaid.
- **Pro** — everything in Free + Plaid auto-sync for up to **4** linked institutions.
  $4.99/mo or $47.90/yr (20% off annualized).
- **Elite** — everything in Pro + **unlimited** linked institutions.
  $7.99/mo or $76.70/yr (20% off annualized).
- Both paid tiers start with a **7-day free trial, card required upfront**.

## Goals

- A public `/pricing` page with a monthly/yearly toggle and a feature-comparison table,
  linking into Stripe Checkout for the chosen tier + interval.
- Stripe Checkout (hosted) captures the card and starts the trial — no card data ever
  touches Cofre's servers.
- A webhook-driven `Subscription` record is the single source of truth for billing state;
  `User.plan` is kept in sync from it so all existing gating code is untouched in spirit.
- A custom in-app billing UI in Settings: current tier/interval, renewal or trial-end date,
  a Pro↔Elite / monthly↔yearly switcher, a Cancel button, and a link out to Stripe's
  hosted payment-method-update page.
- Pro is capped at 4 linked institutions; exceeding it prompts an upgrade to Elite instead
  of silently failing.

## Non-goals

- No custom card-entry UI (Stripe Elements) — Checkout (for new subscriptions) and a
  Stripe-hosted link (for updating an existing card) cover both cases without taking on
  PCI scope.
- No refunds / immediate-cancel-with-proration-refund flow — cancellation is always
  `cancel_at_period_end: true`; the user keeps access until the period ends, matching
  standard SaaS practice.
- No multi-currency support — USD only, matching the existing product.
- No dunning/retry customization beyond what Stripe's default Smart Retries does for
  `invoice.payment_failed` — a failed renewal just leaves the subscription `past_due`
  (see Error handling) and Cofre relies on Stripe's automatic retry schedule and
  Stripe-hosted "update your card" emails.
- No admin/back-office UI for manually granting plans — the existing "hand-edit the DB
  row" escape hatch remains for support cases; this spec is only the customer-facing path.

## Design

### 1. Data model

`User` gains a `stripeCustomerId: string | null` column (nullable, unique) — populated the
first time a user ever starts Checkout, independent of whether a subscription exists yet.
This is what lets `POST /billing/checkout` reuse the same Stripe Customer across repeat
attempts, and what lets the webhook handler map an incoming `customer.subscription.*`
event's `customer` field back to a `userId` before any `Subscription` row exists.

New `Subscription` entity (`apps/api/src/billing/subscription.entity.ts`), 1:1 with `User`,
created *only* by the webhook handler once a real subscription exists:

```ts
@Entity('subscriptions')
export class Subscription {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ unique: true }) userId: string;
  @Column() stripeSubscriptionId: string;
  @Column() tier: 'pro' | 'elite';
  @Column() interval: 'month' | 'year';
  @Column() status: 'trialing' | 'active' | 'past_due' | 'canceled';
  @Column({ type: 'timestamptz', nullable: true }) currentPeriodEnd: Date | null;
  @Column({ type: 'timestamptz', nullable: true }) trialEnd: Date | null;
  @Column({ default: false }) cancelAtPeriodEnd: boolean;
  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}
```

`User.plan` widens from `'free' | 'pro'` to `'free' | 'pro' | 'elite'`
(`user.entity.ts:27`). It remains the field every existing gate/badge reads
(`PlanGuard`, `AccountSettings.tsx:41`, `Sidebar.tsx:196-212`) — nothing there needs to
change except the type and the "Elite" label. `Subscription` is the detailed billing
record; a `BillingService.syncFromStripeSubscription(sub)` method is the *only* writer
of both tables, called exclusively from the webhook handler, and runs the `Subscription`
upsert + `User.plan` update in one DB transaction. Schema updates automatically via
TypeORM's `synchronize: true` (existing project convention).

### 2. Stripe setup (config, not code)

Four recurring Prices under one Product per tier (or two Products, either works) created
directly in the Stripe dashboard/CLI, referenced by ID via env vars — no price amounts are
hardcoded in Cofre's code, so a future price change doesn't require a deploy:

```
STRIPE_SECRET_KEY
STRIPE_WEBHOOK_SECRET
STRIPE_PRICE_PRO_MONTHLY
STRIPE_PRICE_PRO_YEARLY
STRIPE_PRICE_ELITE_MONTHLY
STRIPE_PRICE_ELITE_YEARLY
```

Each Price is created with a 7-day trial default isn't set on the Price itself — trial is
passed per-Checkout-Session (`subscription_data.trial_period_days: 7`), so the same Price
IDs could support a future no-trial promo without re-creating them.

### 3. Checkout flow

`POST /billing/checkout` (`apps/api/src/billing/billing.controller.ts`, behind
`JwtAuthGuard` only — any authenticated user, regardless of current plan, can start
Checkout):

- Body: `{ tier: 'pro' | 'elite', interval: 'month' | 'year' }`.
- Looks up or creates the user's `stripeCustomerId` (see §1) if not already set, so
  re-checkouts and any future upgrade/downgrade reuse the same Stripe Customer.
- Creates a Checkout Session: `mode: 'subscription'`, the resolved price ID from the env
  vars above, `subscription_data: { trial_period_days: 7 }`, `success_url` back to
  `${FRONTEND_URL}/settings?checkout=success`, `cancel_url` back to `${FRONTEND_URL}/pricing`.
- Returns `{ url }`; the frontend does a full redirect (`window.location.href = url`),
  matching how Plaid Link's OAuth redirect is already handled in this app.
- The success-return page shows a brief "activating your plan…" state and polls
  `GET /billing/subscription` for a few seconds — it never trusts Checkout's redirect
  alone, since the authoritative state only lands via the webhook (which usually arrives
  before the redirect completes, but isn't guaranteed to).

### 4. Webhook handler

`POST /billing/webhook` (`apps/api/src/billing/billing-webhook.controller.ts`) — no
`JwtAuthGuard` (Stripe calls this server-to-server), mirrors the existing
`PlaidWebhookController` pattern exactly: reads `req.rawBody` (already captured globally
in `main.ts:10-15`), verifies via `stripe.webhooks.constructEvent(rawBody, signature,
STRIPE_WEBHOOK_SECRET)`, rejects with 401 on a bad signature.

Handled events:

- `checkout.session.completed` — reads `customer` + `subscription` straight off the
  session object (not a DB lookup) and eagerly fetches+syncs that subscription, covering
  the rare race where this event arrives before `customer.subscription.created`.
- `customer.subscription.created` / `customer.subscription.updated` — the main sync path:
  looks up `userId` by the event's `customer` field (`User.stripeCustomerId`), then maps
  Stripe's `status` (`trialing`/`active`/`past_due`/`canceled`/`unpaid`/`incomplete` → this
  app's four-value `status`, collapsing `unpaid`/`incomplete` into `past_due`),
  `items.data[0].price.id` → `tier`/`interval` (reverse-lookup against the four env-var
  price IDs), `current_period_end`, `trial_end`, `cancel_at_period_end`. Calls
  `BillingService.syncFromStripeSubscription(userId, mappedFields)`, which upserts
  `Subscription` by `userId` and updates `User.plan` in one transaction.
- `customer.subscription.deleted` — sets `status: 'canceled'`, `User.plan: 'free'`.
- `invoice.payment_failed` — no plan change (Stripe's own retry schedule keeps the
  subscription `past_due`, and the `customer.subscription.updated` event already reflects
  that status); this case only triggers `MailService` to send a "payment failed, update
  your card" email with the Stripe-hosted update-payment-method link from §7.

All handlers are idempotent (upsert by `stripeSubscriptionId`), matching how
`PlaidService.syncByExternalItemId` already treats webhook delivery as at-least-once.

### 5. Plan gating & the 4-institution cap

`PlaidController`'s decorator becomes `@RequiresPlan('pro', 'elite')`
(`plaid.controller.ts:8`) — either paid tier unlocks Plaid; `PlanGuard` itself is
unchanged.

The institution cap is a business rule, not a route guard, because it depends on
*how many* institutions a user already has, not just their tier. It's enforced in
`PlaidService.previewExchange` (`apps/api/src/plaid/plaid.service.ts:116-130`), right
after the token exchange returns `item_id` and only when this is a genuinely new item
(`if (!item)`, line 126) — reconnects of an existing item never hit the cap:

```
if (!item) {
  if (user.plan === 'pro') {
    const count = await this.itemRepo.count({ where: { userId } });
    if (count >= 4) {
      await this.client.itemRemove({ access_token }); // release the Item Plaid just created
      throw new ForbiddenException({
        message: 'Pro is limited to 4 linked institutions — upgrade to Elite for unlimited.',
        code: 'INSTITUTION_LIMIT_REACHED',
      });
    }
  }
  item = this.itemRepo.create({ userId, itemId: item_id, institutionId, institutionName });
}
```

Elite (`user.plan === 'elite'`) skips the check entirely. The `itemRemove` call cleans up
the live Plaid Item so a rejected link attempt doesn't leave an orphaned connection at
Plaid's end.

### 6. Pricing page

`apps/web/src/app/pricing/page.tsx`, added to `PUBLIC_PATHS` in
`apps/web/src/middleware.ts:13`. Monthly/yearly toggle at the top (a plain boolean state,
no page reload); three cards (Free, Pro, Elite) below, each showing the price for the
selected interval and a "save 20%" badge on the yearly figure. A feature-comparison table
underneath (rows = manual tracking, CSV import, budgets/debts/goals/net-worth, Plaid
auto-sync, number of linked institutions; columns = the three tiers) makes the upsell
path visually obvious. "Start 7-day free trial" on Pro/Elite calls `POST /billing/checkout`
with the selected tier + interval and redirects to the returned Stripe URL; "Get started"
on Free goes to `/signup`.

### 7. Billing management UI (Settings)

New tab/section in `apps/web/src/app/settings/` reading `GET /billing/subscription`
(returns the current `Subscription` row, or `null` for Free users):

- Free users see the three-tier comparison (reuse the pricing page's card component) and
  the same Checkout CTAs.
- Paid users see: current tier + interval, "renews on {date}" or "trial ends {date}" or
  "cancels on {date}" (when `cancelAtPeriodEnd`), a Pro↔Elite and monthly↔yearly switcher,
  a "Cancel plan" button, and an "Update payment method" link.
- The switcher calls `PATCH /billing/subscription` (`{ tier, interval }`) →
  `stripe.subscriptions.update(id, { items: [{ id: itemId, price: newPriceId }],
  proration_behavior: 'create_prorations' })`. The response webhook
  (`customer.subscription.updated`) is what actually updates the DB — the PATCH endpoint
  itself just confirms the Stripe call succeeded and returns 202, and the UI shows an
  optimistic "updating…" state until the next `GET` reflects it (same pattern as the
  Checkout success page in §3).
- "Cancel plan" calls `POST /billing/cancel` → `stripe.subscriptions.update(id,
  { cancel_at_period_end: true })`.
- "Update payment method" is a plain link to a Stripe-hosted Billing Portal session
  scoped to `flow_data: { type: 'payment_method_update' }` (created on demand via
  `POST /billing/portal-link`, since portal sessions are single-use, short-lived URLs) —
  this is the one moment card data is involved, and it stays entirely on Stripe's domain.

### 8. Error handling

- Checkout creation fails (bad tier/interval, Stripe API error) → `400`/`502` surfaced as
  a toast on the pricing page; no partial state to clean up since nothing is written
  until the webhook fires.
- Webhook signature invalid → `401`, logged, Stripe retries automatically (standard Stripe
  webhook behavior) — no action needed on Cofre's side.
- Institution cap hit → `403 INSTITUTION_LIMIT_REACHED` (see §5) — the frontend Plaid-Link
  flow catches this specific code and shows an "Upgrade to Elite" prompt instead of a
  generic error, alongside the existing Plaid-error handling in the Connect Bank flow.
- Subscription goes `past_due` (failed renewal charge) — Plaid access is **not**
  immediately revoked (Stripe's Smart Retries get a few days to recover the payment
  first); only a `customer.subscription.deleted` event (final cancellation after retries
  are exhausted) flips `User.plan` back to `'free'`. A `past_due` banner in Settings tells
  the user their card was declined and links to payment-method update.

### 9. Testing

Given the earlier audit found zero coverage on money-moving code, this module is built
test-first for the three places a bug either locks out a paying customer or lets someone
dodge payment:

- `billing-webhook-verifier` — signature verification (mirrors
  `plaid-webhook-signature.test.ts`'s existing pattern: valid signature accepted, wrong
  secret / tampered payload rejected).
- `BillingService.syncFromStripeSubscription` — pure mapping logic (Stripe status →
  internal status, price ID → tier/interval) tested with fixture payloads for every
  status transition (trialing→active, active→past_due, past_due→canceled, upgrade
  Pro→Elite, downgrade Elite→Pro).
- Institution-cap enforcement in `PlaidService.previewExchange` — a Pro user at 4
  institutions is rejected with `INSTITUTION_LIMIT_REACHED` and the just-created Plaid
  Item is released; an Elite user at any count is not; a Pro user below 4 is not.
