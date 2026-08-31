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
    } catch (err) {
      this.logger.warn('Webhook signature verification failed: ' + (err instanceof Error ? err.message : String(err)));
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
