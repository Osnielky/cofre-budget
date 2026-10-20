import { Controller, Get, Post, Query, UseGuards, HttpCode } from '@nestjs/common';
import { AdminJwtGuard } from './admin-jwt.guard';
import { AdminGuard } from './admin.guard';
import { AdminService } from './admin.service';
import { DemoService } from '../demo/demo.service';

/* Read-only. Anonymous visitors (AdminJwtGuard) and non-admins (AdminGuard) both get 404. Search text is never logged. */
@Controller('admin')
@UseGuards(AdminJwtGuard, AdminGuard)
export class AdminController {
  constructor(private admin: AdminService, private demo: DemoService) {}

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

  /** Wipes the Rockefeller demo account and re-seeds it from the generator. */
  @Post('demo/reset-owner')
  @HttpCode(200)
  async resetDemoOwner() {
    const owner = await this.demo.resetOwner(new Date());
    return { ok: true, email: owner.email };
  }
}
