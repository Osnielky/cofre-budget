import { Controller, Post, Get, UseGuards, Request, Res } from '@nestjs/common';
import { Response } from 'express';
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

  @UseGuards(LocalAuthGuard)
  @Post('login')
  login(@Request() req: any, @Res() res: Response) {
    const result = this.authService.login(req.user);
    res.cookie('access_token', result.access_token, COOKIE_OPTS);
    return res.json({ user: result.user });
  }

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
}
