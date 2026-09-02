import { ConflictException, Injectable, Logger } from '@nestjs/common';
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
    const secretKey = this.config.get<string>('STRIPE_SECRET_KEY');
    const webhookSecret = this.config.get<string>('STRIPE_WEBHOOK_SECRET');
    const proMonthly = this.config.get<string>('STRIPE_PRICE_PRO_MONTHLY');
    const proYearly = this.config.get<string>('STRIPE_PRICE_PRO_YEARLY');
    const eliteMonthly = this.config.get<string>('STRIPE_PRICE_ELITE_MONTHLY');
    const eliteYearly = this.config.get<string>('STRIPE_PRICE_ELITE_YEARLY');

    const required: Record<string, string | undefined> = {
      STRIPE_SECRET_KEY: secretKey,
      STRIPE_WEBHOOK_SECRET: webhookSecret,
      STRIPE_PRICE_PRO_MONTHLY: proMonthly,
      STRIPE_PRICE_PRO_YEARLY: proYearly,
      STRIPE_PRICE_ELITE_MONTHLY: eliteMonthly,
      STRIPE_PRICE_ELITE_YEARLY: eliteYearly,
    };
    const missing = Object.entries(required)
      .filter(([, value]) => !value)
      .map(([key]) => key);
    if (missing.length > 0) {
      throw new Error(`BillingService is missing required env var(s): ${missing.join(', ')}`);
    }

    this.stripe = new Stripe(secretKey as string);
    this.frontendUrl = this.config.get<string>('FRONTEND_URL', 'http://localhost:3000');
    this.priceIds = {
      [proMonthly as string]: { tier: 'pro', interval: 'month' },
      [proYearly as string]: { tier: 'pro', interval: 'year' },
      [eliteMonthly as string]: { tier: 'elite', interval: 'month' },
      [eliteYearly as string]: { tier: 'elite', interval: 'year' },
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
    const existing = await this.subs.findOneBy({ userId });
    if (existing && ['trialing', 'active', 'past_due'].includes(existing.status)) {
      throw new ConflictException(
        'You already have an active subscription — manage it from Settings instead of starting a new one.',
      );
    }
    const customerId = await this.getOrCreateCustomer(userId);
    const session = await this.stripe.checkout.sessions.create({
      customer: customerId,
      mode: 'subscription',
      line_items: [{ price: this.priceIdFor(tier, interval), quantity: 1 }],
      subscription_data: { trial_period_days: 15 },
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
}
