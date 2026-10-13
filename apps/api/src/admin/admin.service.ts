import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { daysAgo, weeklyBuckets } from './admin-stats.math';
import { estimateMrr, type BillingInterval, type PaidTier } from './plan-prices';
import type { AdminStats, AdminUserRow, AdminUsersPage } from './admin.types';

const num = (v: unknown) => Number(v ?? 0) || 0;

/** Postgres returns a Date; sqlite returns 'YYYY-MM-DD HH:MM:SS' (UTC) as a string. */
function toDate(v: unknown): Date {
  if (v instanceof Date) return v;
  const s = String(v);
  return new Date(s.includes('T') || s.includes('Z') ? s : `${s.replace(' ', 'T')}Z`);
}

export const ADMIN_PAGE_SIZE = 50;

/** LIKE pattern that matches `s` literally (escape char: backslash). */
function likeContains(s: string): string {
  return `%${s.toLowerCase().replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}

const iso = (v: unknown): string | null => (v == null ? null : toDate(v).toISOString());

/**
 * Read-only, app-wide aggregates for the admin page. Everything is computed on
 * request with COUNTs. Tables are addressed by name so the same SQL runs on
 * Postgres and on the sqlite test database (some entities use jsonb, which
 * sqlite cannot load). Time cutoffs are bound as parameters.
 */
@Injectable()
export class AdminService {
  constructor(private ds: DataSource) {}

  private async count(table: string, where?: string, params: Record<string, unknown> = {}, expr = 'COUNT(*)'): Promise<number> {
    const qb = this.ds.createQueryBuilder().select(expr, 'n').from(table, 't');
    if (where) qb.where(where, params);
    return num((await qb.getRawOne())?.n);
  }

  async users(q: { search?: string; page?: string | number }): Promise<AdminUsersPage> {
    const search = (q.search ?? '').trim().slice(0, 100);
    const base = () => {
      const qb = this.ds.createQueryBuilder().from('users', 'u');
      if (search) {
        qb.where(`(LOWER(u.email) LIKE :q ESCAPE '\\' OR LOWER(COALESCE(u.name, '')) LIKE :q ESCAPE '\\')`, { q: likeContains(search) });
      }
      return qb;
    };

    const total = num((await base().select('COUNT(*)', 'n').getRawOne())?.n);
    const lastPage = Math.max(1, Math.ceil(total / ADMIN_PAGE_SIZE));
    const asked = Math.floor(Number(q.page));
    const page = Number.isFinite(asked) && asked >= 1 ? Math.min(asked, lastPage) : 1;

    // Explicit column list: nothing financial or secret can reach the response.
    const users = await base()
      .select(['u.id AS id', 'u.email AS email', 'u.name AS name', 'u.plan AS plan',
        'u."googleId" IS NOT NULL AS "isGoogle"', 'u."emailVerified" AS "emailVerified"',
        'u."createdAt" AS "createdAt"', 'u."lastSeenAt" AS "lastSeenAt"'])
      .orderBy('u."createdAt"', 'DESC')
      .offset((page - 1) * ADMIN_PAGE_SIZE)
      .limit(ADMIN_PAGE_SIZE)
      .getRawMany();

    const ids = users.map((u) => u.id as string);
    const perUser = async (table: string) => {
      if (!ids.length) return new Map<string, number>();
      const rows = await this.ds.createQueryBuilder().select('t."userId"', 'userId').addSelect('COUNT(*)', 'n')
        .from(table, 't').where('t."userId" IN (:...ids)', { ids }).groupBy('t."userId"').getRawMany();
      return new Map(rows.map((r) => [r.userId as string, num(r.n)]));
    };
    const [bankLinks, txCounts, subRows] = await Promise.all([
      perUser('plaid_items'),
      perUser('transactions'),
      ids.length
        ? this.ds.createQueryBuilder().select('t."userId"', 'userId').addSelect('t.status', 'status')
            .from('subscriptions', 't').where('t."userId" IN (:...ids)', { ids }).getRawMany()
        : Promise.resolve([] as { userId: string; status: string }[]),
    ]);
    const subStatus = new Map(subRows.map((r) => [r.userId as string, r.status as AdminUserRow['subscriptionStatus']]));

    const rows: AdminUserRow[] = users.map((u) => ({
      id: u.id,
      email: u.email,
      name: u.name ?? null,
      plan: u.plan,
      subscriptionStatus: subStatus.get(u.id) ?? null,
      signupMethod: num(u.isGoogle) || u.isGoogle === true ? 'google' : 'email',
      emailVerified: u.emailVerified === true || num(u.emailVerified) === 1,
      createdAt: iso(u.createdAt) as string,
      lastSeenAt: iso(u.lastSeenAt),
      bankLinks: bankLinks.get(u.id) ?? 0,
      transactions: txCounts.get(u.id) ?? 0,
    }));
    return { rows, total, page, pageSize: ADMIN_PAGE_SIZE };
  }

  async stats(now: Date): Promise<AdminStats> {
    const d1 = daysAgo(now, 1), d7 = daysAgo(now, 7), d30 = daysAgo(now, 30), d84 = daysAgo(now, 7 * 12);
    const distinctUsers = 'COUNT(DISTINCT t."userId")';

    const [
      total, new7d, new30d, verified, google,
      planRows, subRows, canceling, activeSubs, subs30d, canceled30d,
      active1d, active7d, active30d, withBankLink, tx30d,
      withBudgets, withProjects, withGoal, aiConv30d, aiMsg30d, receiptsTotal,
      plaidRows, signupRows,
    ] = await Promise.all([
      this.count('users'),
      this.count('users', 't."createdAt" >= :c', { c: d7 }),
      this.count('users', 't."createdAt" >= :c', { c: d30 }),
      this.count('users', 't."emailVerified" = :v', { v: true }),
      this.count('users', 't."googleId" IS NOT NULL'),
      this.ds.createQueryBuilder().select('t.plan', 'plan').addSelect('COUNT(*)', 'n').from('users', 't').groupBy('t.plan').getRawMany(),
      this.ds.createQueryBuilder().select('t.status', 'status').addSelect('COUNT(*)', 'n').from('subscriptions', 't').groupBy('t.status').getRawMany(),
      this.count('subscriptions', 't."cancelAtPeriodEnd" = :v AND t.status IN (:...s)', { v: true, s: ['active', 'trialing'] }),
      this.ds.createQueryBuilder().select('t.tier', 'tier').addSelect('t."interval"', 'interval').from('subscriptions', 't').where('t.status = :s', { s: 'active' }).getRawMany(),
      this.count('subscriptions', 't."createdAt" >= :c', { c: d30 }),
      // Approximates "canceled in the last 30 days" via updatedAt (no canceledAt column).
      this.count('subscriptions', 't.status = :s AND t."updatedAt" >= :c', { s: 'canceled', c: d30 }),
      this.count('users', 't."lastSeenAt" >= :c', { c: d1 }),
      this.count('users', 't."lastSeenAt" >= :c', { c: d7 }),
      this.count('users', 't."lastSeenAt" >= :c', { c: d30 }),
      this.count('plaid_items', undefined, {}, distinctUsers),
      // Numerator population must match the active30d denominator: only users seen in the last 30 days.
      this.count('transactions', 't."createdAt" >= :c AND t."userId" IN (SELECT CAST(u.id AS VARCHAR) FROM users u WHERE u."lastSeenAt" >= :c)', { c: d30 }),
      this.count('budgets', undefined, {}, distinctUsers),
      this.count('projects', undefined, {}, distinctUsers),
      this.count('users', 't."netWorthGoalTargetDate" IS NOT NULL'),
      this.count('ai_conversations', 't."createdAt" >= :c', { c: d30 }),
      this.count('ai_messages', 't."createdAt" >= :c', { c: d30 }),
      this.count('receipts'),
      this.ds.createQueryBuilder().select('t."errorCode"', 'code').addSelect('COUNT(*)', 'n').from('plaid_items', 't')
        .where('t.status = :s', { s: 'error' }).groupBy('t."errorCode"').getRawMany(),
      this.ds.createQueryBuilder().select('t."createdAt"', 'createdAt').from('users', 't').where('t."createdAt" >= :c', { c: d84 }).getRawMany(),
    ]);

    const byKey = (rows: { n: unknown }[], key: string) =>
      Object.fromEntries(rows.map((r) => [(r as Record<string, unknown>)[key] as string, num(r.n)]));
    const plans = byKey(planRows, 'plan');
    const statuses = byKey(subRows, 'status');
    const byCode = plaidRows
      .map((r) => ({ code: (r.code as string | null) ?? 'UNKNOWN', count: num(r.n) }))
      .sort((a, b) => b.count - a.count);

    return {
      generatedAt: now.toISOString(),
      users: {
        total, new7d, new30d, verified, unverified: total - verified,
        bySignup: { google, email: total - google },
        weeklySignups: weeklyBuckets(signupRows.map((r) => toDate(r.createdAt)), now, 12),
      },
      revenue: {
        plans: { free: plans.free ?? 0, pro: plans.pro ?? 0, elite: plans.elite ?? 0 },
        subscriptions: {
          trialing: statuses.trialing ?? 0, active: statuses.active ?? 0,
          past_due: statuses.past_due ?? 0, canceled: statuses.canceled ?? 0,
        },
        cancelingAtPeriodEnd: canceling,
        mrrEstimate: estimateMrr(activeSubs as { tier: PaidTier; interval: BillingInterval }[]),
        new30d: subs30d,
        canceled30d,
      },
      engagement: {
        active1d, active7d, active30d, withBankLink,
        avgTransactionsPerActiveUser: active30d > 0 ? Math.round((tx30d / active30d) * 10) / 10 : 0,
        withBudgets, withProjects, withNetWorthGoal: withGoal,
        aiConversations30d: aiConv30d, aiMessages30d: aiMsg30d, receiptsTotal,
      },
      health: {
        plaidErrors: { total: byCode.reduce((s, x) => s + x.count, 0), byCode },
        pastDueSubscriptions: statuses.past_due ?? 0,
      },
    };
  }
}
