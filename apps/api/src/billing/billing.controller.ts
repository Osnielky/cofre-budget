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
