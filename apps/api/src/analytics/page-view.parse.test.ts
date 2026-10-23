import { describe, it, expect } from 'vitest';
import { parsePageView, visitorHash, isBot, referrerHost, dayKey, dateKeyOf } from './page-view.parse';

describe('parsePageView', () => {
  it('keeps a well-formed beacon, normalising ids out of the path', () => {
    expect(parsePageView({ path: '/transactions/9d6c2f10-1b2a-4c3d-8e9f-0a1b2c3d4e5f?x=1', referrer: 'https://news.ycombinator.com/item?id=1', signedIn: true, isDemo: false }))
      .toEqual({ path: '/transactions/:id', referrerHost: 'news.ycombinator.com', signedIn: true, isDemo: false, entry: false, search: null, viewportWidth: null });
  });
  it('keeps the landing query string and viewport on entry views only', () => {
    const entry = parsePageView({ path: '/', entry: true, search: '?utm_source=reddit', viewportWidth: 1440.4 });
    expect(entry).toMatchObject({ entry: true, search: '?utm_source=reddit', viewportWidth: 1440 });
    const later = parsePageView({ path: '/pricing', entry: false, search: '?utm_source=reddit', viewportWidth: -5 });
    expect(later).toMatchObject({ entry: false, search: null, viewportWidth: null });
    expect(parsePageView({ path: '/', entry: true, search: 'x'.repeat(3000) })?.search).toBeNull();
  });
  it('drops anything that is not a page path', () => {
    expect(parsePageView(null)).toBeNull();
    expect(parsePageView({ path: 'javascript:alert(1)' })).toBeNull();
    expect(parsePageView({ path: '/' + 'a'.repeat(600) })).toBeNull();
    expect(parsePageView({})).toBeNull();
  });
  it('treats missing flags as an anonymous visitor and tolerates a bad referrer', () => {
    expect(parsePageView({ path: '/pricing', referrer: 'not a url' })).toEqual({ path: '/pricing', referrerHost: null, signedIn: false, isDemo: false, entry: false, search: null, viewportWidth: null });
  });
});

describe('referrerHost', () => {
  it('strips www and lower-cases', () => {
    expect(referrerHost('https://WWW.Reddit.com/r/personalfinance')).toBe('reddit.com');
  });
  it('returns null for the site itself so self-navigation is not a referral', () => {
    expect(referrerHost('https://budgetcofre.com/pricing', 'budgetcofre.com')).toBeNull();
    expect(referrerHost('https://www.budgetcofre.com/', 'budgetcofre.com')).toBeNull();
  });
  it('returns null for empty or unparsable input', () => {
    expect(referrerHost('')).toBeNull();
    expect(referrerHost(undefined)).toBeNull();
  });
});

describe('visitorHash', () => {
  const ua = 'Mozilla/5.0 (Macintosh) Safari/605';
  it('is stable within a day and differs across days, so no one is tracked day to day', () => {
    const a = visitorHash('203.0.113.9', ua, '2026-10-21', 'salt');
    expect(visitorHash('203.0.113.9', ua, '2026-10-21', 'salt')).toBe(a);
    expect(visitorHash('203.0.113.9', ua, '2026-10-22', 'salt')).not.toBe(a);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });
  it('differs for another IP or browser', () => {
    expect(visitorHash('203.0.113.9', ua, '2026-10-21', 'salt')).not.toBe(visitorHash('203.0.113.10', ua, '2026-10-21', 'salt'));
    expect(visitorHash('203.0.113.9', ua, '2026-10-21', 'salt')).not.toBe(visitorHash('203.0.113.9', 'curl/8', '2026-10-21', 'salt'));
  });
});

describe('isBot', () => {
  it('flags crawlers and empty agents', () => {
    for (const ua of ['Googlebot/2.1 (+http://www.google.com/bot.html)', 'Mozilla/5.0 (compatible; bingbot/2.0)', 'facebookexternalhit/1.1', 'curl/8.7.1', 'python-requests/2.31', 'HeadlessChrome/145', '']) {
      expect({ ua, bot: isBot(ua) }).toEqual({ ua, bot: true });
    }
  });
  it('lets real browsers through', () => {
    expect(isBot('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1')).toBe(false);
    expect(isBot('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36')).toBe(false);
  });
});

describe('dayKey', () => {
  it('is the UTC calendar day', () => {
    expect(dayKey(new Date('2026-10-21T23:59:59Z'))).toBe('2026-10-21');
    expect(dayKey(new Date('2026-10-22T00:00:01Z'))).toBe('2026-10-22');
  });
});

describe('dateKeyOf', () => {
  it('reads a Postgres Date and a sqlite string the same way', () => {
    expect(dateKeyOf(new Date('2026-10-21T00:00:00.000Z'))).toBe('2026-10-21');
    expect(dateKeyOf('2026-10-21')).toBe('2026-10-21');
    expect(dateKeyOf('2026-10-21 00:00:00')).toBe('2026-10-21');
  });
});
