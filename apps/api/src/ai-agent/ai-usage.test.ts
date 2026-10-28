import { describe, it, expect } from 'vitest';
import { messageLimit, messageUsage, startOfUtcDay, startOfUtcMonth, usageWindowStart } from './ai-usage';

describe('messageLimit', () => {
  it('gives Pro 25 messages a day', () => {
    expect(messageLimit('pro')).toEqual({ limit: 25, period: 'day' });
  });
  it('gives Elite 400 messages a month', () => {
    expect(messageLimit('elite')).toEqual({ limit: 400, period: 'month' });
  });
  it('gives plans without Ask Cofre no messages', () => {
    expect(messageLimit('free').limit).toBe(0);
  });
});

describe('messageUsage', () => {
  const now = new Date('2026-10-14T18:30:00Z');
  it('reports used, remaining and the next UTC midnight for Pro', () => {
    expect(messageUsage('pro', 7, now)).toEqual({
      limit: 25, used: 7, remaining: 18, period: 'day', resetsAt: '2026-10-15T00:00:00.000Z',
    });
  });
  it('reports the 1st of next month for Elite', () => {
    expect(messageUsage('elite', 120, now)).toEqual({
      limit: 400, used: 120, remaining: 280, period: 'month', resetsAt: '2026-11-01T00:00:00.000Z',
    });
  });
  it('rolls the Elite reset into the next year in December', () => {
    expect(messageUsage('elite', 0, new Date('2026-12-20T10:00:00Z')).resetsAt).toBe('2027-01-01T00:00:00.000Z');
  });
  it('never reports negative remaining', () => {
    expect(messageUsage('pro', 30, now).remaining).toBe(0);
  });
});

describe('usageWindowStart', () => {
  const now = new Date('2026-10-14T18:30:00Z');
  it('is midnight UTC today for Pro', () => {
    expect(usageWindowStart('pro', now).toISOString()).toBe('2026-10-14T00:00:00.000Z');
  });
  it('is the 1st of the month UTC for Elite', () => {
    expect(usageWindowStart('elite', now).toISOString()).toBe('2026-10-01T00:00:00.000Z');
  });
  it('is today for a demo sandbox even on an Elite user', () => {
    expect(usageWindowStart('elite', now, true).toISOString()).toBe('2026-10-14T00:00:00.000Z');
  });
});

describe('UTC window helpers', () => {
  it('startOfUtcDay is midnight UTC of the same UTC day', () => {
    expect(startOfUtcDay(new Date('2026-10-14T23:59:59Z')).toISOString()).toBe('2026-10-14T00:00:00.000Z');
  });
  it('startOfUtcMonth is the 1st at midnight UTC', () => {
    expect(startOfUtcMonth(new Date('2026-10-31T23:59:59Z')).toISOString()).toBe('2026-10-01T00:00:00.000Z');
  });
});

describe('demo visitors', () => {
  const now = new Date('2026-10-14T18:30:00Z');
  it('gives the demo plan 5 messages a day', () => {
    expect(messageLimit('demo')).toEqual({ limit: 5, period: 'day' });
  });
  it('caps a demo visitor at 5 regardless of the plan on the sandbox user', () => {
    expect(messageUsage('pro', 2, now, true)).toMatchObject({ limit: 5, used: 2, remaining: 3, period: 'day' });
    expect(messageUsage('elite', 5, now, true).remaining).toBe(0);
  });
  it('leaves real users on their plan limit', () => {
    expect(messageUsage('pro', 2, now, false).limit).toBe(25);
  });
});
