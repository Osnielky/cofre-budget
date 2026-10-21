import { describe, it, expect, beforeEach } from 'vitest';
import { DataSource } from 'typeorm';
import { User } from '../users/user.entity';
import { PageView } from './page-view.entity';
import { AnalyticsService } from './analytics.service';

const NOW = new Date('2026-10-21T15:00:00Z');
const DAY = 24 * 60 * 60 * 1000;
const dayOf = (daysAgo: number) => new Date(NOW.getTime() - daysAgo * DAY).toISOString().slice(0, 10);

let ds: DataSource;
let service: AnalyticsService;

beforeEach(async () => {
  ds = new DataSource({ type: 'better-sqlite3', database: ':memory:', dropSchema: true, entities: [User, PageView], synchronize: true });
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
    expect(t.funnel).toEqual({ landingVisitors: 1, demoStarts: 1, signups: 1 });
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
