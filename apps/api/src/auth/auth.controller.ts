import { Controller, Post, Get, UseGuards, Request, Res } from '@nestjs/common';
import { Response } from 'express';
import { AuthGuard } from '@nestjs/passport';
import { Throttle, SkipThrottle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { LocalAuthGuard } from './guards/local-auth.guard';
import { JwtAuthGuard } from './guards/jwt-auth.guard';

const COOKIE_OPTS = {
  httpOnly: true,
  sameSite: 'lax' as const,
  secure: process.env.NODE_ENV === 'production',
  maxAge: 7 * 24 * 60 * 60 * 1000,
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
    res.clearCookie('access_token');
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
