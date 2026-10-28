import { describe, it, expect, beforeEach } from 'vitest';
import { DataSource } from 'typeorm';
import { NotFoundException } from '@nestjs/common';
import { PlaidItem } from './plaid-item.entity';
import { BankAccount } from '../bank-accounts/bank-account.entity';
import { Transaction } from '../transactions/transaction.entity';
import { TransactionTombstone } from '../transactions/transaction-tombstone.entity';
import { User } from '../users/user.entity';
import { Category } from '../categories/category.entity';
import { ProjectCategory } from '../projects/project-category.entity';
import { CategorizationRule } from '../categorization-rules/categorization-rule.entity';
import { PlaidService, MAX_REMOVALS_PER_SYNC } from './plaid.service';
import { encryptToken, deriveKey } from '../common/token-crypto.util';

const SECRET = 'test-secret-at-least-this-long';

let ds: DataSource;

beforeEach(async () => {
  ds = new DataSource({
    type: 'better-sqlite3', database: ':memory:', dropSchema: true,
    entities: [PlaidItem, BankAccount, Transaction, TransactionTombstone, User, Category, ProjectCategory, CategorizationRule],
    synchronize: true,
  });
  await ds.initialize();
  await ds.getRepository(User).save(ds.getRepository(User).create({ id: 'user-1', email: 'user-1@example.com' }));
  await ds.getRepository(User).save(ds.getRepository(User).create({ id: 'user-2', email: 'user-2@example.com' }));
});

function plaidTx(id: string, account: string, date: string, amount: number, name: string) {
  return { transaction_id: id, account_id: account, date, amount, name, merchant_name: null, pending: false, category: [] };
}

/** One sync page; `calls` records the cursor each /transactions/sync call was made with. */
function makeService(page: { added?: unknown[]; modified?: unknown[]; removed?: unknown[] }, calls: (string | undefined)[] = []) {
  const service = new PlaidService(
    { get: (k: string, d?: string) => ({ PLAID_ENV: 'sandbox', JWT_SECRET: SECRET } as Record<string, string>)[k] ?? d } as any,
    ds.getRepository(PlaidItem), ds.getRepository(BankAccount), ds.getRepository(Transaction), ds.getRepository(User),
    { getActiveRules: async () => [], matchRule: () => null } as any,
    { applyPlaidReport: async () => undefined } as any,
    ds.getRepository(TransactionTombstone),
  );
  (service as any).client = {
    transactionsSync: async ({ cursor }: { cursor?: string }) => {
      calls.push(cursor);
      return { data: { added: page.added ?? [], modified: page.modified ?? [], removed: page.removed ?? [], next_cursor: 'cursor-after', has_more: false } };
    },
    accountsBalanceGet: async () => ({ data: { accounts: [{ account_id: 'plaid-inv', balances: { current: 37799.53 } }] } }),
    liabilitiesGet: async () => ({ data: { accounts: [], liabilities: { credit: [], mortgage: null, student: null } } }),
  };
  return service;
}

async function seedItem(cursor: string | null = 'cursor-old') {
  const item = await ds.getRepository(PlaidItem).save(ds.getRepository(PlaidItem).create({
    userId: 'user-1', itemId: 'item-schwab', institutionId: 'ins_schwab', institutionName: 'Charles Schwab',
    accessToken: encryptToken('access-token', deriveKey(SECRET)), cursor,
  }));
  const account = await ds.getRepository(BankAccount).save(ds.getRepository(BankAccount).create({
    userId: 'user-1', bankName: 'Charles Schwab', accountName: 'Individual', accountType: 'investment',
    balance: 100, currency: 'USD', color: '#000', provider: 'plaid', plaidItemId: item.id, plaidAccountId: 'plaid-inv',
  }));
  return { item, account };
}

describe('Plaid removed[] keeps a tombstone', () => {
  it('copies the row (and a split parent\'s children) before deleting it', async () => {
    const { item, account } = await seedItem();
    const txRepo = ds.getRepository(Transaction);
    const parent = await txRepo.save(txRepo.create({
      userId: 'user-1', bankAccountId: account.id, externalId: 'plaid-tx-1', source: 'plaid',
      amount: -120, name: 'TRANSFER TO BROKERAGE', date: '2026-09-02', pending: false, isSplitParent: true, note: 'kept',
    }));
    const child = await txRepo.save(txRepo.create({
      userId: 'user-1', bankAccountId: account.id, source: 'manual', amount: -120, name: 'TRANSFER TO BROKERAGE', date: '2026-09-02', pending: false, parentId: parent.id,
    }));

    const service = makeService({ removed: [{ transaction_id: 'plaid-tx-1' }] });
    await service.syncItem(item.id, 'user-1');

    expect(await txRepo.count()).toBe(0);
    const stones = await ds.getRepository(TransactionTombstone).find({ order: { reason: 'ASC' } });
    expect(stones.map((s) => [s.reason, s.transactionId, s.externalId])).toEqual([
      ['plaid_removed', parent.id, 'plaid-tx-1'],
      ['plaid_removed_child', child.id, null],
    ]);
    expect(stones[0].payload).toMatchObject({ id: parent.id, name: 'TRANSFER TO BROKERAGE', note: 'kept', bankAccountId: account.id, isSplitParent: true });
    expect(stones[0].userId).toBe('user-1');
    expect(stones[0].bankAccountId).toBe(account.id);
  });

  it('never tombstones a user-entered row, since Plaid cannot reference one', async () => {
    const { item, account } = await seedItem();
    const txRepo = ds.getRepository(Transaction);
    await txRepo.save(txRepo.create({ userId: 'user-1', bankAccountId: account.id, externalId: 'plaid-tx-1', source: 'csv', amount: -5, name: 'x', date: '2026-09-02', pending: false }));
    const service = makeService({ removed: [{ transaction_id: 'plaid-tx-1' }] });
    await service.syncItem(item.id, 'user-1');
    expect(await txRepo.count()).toBe(1);
    expect(await ds.getRepository(TransactionTombstone).count()).toBe(0);
  });
});

describe('mass removal guard', () => {
  it('keeps every row when one sync asks to remove more than the limit, and says so', async () => {
    const { item, account } = await seedItem();
    const txRepo = ds.getRepository(Transaction);
    const n = MAX_REMOVALS_PER_SYNC + 1;
    for (let i = 0; i < n; i++) {
      await txRepo.save(txRepo.create({ userId: 'user-1', bankAccountId: account.id, externalId: `plaid-tx-${i}`, source: 'plaid', amount: -10, name: `ROW ${i}`, date: '2026-09-02', pending: false }));
    }
    const service = makeService({ removed: Array.from({ length: n }, (_, i) => ({ transaction_id: `plaid-tx-${i}` })) });

    const counts = await service.resyncItemFromScratch(item.id, 'user-1');

    expect(await txRepo.count()).toBe(n);
    expect(await ds.getRepository(TransactionTombstone).count()).toBe(0);
    expect(counts).toMatchObject({ removed: 0, removalsRefused: n });
  });

  it('still removes a normal handful', async () => {
    const { item, account } = await seedItem();
    const txRepo = ds.getRepository(Transaction);
    for (let i = 0; i < 3; i++) {
      await txRepo.save(txRepo.create({ userId: 'user-1', bankAccountId: account.id, externalId: `plaid-tx-${i}`, source: 'plaid', amount: -10, name: `ROW ${i}`, date: '2026-09-02', pending: false }));
    }
    const service = makeService({ removed: [{ transaction_id: 'plaid-tx-0' }, { transaction_id: 'plaid-tx-1' }] });
    const counts = await service.resyncItemFromScratch(item.id, 'user-1');
    expect(await txRepo.count()).toBe(1);
    expect(counts).toMatchObject({ removed: 2 });
    expect(counts.removalsRefused).toBeUndefined();
  });
});

describe('resyncItemFromScratch', () => {
  it('asks Plaid from the beginning, keeps existing rows, adds the missing ones and reports counts', async () => {
    const { item, account } = await seedItem('cursor-old');
    const txRepo = ds.getRepository(Transaction);
    await txRepo.save(txRepo.create({ userId: 'user-1', bankAccountId: account.id, externalId: 'plaid-tx-1', source: 'plaid', amount: -120, name: 'OLD NAME', date: '2026-09-02', pending: false, categoryId: null as any }));
    const calls: (string | undefined)[] = [];
    const service = makeService({ added: [
      plaidTx('plaid-tx-1', 'plaid-inv', '2026-09-02', 120, 'TRANSFER TO BROKERAGE'),
      plaidTx('plaid-tx-2', 'plaid-inv', '2026-10-01', -45.5, 'DIVIDEND'),
    ] }, calls);

    const counts = await service.resyncItemFromScratch(item.id, 'user-1');

    expect(calls).toEqual([undefined]);
    expect(counts).toEqual({ added: 1, modified: 1, removed: 0 });
    const rows = await txRepo.find({ order: { date: 'ASC' } });
    expect(rows.map((r) => [r.externalId, r.name, Number(r.amount)])).toEqual([
      ['plaid-tx-1', 'TRANSFER TO BROKERAGE', -120],
      ['plaid-tx-2', 'DIVIDEND', 45.5],
    ]);
    const after = await ds.getRepository(PlaidItem).findOneByOrFail({ id: item.id });
    expect(after.cursor).toBe('cursor-after');
    expect(Number((await ds.getRepository(BankAccount).findOneByOrFail({ id: account.id })).balance)).toBe(37799.53);
  });

  it('is scoped to the owner', async () => {
    const { item } = await seedItem();
    const service = makeService({});
    await expect(service.resyncItemFromScratch(item.id, 'user-2')).rejects.toBeInstanceOf(NotFoundException);
  });
});
