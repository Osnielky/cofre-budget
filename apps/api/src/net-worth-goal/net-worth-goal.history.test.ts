import { describe, it, expect, beforeEach, vi } from 'vitest';
import { DataSource } from 'typeorm';
import { User } from '../users/user.entity';
import { Transaction } from '../transactions/transaction.entity';
import { Category } from '../categories/category.entity';
import { BankAccount } from '../bank-accounts/bank-account.entity';
import { Project } from '../projects/project.entity';
import { ProjectCategory } from '../projects/project-category.entity';
import { CategorizationRule } from '../categorization-rules/categorization-rule.entity';
import { NetWorthSnapshot } from './net-worth-snapshot.entity';
import { NetWorthGoalService } from './net-worth-goal.service';
import { toDateOnly } from './net-worth-goal.math';

let ds: DataSource;
let userA: User;
let userB: User;

async function makeDataSource() {
  const d = new DataSource({
    type: 'better-sqlite3', database: ':memory:', dropSchema: true,
    entities: [User, Transaction, Category, BankAccount, Project, ProjectCategory, CategorizationRule, NetWorthSnapshot],
    synchronize: true,
  });
  await d.initialize();
  return d;
}

/** Net worth = the stubbed account balance; debts stubbed empty. */
function makeService(balance: number) {
  const bankAccounts = { findAllByUser: vi.fn().mockResolvedValue([{ accountType: 'checking', balance: String(balance) }]) };
  const debts = { findAll: vi.fn().mockResolvedValue([]) };
  return new NetWorthGoalService(
    ds.getRepository(User),
    ds.getRepository(NetWorthSnapshot),
    ds.getRepository(Transaction),
    bankAccounts as any,
    debts as any,
  );
}

beforeEach(async () => {
  ds = await makeDataSource();
  const users = ds.getRepository(User);
  // If User has more required columns, add them here (see users/user.entity.ts).
  userA = await users.save(users.create({ email: 'a@example.com', name: 'A' }));
  userB = await users.save(users.create({ email: 'b@example.com', name: 'B' }));
});

describe('NetWorthGoalService snapshots', () => {
  it('records today when the goal is loaded, last write of the day wins', async () => {
    await makeService(100).get(userA.id);
    await makeService(250).get(userA.id);
    const rows = await ds.getRepository(NetWorthSnapshot).findBy({ userId: userA.id });
    expect(rows).toHaveLength(1);
    expect(rows[0].date).toBe(toDateOnly(new Date()));
    expect(Number(rows[0].value)).toBe(250);
  });

  it('survives two loads at the same moment', async () => {
    const svc = makeService(100);
    await Promise.all([svc.get(userA.id), svc.get(userA.id)]);
    expect(await ds.getRepository(NetWorthSnapshot).countBy({ userId: userA.id })).toBe(1);
  });

  it('still returns the goal when saving the snapshot fails', async () => {
    const svc = makeService(100);
    vi.spyOn(ds.getRepository(NetWorthSnapshot), 'upsert').mockRejectedValueOnce(new Error('db down'));
    await expect(svc.get(userA.id)).resolves.toMatchObject({ current: 100 });
  });

  it("returns only the caller's snapshots in history", async () => {
    const snaps = ds.getRepository(NetWorthSnapshot);
    await snaps.save(snaps.create({ userId: userB.id, date: '2026-01-01', value: '999999.00' }));
    await snaps.save(snaps.create({ userId: userA.id, date: '2026-01-01', value: '10.00' }));
    const out = await makeService(100).history(userA.id);
    expect(out.points.some((p) => p.value === 999999)).toBe(false);
    expect(out.points[0]).toEqual({ date: '2026-01-01', value: 10, estimated: false });
  });

  it('estimates from cash flow only, ignoring transfers', async () => {
    const cats = ds.getRepository(Category);
    const transfer = await cats.save(cats.create({ userId: userA.id, name: 'Transfer', icon: '🔁', color: '#999', type: 'transfer' }));
    const txs = ds.getRepository(Transaction);
    const base = { userId: userA.id, name: 'x', source: 'manual', pending: false, isSplitParent: false };
    await txs.save(txs.create({ ...base, amount: 1, date: '2020-01-10' }));       // earliest month
    await txs.save(txs.create({ ...base, amount: 40, date: '2020-03-10' }));      // cash flow
    await txs.save(txs.create({ ...base, amount: 5000, date: '2020-03-11', categoryRef: transfer })); // ignored
    const out = await makeService(100).history(userA.id);
    // End of Feb = end of Mar (100, no later activity) minus March's cash flow (+40 only).
    const feb = out.points.find((p) => p.date === '2020-02-29');
    expect(feb).toEqual({ date: '2020-02-29', value: 60, estimated: true });
  });
});
