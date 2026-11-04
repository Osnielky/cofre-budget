import { describe, it, expect } from 'vitest';
import { classifyPlanChange, summarizeUpgradePreview, pendingChangeFromSchedule } from './plan-change';

const PRICES = {
  price_pro_month: { tier: 'pro', interval: 'month' },
  price_pro_year: { tier: 'pro', interval: 'year' },
  price_elite_month: { tier: 'elite', interval: 'month' },
  price_elite_year: { tier: 'elite', interval: 'year' },
} as const;

describe('classifyPlanChange', () => {
  it('treats a higher tier or monthly → yearly as an upgrade (charged today)', () => {
    expect(classifyPlanChange({ tier: 'pro', interval: 'month' }, { tier: 'elite', interval: 'month' })).toBe('upgrade');
    expect(classifyPlanChange({ tier: 'pro', interval: 'month' }, { tier: 'pro', interval: 'year' })).toBe('upgrade');
    expect(classifyPlanChange({ tier: 'pro', interval: 'year' }, { tier: 'elite', interval: 'year' })).toBe('upgrade');
  });
  it('treats a lower tier or yearly → monthly as a downgrade (end of the paid period, no refund)', () => {
    expect(classifyPlanChange({ tier: 'elite', interval: 'month' }, { tier: 'pro', interval: 'month' })).toBe('downgrade');
    expect(classifyPlanChange({ tier: 'pro', interval: 'year' }, { tier: 'pro', interval: 'month' })).toBe('downgrade');
    expect(classifyPlanChange({ tier: 'elite', interval: 'year' }, { tier: 'pro', interval: 'month' })).toBe('downgrade');
  });
  it('is "same" when nothing changes', () => {
    expect(classifyPlanChange({ tier: 'pro', interval: 'year' }, { tier: 'pro', interval: 'year' })).toBe('same');
  });
});

describe('summarizeUpgradePreview', () => {
  it('reads today’s charge, the unused-time credit and the new period end from the prorated invoice', () => {
    const out = summarizeUpgradePreview({
      amount_due: 4365,
      lines: { data: [
        { amount: -425, period: { start: 1_700_000_000, end: 1_702_000_000 }, pricing: { price_details: { price: 'price_pro_month' } } },
        { amount: 4790, period: { start: 1_700_000_000, end: 1_731_536_000 }, pricing: { price_details: { price: 'price_pro_year' } } },
      ] },
    } as any, 'price_pro_year');
    expect(out).toEqual({ chargeNow: 43.65, credit: 4.25, periodEnd: new Date(1_731_536_000 * 1000).toISOString() });
  });
  it('never reports a negative charge and copes with an empty preview (trial)', () => {
    expect(summarizeUpgradePreview({ amount_due: -100, lines: { data: [] } } as any, 'price_pro_year'))
      .toEqual({ chargeNow: 0, credit: 0, periodEnd: null });
  });
});

describe('pendingChangeFromSchedule', () => {
  const now = new Date(1_700_000_000 * 1000);
  it('returns the next phase’s plan and start date', () => {
    const out = pendingChangeFromSchedule({
      status: 'active',
      phases: [
        { start_date: 1_690_000_000, end_date: 1_710_000_000, items: [{ price: 'price_pro_year' }] },
        { start_date: 1_710_000_000, end_date: 1_712_600_000, items: [{ price: 'price_pro_month' }] },
      ],
    } as any, PRICES, now);
    expect(out).toEqual({ tier: 'pro', interval: 'month', effectiveAt: new Date(1_710_000_000 * 1000).toISOString() });
  });
  it('is null without a schedule, for a released one, or when no later phase exists', () => {
    expect(pendingChangeFromSchedule(null, PRICES, now)).toBeNull();
    expect(pendingChangeFromSchedule({ status: 'released', phases: [{ start_date: 1_710_000_000, items: [{ price: 'price_pro_month' }] }] } as any, PRICES, now)).toBeNull();
    expect(pendingChangeFromSchedule({ status: 'active', phases: [{ start_date: 1_690_000_000, items: [{ price: 'price_pro_year' }] }] } as any, PRICES, now)).toBeNull();
  });
});
