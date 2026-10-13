import { describe, it, expect, beforeEach } from 'vitest';
import type { DataSource } from 'typeorm';
import { User } from '../users/user.entity';
import { Subscription } from '../billing/subscription.entity';
import { PlaidItem } from '../plaid/plaid-item.entity';
import { Transaction } from '../transactions/transaction.entity';
import { AdminService } from './admin.service';
import { makeDs } from './admin.test-db';

const NOW = new Date('2026-10-13T12:00:00Z');
const DAY = 24 * 60 * 60 * 1000;
const ago = (days: number) => new Date(NOW.getTime() - days * DAY);
// better-sqlite3 cannot bind Date in raw queries; use TypeORM's sqlite datetime format.
const sqlTs = (days: number) => ago(days).toISOString().replace('T', ' ').replace('Z', '');

let ds: DataSource;
let service: AdminService;

async function user(p: Partial<User>): Promise<User> {
  const repo = ds.getRepository(User);
  return repo.save(repo.create({ name: 'U', emailVerified: true, ...p }));
}

beforeEach(async () => {
  ds = await makeDs();
  service = new AdminService(ds);
});

describe('AdminService.stats', () => {
  it('handles an empty database without NaN', async () => {
    const s = await service.stats(NOW);
    expect(s.users.total).toBe(0);
    expect(s.engagement.avgTransactionsPerActiveUser).toBe(0);
    expect(s.revenue.mrrEstimate).toBe(0);
    expect(s.users.weeklySignups).toHaveLength(12);
  });

  it('counts users, growth, verification and signup method', async () => {
    await user({ email: 'g@x.com', googleId: 'g1', createdAt: ago(2) });
    await user({ email: 'e@x.com', createdAt: ago(10), emailVerified: false });
    await user({ email: 'old@x.com', createdAt: ago(200) });
    const s = await service.stats(NOW);
    expect(s.users).toMatchObject({ total: 3, new7d: 1, new30d: 2, verified: 2, unverified: 1, bySignup: { google: 1, email: 2 } });
    expect(s.users.weeklySignups.reduce((a, w) => a + w.count, 0)).toBe(2); // ago(200) is outside 12 weeks
    // ago(2) = 2026-10-11 (Sun) -> week of 2026-10-05; ago(10) = 2026-10-03 (Sat) -> week of 2026-09-28
    expect(s.users.weeklySignups.find((w) => w.week === '2026-10-05')?.count).toBe(1);
    expect(s.users.weeklySignups.find((w) => w.week === '2026-09-28')?.count).toBe(1);
  });

  it('computes plans, subscription statuses and MRR from active subscriptions only', async () => {
    const a = await user({ email: 'a@x.com', plan: 'pro' });
    const b = await user({ email: 'b@x.com', plan: 'elite' });
    const c = await user({ email: 'c@x.com', plan: 'pro' });
    const d = await user({ email: 'd@x.com', plan: 'free' });
    const subs = ds.getRepository(Subscription);
    await subs.save(subs.create({ userId: a.id, stripeSubscriptionId: 's1', tier: 'pro', interval: 'month', status: 'active', cancelAtPeriodEnd: true }));
    await subs.save(subs.create({ userId: b.id, stripeSubscriptionId: 's2', tier: 'elite', interval: 'year', status: 'active' }));
    await subs.save(subs.create({ userId: c.id, stripeSubscriptionId: 's3', tier: 'pro', interval: 'month', status: 'trialing' }));
    await subs.save(subs.create({ userId: d.id, stripeSubscriptionId: 's4', tier: 'pro', interval: 'month', status: 'past_due' }));
    const s = await service.stats(NOW);
    expect(s.revenue.plans).toEqual({ free: 1, pro: 2, elite: 1 });
    expect(s.revenue.subscriptions).toEqual({ trialing: 1, active: 2, past_due: 1, canceled: 0 });
    expect(s.revenue.cancelingAtPeriodEnd).toBe(1);
    expect(s.revenue.mrrEstimate).toBe(11.38); // 4.99 + 76.70/12
    expect(s.health.pastDueSubscriptions).toBe(1);
  });

  it('counts active users and average transactions per active user', async () => {
    const a = await user({ email: 'a@x.com', lastSeenAt: ago(0.5) });
    await user({ email: 'b@x.com', lastSeenAt: ago(5) });
    await user({ email: 'c@x.com', lastSeenAt: ago(60) });
    const tx = ds.getRepository(Transaction);
    for (let i = 0; i < 4; i++) {
      await tx.save(tx.create({ userId: a.id, name: `t${i}`, amount: -1, date: '2026-10-01', source: 'manual' } as Partial<Transaction>));
    }
    const s = await service.stats(NOW);
    expect(s.engagement).toMatchObject({ active1d: 1, active7d: 2, active30d: 2 });
    expect(s.engagement.avgTransactionsPerActiveUser).toBe(2); // 4 tx ÷ 2 active
  });

  it('ignores inactive users\' recent transactions in the per-active-user average', async () => {
    const a = await user({ email: 'a@x.com', lastSeenAt: ago(1) });
    const never = await user({ email: 'n@x.com' });
    const stale = await user({ email: 's@x.com', lastSeenAt: ago(60) });
    const tx = ds.getRepository(Transaction);
    let i = 0;
    for (const [u, n] of [[a, 3], [never, 5], [stale, 5]] as [User, number][]) {
      for (let k = 0; k < n; k++) {
        await tx.save(tx.create({ userId: u.id, name: `t${i++}`, amount: -1, date: '2026-10-01', source: 'manual' } as Partial<Transaction>));
      }
    }
    const s = await service.stats(NOW);
    expect(s.engagement.active30d).toBe(1);
    expect(s.engagement.avgTransactionsPerActiveUser).toBe(3); // only a's 3 tx
  });

  it('counts users with budgets, projects and a net worth goal, and subscription churn windows', async () => {
    const a = await user({ email: 'a@x.com', netWorthGoalTargetDate: '2030-01-01' });
    const b = await user({ email: 'b@x.com' });
    const c = await user({ email: 'c@x.com' });
    await ds.getRepository('Budget').save({ userId: a.id, month: '2026-10', amount: 100 });
    await ds.getRepository('Budget').save({ userId: a.id, month: '2026-09', amount: 100 });
    await ds.getRepository('Project').save({ userId: b.id, name: 'Car' });
    await ds.getRepository('Project').save({ userId: b.id, name: 'House' });
    const subs = ds.getRepository(Subscription);
    await subs.save(subs.create({ userId: a.id, stripeSubscriptionId: 's1', tier: 'pro', interval: 'month', status: 'canceled' }));
    await subs.save(subs.create({ userId: b.id, stripeSubscriptionId: 's2', tier: 'pro', interval: 'month', status: 'canceled' }));
    await subs.save(subs.create({ userId: c.id, stripeSubscriptionId: 's3', tier: 'pro', interval: 'month', status: 'active' }));
    await ds.query('UPDATE subscriptions SET "createdAt" = ?, "updatedAt" = ? WHERE "stripeSubscriptionId" = ?', [sqlTs(90), sqlTs(90), 's2']);
    const s = await service.stats(NOW);
    expect(s.engagement).toMatchObject({ withBudgets: 1, withProjects: 1, withNetWorthGoal: 1 });
    expect(s.revenue.new30d).toBe(2); // s1, s3 (s2 is 90 days old)
    expect(s.revenue.canceled30d).toBe(1); // s1 only; s2 canceled long ago
  });

  it('groups Plaid connections in error by code and counts bank-linked users', async () => {
    const a = await user({ email: 'a@x.com' });
    const b = await user({ email: 'b@x.com' });
    const items = ds.getRepository(PlaidItem);
    const base = { accessToken: 'x', institutionId: 'i', institutionName: 'Bank' };
    await items.save(items.create({ ...base, userId: a.id, itemId: 'i1', status: 'error', errorCode: 'ITEM_LOGIN_REQUIRED' } as Partial<PlaidItem>));
    await items.save(items.create({ ...base, userId: a.id, itemId: 'i2', status: 'error', errorCode: 'ITEM_LOGIN_REQUIRED' } as Partial<PlaidItem>));
    await items.save(items.create({ ...base, userId: b.id, itemId: 'i3', status: 'active' } as Partial<PlaidItem>));
    const s = await service.stats(NOW);
    expect(s.engagement.withBankLink).toBe(2);
    expect(s.health.plaidErrors).toEqual({ total: 2, byCode: [{ code: 'ITEM_LOGIN_REQUIRED', count: 2 }] });
  });

  it('counts AI usage in the last 30 days and receipts overall', async () => {
    const a = await user({ email: 'a@x.com' });
    await ds.query('INSERT INTO ai_conversations VALUES (?, ?, ?), (?, ?, ?)', ['c1', a.id, sqlTs(3), 'c2', a.id, sqlTs(90)]);
    await ds.query('INSERT INTO ai_messages VALUES (?, ?, ?), (?, ?, ?), (?, ?, ?)', ['m1', 'c1', sqlTs(3), 'm2', 'c1', sqlTs(3), 'm3', 'c2', sqlTs(90)]);
    await ds.query('INSERT INTO receipts VALUES (?, ?, ?)', ['r1', a.id, sqlTs(100)]);
    const s = await service.stats(NOW);
    expect(s.engagement).toMatchObject({ aiConversations30d: 1, aiMessages30d: 2, receiptsTotal: 1 });
  });
});
