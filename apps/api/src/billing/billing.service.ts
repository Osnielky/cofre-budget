import { BadRequestException, ConflictException, Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import Stripe from 'stripe';
import { User } from '../users/user.entity';
import { UsersService } from '../users/users.service';
import { Subscription } from './subscription.entity';
import { mapStripeSubscription, PriceIdMap, type MappedSubscription } from './billing.mapping';
import { addInterval, extendedPeriodEnd, isPaidExtension, PAID_EXTENSION_METADATA_KEY } from './late-payment';
import { timed } from '../common/logging/timed';
import { log } from '../common/logging/log';
import { describePaymentFailure } from './payment-failure';
import { MailService } from '../mail/mail.service';
import { billingEmailContent, billingEmailFor, type SubState } from './billing-emails';
import { mapBillingOverview, EMPTY_OVERVIEW, type BillingOverview } from './billing-overview';
import { classifyPlanChange, summarizeUpgradePreview, pendingChangeFromSchedule, type PlanChangePreview } from './plan-change';

/** Grace after Stripe first reports a failed payment before the plan drops to free. */
export const PAST_DUE_GRACE_HOURS = 24;
const PAST_DUE_GRACE_MS = PAST_DUE_GRACE_HOURS * 3_600_000;
const PAST_DUE_SWEEP_EVERY_MS = 3_600_000;
/** Cofre's trial-ending reminder goes out when a real trial ends within this many days. */
const TRIAL_REMINDER_DAYS = 3;

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
    private mail: MailService,
    // Optional so the unit tests can build the service without it. Every plan change
    // evicts the user from the JWT lookup cache, so a downgrade takes effect on the
    // next request instead of up to USER_CACHE_TTL_MS later.
    @Optional() private readonly usersCache?: UsersService,
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
    const customer = await timed('stripe', 'customers.create', () => this.stripe.customers.create({ email: user.email, metadata: { userId } }));
    await this.users.update(userId, { stripeCustomerId: customer.id });
    return customer.id;
  }

  async createCheckoutSession(userId: string, tier: 'pro' | 'elite', interval: 'month' | 'year'): Promise<{ url: string }> {
    const existing = await this.subs.findOneBy({ userId });
    if (existing && ['trialing', 'active', 'past_due'].includes(existing.status)) {
      throw new ConflictException(existing.status === 'past_due'
        ? 'Your subscription is waiting on a payment — add a payment method in Settings → Billing instead of starting a new one.'
        : 'You already have an active subscription — manage it from Settings instead of starting a new one.');
    }
    const customerId = await this.getOrCreateCustomer(userId);
    const session = await timed('stripe', 'checkout.sessions.create', () => this.stripe.checkout.sessions.create({
      customer: customerId,
      mode: 'subscription',
      line_items: [{ price: this.priceIdFor(tier, interval), quantity: 1 }],
      subscription_data: { trial_period_days: 15 },
      success_url: `${this.frontendUrl}/settings?checkout=success`,
      cancel_url: `${this.frontendUrl}/pricing`,
    }));
    if (!session.url) throw new Error('Stripe did not return a Checkout URL');
    return { url: session.url };
  }

  async syncFromStripeSubscription(stripeCustomerId: string, sub: Stripe.Subscription): Promise<MappedSubscription | null> {
    const user = await this.users.findOneBy({ stripeCustomerId });
    if (!user) {
      this.logger.warn(`No local user for Stripe customer ${stripeCustomerId} — ignoring webhook`);
      return null;
    }
    let mapped = mapStripeSubscription(sub, this.priceIds);
    const previous = await this.subs.findOneBy({ userId: user.id });

    // Recovered from past due (paid from Cofre, the portal, the hosted invoice or a
    // Stripe retry alike): the paid period now starts on the day it was paid.
    if (previous?.status === 'past_due' && previous.pastDueSince && mapped.status === 'active' && sub.status === 'active') {
      const extended = await this.extendPaidPeriod(sub.id, previous.pastDueSince, mapped.interval);
      if (extended) { sub = extended; mapped = mapStripeSubscription(sub, this.priceIds); }
    }

    /* The past-due clock starts on the first webhook that reports it and runs until
       the status changes; a recovered payment (active again) restores the plan below
       because `plan` follows the tier for every status but canceled. A repeat past-due
       webhook after the grace window must not hand the tier back for an hour until the
       next sweep, so the sync applies the same 24 h rule as sweepPastDue. */
    const pastDueSince = mapped.status === 'past_due' ? (previous?.pastDueSince ?? new Date()) : null;
    const graceExpired = pastDueSince != null && Date.now() - pastDueSince.getTime() > PAST_DUE_GRACE_MS;
    const plan = mapped.status === 'canceled' || graceExpired ? 'free' : mapped.tier;

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
        pastDueSince,
      },
      ['userId'],
    );
    await this.users.update(user.id, { plan });
    this.usersCache?.invalidate(user.id);
    await this.sendBillingEmail(user, previous, mapped, sub);
    return mapped;
  }

  /**
   * Moves the renewal date out by the time the subscription spent past due, so a
   * late payment buys a full period from the day it was paid (late-payment.ts).
   * The webhook that got us here is not trusted on its own (events can arrive out
   * of order): the subscription is re-read from Stripe and must be active with a
   * paid, non-zero latest invoice settled after the past-due clock started — the
   * extension is measured from that payment. A failure is logged and the recovery
   * stands on Stripe's own dates.
   */
  private async extendPaidPeriod(subscriptionId: string, pastDueSince: Date, interval: 'month' | 'year'): Promise<Stripe.Subscription | null> {
    try {
      const fresh = await timed('stripe', 'subscriptions.retrieve', () => this.stripe.subscriptions.retrieve(subscriptionId, { expand: ['latest_invoice'] }));
      const invoice = fresh.latest_invoice;
      const paidAtUnix = typeof invoice === 'object' && invoice?.status === 'paid' && invoice.amount_paid > 0 ? invoice.status_transitions?.paid_at : null;
      const periodEndUnix = fresh.items.data[0]?.current_period_end;
      if (fresh.status !== 'active' || !paidAtUnix || !periodEndUnix) {
        log('INFO', 'Late payment: no settled payment to extend from', { billing: { operation: 'extendPaidPeriod', status: fresh.status, latestInvoice: typeof invoice === 'object' ? invoice?.status : null } });
        return null;
      }
      // "Latest invoice paid" is not "the overdue invoice paid": a later, smaller
      // invoice (an upgrade proration) can flip Stripe to active while the old one
      // stays open. Nothing may be outstanding on the subscription.
      for (const status of ['open', 'uncollectible'] as const) {
        const outstanding = await timed('stripe', 'invoices.list', () => this.stripe.invoices.list({ subscription: subscriptionId, status, limit: 1 }));
        if (outstanding.data.length > 0) {
          log('INFO', 'Late payment: an invoice is still outstanding, not extending', { billing: { operation: 'extendPaidPeriod', outstanding: status } });
          return null;
        }
      }
      const paidAt = new Date(paidAtUnix * 1000);
      const newEnd = extendedPeriodEnd({ currentPeriodEnd: new Date(periodEndUnix * 1000), pastDueSince, paidAt, interval });
      if (!newEnd) return null;
      const updated = await timed('stripe', 'subscriptions.update', () => this.stripe.subscriptions.update(subscriptionId, {
        trial_end: Math.floor(newEnd.getTime() / 1000),
        proration_behavior: 'none',
        metadata: { [PAID_EXTENSION_METADATA_KEY]: pastDueSince.toISOString() },
      }));
      log('INFO', 'Late payment: paid period moved to the payment date', {
        billing: { operation: 'extendPaidPeriod', lateDays: Math.round((paidAt.getTime() - pastDueSince.getTime()) / 86_400_000) },
      });
      return updated;
    } catch (err) {
      this.logger.error('Late payment: could not move the paid period — keeping Stripe\'s dates', err as Error);
      return null;
    }
  }

  /**
   * Emails the user when this sync started, changed, scheduled the cancellation
   * of, or ended their plan. Decided from the saved row vs. Stripe's, so a
   * repeated webhook sends nothing. A failed send is logged, never thrown: the
   * subscription is already saved and Stripe must not retry the webhook for it.
   */
  private async sendBillingEmail(user: User, previous: Subscription | null, mapped: SubState & { trialEnd: Date | null; currentPeriodEnd: Date | null }, sub: Stripe.Subscription): Promise<void> {
    const kind = billingEmailFor(previous, mapped);
    if (!kind) return;
    const price = sub.items.data[0]?.price;
    try {
      await this.mail.sendBillingEmail(user.email, billingEmailContent(kind, {
        name: user.name ?? '',
        tier: mapped.tier,
        interval: mapped.interval,
        status: mapped.status,
        amount: typeof price?.unit_amount === 'number' ? price.unit_amount / 100 : null,
        currency: price?.currency ?? 'usd',
        trialEnd: mapped.trialEnd,
        currentPeriodEnd: mapped.currentPeriodEnd,
        prevTier: previous?.tier,
        prevInterval: previous?.interval,
        appUrl: this.frontendUrl,
      }));
    } catch (err) {
      this.logger.error(`Billing email "${kind}" failed`, err as Error);
    }
  }

  getSubscription(userId: string): Promise<Subscription | null> {
    return this.subs.findOneBy({ userId });
  }

  /* 24 hours past due → free, whatever Stripe's own dunning setting does afterwards.
     Runs at boot and hourly. Only the user's plan changes: the subscription row keeps
     its past-due status and Stripe keeps retrying, so a later successful charge comes
     back through the webhook and syncFromStripeSubscription restores the tier. */
  onApplicationBootstrap(): void {
    if (process.env.NODE_ENV === 'test') return;
    const sweep = () => { void this.sweepPastDue(); void this.sweepTrialReminders(); };
    setTimeout(sweep, 20_000).unref();
    setInterval(sweep, PAST_DUE_SWEEP_EVERY_MS).unref();
  }

  /**
   * Cofre's own "your trial ends on <date>" email, sent once per subscription when
   * a real trial ends within TRIAL_REMINDER_DAYS. Stripe's reminder is off because
   * a late-payment extension (late-payment.ts) is a Stripe trial internally — those
   * rows are `active` here, so they never match. A trial set to cancel gets nothing
   * (nothing will be charged). Returns how many went out.
   */
  async sweepTrialReminders(now: Date = new Date()): Promise<number> {
    const until = new Date(now.getTime() + TRIAL_REMINDER_DAYS * 86_400_000);
    let rows: Subscription[];
    try {
      rows = await this.subs.createQueryBuilder('sub')
        .where('sub.status = :status', { status: 'trialing' })
        .andWhere('sub.trialReminderSentAt IS NULL')
        .andWhere('sub.cancelAtPeriodEnd = :no', { no: false })
        .andWhere('sub.trialEnd > :now', { now })
        .andWhere('sub.trialEnd <= :until', { until })
        .getMany();
    } catch (err) {
      this.logger.error('Trial-reminder sweep could not read subscriptions', err as Error);
      return 0;
    }
    let sent = 0;
    for (const sub of rows) {
      const user = await this.users.findOneBy({ id: sub.userId });
      if (!user) continue;
      // What the first charge will be and whether anything is there to charge.
      let amount: number | null = null;
      let paymentMethodOnFile = true;
      try {
        const live = await timed('stripe', 'subscriptions.retrieve', () => this.stripe.subscriptions.retrieve(sub.stripeSubscriptionId, {
          expand: ['default_payment_method', 'customer.invoice_settings.default_payment_method'],
        }));
        const unit = live.items.data[0]?.price?.unit_amount;
        amount = typeof unit === 'number' ? unit / 100 : null;
        const customer = live.customer;
        paymentMethodOnFile = !!live.default_payment_method || (typeof customer === 'object' && !('deleted' in customer) && !!customer.invoice_settings?.default_payment_method);
      } catch (err) {
        this.logger.warn(`Trial reminder: could not read Stripe for user ${user.id} — sending without the amount: ${(err as Error).message}`);
      }
      try {
        await this.mail.sendBillingEmail(user.email, billingEmailContent('trial_ending', {
          name: user.name ?? '',
          tier: sub.tier,
          interval: sub.interval,
          status: 'trialing',
          amount,
          currency: 'usd',
          trialEnd: sub.trialEnd,
          currentPeriodEnd: sub.currentPeriodEnd,
          paymentMethodOnFile,
          appUrl: this.frontendUrl,
        }));
        await this.subs.update(sub.id, { trialReminderSentAt: now });
        sent++;
        this.logger.log(`Trial reminder sent: user ${user.id} (${sub.tier}), trial ends ${sub.trialEnd?.toISOString()}`);
      } catch (err) {
        this.logger.error('Trial reminder email failed', err as Error);
      }
    }
    return sent;
  }

  /** Downgrades every user past due for longer than the grace window; returns how many. */
  async sweepPastDue(): Promise<number> {
    const cutoff = new Date(Date.now() - PAST_DUE_GRACE_MS);
    let rows: Subscription[];
    try {
      rows = await this.subs.createQueryBuilder('sub')
        .where('sub.status = :status', { status: 'past_due' })
        .andWhere('sub.pastDueSince IS NOT NULL')
        .andWhere('sub.pastDueSince < :cutoff', { cutoff })
        .getMany();
    } catch (err) {
      this.logger.error('Past-due sweep could not read subscriptions', err as Error);
      return 0;
    }

    let downgraded = 0;
    for (const sub of rows) {
      const user = await this.users.findOneBy({ id: sub.userId });
      if (!user || user.plan === 'free') continue;
      await this.users.update(user.id, { plan: 'free' });
      this.usersCache?.invalidate(user.id);
      downgraded++;
      this.logger.log(`Past-due downgrade: user ${user.id} (${sub.tier}) → free after ${PAST_DUE_GRACE_HOURS} h`);
      try {
        await this.mail.sendBillingEmail(user.email, billingEmailContent('ended', {
          name: user.name ?? '',
          tier: sub.tier,
          interval: sub.interval,
          status: 'canceled',
          amount: null,
          currency: 'usd',
          trialEnd: sub.trialEnd,
          currentPeriodEnd: sub.currentPeriodEnd,
          appUrl: this.frontendUrl,
        }));
      } catch (err) {
        this.logger.error('Past-due downgrade email failed', err as Error);
      }
    }
    return downgraded;
  }

  /** Stripe's subscription with its schedule (a pending downgrade) and item, or 409 without one. */
  private async liveSubscription(userId: string): Promise<{ row: Subscription; stripeSub: Stripe.Subscription }> {
    const row = await this.subs.findOneBy({ userId });
    if (!row || row.status === 'canceled') throw new ConflictException('You have no active subscription to change.');
    const stripeSub = await timed('stripe', 'subscriptions.retrieve', () => this.stripe.subscriptions.retrieve(row.stripeSubscriptionId, { expand: ['schedule'] }));
    return { row, stripeSub };
  }

  /** A plan change while past due would let a small proration invoice stand in for the overdue one. */
  private refuseWhilePastDue(row: Subscription): void {
    if (row.status === 'past_due') throw new ConflictException('Your plan is waiting on a payment — pay the overdue invoice in Settings → Billing before changing it.');
  }

  private priceAmount(priceId: string): Promise<number | null> {
    return timed('stripe', 'prices.retrieve', () => this.stripe.prices.retrieve(priceId)).then((p) => (typeof p.unit_amount === 'number' ? p.unit_amount / 100 : null));
  }

  /**
   * What a plan change would cost before the user confirms it. An upgrade is
   * previewed as the prorated invoice Stripe would charge today; a downgrade
   * costs nothing today and starts when the paid period ends (see plan-change.ts).
   */
  async previewPlanChange(userId: string, tier: 'pro' | 'elite', interval: 'month' | 'year'): Promise<PlanChangePreview> {
    const { row, stripeSub } = await this.liveSubscription(userId);
    this.refuseWhilePastDue(row);
    const kind = classifyPlanChange(row, { tier, interval });
    if (kind === 'same') throw new BadRequestException('You are already on that plan.');
    const item = stripeSub.items.data[0];
    const newPriceId = this.priceIdFor(tier, interval);
    const [fromAmount, toAmount] = await Promise.all([
      typeof item.price.unit_amount === 'number' ? item.price.unit_amount / 100 : null,
      this.priceAmount(newPriceId),
    ]);
    const trialing = row.status === 'trialing';
    const currency = item.price.currency ?? 'usd';
    const base = { from: { tier: row.tier, interval: row.interval, amount: fromAmount ?? 0 }, to: { tier, interval, amount: toAmount ?? 0 }, currency, trialing };
    const paidThrough = (trialing && row.trialEnd ? row.trialEnd : row.currentPeriodEnd)?.toISOString() ?? null;

    if (kind === 'downgrade') {
      return { kind, ...base, chargeNow: 0, credit: 0, effectiveAt: paidThrough ?? new Date().toISOString(), nextChargeAt: paidThrough, forfeitsPaidThrough: null };
    }
    // Inside a late-payment extension Stripe holds the subscription as trialing and
    // would charge nothing for an upgrade until it ends. The upgrade ends the
    // extension instead: the full new price today, the remaining days not credited.
    if (isPaidExtension(stripeSub)) {
      return { kind, ...base, chargeNow: toAmount ?? 0, credit: 0, effectiveAt: new Date().toISOString(), nextChargeAt: addInterval(new Date(), interval).toISOString(), forfeitsPaidThrough: paidThrough };
    }
    const invoice = await timed('stripe', 'invoices.createPreview', () => this.stripe.invoices.createPreview({
      customer: stripeSub.customer as string,
      subscription: stripeSub.id,
      subscription_details: { items: [{ id: item.id, price: newPriceId }], proration_behavior: 'always_invoice' },
    }));
    const p = summarizeUpgradePreview(invoice, newPriceId);
    return {
      kind, ...base,
      chargeNow: trialing ? 0 : p.chargeNow,
      credit: trialing ? 0 : p.credit,
      effectiveAt: new Date().toISOString(),
      nextChargeAt: trialing ? paidThrough : p.periodEnd,
      forfeitsPaidThrough: null,
    };
  }

  /**
   * Applies a plan change. Upgrade: Stripe switches the price now and charges the
   * prorated difference today (`always_invoice`; the switch is refused if that
   * payment fails), then the row and the "plan changed" email follow at once from
   * Stripe's response — not from the webhook, which only confirms it later.
   * Downgrade: a subscription schedule keeps the current price until the period
   * already paid for ends and then switches; nothing is charged or refunded today,
   * and the user gets a "scheduled" email now and the "changed" one when it lands.
   */
  async switchTier(userId: string, tier: 'pro' | 'elite', interval: 'month' | 'year'): Promise<{ kind: 'upgrade' | 'downgrade'; effectiveAt: string }> {
    const user = await this.users.findOneByOrFail({ id: userId });
    const { row, stripeSub } = await this.liveSubscription(userId);
    this.refuseWhilePastDue(row);
    const kind = classifyPlanChange(row, { tier, interval });
    if (kind === 'same') throw new BadRequestException('You are already on that plan.');
    if (stripeSub.cancel_at_period_end) throw new ConflictException('Your plan is set to end — keep it first, then change it.');
    const item = stripeSub.items.data[0];
    const newPriceId = this.priceIdFor(tier, interval);

    // Replacing an earlier scheduled change: a scheduled subscription cannot be updated directly.
    const schedule = stripeSub.schedule;
    if (schedule) await this.releaseSchedule(typeof schedule === 'string' ? schedule : schedule.id);

    if (kind === 'upgrade') {
      let updated: Stripe.Subscription;
      try {
        updated = await timed('stripe', 'subscriptions.update', () => this.stripe.subscriptions.update(stripeSub.id, {
          items: [{ id: item.id, price: newPriceId }],
          proration_behavior: 'always_invoice',
          payment_behavior: 'error_if_incomplete',
          // A late-payment extension is a Stripe trial: end it, or the new price is
          // free until it runs out. Charges the full new price today (see preview).
          ...(isPaidExtension(stripeSub) ? { trial_end: 'now' as const, metadata: { [PAID_EXTENSION_METADATA_KEY]: '' } } : {}),
        }));
      } catch (err) {
        const e = err as Stripe.errors.StripeError;
        if (e?.type === 'StripeCardError' || e?.code === 'card_declined' || e?.code === 'resource_missing') {
          const failure = describePaymentFailure(e);
          log('WARNING', 'Plan upgrade payment declined', { billing: { operation: 'switchTier', code: failure.code, declineCode: failure.declineCode } });
          throw new ConflictException(`Today's payment didn't go through, so your plan was not changed. ${failure.message}`);
        }
        throw err;
      }
      await this.syncFromStripeSubscription(updated.customer as string, updated);
      return { kind, effectiveAt: new Date().toISOString() };
    }

    const current = item.current_period_end;
    const created = await timed('stripe', 'subscriptionSchedules.create', () => this.stripe.subscriptionSchedules.create({ from_subscription: stripeSub.id }));
    const phase0 = created.phases[0];
    await timed('stripe', 'subscriptionSchedules.update', () => this.stripe.subscriptionSchedules.update(created.id, {
      end_behavior: 'release',
      phases: [
        // phase0.trial_end carries a late-payment extension (or a real trial) through: without it the phase would bill at once.
        { items: [{ price: item.price.id, quantity: 1 }], start_date: phase0.start_date, end_date: phase0.end_date, proration_behavior: 'none', ...(phase0.trial_end ? { trial_end: phase0.trial_end } : {}) },
        { items: [{ price: newPriceId, quantity: 1 }], duration: { interval, interval_count: 1 }, proration_behavior: 'none' },
      ],
    }));
    const effectiveAt = new Date((phase0.end_date ?? current) * 1000);
    const toAmount = await this.priceAmount(newPriceId);
    try {
      await this.mail.sendBillingEmail(user.email, billingEmailContent('downgrade_scheduled', {
        name: user.name ?? '',
        tier, interval, status: row.status,
        amount: toAmount, currency: item.price.currency ?? 'usd',
        trialEnd: row.trialEnd, currentPeriodEnd: effectiveAt,
        prevTier: row.tier, prevInterval: row.interval,
        appUrl: this.frontendUrl,
      }));
    } catch (err) {
      this.logger.error('Billing email "downgrade_scheduled" failed', err as Error);
    }
    return { kind, effectiveAt: effectiveAt.toISOString() };
  }

  /**
   * Collects the unpaid invoice of a past-due subscription right now with the
   * customer's default payment method — the way back to the plan after a failed
   * charge, without waiting for Stripe's own retry schedule. On success the
   * subscription is active again and the sync restores the plan and emails
   * "your plan is back" at once; a declined payment leaves everything as it was.
   */
  async payOverdue(userId: string): Promise<{ paid: boolean; amount: number | null; currency: string; paidThrough: string | null; message: string }> {
    const { row, stripeSub } = await this.liveSubscription(userId);
    if (row.status !== 'past_due') return { paid: false, amount: null, currency: 'usd', paidThrough: null, message: 'Nothing is overdue on your plan.' };
    const customer = stripeSub.customer as string;
    const open = await timed('stripe', 'invoices.list', () => this.stripe.invoices.list({ customer, subscription: stripeSub.id, status: 'open', limit: 5 }));
    const invoice = [...open.data].sort((a, b) => a.created - b.created)[0];
    if (!invoice?.id) return { paid: false, amount: null, currency: 'usd', paidThrough: null, message: 'There is no unpaid invoice to collect — Stripe may still be processing the last payment.' };
    let paid: Stripe.Invoice;
    try {
      paid = await timed('stripe', 'invoices.pay', () => this.stripe.invoices.pay(invoice.id as string));
    } catch (err) {
      const e = err as Stripe.errors.StripeError;
      if (e?.type === 'StripeCardError' || e?.type === 'StripeInvalidRequestError') {
        // Stripe's own sentence is often just "The payment failed." (a bank or
        // Link decline with no detail); the decline code is the only clue and it
        // is logged here — never amounts, emails or the method itself.
        const failure = describePaymentFailure(e);
        log('WARNING', 'Overdue invoice payment declined', { billing: { operation: 'payOverdue', code: failure.code, declineCode: failure.declineCode } });
        throw new ConflictException(failure.message);
      }
      throw err;
    }
    const fresh = await timed('stripe', 'subscriptions.retrieve', () => this.stripe.subscriptions.retrieve(stripeSub.id));
    // The sync moves the renewal date to a full period from today (late-payment.ts).
    const synced = await this.syncFromStripeSubscription(customer, fresh);
    const ok = paid.status === 'paid';
    return {
      paid: ok,
      amount: paid.amount_paid / 100,
      currency: paid.currency,
      paidThrough: synced?.currentPeriodEnd?.toISOString() ?? null,
      message: ok ? 'Payment received — your plan is active again.' : 'The payment is still processing; your plan comes back as soon as it settles.',
    };
  }

  /** Drops a scheduled downgrade: the current plan simply continues. */
  async cancelPendingChange(userId: string): Promise<void> {
    const { stripeSub } = await this.liveSubscription(userId);
    const schedule = stripeSub.schedule;
    if (!schedule) return;
    await this.releaseSchedule(typeof schedule === 'string' ? schedule : schedule.id);
  }

  private async releaseSchedule(id: string): Promise<void> {
    await timed('stripe', 'subscriptionSchedules.release', () => this.stripe.subscriptionSchedules.release(id));
  }

  async cancel(userId: string): Promise<void> {
    const { stripeSub } = await this.liveSubscription(userId);
    // A pending downgrade and a cancellation cannot coexist; the cancellation wins.
    if (stripeSub.schedule) await this.releaseSchedule(typeof stripeSub.schedule === 'string' ? stripeSub.schedule : stripeSub.schedule.id);
    await timed('stripe', 'subscriptions.update', () => this.stripe.subscriptions.update(stripeSub.id, { cancel_at_period_end: true }));
  }

  /** Undo a scheduled cancellation; the subscription.updated webhook persists it. */
  async resume(userId: string): Promise<void> {
    const existing = await this.subs.findOneByOrFail({ userId });
    await timed('stripe', 'subscriptions.update', () => this.stripe.subscriptions.update(existing.stripeSubscriptionId, { cancel_at_period_end: false }));
  }

  /**
   * Card, address, next charge and recent invoices for the billing page, read
   * live from Stripe. Each lookup fails on its own: the page shows what loaded.
   */
  async getOverview(userId: string): Promise<BillingOverview> {
    const user = await this.users.findOneBy({ id: userId });
    const customerId = user?.stripeCustomerId;
    if (!customerId) return EMPTY_OVERVIEW;
    const sub = await this.subs.findOneBy({ userId });
    const live = sub && sub.status !== 'canceled' ? sub : null;

    const attempt = async <T>(op: string, fn: () => Promise<T>): Promise<T | null> => {
      try {
        return await timed('stripe', op, fn);
      } catch (err) {
        this.logger.warn(`Billing overview: ${op} failed — ${(err as Error).message}`);
        return null;
      }
    };

    const [customer, subscription, invoices, preview] = await Promise.all([
      attempt('customers.retrieve', () => this.stripe.customers.retrieve(customerId, { expand: ['invoice_settings.default_payment_method'] })),
      live ? attempt('subscriptions.retrieve', () => this.stripe.subscriptions.retrieve(live.stripeSubscriptionId, { expand: ['default_payment_method', 'schedule'] })) : null,
      attempt('invoices.list', () => this.stripe.invoices.list({ customer: customerId, limit: 5 })),
      // No next charge once the plan is set to end.
      live && !live.cancelAtPeriodEnd
        ? attempt('invoices.createPreview', () => this.stripe.invoices.createPreview({ customer: customerId, subscription: live.stripeSubscriptionId }))
        : null,
    ]);

    const stripeSub = (subscription as Stripe.Subscription | null) ?? null;
    const schedule = stripeSub?.schedule && typeof stripeSub.schedule !== 'string' ? stripeSub.schedule : null;
    return mapBillingOverview({
      customer: customer && !(customer as Stripe.DeletedCustomer).deleted ? (customer as Stripe.Customer) : null,
      subscription: stripeSub,
      pendingChange: pendingChangeFromSchedule(schedule, this.priceIds),
      preview: (preview as Stripe.Invoice | null) ?? null,
      invoices: (invoices?.data ?? []) as Stripe.Invoice[],
      fallbackDate: live ? (live.status === 'trialing' && live.trialEnd ? live.trialEnd : live.currentPeriodEnd) : null,
    });
  }

  /**
   * Stripe's customer portal. `flow: 'payment_method'` opens straight on the
   * add / replace payment-method page (and, for a past-due subscription, Stripe
   * retries the open invoice once one is saved); without it the portal opens on
   * its overview — plan, invoices, payment method — for "Manage subscription".
   */
  async createPortalLink(userId: string, flow?: 'payment_method'): Promise<{ url: string }> {
    const user = await this.users.findOneByOrFail({ id: userId });
    if (!user.stripeCustomerId) throw new Error('User has no Stripe customer yet');
    const session = await timed('stripe', 'billingPortal.sessions.create', () => this.stripe.billingPortal.sessions.create({
      customer: user.stripeCustomerId,
      return_url: `${this.frontendUrl}/settings?tab=billing&portal=return`,
      ...(flow === 'payment_method' ? { flow_data: { type: 'payment_method_update' as const } } : {}),
    }));
    return { url: session.url };
  }

  async retrieveSubscription(id: string): Promise<Stripe.Subscription> {
    return timed('stripe', 'subscriptions.retrieve', () => this.stripe.subscriptions.retrieve(id));
  }

  async getCustomerContact(stripeCustomerId: string): Promise<{ email: string; name: string } | null> {
    const user = await this.users.findOneBy({ stripeCustomerId });
    return user ? { email: user.email, name: user.name } : null;
  }

  async createPortalLinkForCustomer(stripeCustomerId: string): Promise<{ url: string }> {
    const session = await timed('stripe', 'billingPortal.sessions.create', () => this.stripe.billingPortal.sessions.create({
      customer: stripeCustomerId,
      return_url: `${this.frontendUrl}/settings?tab=billing&portal=return`,
      flow_data: { type: 'payment_method_update' },
    }));
    return { url: session.url };
  }
}
