import { Inject, Injectable, Logger, OnApplicationBootstrap, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource, LessThan } from 'typeorm';
import { PageView } from './page-view.entity';
import { parsePageView, visitorHash, isBot, dayKey, dateKeyOf } from './page-view.parse';
import type { AdminTraffic } from './analytics.types';

export const RETENTION_DAYS = 90;
const num = (v: unknown) => Number(v ?? 0) || 0;

/**
 * First-party, cookie-less page-view counting. Rows carry a daily-salted
 * visitor hash and nothing personal; see PageView. Aggregates are computed on
 * request with COUNTs (the table stays small: 90 days of a small app).
 * Table names are used in raw queries so the same SQL runs on Postgres and on
 * the sqlite test database.
 */
@Injectable()
export class AnalyticsService implements OnApplicationBootstrap {
  private readonly logger = new Logger(AnalyticsService.name);
  private readonly salt: string;
  private readonly ownHost: string | undefined;

  constructor(
    private readonly ds: DataSource,
    @Optional() @Inject('ANALYTICS_SALT') salt?: string,
    @Optional() @Inject('ANALYTICS_OWN_HOST') ownHost?: string,
    @Optional() config?: ConfigService,
  ) {
    // The hash salt only has to be secret and stable; JWT_SECRET already is.
    this.salt = salt ?? config?.get<string>('ANALYTICS_SALT') ?? config?.get<string>('JWT_SECRET') ?? 'cofre-analytics';
    this.ownHost = ownHost ?? hostOf(config?.get<string>('FRONTEND_URL'));
  }

  /** Old rows go at boot; with daily deploys that is sweep enough for a 90-day table. */
  async onApplicationBootstrap(): Promise<void> {
    try {
      const n = await this.sweep(new Date());
      if (n) this.logger.log(`Swept ${n} page views older than ${RETENTION_DAYS} days`);
    } catch (err) {
      this.logger.warn(`Page-view sweep failed: ${(err as Error).message}`);
    }
  }

  /** Stores one view. Returns false for bots and malformed beacons. */
  async record(body: unknown, meta: { ip: string; userAgent: string | undefined }, now: Date = new Date()): Promise<boolean> {
    if (isBot(meta.userAgent)) return false;
    const view = parsePageView(body, this.ownHost);
    if (!view) return false;
    const date = dayKey(now);
    const repo = this.ds.getRepository(PageView);
    await repo.save(repo.create({
      date, path: view.path, referrerHost: view.referrerHost, signedIn: view.signedIn, isDemo: view.isDemo,
      visitorHash: visitorHash(meta.ip || '', meta.userAgent || '', date, this.salt),
      createdAt: now,
    }));
    return true;
  }

  /** Deletes rows older than RETENTION_DAYS. Returns how many went. */
  async sweep(now: Date = new Date()): Promise<number> {
    const cutoff = dayKey(new Date(now.getTime() - RETENTION_DAYS * 24 * 60 * 60 * 1000));
    const r = await this.ds.getRepository(PageView).delete({ date: LessThan(cutoff) });
    return r.affected ?? 0;
  }

  async traffic(now: Date = new Date()): Promise<AdminTraffic> {
    const today = dayKey(now);
    const since = (days: number) => dayKey(new Date(now.getTime() - (days - 1) * 24 * 60 * 60 * 1000));
    const d7 = since(7), d30 = since(30);
    const qb = () => this.ds.createQueryBuilder().from('page_views', 'v');

    const windowCounts = async (from: string) => {
      const row = await qb().select('COUNT(*)', 'visits').addSelect('COUNT(DISTINCT v."date" || v."visitorHash")', 'visitors')
        .where('v."date" >= :from', { from }).getRawOne();
      return { visits: num(row?.visits), visitors: num(row?.visitors) };
    };
    const [wToday, w7, w30] = await Promise.all([windowCounts(today), windowCounts(d7), windowCounts(d30)]);

    const dailyRows = await qb().select('v."date"', 'date').addSelect('COUNT(*)', 'visits').addSelect('COUNT(DISTINCT v."visitorHash")', 'visitors')
      .where('v."date" >= :from', { from: d30 }).groupBy('v."date"').getRawMany();
    const byDate = new Map(dailyRows.map((r) => [dateKeyOf(r.date), { visits: num(r.visits), visitors: num(r.visitors) }]));
    const daily: AdminTraffic['daily'] = [];
    for (let i = 29; i >= 0; i--) {
      const date = since(i + 1);
      daily.push({ date, ...(byDate.get(date) ?? { visits: 0, visitors: 0 }) });
    }

    const pageRows = await qb().select('v."path"', 'path').addSelect('COUNT(*)', 'visits').addSelect('COUNT(DISTINCT v."date" || v."visitorHash")', 'visitors')
      .where('v."date" >= :from', { from: d30 }).groupBy('v."path"').orderBy('visits', 'DESC').addOrderBy('v."path"', 'ASC').limit(12).getRawMany();
    const refRows = await qb().select('v."referrerHost"', 'host').addSelect('COUNT(*)', 'visits')
      .where('v."date" >= :from AND v."referrerHost" IS NOT NULL', { from: d30 }).groupBy('v."referrerHost"').orderBy('visits', 'DESC').addOrderBy('v."referrerHost"', 'ASC').limit(10).getRawMany();

    const splitRows = await qb().select('v."signedIn"', 'signedIn').addSelect('v."isDemo"', 'isDemo').addSelect('COUNT(*)', 'n')
      .where('v."date" >= :from', { from: d30 }).groupBy('v."signedIn"').addGroupBy('v."isDemo"').getRawMany();
    const split = { anonymous: 0, signedIn: 0, demo: 0 };
    for (const r of splitRows) {
      const n = num(r.n);
      if (truthy(r.isDemo)) split.demo += n;
      else if (truthy(r.signedIn)) split.signedIn += n;
      else split.anonymous += n;
    }

    const distinctOn = async (path: string) => num((await qb().select('COUNT(DISTINCT v."date" || v."visitorHash")', 'n')
      .where('v."date" >= :from AND v."path" = :path', { from: d30, path }).getRawOne())?.n);
    const [landingVisitors, demoStarts, signupsRow] = await Promise.all([
      distinctOn('/'),
      distinctOn('/demo'),
      this.ds.createQueryBuilder().select('COUNT(*)', 'n').from('users', 'u')
        .where('u."createdAt" >= :c AND u."isDemo" = :d', { c: sqlTimestamp(new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)), d: false }).getRawOne(),
    ]);

    return {
      generatedAt: now.toISOString(),
      visits: { today: wToday.visits, d7: w7.visits, d30: w30.visits },
      visitors: { today: wToday.visitors, d7: w7.visitors, d30: w30.visitors },
      daily,
      topPages: pageRows.map((r) => ({ path: String(r.path), visits: num(r.visits), visitors: num(r.visitors) })),
      topReferrers: refRows.map((r) => ({ host: String(r.host), visits: num(r.visits) })),
      split,
      funnel: { landingVisitors, demoStarts, signups: num(signupsRow?.n) },
      retentionDays: RETENTION_DAYS,
    };
  }
}

function hostOf(url: string | undefined): string | undefined {
  if (!url) return undefined;
  try { return new URL(url).hostname; } catch { return undefined; }
}

/** sqlite stores booleans as 0/1; Postgres returns true/false. */
function truthy(v: unknown): boolean {
  return v === true || v === 1 || v === '1' || v === 'true';
}

/** better-sqlite3 cannot bind a Date; both drivers accept this literal. */
function sqlTimestamp(d: Date): string {
  return d.toISOString().replace('T', ' ').replace('Z', '');
}
