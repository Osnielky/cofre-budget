import { describe, it, expect } from 'vitest';
import { billingEmailFor, billingEmailContent, type SubState } from './billing-emails';

const pro: SubState = { tier: 'pro', interval: 'month', status: 'trialing', cancelAtPeriodEnd: false };

describe('billingEmailFor', () => {
  it('sends "started" for a brand-new subscription', () => {
    expect(billingEmailFor(null, pro)).toBe('started');
  });
  it('sends "started" when a previously canceled user subscribes again', () => {
    expect(billingEmailFor({ ...pro, status: 'canceled' }, { ...pro, status: 'active' })).toBe('started');
  });
  it('sends nothing when nothing meaningful changed (duplicate or trial → active)', () => {
    expect(billingEmailFor(pro, pro)).toBeNull();
    expect(billingEmailFor(pro, { ...pro, status: 'active' })).toBeNull();
  });
  it('sends "changed" when the tier or the interval changes', () => {
    expect(billingEmailFor(pro, { ...pro, tier: 'elite' })).toBe('changed');
    expect(billingEmailFor(pro, { ...pro, interval: 'year' })).toBe('changed');
  });
  it('sends "cancel_scheduled" when cancel-at-period-end is switched on', () => {
    expect(billingEmailFor(pro, { ...pro, cancelAtPeriodEnd: true })).toBe('cancel_scheduled');
  });
  it('does not resend "cancel_scheduled" while it stays switched on', () => {
    const canceling = { ...pro, cancelAtPeriodEnd: true };
    expect(billingEmailFor(canceling, canceling)).toBeNull();
  });
  it('sends "ended" when the subscription becomes canceled, and only once', () => {
    const ended = { ...pro, status: 'canceled' as const, cancelAtPeriodEnd: true };
    expect(billingEmailFor({ ...pro, cancelAtPeriodEnd: true }, ended)).toBe('ended');
    expect(billingEmailFor(pro, ended)).toBe('ended'); // canceled immediately
    expect(billingEmailFor(ended, ended)).toBeNull();
    expect(billingEmailFor(null, ended)).toBeNull();
  });
});

describe('billingEmailContent', () => {
  const base = {
    name: 'Ana',
    tier: 'pro' as const,
    interval: 'month' as const,
    status: 'trialing' as const,
    amount: 4.99,
    currency: 'usd',
    trialEnd: new Date('2026-10-29T12:00:00Z'),
    currentPeriodEnd: new Date('2026-10-29T12:00:00Z'),
    appUrl: 'https://budgetcofre.com',
  };

  it('"started" during a trial names the plan, the trial end and the first payment', () => {
    const c = billingEmailContent('started', base);
    expect(c.subject).toBe('Welcome to Cofre Pro');
    const rows = Object.fromEntries(c.rows);
    expect(rows.Plan).toBe('Pro · Monthly');
    expect(rows.Price).toBe('$4.99 / month');
    expect(rows['Free trial ends']).toBe('October 29, 2026');
    expect(rows['First payment']).toBe('$4.99 on October 29, 2026');
    expect(c.features).toContain('Ask Cofre AI assistant (25 messages a day)');
    expect(c.cta.href).toBe('https://budgetcofre.com/dashboard');
  });

  it('"started" without a trial shows the next payment instead', () => {
    const c = billingEmailContent('started', { ...base, status: 'active', trialEnd: null, interval: 'year', amount: 47.9 });
    const rows = Object.fromEntries(c.rows);
    expect(rows.Price).toBe('$47.90 / year');
    expect(rows['Next payment']).toBe('$47.90 on October 29, 2026');
    expect(rows['Free trial ends']).toBeUndefined();
  });

  it('"changed" shows the old and new plan', () => {
    const c = billingEmailContent('changed', { ...base, status: 'active', tier: 'elite', amount: 7.99, prevTier: 'pro', prevInterval: 'month' });
    const rows = Object.fromEntries(c.rows);
    expect(c.subject).toBe('Your Cofre plan changed to Elite');
    expect(rows['Previous plan']).toBe('Pro · Monthly');
    expect(rows['New plan']).toBe('Elite · Monthly');
  });

  it('"cancel_scheduled" says until when access lasts and links back to billing', () => {
    const c = billingEmailContent('cancel_scheduled', { ...base, status: 'active', trialEnd: null });
    expect(c.subject).toBe('Your Cofre Pro cancellation is confirmed');
    expect(Object.fromEntries(c.rows)['Access until']).toBe('October 29, 2026');
    expect(c.cta.href).toBe('https://budgetcofre.com/settings?tab=billing');
  });

  it('"cancel_scheduled" during a trial ends access at the trial end', () => {
    const c = billingEmailContent('cancel_scheduled', { ...base, currentPeriodEnd: new Date('2026-11-29T12:00:00Z') });
    expect(Object.fromEntries(c.rows)['Access until']).toBe('October 29, 2026');
  });

  it('"ended" points to pricing to reactivate', () => {
    const c = billingEmailContent('ended', { ...base, status: 'canceled' });
    expect(c.subject).toBe('Your Cofre Pro plan has ended');
    expect(c.cta.href).toBe('https://budgetcofre.com/pricing');
  });

  it('falls back gracefully when the price amount is unknown', () => {
    const c = billingEmailContent('started', { ...base, amount: null });
    expect(Object.fromEntries(c.rows).Price).toBe('—');
  });
});
