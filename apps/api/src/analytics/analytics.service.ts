import { Inject, Injectable, Logger, OnApplicationBootstrap, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource, LessThan, SelectQueryBuilder } from 'typeorm';
import { PageView } from './page-view.entity';
import { parsePageView, visitorHash, isBot, dayKey, dateKeyOf } from './page-view.parse';
import { parseUserAgent, primaryLanguage, parseUtm } from './visitor-profile';
import { geoLookup, type GeoResult } from './geo';
import type { AdminTraffic, TrafficSegment, ProspectProfile, ProspectVisit } from './analytics.types';

export const RETENTION_DAYS = 90;
const RECENT_VISITS = 40;
const num = (v: unknown) => Number(v ?? 0) || 0;
const DAY = 24 * 60 * 60 * 1000;

export interface ViewMeta { ip: string; userAgent: string | undefined; acceptLanguage?: string }
type Segment = 'all' | 'prospects' | 'customers';

/** Prospects: not signed in, or in the demo. Customers: signed in with a real account. */
const SEGMENT_SQL: Record<Segment, string> = {
  all: '1 = 1',
  prospects: '(v."signedIn" = :f OR v."isDemo" = :t)',
  customers: '(v."signedIn" = :t AND v."isDemo" = :f)',
};
const SEGMENT_PARAMS = { t: true, f: false };

/**
 * First-party, cookie-less page-view counting. Rows carry a daily-salted
 * visitor hash and nothing personal; see PageView. Location, device, browser,
 * language and campaign are derived at ingest and the raw headers dropped.
 * Aggregates are computed on request with COUNTs (the table stays small:
 * 90 days of a small app). Table names are used in raw queries so the same
 * SQL runs on Postgres and on the sqlite test database.
 */
@Injectable()
export class AnalyticsService implements OnApplicationBootstrap {
  private readonly logger = new Logger(AnalyticsService.name);
  private readonly salt: string;
  private readonly ownHost: string | undefined;
  private readonly geo: (ip: string | undefined) => GeoResult;

  constructor(
    private readonly ds: DataSource,
    @Optional() @Inject('ANALYTICS_SALT') salt?: string,
    @Optional() @Inject('ANALYTICS_OWN_HOST') ownHost?: string,
    @Optional() config?: ConfigService,
    @Optional() @Inject('ANALYTICS_GEO') geo?: (ip: string | undefined) => GeoResult,
  ) {
    // The hash salt only has to be secret and stable; JWT_SECRET already is.
    this.salt = salt ?? config?.get<string>('ANALYTICS_SALT') ?? config?.get<string>('JWT_SECRET') ?? 'cofre-analytics';
    this.ownHost = ownHost ?? hostOf(config?.get<string>('FRONTEND_URL'));
    this.geo = geo ?? geoLookup;
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
  async record(body: unknown, meta: ViewMeta, now: Date = new Date()): Promise<boolean> {
    if (isBot(meta.userAgent)) return false;
    const view = parsePageView(body, this.ownHost);
    if (!view) return false;
    const date = dayKey(now);
    const ua = parseUserAgent(meta.userAgent);
    const geo = this.geo(meta.ip);
    const utm = view.entry ? parseUtm(view.search ?? undefined) : { utmSource: null, utmMedium: null, utmCampaign: null };
    const repo = this.ds.getRepository(PageView);
    await repo.save(repo.create({
      date, path: view.path, referrerHost: view.referrerHost, signedIn: view.signedIn, isDemo: view.isDemo,
      entry: view.entry,
      visitorHash: visitorHash(meta.ip || '', meta.userAgent || '', date, this.salt),
      country: geo.country, region: geo.region, city: geo.city,
      device: ua.device, browser: ua.browser, os: ua.os,
      language: primaryLanguage(meta.acceptLanguage),
      viewportWidth: view.viewportWidth,
      ...utm,
      createdAt: now,
    }));
    return true;
  }

  /** Deletes rows older than RETENTION_DAYS. Returns how many went. */
  async sweep(now: Date = new Date()): Promise<number> {
    const cutoff = dayKey(new Date(now.getTime() - RETENTION_DAYS * DAY));
    const r = await this.ds.getRepository(PageView).delete({ date: LessThan(cutoff) });
    return r.affected ?? 0;
  }

  async traffic(now: Date = new Date()): Promise<AdminTraffic> {
    const since = (days: number) => dayKey(new Date(now.getTime() - (days - 1) * DAY));
    const d30 = since(30);
    const qb = (segment: Segment = 'all') => this.ds.createQueryBuilder().from('page_views', 'v').where(SEGMENT_SQL[segment], SEGMENT_PARAMS);

    const [all, prospects, customers] = await Promise.all([this.segment('all', now), this.segment('prospects', now), this.segment('customers', now)]);

    const splitRows = await qb().select('v."signedIn"', 'signedIn').addSelect('v."isDemo"', 'isDemo').addSelect('COUNT(*)', 'n')
      .andWhere('v."date" >= :from', { from: d30 }).groupBy('v."signedIn"').addGroupBy('v."isDemo"').getRawMany();
    const split = { anonymous: 0, signedIn: 0, demo: 0 };
    for (const r of splitRows) {
      const n = num(r.n);
      if (truthy(r.isDemo)) split.demo += n;
      else if (truthy(r.signedIn)) split.signedIn += n;
      else split.anonymous += n;
    }

    const distinctOn = async (path: string) => num((await qb().select('COUNT(DISTINCT v."date" || v."visitorHash")', 'n')
      .andWhere('v."date" >= :from AND v."path" = :path', { from: d30, path }).getRawOne())?.n);
    const [landingVisitors, demoStarts, signupsRow, profile, recent] = await Promise.all([
      distinctOn('/'),
      distinctOn('/demo'),
      this.ds.createQueryBuilder().select('COUNT(*)', 'n').from('users', 'u')
        .where('u."createdAt" >= :c AND u."isDemo" = :d', { c: sqlTimestamp(new Date(now.getTime() - 30 * DAY)), d: false }).getRawOne(),
      this.prospectProfile(d30),
      this.recentProspects(d30),
    ]);

    return {
      generatedAt: now.toISOString(),
      ...all,
      split,
      funnel: { landingVisitors, demoStarts, signups: num(signupsRow?.n) },
      segments: { prospects, customers },
      prospects: { profile, recent },
      retentionDays: RETENTION_DAYS,
    };
  }

  /** Windows, daily series, top pages and referrers for one kind of viewer. */
  private async segment(segment: Segment, now: Date): Promise<TrafficSegment> {
    const today = dayKey(now);
    const since = (days: number) => dayKey(new Date(now.getTime() - (days - 1) * DAY));
    const d7 = since(7), d30 = since(30);
    const qb = () => this.ds.createQueryBuilder().from('page_views', 'v').where(SEGMENT_SQL[segment], SEGMENT_PARAMS);

    const windowCounts = async (from: string) => {
      const row = await qb().select('COUNT(*)', 'visits').addSelect('COUNT(DISTINCT v."date" || v."visitorHash")', 'visitors')
        .andWhere('v."date" >= :from', { from }).getRawOne();
      return { visits: num(row?.visits), visitors: num(row?.visitors) };
    };
    const [wToday, w7, w30] = await Promise.all([windowCounts(today), windowCounts(d7), windowCounts(d30)]);

    const dailyRows = await qb().select('v."date"', 'date').addSelect('COUNT(*)', 'visits').addSelect('COUNT(DISTINCT v."visitorHash")', 'visitors')
      .andWhere('v."date" >= :from', { from: d30 }).groupBy('v."date"').getRawMany();
    const byDate = new Map(dailyRows.map((r) => [dateKeyOf(r.date), { visits: num(r.visits), visitors: num(r.visitors) }]));
    const daily: TrafficSegment['daily'] = [];
    for (let i = 29; i >= 0; i--) {
      const date = since(i + 1);
      daily.push({ date, ...(byDate.get(date) ?? { visits: 0, visitors: 0 }) });
    }

    const pageRows = await qb().select('v."path"', 'path').addSelect('COUNT(*)', 'visits').addSelect('COUNT(DISTINCT v."date" || v."visitorHash")', 'visitors')
      .andWhere('v."date" >= :from', { from: d30 }).groupBy('v."path"').orderBy('visits', 'DESC').addOrderBy('v."path"', 'ASC').limit(12).getRawMany();
    const refRows = await qb().select('v."referrerHost"', 'host').addSelect('COUNT(*)', 'visits')
      .andWhere('v."date" >= :from AND v."referrerHost" IS NOT NULL', { from: d30 }).groupBy('v."referrerHost"').orderBy('visits', 'DESC').addOrderBy('v."referrerHost"', 'ASC').limit(10).getRawMany();

    return {
      visits: { today: wToday.visits, d7: w7.visits, d30: w30.visits },
      visitors: { today: wToday.visitors, d7: w7.visitors, d30: w30.visitors },
      daily,
      topPages: pageRows.map((r) => ({ path: String(r.path), visits: num(r.visits), visitors: num(r.visitors) })),
      topReferrers: refRows.map((r) => ({ host: String(r.host), visits: num(r.visits) })),
    };
  }

  /** 30-day buckets of prospect visitor-days by place, device, language, landing page and campaign. */
  private async prospectProfile(from: string): Promise<ProspectProfile> {
    const base = () => this.ds.createQueryBuilder().from('page_views', 'v')
      .where(SEGMENT_SQL.prospects, SEGMENT_PARAMS).andWhere('v."date" >= :from', { from });
    const visitors = 'COUNT(DISTINCT v."date" || v."visitorHash")';
    const bucket = async (col: string, extra?: (q: SelectQueryBuilder<any>) => SelectQueryBuilder<any>, limit = 10) => {
      let q = base().select(`v."${col}"`, 'label').addSelect(visitors, 'visitors').andWhere(`v."${col}" IS NOT NULL`);
      if (extra) q = extra(q);
      const rows = await q.groupBy(`v."${col}"`).orderBy('visitors', 'DESC').addOrderBy(`v."${col}"`, 'ASC').limit(limit).getRawMany();
      return rows.map((r) => ({ label: String(r.label), visitors: num(r.visitors) }));
    };

    const [countries, cityRows, devices, browsers, os, languages, landingPages, campaignRows, unknownRow] = await Promise.all([
      bucket('country', undefined, 12),
      base().select('v."city"', 'city').addSelect('v."country"', 'country').addSelect(visitors, 'visitors')
        .andWhere('v."city" IS NOT NULL').groupBy('v."city"').addGroupBy('v."country"').orderBy('visitors', 'DESC').addOrderBy('v."city"', 'ASC').limit(12).getRawMany(),
      bucket('device'),
      bucket('browser'),
      bucket('os'),
      bucket('language'),
      bucket('path', (q) => q.andWhere('v."entry" = :t'), 10),
      base().select('v."utmSource"', 'source').addSelect('v."utmMedium"', 'medium').addSelect('v."utmCampaign"', 'campaign').addSelect(visitors, 'visitors')
        .andWhere('v."entry" = :t AND v."utmSource" IS NOT NULL')
        .groupBy('v."utmSource"').addGroupBy('v."utmMedium"').addGroupBy('v."utmCampaign"').orderBy('visitors', 'DESC').limit(12).getRawMany(),
      base().select(visitors, 'n').andWhere('v."country" IS NULL').getRawOne(),
    ]);

    return {
      countries: countries.map((c) => ({ country: c.label, visitors: c.visitors })),
      cities: cityRows.map((r) => ({ label: String(r.city), country: String(r.country ?? ''), visitors: num(r.visitors) })),
      devices, browsers, os, languages,
      landingPages: landingPages.map((p) => ({ path: p.label, visitors: p.visitors })),
      campaigns: campaignRows.map((r) => ({ source: String(r.source), medium: r.medium ? String(r.medium) : null, campaign: r.campaign ? String(r.campaign) : null, visitors: num(r.visitors) })),
      unknownLocation: num(unknownRow?.n),
    };
  }

  /** The last prospect visitor-days with their page path, newest first. */
  private async recentProspects(from: string): Promise<ProspectVisit[]> {
    const rows = await this.ds.createQueryBuilder().from('page_views', 'v')
      .select(['v."date" AS date', 'v."visitorHash" AS hash', 'v."path" AS path', 'v."createdAt" AS "createdAt"', 'v."entry" AS entry',
        'v."country" AS country', 'v."city" AS city', 'v."device" AS device', 'v."browser" AS browser', 'v."os" AS os',
        'v."language" AS language', 'v."referrerHost" AS "referrerHost"', 'v."utmSource" AS "utmSource"', 'v."utmCampaign" AS "utmCampaign"', 'v."isDemo" AS "isDemo"'])
      .where(SEGMENT_SQL.prospects, SEGMENT_PARAMS).andWhere('v."date" >= :from', { from })
      .orderBy('v."createdAt"', 'DESC').limit(RECENT_VISITS * 12).getRawMany();

    const groups = new Map<string, ProspectVisit & { stamps: number[] }>();
    for (const r of rows) {
      const key = `${dateKeyOf(r.date)}|${r.hash}`;
      const at = timestampMs(r.createdAt);
      let g = groups.get(key);
      if (!g) {
        if (groups.size >= RECENT_VISITS) continue;
        g = {
          date: dateKeyOf(r.date), firstSeen: '', lastSeen: '', minutes: 0, views: 0, pages: [], stamps: [],
          country: r.country ?? null, city: r.city ?? null, device: r.device ?? null, browser: r.browser ?? null, os: r.os ?? null,
          language: r.language ?? null, referrerHost: null, campaign: null, isDemo: truthy(r.isDemo),
        };
        groups.set(key, g);
      }
      g.views += 1;
      g.stamps.push(at);
      g.pages.push(String(r.path));
      // Rows come newest first; the referrer and campaign sit on the entry view.
      if (r.referrerHost) g.referrerHost = String(r.referrerHost);
      if (r.utmSource) g.campaign = [r.utmSource, r.utmCampaign].filter(Boolean).join(' / ');
      if (truthy(r.isDemo)) g.isDemo = true;
    }
    return [...groups.values()].map((g) => {
      const order = g.stamps.map((t, i) => [t, i] as const).sort((a, b) => a[0] - b[0]);
      const first = order[0][0], last = order[order.length - 1][0];
      const { stamps, ...visit } = g;
      return { ...visit, pages: order.map(([, i]) => g.pages[i]), firstSeen: new Date(first).toISOString(), lastSeen: new Date(last).toISOString(), minutes: Math.round((last - first) / 60000) };
    });
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

/** Postgres returns a Date; sqlite a zone-less 'YYYY-MM-DD HH:MM:SS.mmm' string that is UTC. */
function timestampMs(v: unknown): number {
  if (v instanceof Date) return v.getTime();
  if (typeof v === 'number') return v;
  const s = String(v);
  return Date.parse(/[zZ]$|[+-]\d\d:?\d\d$/.test(s) ? s : s.replace(' ', 'T') + 'Z');
}

/** better-sqlite3 cannot bind a Date; both drivers accept this literal. */
function sqlTimestamp(d: Date): string {
  return d.toISOString().replace('T', ' ').replace('Z', '');
}
