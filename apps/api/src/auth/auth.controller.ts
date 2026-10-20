import { Controller, Post, Get, Patch, Body, Query, UseGuards, Request, Res, HttpCode } from '@nestjs/common';
import { Response } from 'express';
import { AuthGuard } from '@nestjs/passport';
import { Throttle, SkipThrottle } from '@nestjs/throttler';
import { ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';
import { UsersService } from '../users/users.service';
import { LocalAuthGuard } from './guards/local-auth.guard';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { GoogleCallbackGuard } from './guards/google-callback.guard';
import { isAdminEmail } from '../admin/admin-emails';
import { cookieOptions } from '../common/http/cookies';
import { BlockedInDemo } from '../common/demo/blocked-in-demo.decorator';
import { DemoService } from '../demo/demo.service';

const COOKIE_OPTS = cookieOptions(undefined, 7 * 24 * 60 * 60 * 1000);
// clearCookie must match the same attributes or the browser won't remove it.
const COOKIE_CLEAR_OPTS = cookieOptions();

@Controller('auth')
export class AuthController {
  constructor(
    private authService: AuthService,
    private usersService: UsersService,
    private config: ConfigService,
    private demo: DemoService,
  ) {}

  // 5 attempts per 15 minutes — brute-force protection
  @Throttle({ default: { ttl: 900_000, limit: 5 } })
  @UseGuards(LocalAuthGuard)
  @Post('login')
  login(@Request() req: any, @Res() res: Response) {
    if (this.authService.isUnverifiedPasswordUser(req.user)) {
      return res.status(403).json({ code: 'EMAIL_UNVERIFIED', message: 'Please verify your email first.' });
    }
    const result = this.authService.login(req.user);
    res.cookie('access_token', result.access_token, COOKIE_OPTS);
    return res.json({ user: result.user });
  }

  @Throttle({ default: { ttl: 900_000, limit: 5 } })
  @Post('register')
  @HttpCode(200)
  async register(@Body() body: { name: string; email: string; password: string }) {
    await this.authService.register(body.name, body.email, body.password);
    return { message: 'Check your email to verify your account.' };
  }

  @SkipThrottle()
  @Get('verify-email')
  async verifyEmail(@Query('token') token: string, @Res() res: Response) {
    const redirectTo = await this.authService.verifyEmail(token ?? '');
    return res.redirect(redirectTo);
  }

  @Throttle({ default: { ttl: 900_000, limit: 5 } })
  @Post('forgot-password')
  @HttpCode(200)
  async forgotPassword(@Body() body: { email: string }) {
    await this.authService.requestPasswordReset(body.email);
    return { message: 'If that email exists, we sent a reset link.' };
  }

  @Throttle({ default: { ttl: 900_000, limit: 5 } })
  @Post('reset-password')
  @HttpCode(200)
  async resetPassword(@Body() body: { token: string; password: string }) {
    await this.authService.resetPassword(body.token, body.password);
    return { message: 'Password updated. You can sign in now.' };
  }

  @Throttle({ default: { ttl: 900_000, limit: 5 } })
  @BlockedInDemo()
  @Post('resend-verification')
  @HttpCode(200)
  async resendVerification(@Body() body: { email: string }) {
    await this.authService.resendVerification(body.email);
    return { message: 'If that account exists and is unverified, we sent a new link.' };
  }

  @SkipThrottle()
  @UseGuards(JwtAuthGuard)
  @Post('logout')
  async logout(@Request() req: any, @Res() res: Response) {
    // A demo sandbox ends with the visit: everything it owns goes, user row included.
    if (req.user?.isDemo) await this.demo.wipe(req.user.id).catch(() => undefined);
    res.clearCookie('access_token', COOKIE_CLEAR_OPTS);
    return res.json({ message: 'Logged out' });
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  me(@Request() req: any) {
    return { ...req.user, isAdmin: isAdminEmail(req.user?.email, this.config.get<string>('ADMIN_EMAILS')) };
  }

  @SkipThrottle()
  @UseGuards(JwtAuthGuard)
  @BlockedInDemo()
  @Patch('profile')
  updateProfile(@Request() req: any, @Body() body: { name?: string }) {
    return this.usersService.updateProfile(req.user.id, { name: body.name });
  }

  @Throttle({ default: { ttl: 900_000, limit: 10 } })
  @UseGuards(JwtAuthGuard)
  @BlockedInDemo()
  @Post('change-password')
  @HttpCode(200)
  async changePassword(@Request() req: any, @Body() body: { currentPassword: string; newPassword: string }) {
    await this.authService.changePassword(req.user.id, body.currentPassword ?? '', body.newPassword ?? '');
    return { message: 'Password updated.' };
  }

  @UseGuards(AuthGuard('google'))
  @Get('google')
  googleLogin() { /* passport redirects */ }

  @UseGuards(GoogleCallbackGuard)
  @Get('google/callback')
  googleCallback(@Request() req: any, @Res() res: Response) {
    const frontendUrl = process.env.FRONTEND_URL ?? 'http://localhost:3000';
    if (!req.user) return res.redirect(`${frontendUrl}/login?error=google`);
    const result = this.authService.login(req.user);
    res.cookie('access_token', result.access_token, COOKIE_OPTS);
    return res.redirect(`${frontendUrl}/dashboard`);
  }
}
