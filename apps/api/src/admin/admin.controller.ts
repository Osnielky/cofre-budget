import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { AdminJwtGuard } from './admin-jwt.guard';
import { AdminGuard } from './admin.guard';
import { AdminService } from './admin.service';

/* Read-only. Anonymous visitors (AdminJwtGuard) and non-admins (AdminGuard) both get 404. Search text is never logged. */
@Controller('admin')
@UseGuards(AdminJwtGuard, AdminGuard)
export class AdminController {
  constructor(private admin: AdminService) {}

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
}
