import { Controller, Get, Delete, Query, Request, Res, UseGuards } from '@nestjs/common';
import { Response } from 'express';
import * as crypto from 'crypto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { GmailService } from './gmail.service';

@Controller('gmail')
export class GmailController {
  constructor(private gmail: GmailService) {}

  @UseGuards(JwtAuthGuard)
  @Get('connect')
  connect(@Request() req: any, @Res() res: Response) {
    const nonce = crypto.randomBytes(16).toString('hex');
    const url = this.gmail.buildAuthUrl(req.user.id, nonce);
    const isProd = process.env.NODE_ENV === 'production';
    res.cookie('gmail_oauth_nonce', nonce, {
      httpOnly: true,
      sameSite: isProd ? 'none' : 'lax',
      secure: isProd,
      maxAge: 5 * 60 * 1000,
      path: '/',
    });
    return res.redirect(url);
  }

  @Get('callback')
  async callback(
    @Query('code') code: string,
    @Query('state') state: string,
    @Request() req: any,
    @Res() res: Response,
  ) {
    const FRONTEND = process.env.FRONTEND_URL ?? 'http://localhost:3000';
    try {
      const cookieNonce = req.cookies?.['gmail_oauth_nonce'];
      await this.gmail.handleCallback(code, state, cookieNonce);
      res.clearCookie('gmail_oauth_nonce', { path: '/' });
      return res.redirect(`${FRONTEND}/settings?tab=integrations&status=connected`);
    } catch {
      res.clearCookie('gmail_oauth_nonce', { path: '/' });
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
