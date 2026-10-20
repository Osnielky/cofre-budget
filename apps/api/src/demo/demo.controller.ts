import { Controller, Post, Res, HttpCode } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Response } from 'express';
import { AuthService } from '../auth/auth.service';
import { DemoService } from './demo.service';
import { cookieOptions } from '../common/http/cookies';

/** Visitor sandboxes live 4 hours; the sweep deletes anything older than 24 h. */
const VISITOR_COOKIE_OPTS = cookieOptions(undefined, 4 * 60 * 60 * 1000);

@Controller('demo')
export class DemoController {
  constructor(private demo: DemoService, private auth: AuthService) {}

  /** Public. Creates a throwaway sandbox full of demo data and signs the visitor in. */
  @Throttle({ default: { ttl: 900_000, limit: 10 } })
  @Post('start')
  @HttpCode(200)
  async start(@Res() res: Response) {
    // Opportunistic cleanup; bounded so a burst of visitors never pays for it.
    await this.demo.sweepStaleVisitors(new Date(), undefined, 20).catch(() => 0);
    const user = await this.demo.startVisitor(new Date());
    const { access_token } = this.auth.login(user);
    res.cookie('access_token', access_token, VISITOR_COOKIE_OPTS);
    return res.json({ ok: true });
  }
}
