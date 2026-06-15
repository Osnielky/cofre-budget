import { Controller, Post, Get, UseGuards, Request, Res } from '@nestjs/common';
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
