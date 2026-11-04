import { Controller, Post, Headers, HttpCode, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { timingSafeEqual } from 'crypto';
import { BillingService } from './billing.service';

/* The billing sweeps (24 h past-due downgrade, trial-ending reminder) run on an
   in-process timer, which only ticks while an instance is awake — and cofre-api
   scales to zero. Cloud Scheduler calls this route daily so they run regardless.
   Same contract as plaid/plaid-sweep.controller.ts: no JwtAuthGuard, the caller
   proves itself with the PLAID_SWEEP_SECRET header (one secret, one scheduler
   setup), and with the secret unset the route does not exist (404). */
@Controller('billing')
export class BillingSweepController {
  constructor(private billing: BillingService, private config: ConfigService) {}

  @Post('sweep')
  @HttpCode(200)
  async run(@Headers('x-sweep-secret') provided?: string): Promise<{ pastDueDowngraded: number; trialRemindersSent: number }> {
    // Trimmed: `openssl rand | gcloud secrets create --data-file=-` stores a trailing
    // newline, and a header never carries one.
    const expected = this.config.get<string>('PLAID_SWEEP_SECRET')?.trim();
    if (!expected) throw new NotFoundException();
    const a = Buffer.from((provided ?? '').trim());
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) throw new UnauthorizedException();
    const pastDueDowngraded = await this.billing.sweepPastDue();
    const trialRemindersSent = await this.billing.sweepTrialReminders();
    return { pastDueDowngraded, trialRemindersSent };
  }
}
