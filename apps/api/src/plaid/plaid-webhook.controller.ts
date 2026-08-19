import { Controller, Post, Req, HttpCode, UnauthorizedException, Logger } from '@nestjs/common';
import { PlaidService } from './plaid.service';
import { PlaidWebhookVerifierService } from './plaid-webhook-verifier.service';

/* Plaid calls this server-to-server with no user session, so it deliberately carries
   none of PlaidController's JwtAuthGuard/PlanGuard — request authenticity instead
   comes from the Plaid-Verification JWT checked below. */
@Controller('plaid')
export class PlaidWebhookController {
  private readonly logger = new Logger(PlaidWebhookController.name);

  constructor(
    private service: PlaidService,
    private verifier: PlaidWebhookVerifierService,
  ) {}

  @Post('webhook')
  @HttpCode(200)
  async handleWebhook(@Req() req: any) {
    const signature = req.headers['plaid-verification'];
    const rawBody: Buffer | undefined = req.rawBody;
    if (typeof signature !== 'string' || !rawBody) {
      this.logger.warn('Rejected webhook: missing Plaid-Verification header or raw body');
      throw new UnauthorizedException('Missing webhook verification');
    }

    const verified = await this.verifier.verify(signature, rawBody);
    if (!verified) {
      this.logger.warn('Rejected webhook: invalid signature');
      throw new UnauthorizedException('Invalid webhook signature');
    }

    const body = req.body ?? {};
    const webhookType = body.webhook_type;
    const webhookCode = body.webhook_code;
    const itemId = body.item_id;
    this.logger.log(`Received ${webhookType}/${webhookCode} for item ${itemId}`);

    if (webhookType === 'TRANSACTIONS' && webhookCode === 'SYNC_UPDATES_AVAILABLE') {
      await this.service.syncByExternalItemId(itemId);
    } else if (webhookType === 'ITEM' && webhookCode === 'ERROR') {
      await this.service.markItemStatus(itemId, 'error', body.error?.error_code ?? null);
    } else if (webhookType === 'ITEM' && (webhookCode === 'PENDING_EXPIRATION' || webhookCode === 'PENDING_DISCONNECT')) {
      await this.service.markItemStatus(itemId, 'error', webhookCode);
    } else {
      this.logger.log(`No handler for ${webhookType}/${webhookCode} — acknowledging without action`);
    }

    return { acknowledged: true };
  }
}
