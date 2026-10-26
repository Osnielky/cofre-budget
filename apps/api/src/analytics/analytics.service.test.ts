import { describe, it, expect, beforeEach } from 'vitest';
import { DataSource } from 'typeorm';
import { User } from '../users/user.entity';
import { Subscription } from '../billing/subscription.entity';
import { PageView } from './page-view.entity';
import { AnalyticsService } from './analytics.service';

const NOW = new Date('2026-10-21T15:00:00Z');
const DAY = 24 * 60 * 60 * 1000;
const dayOf = (daysAgo: number) => new Date(NOW.getTime() - daysAgo * DAY).toISOString().slice(0, 10);

let ds: DataSource;
let service: AnalyticsService;

beforeEach(async () => {
  ds = new DataSource({ type: 'better-sqlite3', database: ':memory:', dropSchema: true, entities: [User, Subscription, PageView], synchronize: true });
  await ds.initialize();
  service = new AnalyticsService(ds, 'test-salt', 'budgetcofre.com');
});

const meta = (ip: string, ua = 'Mozilla/5.0 (Macintosh) AppleWebKit/605 Safari/605') => ({ ip, userAgent: ua });

async function seedView(daysAgo: number, path: string, ip: string, extra: Partial<{ referrer: string; signedIn: boolean; isDemo: boolean }> = {}) {
  const at = new Date(NOW.getTime() - daysAgo * DAY);
  return service.record({ path, referrer: extra.referrer, signedIn: extra.signedIn, isDemo: extra.isDemo }, meta(ip), at);
}

describe('AnalyticsService.record', () => {
  it('stores a view with a daily hash and no IP or user agent', async () => {
    const ok = await service.record({ path: '/pricing', referrer: 'https://www.reddit.com/r/x' }, meta('203.0.113.9'), NOW);
    expect(ok).toBe(true);
    const [row] = await ds.getRepository(PageView).find();
    expect(row).toMatchObject({ date: '2026-10-21', path: '/pricing', referrerHost: 'reddit.com', signedIn: false, isDemo: false });
    expect(row.visitorHash).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(row)).not.toContain('203.0.113.9');
    expect(JSON.stringify(row)).not.toContain('Mozilla');
  });

  it('ignores bots and malformed beacons', async () => {
    expect(await service.record({ path: '/' }, meta('203.0.113.9', 'Googlebot/2.1'), NOW)).toBe(false);
    expect(await service.record({ path: 'nope' }, meta('203.0.113.9'), NOW)).toBe(false);
    expect(await ds.getRepository(PageView).count()).toBe(0);
  });

  it('does not count a self-referral', async () => {
    await service.record({ path: '/pricing', referrer: 'https://budgetcofre.com/' }, meta('203.0.113.9'), NOW);
    expect((await ds.getRepository(PageView).find())[0].referrerHost).toBeNull();
  });
});

describe('AnalyticsService.traffic', () => {
  it('handles an empty table', async () => {
    const t = await service.traffic(NOW);
    expect(t.visits).toEqual({ today: 0, d7: 0, d30: 0 });
    expect(t.visitors).toEqual({ today: 0, d7: 0, d30: 0 });
    expect(t.daily).toHaveLength(30);
    expect(t.topPages).toEqual([]);
  });

  it('counts visits and unique visitors per window', async () => {
    await seedView(0, '/', '1.1.1.1');
    await seedView(0, '/pricing', '1.1.1.1');       // same visitor, second page
    await seedView(0, '/', '2.2.2.2');
    await seedView(3, '/', '3.3.3.3');
    await seedView(10, '/', '4.4.4.4');
    await seedView(40, '/', '5.5.5.5');             // outside 30 days
    const t = await service.traffic(NOW);
    expect(t.visits).toEqual({ today: 3, d7: 4, d30: 5 });
    expect(t.visitors).toEqual({ today: 2, d7: 3, d30: 4 });
    expect(t.daily.at(-1)).toEqual({ date: dayOf(0), visits: 3, visitors: 2 });
    expect(t.daily.find((d) => d.date === dayOf(3))).toEqual({ date: dayOf(3), visits: 1, visitors: 1 });
    expect(t.daily[0].date).toBe(dayOf(29));
  });

  it('ranks pages and referrers over 30 days, skipping direct visits', async () => {
    await seedView(1, '/', '1.1.1.1', { referrer: 'https://news.ycombinator.com/' });
    await seedView(1, '/', '2.2.2.2', { referrer: 'https://news.ycombinator.com/' });
    await seedView(2, '/pricing', '2.2.2.2', { referrer: 'https://x.com/' });
    await seedView(2, '/dashboard', '3.3.3.3', { signedIn: true });
    const t = await service.traffic(NOW);
    expect(t.topPages[0]).toEqual({ path: '/', visits: 2, visitors: 2 });
    expect(t.topReferrers).toEqual([{ host: 'news.ycombinator.com', visits: 2 }, { host: 'x.com', visits: 1 }]);
  });

  it('splits visits by anonymous, signed in and demo, and builds the funnel from users', async () => {
    await seedView(1, '/', '1.1.1.1');
    await seedView(1, '/demo', '1.1.1.1');
    await seedView(1, '/dashboard', '1.1.1.1', { signedIn: true, isDemo: true });
    await seedView(2, '/transactions', '9.9.9.9', { signedIn: true });
    const users = ds.getRepository(User);
    await users.save([
      users.create({ email: 'a@x.dev', name: 'A', createdAt: new Date(NOW.getTime() - 2 * DAY) }),
      users.create({ email: 'old@x.dev', name: 'Old', createdAt: new Date(NOW.getTime() - 60 * DAY) }),
      users.create({ email: 'demo-1@visitor.cofre.demo', name: 'Demo', isDemo: true, createdAt: new Date(NOW.getTime() - DAY) }),
    ]);
    const t = await service.traffic(NOW);
    expect(t.split).toEqual({ anonymous: 2, signedIn: 1, demo: 1 });
    expect(t.funnel).toEqual({ landingVisitors: 1, demoStarts: 1, signups: 1, trialStarts: 0, paying: 0 });
  });

  it('counts trial starts in the window and everyone currently paying', async () => {
    const subs = ds.getRepository(Subscription);
    const sub = (userId: string, status: Subscription['status'], daysAgo: number) =>
      subs.create({ userId, stripeSubscriptionId: `sub_${userId}`, tier: 'pro', interval: 'month', status, createdAt: new Date(NOW.getTime() - daysAgo * DAY) });
    await subs.save([
      sub('u1', 'trialing', 2),     // started this month, still on trial
      sub('u2', 'active', 10),      // started this month, converted
      sub('u3', 'canceled', 5),     // started this month, cancelled: still a trial start
      sub('u4', 'active', 200),     // old customer, still paying
      sub('u5', 'past_due', 90),    // old customer, card failing: still counts as paying
      sub('u6', 'canceled', 300),   // gone
    ]);
    const t = await service.traffic(NOW);
    expect(t.funnel.trialStarts).toBe(3);
    expect(t.funnel.paying).toBe(3);
  });
});

describe('AnalyticsService.sweep', () => {
  it('deletes rows older than 90 days and keeps the rest', async () => {
    await seedView(100, '/', '1.1.1.1');
    await seedView(89, '/', '2.2.2.2');
    expect(await service.sweep(NOW)).toBe(1);
    expect(await ds.getRepository(PageView).count()).toBe(1);
  });
});

describe('Prospects vs customers', () => {
  const geo = (ip: string | undefined) => ip === '1.1.1.1' ? { country: 'US', region: 'NY', city: 'New York' } : ip === '2.2.2.2' ? { country: 'ES', region: 'MD', city: 'Madrid' } : { country: null, region: null, city: null };
  const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
  beforeEach(() => { service = new AnalyticsService(ds, 'test-salt', 'budgetcofre.com', undefined, geo); });

  it('stores derived location, device, language and campaign, never the raw headers', async () => {
    await service.record({ path: '/', entry: true, search: '?utm_source=Reddit&utm_campaign=launch', viewportWidth: 390 },
      { ip: '1.1.1.1', userAgent: IPHONE, acceptLanguage: 'es-US,es;q=0.9' }, NOW);
    const [row] = await ds.getRepository(PageView).find();
    expect(row).toMatchObject({ entry: true, country: 'US', region: 'NY', city: 'New York', device: 'mobile', browser: 'Safari', os: 'iOS', language: 'es-us', viewportWidth: 390, utmSource: 'reddit', utmCampaign: 'launch', utmMedium: null });
    expect(JSON.stringify(row)).not.toContain('1.1.1.1');
    expect(JSON.stringify(row)).not.toContain('AppleWebKit');
  });

  it('separates prospects (anonymous + demo) from customers (signed in)', async () => {
    await service.record({ path: '/', entry: true }, meta('1.1.1.1'), NOW);
    await service.record({ path: '/pricing' }, meta('1.1.1.1'), new Date(NOW.getTime() + 60_000));
    await service.record({ path: '/dashboard', isDemo: true, signedIn: true }, meta('3.3.3.3'), NOW);
    await service.record({ path: '/dashboard', signedIn: true }, meta('9.9.9.9'), NOW);
    await service.record({ path: '/goals', signedIn: true }, meta('9.9.9.9'), NOW);
    const t = await service.traffic(NOW);
    expect(t.segments.prospects.visits.today).toBe(3);
    expect(t.segments.prospects.visitors.today).toBe(2);
    expect(t.segments.customers.visits.today).toBe(2);
    expect(t.segments.customers.visitors.today).toBe(1);
    expect(t.segments.customers.topPages.map((p) => p.path).sort()).toEqual(['/dashboard', '/goals']);
    expect(t.segments.prospects.topPages.map((p) => p.path)).toContain('/pricing');
    expect(t.visits.today).toBe(5);
  });

  it('profiles prospects by place, device, language, landing page and campaign', async () => {
    await service.record({ path: '/', entry: true, search: '?utm_source=reddit&utm_medium=post' }, { ip: '1.1.1.1', userAgent: IPHONE, acceptLanguage: 'en-US' }, NOW);
    await service.record({ path: '/pricing' }, { ip: '1.1.1.1', userAgent: IPHONE, acceptLanguage: 'en-US' }, NOW);
    await service.record({ path: '/pricing', entry: true }, { ip: '2.2.2.2', userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Safari/537.36', acceptLanguage: 'es' }, NOW);
    await service.record({ path: '/', entry: true }, { ip: '10.0.0.5', userAgent: IPHONE }, NOW);
    await service.record({ path: '/dashboard', signedIn: true, entry: true }, meta('9.9.9.9'), NOW); // customer, excluded
    const p = (await service.traffic(NOW)).prospects.profile;
    expect(p.countries).toEqual([{ country: 'ES', visitors: 1 }, { country: 'US', visitors: 1 }]);
    expect(p.cities).toEqual([{ label: 'Madrid', country: 'ES', visitors: 1 }, { label: 'New York', country: 'US', visitors: 1 }]);
    expect(p.devices).toEqual([{ label: 'mobile', visitors: 2 }, { label: 'desktop', visitors: 1 }]);
    expect(p.browsers.find((b) => b.label === 'Chrome')?.visitors).toBe(1);
    expect(p.languages).toEqual([{ label: 'en-us', visitors: 1 }, { label: 'es', visitors: 1 }]);
    expect(p.landingPages).toEqual([{ path: '/', visitors: 2 }, { path: '/pricing', visitors: 1 }]);
    expect(p.campaigns).toEqual([{ source: 'reddit', medium: 'post', campaign: null, visitors: 1 }]);
    expect(p.unknownLocation).toBe(1);
  });

  it('lists recent prospect visits with their page path, newest first', async () => {
    await service.record({ path: '/', entry: true, referrer: 'https://www.reddit.com/r/x', search: '?utm_source=reddit&utm_campaign=launch' }, { ip: '1.1.1.1', userAgent: IPHONE, acceptLanguage: 'en' }, NOW);
    await service.record({ path: '/pricing' }, { ip: '1.1.1.1', userAgent: IPHONE }, new Date(NOW.getTime() + 2 * 60_000));
    await service.record({ path: '/demo' }, { ip: '1.1.1.1', userAgent: IPHONE }, new Date(NOW.getTime() + 5 * 60_000));
    await service.record({ path: '/pricing', entry: true }, { ip: '2.2.2.2', userAgent: IPHONE }, new Date(NOW.getTime() + 10 * 60_000));
    await service.record({ path: '/dashboard', signedIn: true }, meta('9.9.9.9'), new Date(NOW.getTime() + 20 * 60_000));
    const recent = (await service.traffic(new Date(NOW.getTime() + 30 * 60_000))).prospects.recent;
    expect(recent).toHaveLength(2);
    expect(recent[0]).toMatchObject({ pages: ['/pricing'], views: 1, minutes: 0, country: 'ES', city: 'Madrid' });
    expect(recent[1]).toMatchObject({ pages: ['/', '/pricing', '/demo'], views: 3, minutes: 5, country: 'US', city: 'New York', device: 'mobile', referrerHost: 'reddit.com', campaign: 'reddit / launch', isDemo: false });
    expect(recent[1].firstSeen).toBe(NOW.toISOString());
  });
});
