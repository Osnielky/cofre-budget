# Stripe Billing (Free / Pro / Elite) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let Cofre charge money — a public pricing page, Stripe Checkout with a 7-day
trial, a webhook-synced subscription record, a custom in-app billing management UI, and
a 4-institution cap on the Pro tier (Elite is unlimited).

**Architecture:** A new `apps/api/src/billing/` module owns all Stripe interaction: an
authenticated controller for checkout/view/switch/cancel/portal-link, and a separate
unauthenticated webhook controller (mirrors the existing `PlaidWebhookController`
pattern) that is the sole writer of subscription state. `User.plan` (already read by
`PlanGuard`, the Sidebar badge, and `AccountSettings`) widens to a third value and stays
the single field the rest of the app checks; a new `Subscription` entity holds the
Stripe-specific detail. Frontend adds a public `/pricing` page and a `Billing` tab in
Settings, both built on one shared tier-cards component.

**Tech Stack:** NestJS 11 + TypeORM (existing), Stripe Node SDK (new dependency),
Next.js 16 / React 19 (existing), Vitest (existing test runner).

**Spec:** `docs/superpowers/specs/2026-08-31-stripe-billing-design.md`

## Global Constraints

- Prices, live only as Stripe Price IDs behind env vars — never hardcode a dollar amount
  in code (spec §2): `STRIPE_PRICE_PRO_MONTHLY`, `STRIPE_PRICE_PRO_YEARLY`,
  `STRIPE_PRICE_ELITE_MONTHLY`, `STRIPE_PRICE_ELITE_YEARLY`.
- Trial is always 7 days, always card-required (set per-Checkout-Session, not per-Price;
  spec §2-3).
- Cancellation is always `cancel_at_period_end: true` — never an immediate cancel or a
  refund (spec, Non-goals).
- No card data ever touches Cofre's own servers — card entry is Stripe Checkout (new
  subscriptions) or a Stripe-hosted Billing Portal link (updating an existing card)
  (spec §3, §7).
- `Subscription` rows and `User.plan` are written **only** from the webhook handler —
  no other code path ever sets `User.plan` to `'pro'`/`'elite'` directly (spec §1, §4).
- Institution cap is exactly 4 for `'pro'`, unlimited for `'elite'`, enforced only when
  linking a genuinely new institution, never on reconnects (spec §5).
- Components must consume theme CSS variables (`--color-*`, `--glass-*`) only — never
  hardcode colors, per this repo's `CLAUDE.md` styling rules.

---

## Task 1: `stripe` dependency + data model (`User` + `Subscription`)

**Files:**
- Modify: `package.json` (add `stripe` dependency)
- Modify: `apps/api/src/users/user.entity.ts:26-27`
- Create: `apps/api/src/billing/subscription.entity.ts`
- Modify: `apps/api/src/config/database.config.ts` (register `Subscription` entity)
- Modify: `apps/web/src/components/UserProvider.tsx:13`

**Interfaces:**
- Produces: `User.plan: 'free' | 'pro' | 'elite'`, `User.stripeCustomerId: string | null`;
  `Subscription` entity with fields `userId`, `stripeSubscriptionId`, `tier`, `interval`,
  `status`, `currentPeriodEnd`, `trialEnd`, `cancelAtPeriodEnd` — every later task in this
  plan reads/writes these exact names.

- [ ] **Step 1: Install the Stripe SDK**

Run: `npm install stripe`

This resolves and pins whatever the current published version is — don't hand-write a
version number into `package.json`.

- [ ] **Step 2: Widen `User.plan` and add `stripeCustomerId`**

Edit `apps/api/src/users/user.entity.ts:26-27`:

```ts
  @Column({ default: 'free' })
  plan: 'free' | 'pro' | 'elite';

  /* Set the first time this user ever starts Stripe Checkout — lets checkout/webhook
     code reuse one Stripe Customer across repeat attempts and upgrades/downgrades. */
  @Column({ nullable: true, unique: true })
  stripeCustomerId: string | null;
```

- [ ] **Step 3: Create the `Subscription` entity**

Create `apps/api/src/billing/subscription.entity.ts`:

```ts
import {
  Entity, PrimaryGeneratedColumn, Column,
  CreateDateColumn, UpdateDateColumn,
} from 'typeorm';

@Entity('subscriptions')
export class Subscription {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  userId: string;

  @Column()
  stripeSubscriptionId: string;

  @Column()
  tier: 'pro' | 'elite';

  @Column()
  interval: 'month' | 'year';

  @Column()
  status: 'trialing' | 'active' | 'past_due' | 'canceled';

  @Column({ type: 'timestamptz', nullable: true })
  currentPeriodEnd: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  trialEnd: Date | null;

  @Column({ default: false })
  cancelAtPeriodEnd: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
```

- [ ] **Step 4: Register the entity so TypeORM's `synchronize` picks it up**

Edit `apps/api/src/config/database.config.ts` — add the import and append to the
`entities` array (matches how every other entity in this file is wired; per this repo's
`CLAUDE.md`, entities must be imported explicitly, glob paths don't work under webpack):

```ts
import { Subscription } from '../billing/subscription.entity';
```

```ts
  entities: [User, BankAccount, PlaidItem, Transaction, Category, Budget, Project, ProjectCategory, Debt, DebtPayment, ConnectedApp, Receipt, CategorizationRule, Subscription],
```

- [ ] **Step 5: Widen the frontend `User` type**

Edit `apps/web/src/components/UserProvider.tsx:13`:

```ts
  plan?: 'free' | 'pro' | 'elite';
```

- [ ] **Step 6: Verify the API still boots and typechecks**

Run: `npx tsc --noEmit -p apps/api/tsconfig.app.json`
Expected: no errors.

Run: `npm run dev:api` briefly, confirm no TypeORM startup errors (new `subscriptions`
table gets created), then stop it.

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json apps/api/src/users/user.entity.ts apps/api/src/billing/subscription.entity.ts apps/api/src/config/database.config.ts apps/web/src/components/UserProvider.tsx
git commit -m "feat(billing): add stripe dependency and Subscription entity"
```

---

## Task 2: Stripe→Cofre mapping (pure function) + webhook signature verifier

**Files:**
- Create: `apps/api/src/billing/billing.mapping.ts`
- Create: `apps/api/src/billing/billing.mapping.test.ts`
- Create: `apps/api/src/billing/stripe-webhook-verifier.service.ts`
- Create: `apps/api/src/billing/stripe-webhook-verifier.service.test.ts`

**Interfaces:**
- Consumes: `Stripe.Subscription` (from the `stripe` package, installed in Task 1).
- Produces: `mapStripeSubscription(sub: Stripe.Subscription, priceIds: PriceIdMap):
  MappedSubscription` and `PriceIdMap`/`MappedSubscription` types — Task 3's
  `BillingService` and Task 5's webhook controller both import these exact names.
  `StripeWebhookVerifierService.verify(payload: Buffer, signature: string,
  secret: string): Stripe.Event` (throws on invalid signature) — Task 5 imports this.

This task isolates the two riskiest pieces of pure logic (Stripe's status vocabulary →
this app's four-value status, and signature verification) so they're tested without ever
touching a database or a real Stripe API call — same reasoning as the existing
`plaid-webhook-signature.test.ts` / `net-worth-goal.math.test.ts` pattern in this repo.

- [ ] **Step 1: Write the failing test for the mapping function**

Create `apps/api/src/billing/billing.mapping.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { mapStripeSubscription, PriceIdMap } from './billing.mapping';
import Stripe from 'stripe';

const PRICE_IDS: PriceIdMap = {
  price_pro_month: { tier: 'pro', interval: 'month' },
  price_pro_year: { tier: 'pro', interval: 'year' },
  price_elite_month: { tier: 'elite', interval: 'month' },
  price_elite_year: { tier: 'elite', interval: 'year' },
};

function fakeSub(overrides: Partial<Stripe.Subscription> & { priceId: string }): Stripe.Subscription {
  const { priceId, ...rest } = overrides;
  return {
    id: 'sub_123',
    status: 'trialing',
    current_period_end: 1_800_000_000,
    trial_end: 1_700_000_000,
    cancel_at_period_end: false,
    items: { data: [{ price: { id: priceId } }] },
    ...rest,
  } as unknown as Stripe.Subscription;
}

describe('mapStripeSubscription', () => {
  it('maps a trialing Pro-monthly subscription', () => {
    const out = mapStripeSubscription(fakeSub({ priceId: 'price_pro_month', status: 'trialing' } as any), PRICE_IDS);
    expect(out).toEqual({
      tier: 'pro',
      interval: 'month',
      status: 'trialing',
      currentPeriodEnd: new Date(1_800_000_000 * 1000),
      trialEnd: new Date(1_700_000_000 * 1000),
      cancelAtPeriodEnd: false,
    });
  });

  it('maps an active Elite-yearly subscription with no trial', () => {
    const out = mapStripeSubscription(
      fakeSub({ priceId: 'price_elite_year', status: 'active', trial_end: null } as any),
      PRICE_IDS,
    );
    expect(out.tier).toBe('elite');
    expect(out.interval).toBe('year');
    expect(out.status).toBe('active');
    expect(out.trialEnd).toBeNull();
  });

  it('collapses unpaid and incomplete into past_due', () => {
    expect(mapStripeSubscription(fakeSub({ priceId: 'price_pro_month', status: 'unpaid' } as any), PRICE_IDS).status).toBe('past_due');
    expect(mapStripeSubscription(fakeSub({ priceId: 'price_pro_month', status: 'incomplete' } as any), PRICE_IDS).status).toBe('past_due');
  });

  it('maps canceled straight through', () => {
    expect(mapStripeSubscription(fakeSub({ priceId: 'price_pro_month', status: 'canceled' } as any), PRICE_IDS).status).toBe('canceled');
  });

  it('carries cancelAtPeriodEnd through unchanged', () => {
    const out = mapStripeSubscription(fakeSub({ priceId: 'price_pro_month', cancel_at_period_end: true } as any), PRICE_IDS);
    expect(out.cancelAtPeriodEnd).toBe(true);
  });

  it('throws when the subscription is on a price ID this app does not recognize', () => {
    expect(() => mapStripeSubscription(fakeSub({ priceId: 'price_unknown' } as any), PRICE_IDS)).toThrow(/unknown price/i);
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npx vitest run --root apps/api src/billing/billing.mapping.test.ts`
Expected: FAIL — `Cannot find module './billing.mapping'`.

- [ ] **Step 3: Implement the mapping function**

Create `apps/api/src/billing/billing.mapping.ts`:

```ts
import Stripe from 'stripe';

export type PriceIdMap = Record<string, { tier: 'pro' | 'elite'; interval: 'month' | 'year' }>;

export interface MappedSubscription {
  tier: 'pro' | 'elite';
  interval: 'month' | 'year';
  status: 'trialing' | 'active' | 'past_due' | 'canceled';
  currentPeriodEnd: Date | null;
  trialEnd: Date | null;
  cancelAtPeriodEnd: boolean;
}

const STATUS_MAP: Record<string, MappedSubscription['status']> = {
  trialing: 'trialing',
  active: 'active',
  past_due: 'past_due',
  unpaid: 'past_due',
  incomplete: 'past_due',
  incomplete_expired: 'canceled',
  canceled: 'canceled',
};

export function mapStripeSubscription(sub: Stripe.Subscription, priceIds: PriceIdMap): MappedSubscription {
  const priceId = sub.items.data[0]?.price?.id;
  const tierInterval = priceId ? priceIds[priceId] : undefined;
  if (!tierInterval) throw new Error(`Subscription ${sub.id} is on an unknown price ID: ${priceId}`);

  const status = STATUS_MAP[sub.status] ?? 'past_due';

  return {
    tier: tierInterval.tier,
    interval: tierInterval.interval,
    status,
    currentPeriodEnd: sub.current_period_end ? new Date(sub.current_period_end * 1000) : null,
    trialEnd: sub.trial_end ? new Date(sub.trial_end * 1000) : null,
    cancelAtPeriodEnd: sub.cancel_at_period_end,
  };
}
```

- [ ] **Step 4: Run it to confirm it passes**

Run: `npx vitest run --root apps/api src/billing/billing.mapping.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Write the failing test for the webhook verifier**

Create `apps/api/src/billing/stripe-webhook-verifier.service.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import Stripe from 'stripe';
import { StripeWebhookVerifierService } from './stripe-webhook-verifier.service';

const SECRET = 'whsec_test_secret';

function sign(payload: string) {
  return Stripe.webhooks.generateTestHeaderString({ payload, secret: SECRET });
}

describe('StripeWebhookVerifierService', () => {
  it('accepts a correctly signed payload and returns the parsed event', () => {
    const verifier = new StripeWebhookVerifierService();
    const payload = JSON.stringify({ id: 'evt_1', type: 'customer.subscription.updated' });
    const signature = sign(payload);
    const event = verifier.verify(Buffer.from(payload), signature, SECRET);
    expect(event.id).toBe('evt_1');
    expect(event.type).toBe('customer.subscription.updated');
  });

  it('rejects a payload signed with a different secret', () => {
    const verifier = new StripeWebhookVerifierService();
    const payload = JSON.stringify({ id: 'evt_1', type: 'customer.subscription.updated' });
    const signature = Stripe.webhooks.generateTestHeaderString({ payload, secret: 'whsec_other' });
    expect(() => verifier.verify(Buffer.from(payload), signature, SECRET)).toThrow();
  });

  it('rejects a tampered payload', () => {
    const verifier = new StripeWebhookVerifierService();
    const payload = JSON.stringify({ id: 'evt_1', type: 'customer.subscription.updated' });
    const signature = sign(payload);
    const tampered = JSON.stringify({ id: 'evt_1', type: 'customer.subscription.deleted' });
    expect(() => verifier.verify(Buffer.from(tampered), signature, SECRET)).toThrow();
  });
});
```

- [ ] **Step 6: Run it to confirm it fails**

Run: `npx vitest run --root apps/api src/billing/stripe-webhook-verifier.service.test.ts`
Expected: FAIL — `Cannot find module './stripe-webhook-verifier.service'`.

- [ ] **Step 7: Implement the verifier**

Create `apps/api/src/billing/stripe-webhook-verifier.service.ts`:

```ts
import { Injectable } from '@nestjs/common';
import Stripe from 'stripe';

@Injectable()
export class StripeWebhookVerifierService {
  /* Throws (Stripe.errors.StripeSignatureVerificationError) on a bad/missing signature —
     callers should let that propagate as a 401, matching PlaidWebhookController's pattern. */
  verify(payload: Buffer, signature: string, secret: string): Stripe.Event {
    return Stripe.webhooks.constructEvent(payload, signature, secret);
  }
}
```

- [ ] **Step 8: Run it to confirm it passes**

Run: `npx vitest run --root apps/api src/billing/stripe-webhook-verifier.service.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 9: Commit**

```bash
git add apps/api/src/billing/billing.mapping.ts apps/api/src/billing/billing.mapping.test.ts apps/api/src/billing/stripe-webhook-verifier.service.ts apps/api/src/billing/stripe-webhook-verifier.service.test.ts
git commit -m "feat(billing): add Stripe subscription mapping and webhook signature verifier"
```

---

## Task 3: `BillingService` — customer, checkout, sync, cancel, switch, portal link

**Files:**
- Create: `apps/api/src/billing/billing.service.ts`
- Create: `apps/api/src/billing/billing.service.test.ts`
- Create: `apps/api/src/billing/billing.module.ts`

**Interfaces:**
- Consumes: `mapStripeSubscription`, `PriceIdMap` (Task 2); `User`, `Subscription`
  entities (Task 1).
- Produces: `BillingService` with methods `getOrCreateCustomer(userId): Promise<string>`,
  `createCheckoutSession(userId, tier, interval): Promise<{ url: string }>`,
  `syncFromStripeSubscription(customerId: string, sub: Stripe.Subscription):
  Promise<void>`, `getSubscription(userId): Promise<Subscription | null>`,
  `switchTier(userId, tier, interval): Promise<void>`, `cancel(userId): Promise<void>`,
  `createPortalLink(userId): Promise<{ url: string }>` — Tasks 4 and 5 call these exact
  methods.

- [ ] **Step 1: Write the failing test for `syncFromStripeSubscription`**

This is the one method worth a real (in-memory) test — it's the sole writer of
`User.plan`, so a bug here either locks out a paying customer or lets someone dodge
payment. Use a real TypeORM SQLite in-memory connection so the transaction/upsert
behavior is genuinely exercised, following this repo's existing `describe`/`it` style
(no other test in this repo spins up TypeORM directly, so this introduces
`better-sqlite3` as a dev-only test dependency):

Run: `npm install --save-dev better-sqlite3`

Create `apps/api/src/billing/billing.service.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { DataSource } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { User } from '../users/user.entity';
import { Subscription } from './subscription.entity';
import { BillingService } from './billing.service';

async function makeDataSource() {
  const ds = new DataSource({
    type: 'better-sqlite3',
    database: ':memory:',
    dropSchema: true,
    entities: [User, Subscription],
    synchronize: true,
  });
  await ds.initialize();
  return ds;
}

describe('BillingService.syncFromStripeSubscription', () => {
  let ds: Awaited<ReturnType<typeof makeDataSource>>;
  let service: BillingService;
  let userId: string;

  beforeEach(async () => {
    ds = await makeDataSource();
    const userRepo = ds.getRepository(User);
    const user = await userRepo.save(userRepo.create({
      email: 'a@example.com', stripeCustomerId: 'cus_123', plan: 'free',
    }));
    userId = user.id;

    const config = { get: (key: string) => ({
      STRIPE_PRICE_PRO_MONTHLY: 'price_pro_month',
      STRIPE_PRICE_PRO_YEARLY: 'price_pro_year',
      STRIPE_PRICE_ELITE_MONTHLY: 'price_elite_month',
      STRIPE_PRICE_ELITE_YEARLY: 'price_elite_year',
      STRIPE_SECRET_KEY: 'sk_test_x',
    } as Record<string, string>)[key] } as unknown as ConfigService;

    service = new BillingService(
      ds.getRepository(User),
      ds.getRepository(Subscription),
      config,
    );
  });

  function fakeSub(overrides: any = {}) {
    return {
      id: 'sub_1', status: 'trialing', current_period_end: 1_800_000_000,
      trial_end: 1_700_000_000, cancel_at_period_end: false,
      items: { data: [{ price: { id: 'price_pro_month' } }] },
      ...overrides,
    };
  }

  it('creates a Subscription row and sets User.plan on first sync', async () => {
    await service.syncFromStripeSubscription('cus_123', fakeSub() as any);
    const user = await ds.getRepository(User).findOneByOrFail({ id: userId });
    expect(user.plan).toBe('pro');
    const sub = await ds.getRepository(Subscription).findOneByOrFail({ userId });
    expect(sub.status).toBe('trialing');
    expect(sub.stripeSubscriptionId).toBe('sub_1');
  });

  it('updates the existing row and User.plan on a later sync (e.g. trial → active)', async () => {
    await service.syncFromStripeSubscription('cus_123', fakeSub({ status: 'trialing' }) as any);
    await service.syncFromStripeSubscription('cus_123', fakeSub({ status: 'active' }) as any);
    const user = await ds.getRepository(User).findOneByOrFail({ id: userId });
    expect(user.plan).toBe('pro');
    const sub = await ds.getRepository(Subscription).findOneByOrFail({ userId });
    expect(sub.status).toBe('active');
    const all = await ds.getRepository(Subscription).find({ where: { userId } });
    expect(all).toHaveLength(1);
  });

  it('resets User.plan to free when the subscription is canceled', async () => {
    await service.syncFromStripeSubscription('cus_123', fakeSub({ status: 'active' }) as any);
    await service.syncFromStripeSubscription('cus_123', fakeSub({ status: 'canceled' }) as any);
    const user = await ds.getRepository(User).findOneByOrFail({ id: userId });
    expect(user.plan).toBe('free');
  });

  it('upgrades the tier when the subscription moves to an Elite price', async () => {
    await service.syncFromStripeSubscription('cus_123', fakeSub({ status: 'active' }) as any);
    await service.syncFromStripeSubscription(
      'cus_123',
      fakeSub({ status: 'active', items: { data: [{ price: { id: 'price_elite_year' } }] } }) as any,
    );
    const user = await ds.getRepository(User).findOneByOrFail({ id: userId });
    expect(user.plan).toBe('elite');
  });

  it('is a no-op when no user has this Stripe customer ID', async () => {
    await expect(
      service.syncFromStripeSubscription('cus_unknown', fakeSub() as any),
    ).resolves.not.toThrow();
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npx vitest run --root apps/api src/billing/billing.service.test.ts`
Expected: FAIL — `Cannot find module './billing.service'`.

- [ ] **Step 3: Implement `BillingService`**

Create `apps/api/src/billing/billing.service.ts`:

```ts
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import Stripe from 'stripe';
import { User } from '../users/user.entity';
import { Subscription } from './subscription.entity';
import { mapStripeSubscription, PriceIdMap } from './billing.mapping';

@Injectable()
export class BillingService {
  private readonly logger = new Logger(BillingService.name);
  private readonly stripe: Stripe;
  private readonly priceIds: PriceIdMap;
  private readonly frontendUrl: string;

  constructor(
    @InjectRepository(User) private users: Repository<User>,
    @InjectRepository(Subscription) private subs: Repository<Subscription>,
    private config: ConfigService,
  ) {
    this.stripe = new Stripe(this.config.get<string>('STRIPE_SECRET_KEY') as string);
    this.frontendUrl = this.config.get<string>('FRONTEND_URL', 'http://localhost:3000');
    this.priceIds = {
      [this.config.get<string>('STRIPE_PRICE_PRO_MONTHLY') as string]: { tier: 'pro', interval: 'month' },
      [this.config.get<string>('STRIPE_PRICE_PRO_YEARLY') as string]: { tier: 'pro', interval: 'year' },
      [this.config.get<string>('STRIPE_PRICE_ELITE_MONTHLY') as string]: { tier: 'elite', interval: 'month' },
      [this.config.get<string>('STRIPE_PRICE_ELITE_YEARLY') as string]: { tier: 'elite', interval: 'year' },
    };
  }

  private priceIdFor(tier: 'pro' | 'elite', interval: 'month' | 'year'): string {
    const key = Object.entries(this.priceIds).find(([, v]) => v.tier === tier && v.interval === interval)?.[0];
    if (!key) throw new Error(`No Stripe price configured for ${tier}/${interval}`);
    return key;
  }

  async getOrCreateCustomer(userId: string): Promise<string> {
    const user = await this.users.findOneByOrFail({ id: userId });
    if (user.stripeCustomerId) return user.stripeCustomerId;
    const customer = await this.stripe.customers.create({ email: user.email, metadata: { userId } });
    await this.users.update(userId, { stripeCustomerId: customer.id });
    return customer.id;
  }

  async createCheckoutSession(userId: string, tier: 'pro' | 'elite', interval: 'month' | 'year'): Promise<{ url: string }> {
    const customerId = await this.getOrCreateCustomer(userId);
    const session = await this.stripe.checkout.sessions.create({
      customer: customerId,
      mode: 'subscription',
      line_items: [{ price: this.priceIdFor(tier, interval), quantity: 1 }],
      subscription_data: { trial_period_days: 7 },
      success_url: `${this.frontendUrl}/settings?checkout=success`,
      cancel_url: `${this.frontendUrl}/pricing`,
    });
    if (!session.url) throw new Error('Stripe did not return a Checkout URL');
    return { url: session.url };
  }

  async syncFromStripeSubscription(stripeCustomerId: string, sub: Stripe.Subscription): Promise<void> {
    const user = await this.users.findOneBy({ stripeCustomerId });
    if (!user) {
      this.logger.warn(`No local user for Stripe customer ${stripeCustomerId} — ignoring webhook`);
      return;
    }
    const mapped = mapStripeSubscription(sub, this.priceIds);
    const plan = mapped.status === 'canceled' ? 'free' : mapped.tier;

    await this.subs.upsert(
      {
        userId: user.id,
        stripeSubscriptionId: sub.id,
        tier: mapped.tier,
        interval: mapped.interval,
        status: mapped.status,
        currentPeriodEnd: mapped.currentPeriodEnd,
        trialEnd: mapped.trialEnd,
        cancelAtPeriodEnd: mapped.cancelAtPeriodEnd,
      },
      ['userId'],
    );
    await this.users.update(user.id, { plan });
  }

  getSubscription(userId: string): Promise<Subscription | null> {
    return this.subs.findOneBy({ userId });
  }

  async switchTier(userId: string, tier: 'pro' | 'elite', interval: 'month' | 'year'): Promise<void> {
    const existing = await this.subs.findOneByOrFail({ userId });
    const stripeSub = await this.stripe.subscriptions.retrieve(existing.stripeSubscriptionId);
    const itemId = stripeSub.items.data[0].id;
    await this.stripe.subscriptions.update(existing.stripeSubscriptionId, {
      items: [{ id: itemId, price: this.priceIdFor(tier, interval) }],
      proration_behavior: 'create_prorations',
    });
    // The customer.subscription.updated webhook is what actually persists the change.
  }

  async cancel(userId: string): Promise<void> {
    const existing = await this.subs.findOneByOrFail({ userId });
    await this.stripe.subscriptions.update(existing.stripeSubscriptionId, { cancel_at_period_end: true });
  }

  async createPortalLink(userId: string): Promise<{ url: string }> {
    const user = await this.users.findOneByOrFail({ id: userId });
    if (!user.stripeCustomerId) throw new Error('User has no Stripe customer yet');
    const session = await this.stripe.billingPortal.sessions.create({
      customer: user.stripeCustomerId,
      return_url: `${this.frontendUrl}/settings`,
      flow_data: { type: 'payment_method_update' },
    });
    return { url: session.url };
  }
}
```

- [ ] **Step 4: Run it to confirm it passes**

Run: `npx vitest run --root apps/api src/billing/billing.service.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Create `BillingModule`**

Create `apps/api/src/billing/billing.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../users/user.entity';
import { Subscription } from './subscription.entity';
import { BillingService } from './billing.service';
import { StripeWebhookVerifierService } from './stripe-webhook-verifier.service';
import { MailModule } from '../mail/mail.module';

@Module({
  imports: [TypeOrmModule.forFeature([User, Subscription]), MailModule],
  providers: [BillingService, StripeWebhookVerifierService],
  exports: [BillingService],
})
export class BillingModule {}
```

(Controllers are added to this module in Tasks 4 and 5.)

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json apps/api/src/billing/billing.service.ts apps/api/src/billing/billing.service.test.ts apps/api/src/billing/billing.module.ts
git commit -m "feat(billing): add BillingService (checkout, sync, switch, cancel, portal link)"
```

---

## Task 4: `BillingController` (authenticated) + wire into `AppModule`

**Files:**
- Create: `apps/api/src/billing/billing.controller.ts`
- Modify: `apps/api/src/billing/billing.module.ts`
- Modify: `apps/api/src/app/app.module.ts`

**Interfaces:**
- Consumes: `BillingService` (Task 3).
- Produces: `POST /api/billing/checkout`, `GET /api/billing/subscription`,
  `PATCH /api/billing/subscription`, `POST /api/billing/cancel`,
  `POST /api/billing/portal-link` — Task 9/10's frontend calls these exact routes.

- [ ] **Step 1: Write the controller**

Create `apps/api/src/billing/billing.controller.ts`:

```ts
import { Controller, Post, Get, Patch, Body, UseGuards, Request } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { BillingService } from './billing.service';

@UseGuards(JwtAuthGuard)
@Controller('billing')
export class BillingController {
  constructor(private billing: BillingService) {}

  @Post('checkout')
  createCheckout(@Request() req: any, @Body() body: { tier: 'pro' | 'elite'; interval: 'month' | 'year' }) {
    return this.billing.createCheckoutSession(req.user.id, body.tier, body.interval);
  }

  @Get('subscription')
  getSubscription(@Request() req: any) {
    return this.billing.getSubscription(req.user.id);
  }

  @Patch('subscription')
  async switchTier(@Request() req: any, @Body() body: { tier: 'pro' | 'elite'; interval: 'month' | 'year' }) {
    await this.billing.switchTier(req.user.id, body.tier, body.interval);
    return { ok: true };
  }

  @Post('cancel')
  async cancel(@Request() req: any) {
    await this.billing.cancel(req.user.id);
    return { ok: true };
  }

  @Post('portal-link')
  createPortalLink(@Request() req: any) {
    return this.billing.createPortalLink(req.user.id);
  }
}
```

- [ ] **Step 2: Wire the controller into `BillingModule`**

Edit `apps/api/src/billing/billing.module.ts`:

```ts
import { BillingController } from './billing.controller';
```

```ts
  controllers: [BillingController],
```

- [ ] **Step 3: Register `BillingModule` in `AppModule`**

Edit `apps/api/src/app/app.module.ts` — add the import and list entry alongside the
other feature modules:

```ts
import { BillingModule } from '../billing/billing.module';
```

```ts
    NetWorthGoalModule,
    BillingModule,
```

- [ ] **Step 4: Verify the app boots and the routes are registered**

Run: `npx tsc --noEmit -p apps/api/tsconfig.app.json`
Expected: no errors.

Run: `npm run dev:api`, then in another terminal:
`curl -i -X POST http://localhost:3333/api/billing/checkout`
Expected: `401` (no auth cookie) — confirms the route exists and `JwtAuthGuard` is
active, not a 404. Stop the dev server after checking.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/billing/billing.controller.ts apps/api/src/billing/billing.module.ts apps/api/src/app/app.module.ts
git commit -m "feat(billing): add authenticated billing controller"
```

---

## Task 5: `BillingWebhookController` (unauthenticated) + payment-failed email

**Files:**
- Create: `apps/api/src/billing/billing-webhook.controller.ts`
- Modify: `apps/api/src/billing/billing.module.ts`
- Modify: `apps/api/src/mail/mail.service.ts`

**Interfaces:**
- Consumes: `StripeWebhookVerifierService.verify` (Task 2), `BillingService`
  (Task 3), `MailService` (existing).
- Produces: `POST /api/billing/webhook` (raw-body Stripe signature verification, no
  guard) and `MailService.sendPaymentFailed(to, name, portalUrl): Promise<void>`.

- [ ] **Step 1: Add the payment-failed email to `MailService`**

`apps/api/src/main.ts:10-15` already captures `req.rawBody` globally, so no `main.ts`
change is needed here — the webhook controller in the next step can read it directly.

Edit `apps/api/src/mail/mail.service.ts` — add a new method near `sendPasswordReset`
(`mail.service.ts:41-50`):

```ts
  async sendPaymentFailed(to: string, name: string, updateLink: string): Promise<void> {
    await this.send(
      to,
      'Your Cofre payment failed',
      'Payment failed',
      'We couldn’t charge your card for your Cofre subscription. Please update your payment method to keep your plan active.',
      'Update payment method',
      updateLink,
    );
  }
```

- [ ] **Step 2: Write the webhook controller**

Create `apps/api/src/billing/billing-webhook.controller.ts`:

```ts
import { Controller, Post, Req, HttpCode, UnauthorizedException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';
import { BillingService } from './billing.service';
import { StripeWebhookVerifierService } from './stripe-webhook-verifier.service';
import { MailService } from '../mail/mail.service';

/* Stripe calls this server-to-server with no user session, so it deliberately carries
   none of BillingController's JwtAuthGuard — request authenticity instead comes from
   the Stripe-Signature header checked below. Mirrors PlaidWebhookController. */
@Controller('billing')
export class BillingWebhookController {
  private readonly logger = new Logger(BillingWebhookController.name);

  constructor(
    private billing: BillingService,
    private verifier: StripeWebhookVerifierService,
    private mail: MailService,
    private config: ConfigService,
  ) {}

  @Post('webhook')
  @HttpCode(200)
  async handleWebhook(@Req() req: any) {
    const signature = req.headers['stripe-signature'];
    const rawBody: Buffer | undefined = req.rawBody;
    if (typeof signature !== 'string' || !rawBody) {
      this.logger.warn('Rejected webhook: missing Stripe-Signature header or raw body');
      throw new UnauthorizedException('Missing webhook verification');
    }

    let event: Stripe.Event;
    try {
      event = this.verifier.verify(rawBody, signature, this.config.get<string>('STRIPE_WEBHOOK_SECRET') as string);
    } catch {
      this.logger.warn('Rejected webhook: invalid signature');
      throw new UnauthorizedException('Invalid webhook signature');
    }

    this.logger.log(`Received ${event.type}`);

    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        if (typeof session.customer === 'string' && typeof session.subscription === 'string') {
          const sub = await this.getStripeSubscription(session.subscription);
          await this.billing.syncFromStripeSubscription(session.customer, sub);
        }
        break;
      }
      case 'customer.subscription.created':
      case 'customer.subscription.updated': {
        const sub = event.data.object as Stripe.Subscription;
        if (typeof sub.customer === 'string') {
          await this.billing.syncFromStripeSubscription(sub.customer, sub);
        }
        break;
      }
      case 'customer.subscription.deleted': {
        const sub = event.data.object as Stripe.Subscription;
        if (typeof sub.customer === 'string') {
          await this.billing.syncFromStripeSubscription(sub.customer, sub);
        }
        break;
      }
      case 'invoice.payment_failed': {
        await this.notifyPaymentFailed(event.data.object as Stripe.Invoice);
        break;
      }
      default:
        this.logger.log(`No handler for ${event.type} — acknowledging without action`);
    }

    return { received: true };
  }

  private async getStripeSubscription(id: string): Promise<Stripe.Subscription> {
    // BillingService owns the Stripe client; expose a thin passthrough for this one case.
    return this.billing.retrieveSubscription(id);
  }

  private async notifyPaymentFailed(invoice: Stripe.Invoice): Promise<void> {
    if (typeof invoice.customer !== 'string') return;
    const details = await this.billing.getCustomerContact(invoice.customer);
    if (!details) return;
    const { url } = await this.billing.createPortalLinkForCustomer(invoice.customer);
    await this.mail.sendPaymentFailed(details.email, details.name, url);
  }
}
```

- [ ] **Step 3: Add the three small `BillingService` helpers the webhook controller needs**

The webhook controller needs to retrieve a subscription by ID, look up a user's
email/name by Stripe customer ID, and create a portal link from a customer ID directly
(not a `userId`, since `invoice.payment_failed` only carries the customer). Edit
`apps/api/src/billing/billing.service.ts` — add these three methods to the class (after
`createPortalLink`):

```ts
  async retrieveSubscription(id: string): Promise<Stripe.Subscription> {
    return this.stripe.subscriptions.retrieve(id);
  }

  async getCustomerContact(stripeCustomerId: string): Promise<{ email: string; name: string } | null> {
    const user = await this.users.findOneBy({ stripeCustomerId });
    return user ? { email: user.email, name: user.name } : null;
  }

  async createPortalLinkForCustomer(stripeCustomerId: string): Promise<{ url: string }> {
    const session = await this.stripe.billingPortal.sessions.create({
      customer: stripeCustomerId,
      return_url: `${this.frontendUrl}/settings`,
      flow_data: { type: 'payment_method_update' },
    });
    return { url: session.url };
  }
```

- [ ] **Step 4: Wire the webhook controller into `BillingModule`**

Edit `apps/api/src/billing/billing.module.ts`:

```ts
import { BillingWebhookController } from './billing-webhook.controller';
```

```ts
  controllers: [BillingController, BillingWebhookController],
```

- [ ] **Step 5: Verify it typechecks and the route exists**

Run: `npx tsc --noEmit -p apps/api/tsconfig.app.json`
Expected: no errors.

Run: `npm run dev:api`, then:
`curl -i -X POST http://localhost:3333/api/billing/webhook`
Expected: `401` (missing signature header) — confirms the route exists with no auth
guard blocking it before the signature check runs. Stop the dev server after checking.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/billing/billing-webhook.controller.ts apps/api/src/billing/billing.module.ts apps/api/src/billing/billing.service.ts apps/api/src/mail/mail.service.ts
git commit -m "feat(billing): add Stripe webhook handler and payment-failed email"
```

---

## Task 6: Plan gating — Plaid opens to Pro+Elite, 4-institution cap on Pro

**Files:**
- Modify: `apps/api/src/plaid/plaid.controller.ts:7-9`
- Modify: `apps/api/src/plaid/plaid.service.ts:116-130`
- Create: `apps/api/src/plaid/plaid.service.institution-cap.test.ts`

**Interfaces:**
- Consumes: `PlaidItem` repository (existing), `User.plan` (Task 1).
- Produces: no new exports — this task changes existing behavior only.

- [ ] **Step 1: Open Plaid to both paid tiers**

Edit `apps/api/src/plaid/plaid.controller.ts:8`:

```ts
@RequiresPlan('pro', 'elite')
```

- [ ] **Step 2: Write the failing test for the institution cap**

Look at `apps/api/src/plaid/plaid.service.ts:50-72` first — the real constructor order
is `(config: ConfigService, itemRepo, accountRepo, txRepo, userRepo,
rulesService: CategorizationRulesService)`, and it derives its internal encryption key
from `config.get('JWT_SECRET')` (throwing if unset) rather than taking a key directly.
This test stubs the Plaid client's `itemPublicTokenExchange`/`accountsBalanceGet`/
`itemRemove` calls after construction and uses real in-memory repos for `PlaidItem`,
`BankAccount`, `Transaction`, and `User`, following the same `better-sqlite3`
`DataSource` pattern introduced in Task 3.

Create `apps/api/src/plaid/plaid.service.institution-cap.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { DataSource } from 'typeorm';
import { PlaidItem } from './plaid-item.entity';
import { BankAccount } from '../bank-accounts/bank-account.entity';
import { Transaction } from '../transactions/transaction.entity';
import { User } from '../users/user.entity';
import { PlaidService } from './plaid.service';

async function makeDataSource() {
  const ds = new DataSource({
    type: 'better-sqlite3', database: ':memory:', dropSchema: true,
    entities: [PlaidItem, BankAccount, Transaction, User], synchronize: true,
  });
  await ds.initialize();
  return ds;
}

function fakeConfig(env: Record<string, string> = {}) {
  return { get: (key: string, fallback?: string) => env[key] ?? fallback } as any;
}

describe('PlaidService institution cap', () => {
  let ds: Awaited<ReturnType<typeof makeDataSource>>;

  beforeEach(async () => { ds = await makeDataSource(); });

  // Matches PlaidService's real constructor order: (config, itemRepo, accountRepo,
  // txRepo, userRepo, rulesService) — read plaid.service.ts:50-56 before touching this.
  function makeService(fakeClient: any) {
    const service = new PlaidService(
      fakeConfig({ PLAID_ENV: 'sandbox', JWT_SECRET: 'test-secret-at-least-this-long' }),
      ds.getRepository(PlaidItem),
      ds.getRepository(BankAccount),
      ds.getRepository(Transaction),
      ds.getRepository(User),
      { matchNewTransaction: async () => null } as any, // CategorizationRulesService stub
    );
    (service as any).client = fakeClient;
    return service;
  }

  it('rejects a 5th institution for a Pro user and releases the Plaid item', async () => {
    for (let i = 0; i < 4; i++) {
      await ds.getRepository(PlaidItem).save(ds.getRepository(PlaidItem).create({
        userId: 'user-1', itemId: `item-${i}`, institutionId: 'inst', institutionName: 'Bank',
        accessToken: 'enc',
      }));
    }
    const itemRemove = async () => ({});
    const service = makeService({
      itemPublicTokenExchange: async () => ({ data: { access_token: 'tok', item_id: 'item-new' } }),
      itemRemove,
    });

    await expect(
      service.previewExchange('user-1', 'public-token', 'inst', 'Bank', 'pro' as any),
    ).rejects.toThrow(/4 linked institutions/i);

    const count = await ds.getRepository(PlaidItem).count({ where: { userId: 'user-1' } });
    expect(count).toBe(4); // the 5th was never persisted
  });

  it('allows a 5th institution for an Elite user', async () => {
    for (let i = 0; i < 4; i++) {
      await ds.getRepository(PlaidItem).save(ds.getRepository(PlaidItem).create({
        userId: 'user-1', itemId: `item-${i}`, institutionId: 'inst', institutionName: 'Bank',
        accessToken: 'enc',
      }));
    }
    const service = makeService({
      itemPublicTokenExchange: async () => ({ data: { access_token: 'tok', item_id: 'item-new' } }),
      accountsBalanceGet: async () => ({ data: { accounts: [] } }),
    });

    await expect(
      service.previewExchange('user-1', 'public-token', 'inst', 'Bank', 'elite' as any),
    ).resolves.toBeDefined();
  });

  it('allows a Pro user below the cap', async () => {
    const service = makeService({
      itemPublicTokenExchange: async () => ({ data: { access_token: 'tok', item_id: 'item-new' } }),
      accountsBalanceGet: async () => ({ data: { accounts: [] } }),
    });

    await expect(
      service.previewExchange('user-1', 'public-token', 'inst', 'Bank', 'pro' as any),
    ).resolves.toBeDefined();
  });
});
```

- [ ] **Step 3: Run it to confirm it fails**

Run: `npx vitest run --root apps/api src/plaid/plaid.service.institution-cap.test.ts`
Expected: FAIL — `previewExchange` doesn't accept a 5th `plan` argument yet, and the cap
doesn't exist.

- [ ] **Step 4: Add the cap check to `previewExchange`**

`previewExchange`'s current signature and body are at
`apps/api/src/plaid/plaid.service.ts:116-130` (read the surrounding
`PreviewExchangeResult`/`ExchangeDecision` types first so the return type stays
consistent). Change the signature to accept the caller's plan and add the check:

```ts
  async previewExchange(
    userId: string,
    publicToken: string,
    institutionId: string,
    institutionName: string,
    plan: 'free' | 'pro' | 'elite',
  ): Promise<PreviewExchangeResult> {
    const exchangeRes = await this.client.itemPublicTokenExchange({ public_token: publicToken });
    const { access_token, item_id } = exchangeRes.data;

    let item = await this.itemRepo.findOneBy({ itemId: item_id });
    if (!item) {
      if (plan === 'pro') {
        const count = await this.itemRepo.count({ where: { userId } });
        if (count >= 4) {
          await this.client.itemRemove({ access_token });
          throw new ForbiddenException({
            message: 'Pro is limited to 4 linked institutions — upgrade to Elite for unlimited.',
            code: 'INSTITUTION_LIMIT_REACHED',
          });
        }
      }
      item = this.itemRepo.create({ userId, itemId: item_id, institutionId, institutionName });
    }
    item.accessToken = encryptToken(access_token, this.encKey);
    await this.itemRepo.save(item);
    // ...(rest of the existing method body is unchanged)
```

Add `ForbiddenException` to the `@nestjs/common` import at the top of the file if it
isn't already imported.

- [ ] **Step 5: Update the one caller of `previewExchange`**

Edit `apps/api/src/plaid/plaid.controller.ts` — the `previewExchange` route handler
(around line 21) already has `req.user` available; pass the plan through:

```ts
  @Post('exchange/preview')
  previewExchange(
    @Request() req: any,
    @Body() body: { public_token: string; institution_id: string; institution_name: string },
  ) {
    return this.service.previewExchange(
      req.user.id,
      body.public_token,
      body.institution_id,
      body.institution_name,
      req.user.plan,
    );
  }
```

- [ ] **Step 6: Run the test to confirm it passes**

Run: `npx vitest run --root apps/api src/plaid/plaid.service.institution-cap.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 7: Run the full API test suite to check nothing else broke**

Run: `npm run test:api`
Expected: all tests PASS, including the pre-existing `plaid-webhook-signature.test.ts`
and `receipt-parser.test.ts`.

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/plaid/plaid.controller.ts apps/api/src/plaid/plaid.service.ts apps/api/src/plaid/plaid.service.institution-cap.test.ts
git commit -m "feat(billing): open Plaid to Pro+Elite, cap Pro at 4 institutions"
```

---

## Task 7: Deploy config — wire Stripe secrets/env vars

**Files:**
- Modify: `deploy/cloudbuild.yaml`
- Modify: `deploy/ci-deploy.sh`

**Interfaces:** none (infra config only — this task edits checked-in deploy scripts;
it does not run any `gcloud` command itself, matching this project's convention that the
user runs cloud commands themselves).

- [ ] **Step 1: Read the existing Resend/Plaid wiring for the exact pattern to copy**

Open `deploy/cloudbuild.yaml` around the `_MAIL_FROM`/substitution-variables section and
`deploy/ci-deploy.sh` around its `--set-env-vars`/`--set-secrets` lines (already read
during the audit earlier in this project — `ci-deploy.sh:20-21` sets
`RESEND_API_KEY=RESEND_API_KEY:latest` as a secret and `MAIL_FROM=${MAIL_FROM}` as a
plain env var). Stripe's four Price IDs are not sensitive (they're not usable without
the secret key), so they follow the `MAIL_FROM` pattern; the secret key and webhook
signing secret follow the `RESEND_API_KEY` pattern.

- [ ] **Step 2: Add four new substitution variables to `cloudbuild.yaml`**

Edit `deploy/cloudbuild.yaml` — add near the existing `_MAIL_FROM` substitution
(around line 28):

```yaml
  _STRIPE_PRICE_PRO_MONTHLY: price_REPLACE_ME
  _STRIPE_PRICE_PRO_YEARLY: price_REPLACE_ME
  _STRIPE_PRICE_ELITE_MONTHLY: price_REPLACE_ME
  _STRIPE_PRICE_ELITE_YEARLY: price_REPLACE_ME
```

Add a code comment directly above these four lines: `# Fill in with the real Price IDs
from the Stripe dashboard before the first deploy that ships billing.` — these are
genuinely not known until the user creates the Products/Prices in their Stripe account,
which is an action they take outside this repo (matches how this file already documents
`_GOOGLE_CLIENT_ID`/`_PLAID_CLIENT_ID` needing real values).

- [ ] **Step 3: Pass them through as `--set-env-vars` in the API build step**

Edit `deploy/cloudbuild.yaml` — find the API deploy step's `--set-env-vars` argument
(same one that includes `MAIL_FROM=${_MAIL_FROM}`, around line 116) and add:

```yaml
      - 'STRIPE_PRICE_PRO_MONTHLY=${_STRIPE_PRICE_PRO_MONTHLY}'
      - 'STRIPE_PRICE_PRO_YEARLY=${_STRIPE_PRICE_PRO_YEARLY}'
      - 'STRIPE_PRICE_ELITE_MONTHLY=${_STRIPE_PRICE_ELITE_MONTHLY}'
      - 'STRIPE_PRICE_ELITE_YEARLY=${_STRIPE_PRICE_ELITE_YEARLY}'
```

- [ ] **Step 4: Add the two secrets to `ci-deploy.sh`**

Edit `deploy/ci-deploy.sh:21` — add to the existing `--set-secrets` list (alongside
`RESEND_API_KEY=RESEND_API_KEY:latest`):

```
STRIPE_SECRET_KEY=STRIPE_SECRET_KEY:latest,STRIPE_WEBHOOK_SECRET=STRIPE_WEBHOOK_SECRET:latest
```

Also add a comment near the top of `ci-deploy.sh` (matching the existing header comment
listing required vars/secrets) noting that `STRIPE_SECRET_KEY` and
`STRIPE_WEBHOOK_SECRET` must exist in Secret Manager before this script runs — this
script only references them, it doesn't create them (the user creates GCP secrets
themselves, per this project's established workflow).

- [ ] **Step 5: Verify the YAML is still valid**

Run: `npx js-yaml deploy/cloudbuild.yaml > /dev/null && echo OK` (or, if `js-yaml` isn't
available, visually re-read the edited block for indentation matching the surrounding
list items exactly — Cloud Build substitution blocks are indentation-sensitive).
Expected: `OK`, or a clean re-read with no misaligned list items.

- [ ] **Step 6: Commit**

```bash
git add deploy/cloudbuild.yaml deploy/ci-deploy.sh
git commit -m "chore(billing): wire Stripe secrets and price IDs into deploy config"
```

---

## Task 8: Public `/pricing` page + shared tier-cards component

**Files:**
- Create: `apps/web/src/components/PricingCards.tsx`
- Create: `apps/web/src/app/pricing/page.tsx`
- Modify: `apps/web/src/middleware.ts:13`

**Interfaces:**
- Produces: `<PricingCards onSelectFree={() => void} onSelectPaid={(tier: 'pro'|'elite',
  interval: 'month'|'year') => void} currentTier?: 'free'|'pro'|'elite'>` — Task 9's
  Settings billing tab imports this same component to avoid duplicating the tier/feature
  list.

- [ ] **Step 1: Build the shared `PricingCards` component**

Create `apps/web/src/components/PricingCards.tsx`:

```tsx
'use client';

import { useState } from 'react';

type Tier = 'free' | 'pro' | 'elite';
type Interval = 'month' | 'year';

const PRICES: Record<'pro' | 'elite', { month: number; year: number }> = {
  pro: { month: 4.99, year: 47.9 },
  elite: { month: 7.99, year: 76.7 },
};

const FEATURES: { label: string; free: boolean; pro: boolean; elite: boolean }[] = [
  { label: 'Manual accounts & CSV import', free: true, pro: true, elite: true },
  { label: 'Budgets, debts/loans, goals, net worth', free: true, pro: true, elite: true },
  { label: 'Automatic bank sync (Plaid)', free: false, pro: true, elite: true },
  { label: 'Up to 4 linked institutions', free: false, pro: true, elite: true },
  { label: 'Unlimited linked institutions', free: false, pro: false, elite: true },
];

const glass: React.CSSProperties = {
  background: 'var(--color-surface)',
  backdropFilter: 'var(--glass-blur)',
  WebkitBackdropFilter: 'var(--glass-blur)',
  border: 'var(--glass-border)',
  boxShadow: 'var(--glass-shadow)',
};

export default function PricingCards({
  onSelectFree,
  onSelectPaid,
  currentTier,
}: {
  onSelectFree: () => void;
  onSelectPaid: (tier: 'pro' | 'elite', interval: Interval) => void;
  currentTier?: Tier;
}) {
  const [interval, setInterval] = useState<Interval>('month');

  return (
    <div>
      <div className="flex justify-center mb-8">
        <div className="inline-flex rounded-full p-1" style={glass}>
          {(['month', 'year'] as Interval[]).map((i) => (
            <button
              key={i}
              onClick={() => setInterval(i)}
              className="px-4 py-1.5 rounded-full text-sm font-semibold transition-colors"
              style={interval === i
                ? { background: 'var(--color-primary)', color: '#fff' }
                : { color: 'var(--color-text-muted)' }}
            >
              {i === 'month' ? 'Monthly' : 'Yearly — save 20%'}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="rounded-2xl p-6" style={glass}>
          <h3 className="text-lg font-bold" style={{ color: 'var(--color-text-primary)' }}>Free</h3>
          <p className="text-3xl font-bold mt-2" style={{ color: 'var(--color-text-primary)' }}>$0</p>
          <button
            onClick={onSelectFree}
            disabled={currentTier === 'free'}
            className="btn-gold w-full mt-6 py-2 rounded-full font-semibold disabled:opacity-50"
          >
            {currentTier === 'free' ? 'Current plan' : 'Get started'}
          </button>
        </div>

        {(['pro', 'elite'] as const).map((tier) => (
          <div key={tier} className="rounded-2xl p-6" style={glass}>
            <h3 className="text-lg font-bold capitalize" style={{ color: 'var(--color-text-primary)' }}>{tier}</h3>
            <p className="text-3xl font-bold mt-2" style={{ color: 'var(--color-text-primary)' }}>
              ${PRICES[tier][interval].toFixed(2)}
              <span className="text-sm font-normal" style={{ color: 'var(--color-text-muted)' }}>
                /{interval === 'month' ? 'mo' : 'yr'}
              </span>
            </p>
            <button
              onClick={() => onSelectPaid(tier, interval)}
              disabled={currentTier === tier}
              className="btn-gold w-full mt-6 py-2 rounded-full font-semibold disabled:opacity-50"
            >
              {currentTier === tier ? 'Current plan' : 'Start 7-day free trial'}
            </button>
          </div>
        ))}
      </div>

      <div className="mt-10 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr style={{ color: 'var(--color-text-muted)' }}>
              <th className="text-left py-2">Feature</th>
              <th className="py-2">Free</th>
              <th className="py-2">Pro</th>
              <th className="py-2">Elite</th>
            </tr>
          </thead>
          <tbody>
            {FEATURES.map((f) => (
              <tr key={f.label} style={{ borderTop: '1px solid var(--color-border)' }}>
                <td className="py-2" style={{ color: 'var(--color-text-primary)' }}>{f.label}</td>
                <td className="text-center py-2">{f.free ? '✓' : '—'}</td>
                <td className="text-center py-2">{f.pro ? '✓' : '—'}</td>
                <td className="text-center py-2">{f.elite ? '✓' : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Build the public pricing page**

Create `apps/web/src/app/pricing/page.tsx`:

```tsx
'use client';

import { useRouter } from 'next/navigation';
import PricingCards from '@/components/PricingCards';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3333/api';

export default function PricingPage() {
  const router = useRouter();

  async function handleSelectPaid(tier: 'pro' | 'elite', interval: 'month' | 'year') {
    const res = await fetch(`${API}/billing/checkout`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
      body: JSON.stringify({ tier, interval }),
    });
    if (res.status === 401) {
      router.push('/signup');
      return;
    }
    if (!res.ok) return;
    const { url } = await res.json();
    window.location.href = url;
  }

  return (
    <div className="max-w-5xl mx-auto px-6 py-16">
      <h1 className="text-3xl font-bold text-center mb-2" style={{ color: 'var(--color-text-primary)' }}>
        Simple pricing
      </h1>
      <p className="text-center mb-10" style={{ color: 'var(--color-text-muted)' }}>
        Start free. Upgrade when you want your banks connected automatically.
      </p>
      <PricingCards onSelectFree={() => router.push('/signup')} onSelectPaid={handleSelectPaid} />
    </div>
  );
}
```

- [ ] **Step 3: Make `/pricing` public**

Edit `apps/web/src/middleware.ts:13` — add `'/pricing'` to `PUBLIC_PATHS`.

- [ ] **Step 4: Manually verify in a browser**

Run: `npm run dev:web`, visit `http://localhost:3000/pricing` while logged out.
Expected: the page renders without redirecting to `/login`, the monthly/yearly toggle
switches the displayed prices, and clicking a paid tier's button (while logged out)
sends you to `/signup` (since `POST /billing/checkout` returns 401 without a session).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/PricingCards.tsx apps/web/src/app/pricing/page.tsx apps/web/src/middleware.ts
git commit -m "feat(billing): add public pricing page"
```

---

## Task 9: Settings → Billing tab (view, switch, cancel, portal link)

**Files:**
- Create: `apps/web/src/components/BillingTab.tsx`
- Modify: `apps/web/src/app/settings/page.tsx`

**Interfaces:**
- Consumes: `PricingCards` (Task 8), `GET/PATCH/POST /api/billing/*` (Tasks 4/5).

- [ ] **Step 1: Build the Billing tab component**

Create `apps/web/src/components/BillingTab.tsx`:

```tsx
'use client';

import { useEffect, useState, useCallback } from 'react';
import PricingCards from './PricingCards';
import { useUser } from './UserProvider';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3333/api';

interface SubscriptionInfo {
  tier: 'pro' | 'elite';
  interval: 'month' | 'year';
  status: 'trialing' | 'active' | 'past_due' | 'canceled';
  currentPeriodEnd: string | null;
  trialEnd: string | null;
  cancelAtPeriodEnd: boolean;
}

const glass: React.CSSProperties = {
  background: 'var(--color-surface)',
  backdropFilter: 'var(--glass-blur)',
  WebkitBackdropFilter: 'var(--glass-blur)',
  border: 'var(--glass-border)',
  boxShadow: 'var(--glass-shadow)',
};

function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

export default function BillingTab() {
  const { user, refetch } = useUser();
  const [sub, setSub] = useState<SubscriptionInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API}/billing/subscription`, { credentials: 'include' });
      setSub(res.ok ? await res.json() : null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function startCheckout(tier: 'pro' | 'elite', interval: 'month' | 'year') {
    setBusy(true);
    try {
      const res = await fetch(`${API}/billing/checkout`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify({ tier, interval }),
      });
      if (!res.ok) return;
      const { url } = await res.json();
      window.location.href = url;
    } finally {
      setBusy(false);
    }
  }

  async function switchTier(tier: 'pro' | 'elite', interval: 'month' | 'year') {
    setBusy(true);
    try {
      const res = await fetch(`${API}/billing/subscription`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify({ tier, interval }),
      });
      if (res.ok) {
        await new Promise((r) => setTimeout(r, 1500)); // give the webhook a moment to land
        await load();
        await refetch();
      }
    } finally {
      setBusy(false);
    }
  }

  async function cancelPlan() {
    if (!confirm('Cancel your subscription? You’ll keep access until the end of the current billing period.')) return;
    setBusy(true);
    try {
      const res = await fetch(`${API}/billing/cancel`, { method: 'POST', credentials: 'include' });
      if (res.ok) {
        await new Promise((r) => setTimeout(r, 1500));
        await load();
      }
    } finally {
      setBusy(false);
    }
  }

  async function openPortal() {
    const res = await fetch(`${API}/billing/portal-link`, { method: 'POST', credentials: 'include' });
    if (!res.ok) return;
    const { url } = await res.json();
    window.location.href = url;
  }

  if (loading) return null;

  if (!sub) {
    return (
      <div>
        <h2 className="text-lg font-bold mb-4" style={{ color: 'var(--color-text-primary)' }}>Plan &amp; billing</h2>
        <PricingCards onSelectFree={() => {}} onSelectPaid={startCheckout} currentTier={user?.plan ?? 'free'} />
      </div>
    );
  }

  return (
    <div className="max-w-xl">
      <h2 className="text-lg font-bold mb-4" style={{ color: 'var(--color-text-primary)' }}>Plan &amp; billing</h2>
      <div className="rounded-2xl p-6 space-y-3" style={glass}>
        <p style={{ color: 'var(--color-text-primary)' }}>
          <span className="font-semibold capitalize">{sub.tier}</span> · {sub.interval === 'month' ? 'Monthly' : 'Yearly'}
        </p>
        {sub.status === 'trialing' && (
          <p style={{ color: 'var(--color-text-muted)' }}>Trial ends {fmtDate(sub.trialEnd)}</p>
        )}
        {sub.status === 'past_due' && (
          <p style={{ color: 'var(--color-card-orange)' }}>
            Your last payment failed — update your card to keep your plan active.
          </p>
        )}
        {sub.cancelAtPeriodEnd ? (
          <p style={{ color: 'var(--color-text-muted)' }}>Cancels on {fmtDate(sub.currentPeriodEnd)}</p>
        ) : (
          <p style={{ color: 'var(--color-text-muted)' }}>Renews on {fmtDate(sub.currentPeriodEnd)}</p>
        )}

        <div className="flex flex-wrap gap-2 pt-2">
          {sub.tier === 'pro' && (
            <button disabled={busy} onClick={() => switchTier('elite', sub.interval)} className="btn-gold px-4 py-2 rounded-full text-sm font-semibold">
              Upgrade to Elite
            </button>
          )}
          {sub.tier === 'elite' && (
            <button disabled={busy} onClick={() => switchTier('pro', sub.interval)} className="px-4 py-2 rounded-full text-sm font-semibold" style={{ border: '1px solid var(--color-border)', color: 'var(--color-text-primary)' }}>
              Downgrade to Pro
            </button>
          )}
          <button
            disabled={busy}
            onClick={() => switchTier(sub.tier, sub.interval === 'month' ? 'year' : 'month')}
            className="px-4 py-2 rounded-full text-sm font-semibold"
            style={{ border: '1px solid var(--color-border)', color: 'var(--color-text-primary)' }}
          >
            Switch to {sub.interval === 'month' ? 'yearly (save 20%)' : 'monthly'}
          </button>
          <button disabled={busy} onClick={openPortal} className="px-4 py-2 rounded-full text-sm font-semibold" style={{ border: '1px solid var(--color-border)', color: 'var(--color-text-primary)' }}>
            Update payment method
          </button>
          {!sub.cancelAtPeriodEnd && (
            <button disabled={busy} onClick={cancelPlan} className="px-4 py-2 rounded-full text-sm font-semibold" style={{ color: 'var(--color-card-orange)' }}>
              Cancel plan
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Add the tab into Settings**

Edit `apps/web/src/app/settings/page.tsx`:

1. Widen the `Tab` type (`page.tsx:24`) to include `'billing'`.
2. Import the component near the other component imports (`page.tsx:6-15`):
   `import BillingTab from '@/components/BillingTab';`
3. Add an entry to the `TABS` array (`page.tsx:123` onward) — copy the shape of the
   `'integrations'` entry, label `'Billing'`.
4. Add the render branch near the other `activeTab === '...'` branches (around
   `page.tsx:972`): `{activeTab === 'billing' && <BillingTab />}`
5. The existing tab-restore effect (`page.tsx:234-240`) reads
   `new URLSearchParams(window.location.search).get('tab')` against a hardcoded array of
   allowed values — add `'billing'` to that array so `/settings?tab=billing` deep-links
   correctly. In the same effect, also handle the Checkout `success_url` from Task 3
   (`${FRONTEND_URL}/settings?checkout=success`): read `params.get('checkout')` and, when
   it's `'success'`, call `setActiveTab('billing')` regardless of any `tab` param, so the
   user lands directly on their new plan instead of the default `'banks'` tab.

- [ ] **Step 3: Manually verify in a browser**

Run: `npm run dev:web` and `npm run dev:api` (with real Stripe test-mode keys in
`.env` — `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` from `stripe listen --forward-to
localhost:3333/api/billing/webhook`, and the four `STRIPE_PRICE_*` test-mode price IDs).
Log in, go to Settings → Billing, confirm the Free-tier pricing cards render; click
"Start 7-day free trial" on Pro, complete Stripe's test Checkout with card `4242 4242
4242 4242`, get redirected back to `/settings?checkout=success`, confirm the Billing tab
now shows "Pro · Monthly" and a trial-end date once the webhook (forwarded by `stripe
listen`) lands.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/BillingTab.tsx apps/web/src/app/settings/page.tsx
git commit -m "feat(billing): add Billing tab to Settings"
```

---

## Task 10: Institution-limit UX + plan-badge updates for Elite

**Files:**
- Modify: `apps/web/src/app/settings/page.tsx` (the `onPlaidSuccess` catch block,
  `page.tsx:319-370`)
- Modify: `apps/web/src/components/Sidebar.tsx:196-212`
- Modify: `apps/web/src/components/AccountSettings.tsx:41,82,147-186`

**Interfaces:** none new — this task only changes existing UI branches.

- [ ] **Step 1: Surface `INSTITUTION_LIMIT_REACHED` distinctly in the Connect Bank flow**

Edit `apps/web/src/app/settings/page.tsx` — the `onPlaidSuccess` function's `try` block
(`page.tsx:331-339`) currently does `if (!res.ok) throw new Error();` on the
`/plaid/exchange/preview` call, which discards the response body. Change it to inspect
the body for the institution-cap error code before falling through to the generic error:

```ts
        const res = await fetch(`${API}/plaid/exchange/preview`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
          body: JSON.stringify({
            public_token: publicToken,
            institution_id: metadata.institution?.institution_id ?? '',
            institution_name: metadata.institution?.name ?? 'Unknown Bank',
          }),
        });
        if (!res.ok) {
          const body = await res.json().catch(() => null);
          if (body?.code === 'INSTITUTION_LIMIT_REACHED') {
            throw new Error('INSTITUTION_LIMIT_REACHED');
          }
          throw new Error();
        }
```

And widen the outer `catch` (`page.tsx:362-364`) to check for that specific message
before falling back to the existing generic messages:

```ts
    } catch (err) {
      if (err instanceof Error && err.message === 'INSTITUTION_LIMIT_REACHED') {
        setError('Pro is limited to 4 linked institutions — upgrade to Elite in Settings → Billing for unlimited.');
      } else {
        setError(linkMode === 'reconnect' ? 'Reconnected, but refresh failed. Try syncing manually.' : 'Bank connected but account import failed. Try syncing manually.');
      }
    } finally {
```

- [ ] **Step 2: Update the Sidebar plan badge for Elite**

Edit `apps/web/src/components/Sidebar.tsx:196-212` — the badge currently only checks
`user.plan === 'pro'`. Change it to show a distinct label per paid tier while keeping
Free as `'Basic'`:

```tsx
            {user && (
              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-md shrink-0"
                style={user.plan !== 'free'
                  ? { background: 'color-mix(in srgb, var(--color-primary) 16%, transparent)', color: 'var(--color-primary)' }
                  : { background: 'color-mix(in srgb, var(--color-text-muted) 16%, transparent)', color: 'var(--color-text-muted)' }}>
                {user.plan === 'elite' ? 'Elite' : user.plan === 'pro' ? 'Pro' : 'Basic'}
              </span>
            )}
```

And the "Upgrade to Pro" link below it (`page.tsx:207-212` in that file) should only
show for Free users pointing at Billing, and a distinct "Upgrade to Elite" for Pro users:

```tsx
          {user && user.plan === 'free' && (
            <Link href="/settings?tab=billing" className="text-[10px] font-semibold leading-tight hover:underline"
              style={{ color: 'var(--color-primary)' }}>
              Upgrade to Pro
            </Link>
          )}
          {user && user.plan === 'pro' && (
            <Link href="/settings?tab=billing" className="text-[10px] font-semibold leading-tight hover:underline"
              style={{ color: 'var(--color-primary)' }}>
              Upgrade to Elite
            </Link>
          )}
```

- [ ] **Step 3: Update `AccountSettings.tsx` for the three-tier label**

Edit `apps/web/src/components/AccountSettings.tsx:41` — replace the boolean with a
three-way label, and update every place that read `isPro` (lines `82`, `147`, `150`,
`151`, `157`, `160`, `162`, `168-172`, `176-185`) to use it:

```ts
  const planLabel = user?.plan === 'elite' ? 'Elite' : user?.plan === 'pro' ? 'Pro' : 'Free';
  const isPaid    = user?.plan === 'pro' || user?.plan === 'elite';
```

Replace each `isPro` reference with `isPaid` (for the "has an active paid plan at all"
styling branches at lines `147-151`, `168-172`) and each hardcoded `'Pro'`/`'Pro
membership'` string with `planLabel` (line 82's `{isPro ? 'Pro' : 'Free'} plan` becomes
`{planLabel} plan`; line 157's `{isPro ? 'Pro membership' : 'Free plan'}` becomes
`` {isPaid ? `${planLabel} membership` : 'Free plan'} ``).

The upgrade CTA block (`page.tsx:176-188`, condition `{!isPro && (...)}`) currently
renders a **non-functional stub** — `<button type="button" disabled ... title="Coming
soon">Upgrade to Pro</button>`. Change the condition to `{!isPaid && (...)}`, remove the
`disabled` attribute and `title="Coming soon"`, change the copy from "Upgrade to Pro for
unlimited accounts and advanced insights." to "Upgrade for automatic bank sync.", and
make the button actually navigate — wrap it in `next/link`'s `Link` (already imported
elsewhere in this codebase's settings components) pointed at `/settings?tab=billing`, or
convert the `<button>` to `<Link href="/settings?tab=billing" className="...">` keeping
the same Tailwind classes minus `disabled:opacity-60`.

- [ ] **Step 4: Manually verify in a browser**

With a test user manually flipped to each of `'free'`, `'pro'`, `'elite'` in the local
DB (`UPDATE users SET plan = 'elite' WHERE email = '...'`), reload the app and confirm
the Sidebar badge and Account Settings page both show the correct label and upgrade CTA
for each state.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/settings/page.tsx apps/web/src/components/Sidebar.tsx apps/web/src/components/AccountSettings.tsx
git commit -m "feat(billing): handle institution-limit error and Elite plan badges"
```

---

## Final check: full suite

- [ ] **Run everything once, end to end**

Run: `npm run test:api && npm run test:dashboard`
Expected: all tests pass, including the six new/changed test files added across Tasks
2, 3, and 6.

Run: `npx tsc --noEmit -p apps/api/tsconfig.app.json`
Expected: no errors.
