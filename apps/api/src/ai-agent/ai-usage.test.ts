import { describe, it, expect } from 'vitest';
import { dailyMessageLimit, messageUsage, startOfUtcDay } from './ai-usage';

describe('dailyMessageLimit', () => {
  it('gives Pro 25 and Elite 50 messages a day', () => {
    expect(dailyMessageLimit('pro')).toBe(25);
    expect(dailyMessageLimit('elite')).toBe(50);
  });
  it('gives plans without Ask Cofre no messages', () => {
    expect(dailyMessageLimit('free')).toBe(0);
  });
});

describe('messageUsage', () => {
  const now = new Date('2026-10-14T18:30:00Z');
  it('reports used, remaining and the next UTC midnight', () => {
    expect(messageUsage('pro', 7, now)).toEqual({
      limit: 25, used: 7, remaining: 18, resetsAt: '2026-10-15T00:00:00.000Z',
    });
  });
  it('never reports negative remaining', () => {
    expect(messageUsage('pro', 30, now).remaining).toBe(0);
  });
});

describe('startOfUtcDay', () => {
  it('is midnight UTC of the same UTC day', () => {
    expect(startOfUtcDay(new Date('2026-10-14T23:59:59Z')).toISOString()).toBe('2026-10-14T00:00:00.000Z');
  });
});

describe('demo visitors', () => {
  const now = new Date('2026-10-14T18:30:00Z');
  it('gives the demo plan 5 messages a day', () => {
    expect(dailyMessageLimit('demo')).toBe(5);
  });
  it('caps a demo visitor at 5 regardless of the plan on the sandbox user', () => {
    expect(messageUsage('pro', 2, now, true)).toMatchObject({ limit: 5, used: 2, remaining: 3 });
    expect(messageUsage('elite', 5, now, true).remaining).toBe(0);
  });
  it('leaves real users on their plan limit', () => {
    expect(messageUsage('pro', 2, now, false).limit).toBe(25);
  });
});
