import { describe, it, expect } from 'vitest';
import { NotFoundException, UnauthorizedException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { BillingSweepController } from './billing-sweep.controller';
import type { BillingService } from './billing.service';

function make(secret: string | undefined) {
  const calls: string[] = [];
  const billing = {
    sweepPastDue: async () => { calls.push('pastDue'); return 2; },
    sweepTrialReminders: async () => { calls.push('trials'); return 1; },
  } as unknown as BillingService;
  const config = { get: (key: string) => (key === 'PLAID_SWEEP_SECRET' ? secret : undefined) } as unknown as ConfigService;
  return { controller: new BillingSweepController(billing, config), calls };
}

describe('BillingSweepController', () => {
  it('does not exist while the sweep secret is unset', async () => {
    const { controller, calls } = make(undefined);
    await expect(controller.run('anything')).rejects.toBeInstanceOf(NotFoundException);
    expect(calls).toEqual([]);
  });

  it('refuses a wrong or missing secret', async () => {
    const { controller, calls } = make('s3cret');
    await expect(controller.run('nope')).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(controller.run(undefined)).rejects.toBeInstanceOf(UnauthorizedException);
    expect(calls).toEqual([]);
  });

  it('runs both billing sweeps and reports the counts', async () => {
    const { controller, calls } = make('s3cret');
    await expect(controller.run('s3cret')).resolves.toEqual({ pastDueDowngraded: 2, trialRemindersSent: 1 });
    expect(calls).toEqual(['pastDue', 'trials']);
  });
});
