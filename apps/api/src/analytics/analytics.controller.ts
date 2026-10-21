import { Controller, Post, Body, Request, HttpCode } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AnalyticsService } from './analytics.service';
import { clientIp } from '../common/client-ip-throttler.guard';

/** Public page-view beacon from the web app (PageViewBeacon.tsx). Never errors to the caller. */
@Controller('analytics')
export class AnalyticsController {
  constructor(private analytics: AnalyticsService) {}

  @Throttle({ default: { ttl: 60_000, limit: 60 } })
  @Post('view')
  @HttpCode(204)
  async view(@Request() req: any, @Body() body: unknown): Promise<void> {
    await this.analytics.record(body, { ip: clientIp(req), userAgent: req.headers?.['user-agent'] }).catch(() => false);
  }
}
