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
      id: 'sub_1', status: 'trialing',
      trial_end: 1_700_000_000, cancel_at_period_end: false,
      items: { data: [{ price: { id: 'price_pro_month' }, current_period_end: 1_800_000_000 }] },
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

describe('BillingService constructor', () => {
  it('throws a clear error when a required Stripe env var is missing', async () => {
    const ds = await makeDataSource();
    const incompleteConfig = { get: (key: string) => ({
      STRIPE_PRICE_PRO_MONTHLY: 'price_pro_month',
      STRIPE_PRICE_PRO_YEARLY: 'price_pro_year',
      STRIPE_PRICE_ELITE_MONTHLY: 'price_elite_month',
      // STRIPE_PRICE_ELITE_YEARLY intentionally omitted
      STRIPE_SECRET_KEY: 'sk_test_x',
    } as Record<string, string>)[key] } as unknown as ConfigService;

    expect(() => new BillingService(
      ds.getRepository(User),
      ds.getRepository(Subscription),
      incompleteConfig,
    )).toThrow(/STRIPE_PRICE_ELITE_YEARLY/);
  });
});
