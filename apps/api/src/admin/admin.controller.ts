import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AdminGuard } from './admin.guard';
import { AdminService } from './admin.service';

/* Read-only. Non-admins get 404 from AdminGuard. Search text is never logged. */
@Controller('admin')
@UseGuards(JwtAuthGuard, AdminGuard)
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
