import { Controller, Post, Get, Body, HttpCode, UseGuards, Request, Res } from '@nestjs/common';
import { Response } from 'express';
import { AuthGuard } from '@nestjs/passport';
import { Throttle, SkipThrottle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { LocalAuthGuard } from './guards/local-auth.guard';
import { JwtAuthGuard } from './guards/jwt-auth.guard';

const isProd = process.env.NODE_ENV === 'production';

// In production the web and API are served from different Cloud Run domains,
// which the browser treats as cross-site. SameSite=None (+Secure) is required
// for the auth cookie to ride along on credentialed cross-origin requests.
// Locally we stay on Lax so the cookie works over plain http on localhost.
const COOKIE_OPTS = {
  httpOnly: true,
  sameSite: isProd ? ('none' as const) : ('lax' as const),
  secure: isProd,
  maxAge: 7 * 24 * 60 * 60 * 1000,
  path: '/',
};

// clearCookie must match the same attributes or the browser won't remove it.
const COOKIE_CLEAR_OPTS = {
  httpOnly: true,
  sameSite: isProd ? ('none' as const) : ('lax' as const),
  secure: isProd,
  path: '/',
};

@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  // 5 attempts per 15 minutes — brute-force protection
  @Throttle({ default: { ttl: 900_000, limit: 5 } })
  @UseGuards(LocalAuthGuard)
  @Post('login')
  login(@Request() req: any, @Res() res: Response) {
    const result = this.authService.login(req.user);
    res.cookie('access_token', result.access_token, COOKIE_OPTS);
    return res.json({ user: result.user });
  }

  // ── Registration & email verification ──────────────────────────
  @Throttle({ default: { ttl: 3_600_000, limit: 8 } })
  @Post('register')
  @HttpCode(200)
  register(@Body() body: { email: string; password: string; name?: string }) {
    return this.authService.register(body.email, body.password, body.name);
  }

  @Throttle({ default: { ttl: 900_000, limit: 10 } })
  @Post('verify-email')
  @HttpCode(200)
  async verifyEmail(@Body() body: { email: string; code: string }, @Res() res: Response) {
    const result = await this.authService.verifyEmail(body.email, body.code);
    res.cookie('access_token', result.access_token, COOKIE_OPTS);
    return res.json({ user: result.user });
  }

  @Throttle({ default: { ttl: 900_000, limit: 4 } })
  @Post('resend-code')
  @HttpCode(200)
  async resendCode(@Body() body: { email: string }) {
    await this.authService.resendCode(body.email);
    return { message: 'If the account exists and is unverified, a new code was sent.' };
  }

  // ── Password reset ─────────────────────────────────────────────
  @Throttle({ default: { ttl: 900_000, limit: 5 } })
  @Post('forgot-password')
  @HttpCode(200)
  async forgotPassword(@Body() body: { email: string }) {
    await this.authService.forgotPassword(body.email);
    return { message: 'If an account exists, a reset code has been sent.' };
  }

  @Throttle({ default: { ttl: 900_000, limit: 10 } })
  @Post('reset-password')
  @HttpCode(200)
  async resetPassword(@Body() body: { email: string; code: string; password: string }) {
    await this.authService.resetPassword(body.email, body.code, body.password);
    return { message: 'Password updated. You can now sign in.' };
  }

  // ── Change password (authenticated) ────────────────────────────
  @SkipThrottle()
  @UseGuards(JwtAuthGuard)
  @Post('change-password')
  @HttpCode(200)
  async changePassword(@Request() req: any, @Body() body: { currentPassword: string; newPassword: string }) {
    await this.authService.changePassword(req.user.id, body.currentPassword, body.newPassword);
    return { message: 'Password changed successfully.' };
  }

  @SkipThrottle()
  @UseGuards(JwtAuthGuard)
  @Post('logout')
  logout(@Res() res: Response) {
    res.clearCookie('access_token', COOKIE_CLEAR_OPTS);
    return res.json({ message: 'Logged out' });
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  me(@Request() req: any) {
    return req.user;
  }

  @UseGuards(AuthGuard('google'))
  @Get('google')
  googleLogin() { /* passport redirects */ }

  @UseGuards(AuthGuard('google'))
  @Get('google/callback')
  googleCallback(@Request() req: any, @Res() res: Response) {
    const result = this.authService.login(req.user);
    res.cookie('access_token', result.access_token, COOKIE_OPTS);
    const frontendUrl = process.env.FRONTEND_URL ?? 'http://localhost:3000';
    return res.redirect(`${frontendUrl}/dashboard`);
  }
}
