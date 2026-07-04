import { Controller, Post, Get, Patch, Body, Query, UseGuards, Request, Res, HttpCode } from '@nestjs/common';
import { Response } from 'express';
import { AuthGuard } from '@nestjs/passport';
import { Throttle, SkipThrottle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { UsersService } from '../users/users.service';
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
  constructor(
    private authService: AuthService,
    private usersService: UsersService,
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
  @Post('resend-verification')
  @HttpCode(200)
  async resendVerification(@Body() body: { email: string }) {
    await this.authService.resendVerification(body.email);
    return { message: 'If that account exists and is unverified, we sent a new link.' };
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

  @SkipThrottle()
  @UseGuards(JwtAuthGuard)
  @Patch('profile')
  updateProfile(@Request() req: any, @Body() body: { name?: string; savingsGoal?: number | null }) {
    return this.usersService.updateProfile(req.user.id, { name: body.name, savingsGoal: body.savingsGoal });
  }

  @Throttle({ default: { ttl: 900_000, limit: 10 } })
  @UseGuards(JwtAuthGuard)
  @Post('change-password')
  @HttpCode(200)
  async changePassword(@Request() req: any, @Body() body: { currentPassword: string; newPassword: string }) {
    await this.authService.changePassword(req.user.id, body.currentPassword ?? '', body.newPassword ?? '');
    return { message: 'Password updated.' };
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
