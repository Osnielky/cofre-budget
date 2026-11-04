import { describe, it, expect, beforeEach } from 'vitest';
import { DataSource } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { ConflictException } from '@nestjs/common';
import { User } from '../users/user.entity';
import { Subscription } from './subscription.entity';
import { BillingService } from './billing.service';
import type { MailService } from '../mail/mail.service';
import type { BillingEmailContent } from './billing-emails';

/** Records billing emails instead of sending them; `fail` makes every send throw. */
class FakeMail {
  sent: { to: string; content: BillingEmailContent }[] = [];
  fail = false;
  async sendBillingEmail(to: string, content: BillingEmailContent) {
    if (this.fail) throw new Error('resend down');
    this.sent.push({ to, content });
  }
}
const asMail = (m: FakeMail) => m as unknown as MailService;

function fakeConfig(overrides: Record<string, string | undefined> = {}): ConfigService {
  const base: Record<string, string | undefined> = {
    STRIPE_PRICE_PRO_MONTHLY: 'price_pro_month',
    STRIPE_PRICE_PRO_YEARLY: 'price_pro_year',
    STRIPE_PRICE_ELITE_MONTHLY: 'price_elite_month',
    STRIPE_PRICE_ELITE_YEARLY: 'price_elite_year',
    STRIPE_SECRET_KEY: 'sk_test_x',
    STRIPE_WEBHOOK_SECRET: 'whsec_test',
    ...overrides,
  };
  return { get: (key: string) => base[key] } as unknown as ConfigService;
}

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
  let mail: FakeMail;

  beforeEach(async () => {
    ds = await makeDataSource();
    const userRepo = ds.getRepository(User);
    const user = await userRepo.save(userRepo.create({
      email: 'a@example.com', stripeCustomerId: 'cus_123', plan: 'free',
    }));
    userId = user.id;

    const config = fakeConfig();

    mail = new FakeMail();
    service = new BillingService(
      ds.getRepository(User),
      ds.getRepository(Subscription),
      config,
      asMail(mail),
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

  describe('late payment moves the renewal date', () => {
    const DAY = 86_400_000;
    const periodEnd = Math.floor(Date.now() / 1000) + 15 * 86_400;
    const items = { data: [{ price: { id: 'price_pro_month' }, current_period_end: periodEnd }] };
    /** Stripe as re-read before extending: `live` is what the subscription really looks like now. */
    function stubStripe(live: any = { status: 'active', latest_invoice: { status: 'paid', amount_paid: 499, status_transitions: { paid_at: Math.floor(Date.now() / 1000) } } }) {
      const updates: any[] = [];
      (service as any).stripe = {
        invoices: { list: async (params: any) => ({ data: live.outstanding?.includes(params.status) ? [{ id: 'in_open' }] : [] }) },
        subscriptions: {
          retrieve: async () => fakeSub({ trial_end: null, items, ...live }),
          update: async (id: string, params: any) => {
            updates.push({ id, params });
            return fakeSub({ status: 'trialing', trial_end: params.trial_end, metadata: params.metadata, items });
          },
        },
      };
      return updates;
    }

    it('after a recovery, extends the paid period by the time spent past due — whoever collected the payment', async () => {
      const pastDueSince = new Date(Date.now() - 10 * DAY);
      await service.syncFromStripeSubscription('cus_123', fakeSub({ status: 'past_due', trial_end: null, items }) as any);
      await ds.getRepository(Subscription).update({ userId }, { pastDueSince });
      const updates = stubStripe();
      mail.sent = [];
      // Stripe's retry (or the portal) paid the old invoice: the webhook says active again.
      await service.syncFromStripeSubscription('cus_123', fakeSub({ status: 'active', trial_end: null, items }) as any);
      expect(updates).toHaveLength(1);
      const expectedEnd = periodEnd + Math.round((Date.now() - pastDueSince.getTime()) / 1000);
      expect(Math.abs(updates[0].params.trial_end - expectedEnd)).toBeLessThan(5);
      expect(updates[0].params.proration_behavior).toBe('none');
      expect(updates[0].params.metadata).toEqual({ cofre_paid_period_extended: pastDueSince.toISOString() });
      const row = await ds.getRepository(Subscription).findOneByOrFail({ userId });
      expect(row.status).toBe('active');
      expect(row.trialEnd).toBeNull();
      expect(row.pastDueSince).toBeNull();
      expect(Math.abs(row.currentPeriodEnd!.getTime() / 1000 - expectedEnd)).toBeLessThan(5);
      expect((await ds.getRepository(User).findOneByOrFail({ id: userId })).plan).toBe('pro');
      expect(mail.sent.map((m) => m.content.subject)).toEqual(['Payment received — your Cofre Pro plan is back']);
      // Stripe then reports the extension itself: nothing more happens.
      await service.syncFromStripeSubscription('cus_123', fakeSub({ status: 'trialing', trial_end: updates[0].params.trial_end, metadata: updates[0].params.metadata, items }) as any);
      expect(updates).toHaveLength(1);
      expect((await ds.getRepository(Subscription).findOneByOrFail({ userId })).status).toBe('active');
      expect(mail.sent).toHaveLength(1);
    });

    it('does not trust the webhook alone: no extension unless Stripe shows a paid invoice settled after the clock started', async () => {
      const pastDueSince = new Date(Date.now() - 10 * DAY);
      await service.syncFromStripeSubscription('cus_123', fakeSub({ status: 'past_due', trial_end: null, items }) as any);
      await ds.getRepository(Subscription).update({ userId }, { pastDueSince });
      // A stale "active" event: Stripe still shows the invoice open.
      let updates = stubStripe({ status: 'past_due', latest_invoice: { status: 'open', amount_paid: 0, status_transitions: { paid_at: null } } });
      await service.syncFromStripeSubscription('cus_123', fakeSub({ status: 'active', trial_end: null, items }) as any);
      expect(updates).toHaveLength(0);
      // Active, but the latest paid invoice predates the past-due clock (an old event replayed).
      await service.syncFromStripeSubscription('cus_123', fakeSub({ status: 'past_due', trial_end: null, items }) as any);
      await ds.getRepository(Subscription).update({ userId }, { pastDueSince });
      updates = stubStripe({ status: 'active', latest_invoice: { status: 'paid', amount_paid: 499, status_transitions: { paid_at: Math.floor(pastDueSince.getTime() / 1000) - 86_400 } } });
      await service.syncFromStripeSubscription('cus_123', fakeSub({ status: 'active', trial_end: null, items }) as any);
      expect(updates).toHaveLength(0);
      // Active because a later, smaller invoice was paid while the overdue one is still open.
      for (const outstanding of [['open'], ['uncollectible']]) {
        await service.syncFromStripeSubscription('cus_123', fakeSub({ status: 'past_due', trial_end: null, items }) as any);
        await ds.getRepository(Subscription).update({ userId }, { pastDueSince });
        updates = stubStripe({ status: 'active', outstanding, latest_invoice: { status: 'paid', amount_paid: 120, status_transitions: { paid_at: Math.floor(Date.now() / 1000) } } });
        await service.syncFromStripeSubscription('cus_123', fakeSub({ status: 'active', trial_end: null, items }) as any);
        expect(updates).toHaveLength(0);
      }
    });

    it('leaves the dates alone when the plan was not past due, and when Stripe refuses the move', async () => {
      const updates = stubStripe();
      await service.syncFromStripeSubscription('cus_123', fakeSub({ status: 'trialing' }) as any);
      await service.syncFromStripeSubscription('cus_123', fakeSub({ status: 'active', trial_end: null }) as any);
      expect(updates).toHaveLength(0);
      // Past due, then Stripe errors on the update: the recovery still lands on Stripe's dates.
      await service.syncFromStripeSubscription('cus_123', fakeSub({ status: 'past_due', trial_end: null }) as any);
      await ds.getRepository(Subscription).update({ userId }, { pastDueSince: new Date(Date.now() - 3 * DAY) });
      (service as any).stripe = { subscriptions: { retrieve: async () => { throw new Error('boom'); }, update: async () => { throw new Error('boom'); } } };
      await service.syncFromStripeSubscription('cus_123', fakeSub({ status: 'active', trial_end: null }) as any);
      const row = await ds.getRepository(Subscription).findOneByOrFail({ userId });
      expect(row.status).toBe('active');
      expect(row.currentPeriodEnd).toEqual(new Date(1_800_000_000 * 1000));
    });
  });

  describe('trial-ending reminder', () => {
    const DAY = 86_400_000;
    const seed = async (o: Partial<Subscription> = {}) => {
      await ds.getRepository(Subscription).save(ds.getRepository(Subscription).create({
        userId, stripeSubscriptionId: 'sub_t', tier: 'pro', interval: 'month', status: 'trialing', cancelAtPeriodEnd: false,
        trialEnd: new Date(Date.now() + 2 * DAY), currentPeriodEnd: new Date(Date.now() + 2 * DAY), ...o,
      }));
    };
    const stripeWith = (live: any) => { (service as any).stripe = { subscriptions: { retrieve: async () => live } }; };
    const item = { price: { id: 'price_pro_month', unit_amount: 499, currency: 'usd' } };

    it('emails once when a real trial ends within 3 days, naming the first charge and the card on file', async () => {
      await seed();
      stripeWith({ items: { data: [item] }, default_payment_method: { id: 'pm_1' }, customer: { invoice_settings: { default_payment_method: null } } });
      expect(await service.sweepTrialReminders()).toBe(1);
      expect(mail.sent).toHaveLength(1);
      expect(mail.sent[0].content.subject).toMatch(/^Your Cofre Pro trial ends on/);
      expect(mail.sent[0].content.intro).toMatch(/charged to the payment method on file/);
      expect((await ds.getRepository(Subscription).findOneByOrFail({ userId })).trialReminderSentAt).toBeInstanceOf(Date);
      expect(await service.sweepTrialReminders()).toBe(0);
      expect(mail.sent).toHaveLength(1);
    });

    it('asks for a payment method when Stripe holds none', async () => {
      await seed();
      stripeWith({ items: { data: [item] }, default_payment_method: null, customer: { invoice_settings: { default_payment_method: null } } });
      await service.sweepTrialReminders();
      expect(mail.sent[0].content.intro).toMatch(/no payment method on file yet/);
      expect(mail.sent[0].content.cta.label).toBe('Add payment method');
    });

    it('skips trials further out, trials set to cancel, ended trials and late-payment extensions', async () => {
      stripeWith({ items: { data: [item] }, default_payment_method: { id: 'pm_1' }, customer: {} });
      for (const o of [
        { trialEnd: new Date(Date.now() + 5 * DAY) },
        { cancelAtPeriodEnd: true },
        { trialEnd: new Date(Date.now() - DAY) },
        { status: 'active' as const, trialEnd: null },
      ]) {
        await ds.getRepository(Subscription).delete({ userId });
        await seed(o);
        expect(await service.sweepTrialReminders()).toBe(0);
      }
      expect(mail.sent).toEqual([]);
    });

    it('still sends when Stripe cannot be read, and leaves the stamp off when the email fails', async () => {
      await seed();
      (service as any).stripe = { subscriptions: { retrieve: async () => { throw new Error('stripe down'); } } };
      expect(await service.sweepTrialReminders()).toBe(1);
      expect(mail.sent[0].content.intro).toMatch(/charged to the payment method on file/);
      await ds.getRepository(Subscription).update({ userId }, { trialReminderSentAt: null });
      mail.fail = true;
      expect(await service.sweepTrialReminders()).toBe(0);
      expect((await ds.getRepository(Subscription).findOneByOrFail({ userId })).trialReminderSentAt).toBeNull();
    });
  });

  describe('past-due downgrade (24 h)', () => {
    const sync = (o: any = {}) => service.syncFromStripeSubscription('cus_123', fakeSub(o) as any);
    const plan = async () => (await ds.getRepository(User).findOneByOrFail({ id: userId })).plan;
    const row = () => ds.getRepository(Subscription).findOneByOrFail({ userId });
    const HOUR = 3_600_000;
    const agePastDue = async (hours: number) =>
      ds.getRepository(Subscription).update({ userId }, { pastDueSince: new Date(Date.now() - hours * HOUR) });

    it('stamps pastDueSince the first time Stripe reports past due and keeps it on repeats', async () => {
      await sync({ status: 'active' });
      expect((await row()).pastDueSince).toBeNull();
      await sync({ status: 'past_due' });
      const first = (await row()).pastDueSince;
      expect(first).toBeInstanceOf(Date);
      await agePastDue(5);
      await sync({ status: 'past_due' });
      expect((await row()).pastDueSince!.getTime()).toBeLessThan(first!.getTime());
      expect(await plan()).toBe('pro');
    });

    it('keeps the plan for the first 24 hours, then downgrades to free and emails once', async () => {
      await sync({ status: 'active' });
      await sync({ status: 'past_due' });
      mail.sent = [];
      await agePastDue(23);
      expect(await service.sweepPastDue()).toBe(0);
      expect(await plan()).toBe('pro');

      await agePastDue(25);
      expect(await service.sweepPastDue()).toBe(1);
      expect(await plan()).toBe('free');
      expect((await row()).status).toBe('past_due');
      expect(mail.sent.map((m) => m.content.subject)).toEqual(['Your Cofre Pro plan has ended']);

      expect(await service.sweepPastDue()).toBe(0);
      expect(mail.sent).toHaveLength(1);
    });

    it('restores the plan and clears the clock when Stripe collects the payment', async () => {
      (service as any).stripe = { invoices: { list: async () => ({ data: [] }) }, subscriptions: {
        retrieve: async () => fakeSub({ status: 'active', trial_end: null, latest_invoice: { status: 'paid', amount_paid: 499, status_transitions: { paid_at: Math.floor(Date.now() / 1000) } } }),
        update: async (_id: string, p: any) => fakeSub({ status: 'trialing', trial_end: p.trial_end, metadata: p.metadata }),
      } };
      await sync({ status: 'active' });
      await sync({ status: 'past_due' });
      await agePastDue(30);
      await service.sweepPastDue();
      expect(await plan()).toBe('free');
      await sync({ status: 'active' });
      expect(await plan()).toBe('pro');
      expect((await row()).pastDueSince).toBeNull();
      // Stripe's own period end (Jan 2027) is already more than a month away, so a 30-hour delay earns nothing extra.
      expect((await row()).currentPeriodEnd).toEqual(new Date(1_800_000_000 * 1000));
    });

    it('a repeat past-due webhook after the grace window does not hand the tier back', async () => {
      await sync({ status: 'active' });
      await sync({ status: 'past_due' });
      await agePastDue(30);
      await service.sweepPastDue();
      expect(await plan()).toBe('free');
      await sync({ status: 'past_due' });
      expect(await plan()).toBe('free');
      expect((await row()).pastDueSince!.getTime()).toBeLessThan(Date.now() - 29 * HOUR);
    });

    it('never touches a user whose plan is already free or whose subscription left past due', async () => {
      await sync({ status: 'active' });
      await sync({ status: 'canceled' });
      await ds.getRepository(Subscription).update({ userId }, { pastDueSince: new Date(Date.now() - 48 * HOUR) });
      expect(await service.sweepPastDue()).toBe(0);
      expect(mail.sent.filter((m) => m.content.subject.includes('has ended'))).toHaveLength(1);
    });
  });

  describe('billing emails', () => {
    const sync = (o: any = {}) => service.syncFromStripeSubscription('cus_123', fakeSub(o) as any);
    const subjects = () => mail.sent.map((m) => m.content.subject);

    it('sends one welcome email when the subscription starts, with the Stripe price', async () => {
      await sync({ items: { data: [{ price: { id: 'price_pro_month', unit_amount: 499, currency: 'usd' }, current_period_end: 1_800_000_000 }] } });
      expect(subjects()).toEqual(['Welcome to Cofre Pro']);
      expect(mail.sent[0].to).toBe('a@example.com');
      expect(Object.fromEntries(mail.sent[0].content.rows).Price).toBe('$4.99 / month');
    });

    it('does not email again on a duplicate webhook or trial → active', async () => {
      await sync();
      await sync();
      await sync({ status: 'active' });
      expect(subjects()).toEqual(['Welcome to Cofre Pro']);
    });

    it('emails on a plan change, a scheduled cancellation and the end of the plan', async () => {
      await sync({ status: 'active' });
      await sync({ status: 'active', items: { data: [{ price: { id: 'price_elite_month' }, current_period_end: 1_800_000_000 }] } });
      await sync({ status: 'active', cancel_at_period_end: true, items: { data: [{ price: { id: 'price_elite_month' }, current_period_end: 1_800_000_000 }] } });
      await sync({ status: 'canceled', cancel_at_period_end: true, items: { data: [{ price: { id: 'price_elite_month' }, current_period_end: 1_800_000_000 }] } });
      expect(subjects()).toEqual([
        'Welcome to Cofre Pro',
        'Your Cofre plan changed to Elite',
        'Your Cofre Elite cancellation is confirmed',
        'Your Cofre Elite plan has ended',
      ]);
    });

    it('still saves the subscription when the email fails to send', async () => {
      mail.fail = true;
      await expect(sync({ status: 'active' })).resolves.toMatchObject({ status: 'active' });
      const user = await ds.getRepository(User).findOneByOrFail({ id: userId });
      expect(user.plan).toBe('pro');
    });
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
    // STRIPE_PRICE_ELITE_YEARLY intentionally omitted
    const incompleteConfig = fakeConfig({ STRIPE_PRICE_ELITE_YEARLY: undefined });

    expect(() => new BillingService(
      ds.getRepository(User),
      ds.getRepository(Subscription),
      incompleteConfig,
      asMail(new FakeMail()),
    )).toThrow(/STRIPE_PRICE_ELITE_YEARLY/);
  });

  it('throws a clear error when STRIPE_WEBHOOK_SECRET is missing', async () => {
    const ds = await makeDataSource();
    const incompleteConfig = fakeConfig({ STRIPE_WEBHOOK_SECRET: undefined });

    expect(() => new BillingService(
      ds.getRepository(User),
      ds.getRepository(Subscription),
      incompleteConfig,
      asMail(new FakeMail()),
    )).toThrow(/STRIPE_WEBHOOK_SECRET/);
  });
});

describe('BillingService.createCheckoutSession existing-subscription guard', () => {
  async function setupUserWithSubscription(status: 'trialing' | 'active' | 'past_due' | 'canceled') {
    const ds = await makeDataSource();
    const userRepo = ds.getRepository(User);
    const user = await userRepo.save(userRepo.create({
      email: 'b@example.com', stripeCustomerId: 'cus_456', plan: status === 'canceled' ? 'free' : 'pro',
    }));
    await ds.getRepository(Subscription).save(ds.getRepository(Subscription).create({
      userId: user.id,
      stripeSubscriptionId: 'sub_existing',
      tier: 'pro',
      interval: 'month',
      status,
      cancelAtPeriodEnd: false,
    }));
    const service = new BillingService(ds.getRepository(User), ds.getRepository(Subscription), fakeConfig(), asMail(new FakeMail()));
    return { service, userId: user.id };
  }

  it.each(['trialing', 'active', 'past_due'] as const)(
    'rejects a new checkout with ConflictException when the existing subscription is %s',
    async (status) => {
      const { service, userId } = await setupUserWithSubscription(status);
      await expect(service.createCheckoutSession(userId, 'elite', 'month')).rejects.toBeInstanceOf(ConflictException);
    },
  );

  it('does not block on the guard when the existing subscription is canceled', async () => {
    const { service, userId } = await setupUserWithSubscription('canceled');
    // Past the guard, createCheckoutSession would go on to call the real Stripe API
    // (no network in this test env), so we only assert it never rejects with the
    // guard's ConflictException — anything else confirms the guard let it through.
    await expect(service.createCheckoutSession(userId, 'pro', 'month')).rejects.not.toBeInstanceOf(ConflictException);
  });

  it('does not block on the guard when the user has no Subscription row at all', async () => {
    const ds = await makeDataSource();
    const userRepo = ds.getRepository(User);
    const user = await userRepo.save(userRepo.create({ email: 'c@example.com', stripeCustomerId: 'cus_789', plan: 'free' }));
    const service = new BillingService(ds.getRepository(User), ds.getRepository(Subscription), fakeConfig(), asMail(new FakeMail()));
    await expect(service.createCheckoutSession(user.id, 'pro', 'month')).rejects.not.toBeInstanceOf(ConflictException);
  });
});

describe('BillingService.getOverview and resume', () => {
  async function setup(opts: { withSub?: boolean; cancelAtPeriodEnd?: boolean } = {}) {
    const ds = await makeDataSource();
    const userRepo = ds.getRepository(User);
    const user = await userRepo.save(userRepo.create({ email: 'o@example.com', stripeCustomerId: 'cus_o', plan: 'pro' }));
    if (opts.withSub !== false) {
      await ds.getRepository(Subscription).save(ds.getRepository(Subscription).create({
        userId: user.id, stripeSubscriptionId: 'sub_o', tier: 'pro', interval: 'month', status: 'active',
        cancelAtPeriodEnd: opts.cancelAtPeriodEnd ?? false, currentPeriodEnd: new Date('2026-11-14T00:00:00Z'),
      }));
    }
    const service = new BillingService(ds.getRepository(User), ds.getRepository(Subscription), fakeConfig(), asMail(new FakeMail()));
    const calls: string[] = [];
    const updates: unknown[] = [];
    const stripe = {
      customers: { retrieve: async () => { calls.push('customer'); return { address: null, invoice_settings: { default_payment_method: { type: 'card', card: { brand: 'visa', last4: '4242', exp_month: 4, exp_year: 2028 } } } }; } },
      subscriptions: {
        retrieve: async () => { calls.push('subscription'); return { default_payment_method: null }; },
        update: async (_id: string, params: unknown) => { updates.push(params); return {}; },
      },
      invoices: {
        list: async () => { calls.push('invoices'); return { data: [] }; },
        createPreview: async () => { calls.push('preview'); return { subtotal: 499, total: 499, total_excluding_tax: 499, currency: 'usd', next_payment_attempt: null }; },
      },
    };
    (service as any).stripe = stripe;
    return { service, userId: user.id, calls, updates, stripe };
  }

  it('returns the card and next charge for an active subscription', async () => {
    const { service, userId } = await setup();
    const out = await service.getOverview(userId);
    expect(out.paymentMethod).toMatchObject({ kind: 'card', last4: '4242' });
    expect(out.upcoming).toMatchObject({ total: 4.99, date: '2026-11-14T00:00:00.000Z' });
  });

  it('skips the next-charge preview once the plan is set to cancel', async () => {
    const { service, userId, calls } = await setup({ cancelAtPeriodEnd: true });
    const out = await service.getOverview(userId);
    expect(calls).not.toContain('preview');
    expect(out.upcoming).toBeNull();
  });

  it('still answers with what it has when a Stripe call fails', async () => {
    const { service, userId, stripe } = await setup();
    stripe.invoices.list = async () => { throw new Error('stripe down'); };
    const out = await service.getOverview(userId);
    expect(out.invoices).toEqual([]);
    expect(out.paymentMethod).toMatchObject({ kind: 'card', last4: '4242' });
  });

  it('returns an empty overview for a user with no Stripe customer', async () => {
    const ds = await makeDataSource();
    const user = await ds.getRepository(User).save(ds.getRepository(User).create({ email: 'n@example.com', plan: 'free' }));
    const service = new BillingService(ds.getRepository(User), ds.getRepository(Subscription), fakeConfig(), asMail(new FakeMail()));
    expect(await service.getOverview(user.id)).toEqual({ paymentMethod: null, billingAddress: null, upcoming: null, pendingChange: null, invoices: [] });
  });

  it('resume turns cancel-at-period-end back off in Stripe', async () => {
    const { service, userId, updates } = await setup({ cancelAtPeriodEnd: true });
    await service.resume(userId);
    expect(updates).toEqual([{ cancel_at_period_end: false }]);
  });
});

describe('BillingService.createPortalLink', () => {
  async function setup() {
    const ds = await makeDataSource();
    const userRepo = ds.getRepository(User);
    const user = await userRepo.save(userRepo.create({ email: 'p@example.com', stripeCustomerId: 'cus_p', plan: 'pro' }));
    const service = new BillingService(ds.getRepository(User), ds.getRepository(Subscription), fakeConfig(), asMail(new FakeMail()));
    const params: any[] = [];
    (service as any).stripe = { billingPortal: { sessions: { create: async (p: unknown) => { params.push(p); return { url: 'https://billing.stripe.com/s' }; } } } };
    return { service, userId: user.id, params };
  }

  it('opens the portal overview by default and returns to the Billing tab', async () => {
    const { service, userId, params } = await setup();
    await service.createPortalLink(userId);
    expect(params[0]).toMatchObject({ customer: 'cus_p' });
    expect(params[0].return_url).toMatch(/\/settings\?tab=billing&portal=return$/);
    expect(params[0].flow_data).toBeUndefined();
  });

  it('jumps straight to the payment-method page when asked', async () => {
    const { service, userId, params } = await setup();
    await service.createPortalLink(userId, 'payment_method');
    expect(params[0].flow_data).toEqual({ type: 'payment_method_update' });
  });
});

describe('BillingService.switchTier / previewPlanChange / cancelPendingChange', () => {
  async function setup(opts: { status?: 'trialing' | 'active'; tier?: 'pro' | 'elite'; interval?: 'month' | 'year'; schedule?: boolean; extension?: boolean } = {}) {
    const ds = await makeDataSource();
    const userRepo = ds.getRepository(User);
    const user = await userRepo.save(userRepo.create({ email: 's@example.com', name: 'Sam', stripeCustomerId: 'cus_s', plan: 'pro' }));
    const tier = opts.tier ?? 'pro', interval = opts.interval ?? 'month';
    await ds.getRepository(Subscription).save(ds.getRepository(Subscription).create({
      userId: user.id, stripeSubscriptionId: 'sub_s', tier, interval, status: opts.status ?? 'active',
      cancelAtPeriodEnd: false, currentPeriodEnd: new Date('2026-11-29T00:00:00Z'), trialEnd: opts.status === 'trialing' ? new Date('2026-11-29T00:00:00Z') : null,
    }));
    const mail = new FakeMail();
    const service = new BillingService(ds.getRepository(User), ds.getRepository(Subscription), fakeConfig(), asMail(mail));
    const calls: { op: string; params: any }[] = [];
    const priceId = `price_${tier}_${interval}`;
    const item = { id: 'si_1', price: { id: priceId, unit_amount: interval === 'month' ? 499 : 4790, currency: 'usd' }, current_period_end: 1_795_000_000 };
    const stripe = {
      subscriptions: {
        // `extension`: the row is active, but Stripe holds the subscription as a stamped trial (late-payment.ts).
        retrieve: async () => ({ id: 'sub_s', customer: 'cus_s', status: opts.extension ? 'trialing' : opts.status ?? 'active', cancel_at_period_end: false,
          trial_end: opts.extension ? 1_795_000_000 : null, metadata: opts.extension ? { cofre_paid_period_extended: '2026-10-29T00:00:00.000Z' } : {},
          items: { data: [item] }, schedule: opts.schedule ? { id: 'sched_old', status: 'active', phases: [] } : null }),
        update: async (_id: string, params: any) => {
          calls.push({ op: 'subscriptions.update', params });
          const price = Object.keys({ price_pro_month: 1, price_pro_year: 1, price_elite_month: 1, price_elite_year: 1 }).find((p) => p === params.items?.[0]?.price) ?? priceId;
          return { id: 'sub_s', customer: 'cus_s', status: opts.status ?? 'active', cancel_at_period_end: params.cancel_at_period_end ?? false, trial_end: null, items: { data: [{ ...item, price: { ...item.price, id: price, unit_amount: price.endsWith('year') ? 4790 : 499 } }] } };
        },
      },
      prices: { retrieve: async (id: string) => ({ id, unit_amount: id.endsWith('year') ? (id.includes('elite') ? 7670 : 4790) : (id.includes('elite') ? 799 : 499), currency: 'usd' }) },
      invoices: { createPreview: async (params: any) => { calls.push({ op: 'invoices.createPreview', params }); return { amount_due: 4365, lines: { data: [{ amount: -425, period: { end: 1_795_000_000 }, pricing: { price_details: { price: priceId } } }, { amount: 4790, period: { end: 1_826_000_000 }, pricing: { price_details: { price: params.subscription_details.items[0].price } } }] } }; } },
      subscriptionSchedules: {
        create: async (params: any) => { calls.push({ op: 'subscriptionSchedules.create', params }); return { id: 'sched_1', phases: [{ start_date: 1_792_000_000, end_date: 1_795_000_000, ...(opts.extension ? { trial_end: 1_795_000_000 } : {}) }] }; },
        update: async (id: string, params: any) => { calls.push({ op: 'subscriptionSchedules.update', params: { id, ...params } }); return { id }; },
        release: async (id: string) => { calls.push({ op: 'subscriptionSchedules.release', params: id }); return { id }; },
      },
    };
    (service as any).stripe = stripe;
    return { service, ds, userId: user.id, calls, mail, stripe };
  }

  it('previews an upgrade as today’s prorated charge with the unused-time credit and the new period end', async () => {
    const { service, userId, calls } = await setup();
    const out = await service.previewPlanChange(userId, 'pro', 'year');
    expect(out).toMatchObject({ kind: 'upgrade', chargeNow: 43.65, credit: 4.25, from: { tier: 'pro', interval: 'month', amount: 4.99 }, to: { tier: 'pro', interval: 'year', amount: 47.9 }, nextChargeAt: new Date(1_826_000_000 * 1000).toISOString() });
    expect(calls[0].params.subscription_details).toEqual({ items: [{ id: 'si_1', price: 'price_pro_year' }], proration_behavior: 'always_invoice' });
  });

  it('previews a downgrade as nothing today, starting when the paid period ends', async () => {
    const { service, userId, calls } = await setup({ interval: 'year' });
    const out = await service.previewPlanChange(userId, 'pro', 'month');
    expect(out).toMatchObject({ kind: 'downgrade', chargeNow: 0, credit: 0, effectiveAt: '2026-11-29T00:00:00.000Z', nextChargeAt: '2026-11-29T00:00:00.000Z', to: { amount: 4.99 } });
    expect(calls).toEqual([]);
  });

  it('charges nothing today for an upgrade during the trial; the first payment is at trial end', async () => {
    const { service, userId } = await setup({ status: 'trialing' });
    const out = await service.previewPlanChange(userId, 'pro', 'year');
    expect(out).toMatchObject({ kind: 'upgrade', chargeNow: 0, trialing: true, nextChargeAt: '2026-11-29T00:00:00.000Z' });
  });

  describe('inside a late-payment extension (Stripe holds the subscription as a trial)', () => {
    it('previews an upgrade as the full new price today, the remaining paid days given up, next charge one interval out', async () => {
      const { service, userId, calls } = await setup({ extension: true });
      const out = await service.previewPlanChange(userId, 'elite', 'month');
      expect(out).toMatchObject({ kind: 'upgrade', chargeNow: 7.99, credit: 0, trialing: false, forfeitsPaidThrough: '2026-11-29T00:00:00.000Z' });
      const cap = new Date(); cap.setUTCMonth(cap.getUTCMonth() + 1);
      expect(Math.abs(new Date(out.nextChargeAt!).getTime() - cap.getTime())).toBeLessThan(5000);
      expect(calls.map((c) => c.op)).not.toContain('invoices.createPreview');
    });

    it('an upgrade ends the extension so the new price is charged today, and clears the stamp', async () => {
      const { service, userId, calls } = await setup({ extension: true });
      await service.switchTier(userId, 'elite', 'month');
      expect(calls[0]).toMatchObject({ op: 'subscriptions.update', params: { items: [{ id: 'si_1', price: 'price_elite_month' }], proration_behavior: 'always_invoice', trial_end: 'now', metadata: { cofre_paid_period_extended: '' } } });
    });

    it('a scheduled downgrade carries the extension through phase 0 so nothing bills before it ends', async () => {
      const { service, userId, calls } = await setup({ extension: true, interval: 'year' });
      await service.switchTier(userId, 'pro', 'month');
      expect(calls[1].params.phases[0]).toMatchObject({ start_date: 1_792_000_000, end_date: 1_795_000_000, trial_end: 1_795_000_000 });
      expect(calls[1].params.phases[1]).not.toHaveProperty('trial_end');
    });
  });

  it('outside an extension the upgrade sends no trial_end', async () => {
    const { service, userId, calls } = await setup();
    await service.switchTier(userId, 'pro', 'year');
    expect(calls[0].params).not.toHaveProperty('trial_end');
    expect(calls[0].params).not.toHaveProperty('metadata');
  });

  it('refuses any plan change while past due — the overdue invoice is paid first', async () => {
    const { service, userId, calls } = await setup({ status: 'past_due' as any });
    await expect(service.previewPlanChange(userId, 'elite', 'month')).rejects.toThrow(/pay the overdue invoice/);
    await expect(service.switchTier(userId, 'elite', 'month')).rejects.toThrow(/pay the overdue invoice/);
    expect(calls).toEqual([]);
  });

  it('refuses a no-op change', async () => {
    const { service, userId } = await setup();
    await expect(service.previewPlanChange(userId, 'pro', 'month')).rejects.toThrow(/already on that plan/);
  });

  it('upgrades now: always_invoice, refuse-if-unpaid, row and email updated from Stripe’s response without waiting for the webhook', async () => {
    const { service, ds, userId, calls, mail } = await setup();
    const out = await service.switchTier(userId, 'pro', 'year');
    expect(out.kind).toBe('upgrade');
    expect(calls[0]).toMatchObject({ op: 'subscriptions.update', params: { items: [{ id: 'si_1', price: 'price_pro_year' }], proration_behavior: 'always_invoice', payment_behavior: 'error_if_incomplete' } });
    const row = await ds.getRepository(Subscription).findOneByOrFail({ userId });
    expect(row.interval).toBe('year');
    expect(mail.sent.map((m) => m.content.subject)).toEqual(['Your Cofre plan changed to Pro']);
    expect(Object.fromEntries(mail.sent[0].content.rows)).toMatchObject({ 'Previous plan': 'Pro · Monthly', 'New plan': 'Pro · Yearly', Price: '$47.90 / year' });
  });

  it('does not change the plan when today’s payment is declined', async () => {
    const { service, ds, userId, stripe, mail } = await setup();
    stripe.subscriptions.update = async () => { throw Object.assign(new Error('Your card was declined.'), { type: 'StripeCardError', code: 'card_declined' }); };
    await expect(service.switchTier(userId, 'pro', 'year')).rejects.toThrow(/payment didn't go through/);
    expect((await ds.getRepository(Subscription).findOneByOrFail({ userId })).interval).toBe('month');
    expect(mail.sent).toEqual([]);
  });

  it('downgrades at the end of the paid period through a schedule, charges nothing, keeps the row and emails the date and no-refund note', async () => {
    const { service, ds, userId, calls, mail } = await setup({ interval: 'year' });
    const out = await service.switchTier(userId, 'pro', 'month');
    expect(out).toEqual({ kind: 'downgrade', effectiveAt: new Date(1_795_000_000 * 1000).toISOString() });
    expect(calls.map((c) => c.op)).toEqual(['subscriptionSchedules.create', 'subscriptionSchedules.update']);
    expect(calls[1].params).toMatchObject({ end_behavior: 'release', phases: [
      { items: [{ price: 'price_pro_year', quantity: 1 }], start_date: 1_792_000_000, end_date: 1_795_000_000, proration_behavior: 'none' },
      { items: [{ price: 'price_pro_month', quantity: 1 }], duration: { interval: 'month', interval_count: 1 }, proration_behavior: 'none' },
    ] });
    expect((await ds.getRepository(Subscription).findOneByOrFail({ userId })).interval).toBe('year');
    expect(mail.sent).toHaveLength(1);
    const rows = Object.fromEntries(mail.sent[0].content.rows);
    expect(mail.sent[0].content.subject).toMatch(/switches to Pro · Monthly on/);
    expect(rows['Charged today']).toBe('Nothing');
    expect(rows['Refund for the remaining time']).toMatch(/None/);
    expect(rows['From then']).toBe('Pro · Monthly');
  });

  it('replaces an earlier scheduled change and lets the user cancel one', async () => {
    const { service, userId, calls } = await setup({ interval: 'year', schedule: true });
    await service.switchTier(userId, 'elite', 'year');
    expect(calls.map((c) => c.op)).toEqual(['subscriptionSchedules.release', 'subscriptions.update']);
    calls.length = 0;
    await service.cancelPendingChange(userId);
    expect(calls).toEqual([{ op: 'subscriptionSchedules.release', params: 'sched_old' }]);
  });

  it('cancelling the plan drops a pending downgrade first', async () => {
    const { service, userId, calls } = await setup({ schedule: true });
    await service.cancel(userId);
    expect(calls.map((c) => c.op)).toEqual(['subscriptionSchedules.release', 'subscriptions.update']);
    expect(calls[1].params).toEqual({ cancel_at_period_end: true });
  });
});

describe('BillingService.payOverdue', () => {
  async function setup(opts: { status?: 'past_due' | 'active'; invoices?: any[]; payError?: any } = {}) {
    const ds = await makeDataSource();
    const userRepo = ds.getRepository(User);
    const user = await userRepo.save(userRepo.create({ email: 'd@example.com', name: 'Dee', stripeCustomerId: 'cus_d', plan: 'free' }));
    await ds.getRepository(Subscription).save(ds.getRepository(Subscription).create({
      userId: user.id, stripeSubscriptionId: 'sub_d', tier: 'pro', interval: 'month', status: opts.status ?? 'past_due',
      cancelAtPeriodEnd: false, currentPeriodEnd: new Date('2026-11-29T00:00:00Z'), pastDueSince: new Date('2026-10-29T00:00:00Z'),
    }));
    const mail = new FakeMail();
    const service = new BillingService(ds.getRepository(User), ds.getRepository(Subscription), fakeConfig(), asMail(mail));
    const calls: string[] = [];
    let status = opts.status ?? 'past_due';
    const item = { id: 'si_d', price: { id: 'price_pro_month', unit_amount: 499, currency: 'usd' }, current_period_end: 1_795_000_000 };
    const updates: any[] = [];
    const paidIds = new Set<string>();
    (service as any).stripe = {
      subscriptions: {
        retrieve: async () => ({ id: 'sub_d', customer: 'cus_d', status, cancel_at_period_end: false, trial_end: null, items: { data: [item] }, schedule: null,
          latest_invoice: status === 'active' ? { status: 'paid', amount_paid: 499, status_transitions: { paid_at: Math.floor(Date.now() / 1000) } } : null }),
        update: async (id: string, params: any) => { updates.push(params); return { id, customer: 'cus_d', status: 'trialing', cancel_at_period_end: false, trial_end: params.trial_end, metadata: params.metadata, items: { data: [item] }, schedule: null }; },
      },
      invoices: {
        list: async (params: any) => {
          if (params.status === 'uncollectible') return { data: [] };
          calls.push('invoices.list');
          return { data: (opts.invoices ?? [{ id: 'in_old', created: 2, amount_due: 499 }]).filter((i: any) => !paidIds.has(i.id)) };
        },
        pay: async (id: string) => { calls.push(`invoices.pay:${id}`); if (opts.payError) throw opts.payError; paidIds.add(id); status = 'active'; return { id, status: 'paid', amount_paid: 499, currency: 'usd' }; },
      },
    };
    return { service, ds, userId: user.id, calls, mail, updates };
  }

  it('pays the oldest open invoice, restores the plan at once and emails that the plan is back', async () => {
    const { service, ds, userId, calls, mail, updates } = await setup();
    const out = await service.payOverdue(userId);
    expect(out).toMatchObject({ paid: true, amount: 4.99, currency: 'usd' });
    expect(calls.slice(0, 2)).toEqual(['invoices.list', 'invoices.pay:in_old']);
    // Past due since Oct 29: the paid month now starts today, so the renewal date moves out by that much.
    const expectedEnd = 1_795_000_000 + Math.round((Date.now() - new Date('2026-10-29T00:00:00Z').getTime()) / 1000);
    expect(updates).toHaveLength(1);
    expect(Math.abs(updates[0].trial_end - expectedEnd)).toBeLessThan(5);
    expect(Math.abs(new Date(out.paidThrough!).getTime() / 1000 - expectedEnd)).toBeLessThan(5);
    expect((await ds.getRepository(User).findOneByOrFail({ id: userId })).plan).toBe('pro');
    const row = await ds.getRepository(Subscription).findOneByOrFail({ userId });
    expect(row.status).toBe('active');
    expect(row.pastDueSince).toBeNull();
    expect(row.currentPeriodEnd).toEqual(new Date(out.paidThrough!));
    expect(mail.sent.map((m) => m.content.subject)).toEqual(['Payment received — your Cofre Pro plan is back']);
  });

  it('pays the oldest of several open invoices and does not move the date while one is still open', async () => {
    const { service, ds, userId, calls, updates } = await setup({ invoices: [{ id: 'in_old', created: 2, amount_due: 499 }, { id: 'in_new', created: 3, amount_due: 499 }] });
    const out = await service.payOverdue(userId);
    expect(out.paid).toBe(true);
    expect(calls.slice(0, 2)).toEqual(['invoices.list', 'invoices.pay:in_old']);
    expect(updates).toHaveLength(0);
    expect((await ds.getRepository(Subscription).findOneByOrFail({ userId })).currentPeriodEnd).toEqual(new Date(1_795_000_000 * 1000));
  });

  it('turns a declined payment into a clear 409 and changes nothing', async () => {
    const { service, ds, userId, mail } = await setup({ payError: Object.assign(new Error('The payment failed.'), { type: 'StripeCardError', code: 'card_declined', decline_code: 'insufficient_funds' }) });
    await expect(service.payOverdue(userId)).rejects.toThrow(/Stripe could not charge your payment method: the bank reported insufficient funds\. Add another card or bank account/);
    expect((await ds.getRepository(User).findOneByOrFail({ id: userId })).plan).toBe('free');
    expect(mail.sent).toEqual([]);
  });

  it('explains when there is no payment method to charge', async () => {
    const { service, userId } = await setup({ payError: Object.assign(new Error('This customer has no attached payment source or default payment method.'), { type: 'StripeInvalidRequestError', code: 'invoice_payment_intent_requires_action' }) });
    await expect(service.payOverdue(userId)).rejects.toThrow(/no payment method on file/);
  });

  it('does nothing when the plan is not past due or no invoice is open', async () => {
    const active = await setup({ status: 'active' });
    expect((await active.service.payOverdue(active.userId)).paid).toBe(false);
    expect(active.calls).toEqual([]);
    const { service, userId, calls } = await setup({ invoices: [] });
    const out = await service.payOverdue(userId);
    expect(out.paid).toBe(false);
    expect(calls).toEqual(['invoices.list']);
  });
});
