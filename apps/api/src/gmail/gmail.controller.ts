import { Controller, Get, Delete, Query, Request, Res, UseGuards } from '@nestjs/common';
import { Response } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { GmailService } from './gmail.service';

const FRONTEND = process.env.FRONTEND_URL ?? 'http://localhost:3000';

@Controller('gmail')
export class GmailController {
  constructor(private gmail: GmailService) {}

  @UseGuards(JwtAuthGuard)
  @Get('connect')
  connect(@Request() req: any, @Res() res: Response) {
    const url = this.gmail.buildAuthUrl(req.user.id);
    return res.redirect(url);
  }

  @Get('callback')
  async callback(@Query('code') code: string, @Query('state') state: string, @Res() res: Response) {
    try {
      await this.gmail.handleCallback(code, state);
      return res.redirect(`${FRONTEND}/settings?tab=integrations&status=connected`);
    } catch {
      return res.redirect(`${FRONTEND}/settings?tab=integrations&status=error`);
    }
  }

  @UseGuards(JwtAuthGuard)
  @Delete('disconnect')
  async disconnect(@Request() req: any) {
    await this.gmail.disconnect(req.user.id);
    return { ok: true };
  }

  @UseGuards(JwtAuthGuard)
  @Get('status')
  async status(@Request() req: any) {
    const conn = await this.gmail.getConnection(req.user.id);
    if (!conn) return { connected: false };
    return { connected: true, email: conn.email, connectedAt: conn.createdAt };
  }
}
