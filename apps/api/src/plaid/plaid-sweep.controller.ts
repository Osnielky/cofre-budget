import { Controller, Post, Headers, HttpCode, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { timingSafeEqual } from 'crypto';
import { PlaidSweepService } from './plaid-sweep.service';

/* Called by Cloud Scheduler, not by a user, so it carries no JwtAuthGuard: the
   caller proves itself with the PLAID_SWEEP_SECRET header instead. With the secret
   unset the route does not exist (404), so a forgotten env var can't open it. */
@Controller('plaid')
export class PlaidSweepController {
  constructor(private sweep: PlaidSweepService, private config: ConfigService) {}

  @Post('sweep')
  @HttpCode(200)
  async run(@Headers('x-sweep-secret') provided?: string) {
    const expected = this.config.get<string>('PLAID_SWEEP_SECRET');
    if (!expected) throw new NotFoundException();
    const a = Buffer.from(provided ?? '');
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) throw new UnauthorizedException();
    return this.sweep.sweepStale();
  }
}
