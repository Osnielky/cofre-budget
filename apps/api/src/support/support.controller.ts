import { Controller, Get, Post, Param, Body, Request, Res, UseGuards, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { BlockedInDemo } from '../common/demo/blocked-in-demo.decorator';
import { isAdminEmail } from '../admin/admin-emails';
import { SupportService } from './support.service';

/** Problem reports from signed-in users. Admin management lives in AdminController. */
@Controller('support')
@UseGuards(JwtAuthGuard)
export class SupportController {
  constructor(private support: SupportService, private config: ConfigService) {}

  /** Demo accounts are blocked: Rockefeller's password is public and sandboxes are anonymous. */
  @Post('tickets')
  @BlockedInDemo()
  @Throttle({ default: { ttl: 900_000, limit: 5 } })
  create(@Request() req: any, @Body() body: unknown) {
    return this.support.create(req.user.id, body, req.headers?.['user-agent']);
  }

  @Get('tickets')
  list(@Request() req: any) {
    return this.support.listForUser(req.user.id);
  }

  /** The image bytes, for the reporter or an admin. Anyone else gets 404, like a missing ticket. */
  @Get('tickets/:id/screenshot')
  async screenshot(@Param('id') id: string, @Request() req: any, @Res() res: Response) {
    const isAdmin = isAdminEmail(req.user?.email, this.config.get<string>('ADMIN_EMAILS'));
    const img = await this.support.screenshot(id, { id: req.user.id, isAdmin });
    if (!img) throw new NotFoundException();
    res.set('Content-Type', img.mimeType);
    res.set('Cache-Control', 'private, max-age=3600');
    res.send(img.data);
  }
}
