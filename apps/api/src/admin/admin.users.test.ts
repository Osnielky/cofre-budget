import { describe, it, expect, beforeEach } from 'vitest';
import type { DataSource } from 'typeorm';
import { User } from '../users/user.entity';
import { Subscription } from '../billing/subscription.entity';
import { PlaidItem } from '../plaid/plaid-item.entity';
import { Transaction } from '../transactions/transaction.entity';
import { AdminService, ADMIN_PAGE_SIZE } from './admin.service';
import { makeDs } from './admin.test-db';

let ds: DataSource;
let service: AdminService;

async function user(email: string, p: Partial<User> = {}): Promise<User> {
  const repo = ds.getRepository(User);
  return repo.save(repo.create({ email, name: email.split('@')[0], emailVerified: true, ...p }));
}

beforeEach(async () => {
  ds = await makeDs();
  service = new AdminService(ds);
});

describe('AdminService.users', () => {
  it('returns exactly the allowed fields, with zero counts for an empty account', async () => {
    await user('lonely@x.com', { stripeCustomerId: 'cus_secret', plaidUserId: 'plaid_secret', googleId: 'g-secret' });
    const { rows } = await service.users({});
    expect(Object.keys(rows[0]).sort()).toEqual([
      'bankLinks', 'createdAt', 'email', 'emailVerified', 'id', 'lastSeenAt',
      'name', 'plan', 'signupMethod', 'subscriptionStatus', 'transactions',
    ]);
    expect(rows[0]).toMatchObject({ subscriptionStatus: null, bankLinks: 0, transactions: 0, signupMethod: 'google' });
  });

  it('attaches subscription status, bank links and transaction counts per user', async () => {
    const a = await user('a@x.com');
    const subs = ds.getRepository(Subscription);
    await subs.save(subs.create({ userId: a.id, stripeSubscriptionId: 's1', tier: 'pro', interval: 'month', status: 'active' }));
    const items = ds.getRepository(PlaidItem);
    await items.save(items.create({ userId: a.id, accessToken: 'x', itemId: 'i1', institutionId: 'i', institutionName: 'B' } as Partial<PlaidItem>));
    const tx = ds.getRepository(Transaction);
    await tx.save(tx.create({ userId: a.id, name: 't', amount: -5, date: '2026-10-01', source: 'manual' } as Partial<Transaction>));
    const { rows } = await service.users({});
    expect(rows[0]).toMatchObject({ email: 'a@x.com', subscriptionStatus: 'active', bankLinks: 1, transactions: 1, signupMethod: 'email' });
  });

  it('pages 50 at a time, newest first, and clamps bad page values', async () => {
    for (let i = 0; i < 55; i++) await user(`u${i}@x.com`, { createdAt: new Date(Date.UTC(2026, 0, 1, 0, i)) });
    const p1 = await service.users({ page: '1' });
    expect(p1).toMatchObject({ total: 55, page: 1, pageSize: ADMIN_PAGE_SIZE });
    expect(p1.rows).toHaveLength(50);
    expect(p1.rows[0].email).toBe('u54@x.com');
    expect((await service.users({ page: 2 })).rows).toHaveLength(5);
    for (const bad of ['0', '-3', 'abc', undefined]) expect((await service.users({ page: bad })).page).toBe(1);
    expect((await service.users({ page: '999' })).page).toBe(2); // clamps to last page
  });

  it('searches email and name case-insensitively', async () => {
    await user('Alice@x.com', { name: 'Alice' });
    await user('bob@x.com', { name: 'Robert Smith' });
    expect((await service.users({ search: 'ALICE' })).rows.map((r) => r.email)).toEqual(['Alice@x.com']);
    expect((await service.users({ search: 'smith' })).rows.map((r) => r.email)).toEqual(['bob@x.com']);
  });

  it('treats %, _ and \\ in search as literal characters', async () => {
    await user('a_b@x.com');
    await user('axb@x.com');
    await user('pct@x.com', { name: '100%' });
    expect((await service.users({ search: 'a_b' })).rows.map((r) => r.email)).toEqual(['a_b@x.com']);
    expect((await service.users({ search: '%' })).rows.map((r) => r.email)).toEqual(['pct@x.com']);
    expect((await service.users({ search: '\\' })).rows).toEqual([]);
  });
});
