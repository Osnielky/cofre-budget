import { describe, it, expect } from 'vitest';
import { busiest, classifyReferrer, engagementHint, funnelSteps, hourLabel, localActivity, movingAverage, pageKind, weekOverWeek } from './traffic';

const days = (visitors: number[]) => visitors.map((v, i) => ({ date: `2026-10-${String(i + 1).padStart(2, '0')}`, visits: v, visitors: v }));

describe('weekOverWeek', () => {
  it('compares the last seven days with the seven before', () => {
    expect(weekOverWeek(days([0, 0, 1, 1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 2, 2, 2]))).toEqual({ thisWeek: 14, lastWeek: 7, deltaPct: 100 });
    expect(weekOverWeek(days([0, 0, 0, 0, 0, 0, 0, 3, 3, 3, 3, 3, 3, 3]))).toEqual({ thisWeek: 21, lastWeek: 0, deltaPct: null });
    expect(weekOverWeek([])).toEqual({ thisWeek: 0, lastWeek: 0, deltaPct: null });
  });
});

describe('movingAverage', () => {
  it('averages what exists so far, then a trailing window', () => {
    expect(movingAverage([2, 4, 6, 8], 3)).toEqual([2, 3, 4, 6]);
    expect(movingAverage([1, 2], 7)).toEqual([1, 1.5]);
  });
});

describe('classifyReferrer', () => {
  it('knows search engines, social sites, AI assistants, crawlers and the owner\'s own URLs', () => {
    expect(classifyReferrer('www.google.com')).toEqual({ kind: 'search', label: 'google.com' });
    expect(classifyReferrer('google.co.uk').kind).toBe('search');
    expect(classifyReferrer('com.google.android.googlequicksearchbox')).toEqual({ kind: 'search', label: 'Google app (Android)' });
    expect(classifyReferrer('www.reddit.com')).toEqual({ kind: 'social', label: 'reddit.com' });
    expect(classifyReferrer('t.co').kind).toBe('social');
    expect(classifyReferrer('news.ycombinator.com').kind).toBe('social');
    expect(classifyReferrer('chatgpt.com').kind).toBe('ai');
    expect(classifyReferrer('aicrawler.store').kind).toBe('crawler');
    expect(classifyReferrer('cofre-web-193134215805.us-central1.run.app').kind).toBe('own');
    expect(classifyReferrer('app.budgetcofre.com').kind).toBe('own');
    expect(classifyReferrer('medium.com')).toEqual({ kind: 'other', label: 'medium.com' });
  });
});

describe('pageKind', () => {
  it('tells marketing pages, the demo, auth forms and app pages apart', () => {
    expect(pageKind('/')).toBe('landing');
    expect(pageKind('/demo')).toBe('demo');
    expect(pageKind('/login')).toBe('auth');
    expect(pageKind('/signup')).toBe('auth');
    expect(pageKind('/tools/millionaire-calculator')).toBe('public');
    expect(pageKind('/pricing')).toBe('public');
    expect(pageKind('/dashboard')).toBe('app');
    expect(pageKind('/transactions')).toBe('app');
  });
});

describe('funnelSteps', () => {
  it('reads each step against the top and the previous step', () => {
    const steps = funnelSteps({ landingVisitors: 24, demoStarts: 3, signups: 2, trialStarts: 0, paying: 0 });
    expect(steps.map((s) => [s.key, s.value, s.ofTop, s.ofPrevious])).toEqual([
      ['landingVisitors', 24, 100, null],
      ['demoStarts', 3, 12.5, 12.5],
      ['signups', 2, 8.3, 66.7],
      ['trialStarts', 0, 0, 0],
      ['paying', 0, 0, null],
    ]);
  });
  it('has no shares when nobody saw the landing page', () => {
    expect(funnelSteps({ landingVisitors: 0, demoStarts: 0, signups: 1, trialStarts: 0, paying: 0 }).map((s) => s.ofTop)).toEqual([null, null, null, null, null]);
  });
});

describe('engagementHint', () => {
  it('speaks to the sample size first, then the bounce, then the channel', () => {
    expect(engagementHint({ visitorDays: 0, singlePage: 0, avgPages: 0 }, { direct: 0, referred: 0 })).toBe('Nothing to read yet.');
    expect(engagementHint({ visitorDays: 12, singlePage: 11, avgPages: 1.1 }, { direct: 10, referred: 2 })).toMatch(/Too few visitors/);
    expect(engagementHint({ visitorDays: 40, singlePage: 35, avgPages: 1.1 }, { direct: 30, referred: 10 })).toMatch(/leave after one page/);
    expect(engagementHint({ visitorDays: 40, singlePage: 10, avgPages: 3.2 }, { direct: 35, referred: 5 })).toMatch(/tag the links/);
    expect(engagementHint({ visitorDays: 40, singlePage: 10, avgPages: 3.2 }, { direct: 5, referred: 35 })).toMatch(/demo and signup/);
  });
});

describe('localActivity + busiest', () => {
  it('rotates UTC buckets into the local zone and finds the busiest block', () => {
    const a = new Array(168).fill(0);
    a[2 * 24 + 14] = 3;  // Tue 14:00 UTC
    a[2 * 24 + 15] = 2;  // Tue 15:00 UTC
    a[1 * 24 + 3] = 1;   // Mon 03:00 UTC
    const nyc = localActivity(a, -4);  // EDT
    expect(nyc.total).toBe(6);
    expect(nyc.byHour[10]).toBe(3);
    expect(nyc.byHour[11]).toBe(2);
    expect(nyc.byWeekday).toEqual([1, 0, 5, 0, 0, 0, 0]);  // Mon 03:00 UTC → Sun 23:00 local
    expect(busiest(nyc.byHour, nyc.byWeekday)).toBe('Tue · 10am–12pm');
    expect(busiest(new Array(24).fill(0), new Array(7).fill(0))).toBeNull();
  });
  it('labels hours the way people say them', () => {
    expect([0, 1, 12, 13, 23].map(hourLabel)).toEqual(['12am', '1am', '12pm', '1pm', '11pm']);
  });
});
