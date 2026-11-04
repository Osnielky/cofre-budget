import { Controller, Post, Get, Patch, Body, UseGuards, Request } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { BillingService } from './billing.service';
import { BlockedInDemo } from '../common/demo/blocked-in-demo.decorator';

@UseGuards(JwtAuthGuard)
@Controller('billing')
export class BillingController {
  constructor(private billing: BillingService) {}

  @BlockedInDemo()
  @Post('checkout')
  createCheckout(@Request() req: any, @Body() body: { tier: 'pro' | 'elite'; interval: 'month' | 'year' }) {
    return this.billing.createCheckoutSession(req.user.id, body.tier, body.interval);
  }

  @Get('subscription')
  getSubscription(@Request() req: any) {
    return this.billing.getSubscription(req.user.id);
  }

  /** What a plan change costs today and when it applies — shown before the user confirms. */
  @Post('subscription/preview')
  previewSwitch(@Request() req: any, @Body() body: { tier: 'pro' | 'elite'; interval: 'month' | 'year' }) {
    return this.billing.previewPlanChange(req.user.id, body.tier, body.interval);
  }

  @BlockedInDemo()
  @Patch('subscription')
  switchTier(@Request() req: any, @Body() body: { tier: 'pro' | 'elite'; interval: 'month' | 'year' }) {
    return this.billing.switchTier(req.user.id, body.tier, body.interval);
  }

  /** Collects the overdue invoice now (after a failed charge) and restores the plan. */
  @BlockedInDemo()
  @Post('pay-overdue')
  payOverdue(@Request() req: any) {
    return this.billing.payOverdue(req.user.id);
  }

  @BlockedInDemo()
  @Post('subscription/pending-change/cancel')
  async cancelPendingChange(@Request() req: any) {
    await this.billing.cancelPendingChange(req.user.id);
    return { ok: true };
  }

  @BlockedInDemo()
  @Post('cancel')
  async cancel(@Request() req: any) {
    await this.billing.cancel(req.user.id);
    return { ok: true };
  }

  @Get('overview')
  getOverview(@Request() req: any) {
    return this.billing.getOverview(req.user.id);
  }

  @BlockedInDemo()
  @Post('resume')
  async resume(@Request() req: any) {
    await this.billing.resume(req.user.id);
    return { ok: true };
  }

  @BlockedInDemo()
  @Post('portal-link')
  createPortalLink(@Request() req: any, @Body() body: { flow?: 'payment_method' } | undefined) {
    return this.billing.createPortalLink(req.user.id, body?.flow === 'payment_method' ? 'payment_method' : undefined);
  }
}
