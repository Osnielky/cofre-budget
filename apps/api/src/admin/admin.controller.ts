import { Controller, Get, Post, Patch, Param, Body, Query, UseGuards, HttpCode } from '@nestjs/common';
import { AdminJwtGuard } from './admin-jwt.guard';
import { AdminGuard } from './admin.guard';
import { AdminService } from './admin.service';
import { DemoService } from '../demo/demo.service';
import { AnalyticsService } from '../analytics/analytics.service';
import { SupportService } from '../support/support.service';

/* Anonymous visitors (AdminJwtGuard) and non-admins (AdminGuard) both get 404. Search text is never logged. */
@Controller('admin')
@UseGuards(AdminJwtGuard, AdminGuard)
export class AdminController {
  constructor(private admin: AdminService, private demo: DemoService, private analytics: AnalyticsService, private support: SupportService) {}

  /** Problem reports, newest first, filtered by status; includes counts per status. */
  @Get('tickets')
  tickets(@Query('status') status?: unknown, @Query('page') page?: unknown) {
    return this.support.adminList({ status, page });
  }

  @Get('tickets/:id')
  ticket(@Param('id') id: string) {
    return this.support.adminGet(id);
  }

  /** `{ status?, reply?, adminNote? }`. Resolving with a reply emails the reporter once. */
  @Patch('tickets/:id')
  patchTicket(@Param('id') id: string, @Body() body: unknown) {
    return this.support.adminPatch(id, (body ?? {}) as Record<string, unknown>);
  }

  @Get('stats')
  stats() {
    return this.admin.stats(new Date());
  }

  @Get('users')
  users(@Query('search') search?: unknown, @Query('page') page?: unknown) {
    // Repeated params (?search=a&search=b) arrive as arrays; ignore them.
    return this.admin.users({
      search: typeof search === 'string' ? search : undefined,
      page: typeof page === 'string' ? page : undefined,
    });
  }

  /** Page-view traffic for the last 30 days (first-party, cookie-less). */
  @Get('traffic')
  traffic() {
    return this.analytics.traffic(new Date());
  }

  /** Wipes the Rockefeller demo account and re-seeds it from the generator. */
  @Post('demo/reset-owner')
  @HttpCode(200)
  async resetDemoOwner() {
    const owner = await this.demo.resetOwner(new Date());
    return { ok: true, email: owner.email };
  }
}
