import { describe, it, expect } from 'vitest';
import { extendedPeriodEnd } from './late-payment';

const DAY = 86_400_000;

describe('extendedPeriodEnd', () => {
  it('pushes the renewal date out by the time spent past due', () => {
    const periodEnd = new Date('2026-11-29T00:00:00Z');
    const pastDueSince = new Date('2026-10-29T00:00:00Z');
    const paidAt = new Date('2026-11-14T00:00:00Z'); // 16 days late
    expect(extendedPeriodEnd(periodEnd, pastDueSince, paidAt)).toEqual(new Date(periodEnd.getTime() + 16 * DAY));
  });

  it('does nothing for a payment that went through within the hour', () => {
    const pastDueSince = new Date('2026-10-29T00:00:00Z');
    expect(extendedPeriodEnd(new Date('2026-11-29T00:00:00Z'), pastDueSince, new Date(pastDueSince.getTime() + 30 * 60_000))).toBeNull();
  });

  it('never moves the date backwards', () => {
    const pastDueSince = new Date('2026-10-29T00:00:00Z');
    expect(extendedPeriodEnd(new Date('2026-11-29T00:00:00Z'), pastDueSince, new Date('2026-10-28T00:00:00Z'))).toBeNull();
  });
});
