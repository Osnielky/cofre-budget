import { describe, it, expect, beforeEach } from 'vitest';
import { DataSource } from 'typeorm';
import { PlaidItem } from './plaid-item.entity';
import { BankAccount } from '../bank-accounts/bank-account.entity';
import { Transaction } from '../transactions/transaction.entity';
import { TransactionTombstone } from '../transactions/transaction-tombstone.entity';
import { User } from '../users/user.entity';
import { Category } from '../categories/category.entity';
import { ProjectCategory } from '../projects/project-category.entity';
import { CategorizationRule } from '../categorization-rules/categorization-rule.entity';
import { PlaidService } from './plaid.service';
import { encryptToken, deriveKey } from '../common/token-crypto.util';

const SECRET = 'test-secret-at-least-this-long';

let ds: DataSource;
let shopping: Category;

beforeEach(async () => {
  ds = new DataSource({
    type: 'better-sqlite3', database: ':memory:', dropSchema: true,
    entities: [PlaidItem, BankAccount, Transaction, TransactionTombstone, User, Category, ProjectCategory, CategorizationRule],
    synchronize: true,
  });
  await ds.initialize();
  await ds.getRepository(User).save(ds.getRepository(User).create({ id: 'user-1', email: 'user-1@example.com' }));
  shopping = await ds.getRepository(Category).save(ds.getRepository(Category).create({ userId: 'user-1', name: 'Shopping', type: 'expense', icon: '🛍️', color: '#9B6DFF' }));
});

function plaidTx(id: string, date: string, amount: number, name: string, extra: Record<string, unknown> = {}) {
  return { transaction_id: id, account_id: 'plaid-card', date, amount, name, merchant_name: null, pending: false, category: [], pending_transaction_id: null, ...extra };
}

function makeService(page: { added?: unknown[]; modified?: unknown[]; removed?: unknown[] }, rules: { getActiveRules: () => Promise<unknown[]>; matchRule: (...a: unknown[]) => unknown } = { getActiveRules: async () => [], matchRule: () => null }) {
  const service = new PlaidService(
    { get: (k: string, d?: string) => ({ PLAID_ENV: 'sandbox', JWT_SECRET: SECRET } as Record<string, string>)[k] ?? d } as any,
    ds.getRepository(PlaidItem), ds.getRepository(BankAccount), ds.getRepository(Transaction), ds.getRepository(User),
    rules as any,
    { applyPlaidReport: async () => undefined } as any,
    ds.getRepository(TransactionTombstone),
  );
  (service as any).client = {
    transactionsSync: async () => ({ data: { added: page.added ?? [], modified: page.modified ?? [], removed: page.removed ?? [], next_cursor: 'cursor-after', has_more: false } }),
    accountsBalanceGet: async () => ({ data: { accounts: [] } }),
    liabilitiesGet: async () => ({ data: { accounts: [], liabilities: { credit: [], mortgage: null, student: null } } }),
  };
  return service;
}

async function seedItem() {
  const item = await ds.getRepository(PlaidItem).save(ds.getRepository(PlaidItem).create({
    userId: 'user-1', itemId: 'item-boa', institutionId: 'ins_boa', institutionName: 'Bank of America',
    accessToken: encryptToken('access-token', deriveKey(SECRET)), cursor: 'cursor-old',
  }));
  const account = await ds.getRepository(BankAccount).save(ds.getRepository(BankAccount).create({
    userId: 'user-1', bankName: 'Bank of America', accountName: 'Credit ••1372', accountType: 'credit',
    balance: 0, currency: 'USD', color: '#000', provider: 'plaid', plaidItemId: item.id, plaidAccountId: 'plaid-card',
  }));
  return { item, account };
}

/* Plaid never updates a pending charge into a posted one: the pending id goes to
   removed[] and the posted charge arrives in added[] under a new id that names
   the old one in pending_transaction_id. Whatever the user did to the pending
   row must survive that hand-over. */
describe('pending → posted hand-over', () => {
  it('keeps the user\'s category, note and splits by re-keying the pending row in place', async () => {
    const { item, account } = await seedItem();
    const txRepo = ds.getRepository(Transaction);
    const pendingRow = await txRepo.save(txRepo.create({
      userId: 'user-1', bankAccountId: account.id, externalId: 'plaid-pending-1', source: 'plaid',
      amount: -36.43, name: 'AMAZON MKTPL*896KK9ZM3', date: '2026-10-29', pending: true,
      categoryId: shopping.id, note: 'birthday gift', isSplitParent: true,
    }));
    const child = await txRepo.save(txRepo.create({
      userId: 'user-1', bankAccountId: account.id, source: 'manual', amount: -36.43, name: 'AMAZON MKTPL*896KK9ZM3', date: '2026-10-29', pending: false, parentId: pendingRow.id,
    }));

    const service = makeService({
      added: [plaidTx('plaid-posted-1', '2026-10-30', 36.43, 'AMAZON MKTPL*896KK9ZM3 Amzn.com/billWA', { merchant_name: 'Amazon', pending_transaction_id: 'plaid-pending-1' })],
      removed: [{ transaction_id: 'plaid-pending-1' }],
    });
    await service.syncItem(item.id, 'user-1');

    const rows = await txRepo.find({ where: { isSplitParent: true } });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: pendingRow.id, externalId: 'plaid-posted-1', pending: false, date: '2026-10-30',
      name: 'AMAZON MKTPL*896KK9ZM3 Amzn.com/billWA', merchantName: 'Amazon',
      categoryId: shopping.id, note: 'birthday gift',
    });
    expect(Number(rows[0].amount)).toBe(-36.43);
    expect((await txRepo.findOneByOrFail({ id: child.id })).parentId).toBe(pendingRow.id);
    expect(await txRepo.count()).toBe(2);
    expect(await ds.getRepository(TransactionTombstone).count()).toBe(0);
  });

  it('still applies a rule when the pending row had no category and the posted name is richer', async () => {
    const { item, account } = await seedItem();
    const txRepo = ds.getRepository(Transaction);
    await txRepo.save(txRepo.create({
      userId: 'user-1', bankAccountId: account.id, externalId: 'plaid-pending-1', source: 'plaid',
      amount: -36.43, name: 'PENDING CARD PURCHASE', date: '2026-10-29', pending: true,
    }));
    const rules = ds.getRepository(CategorizationRule);
    const rule = await rules.save(rules.create({ userId: 'user-1', matchType: 'merchant', matchValue: 'Amazon', matchStrategy: 'exact', categoryId: shopping.id }));
    const service = makeService(
      { added: [plaidTx('plaid-posted-1', '2026-10-30', 36.43, 'AMAZON MKTPL', { merchant_name: 'Amazon', pending_transaction_id: 'plaid-pending-1' })], removed: [{ transaction_id: 'plaid-pending-1' }] },
      { getActiveRules: async () => [rule], matchRule: (_rules: unknown, tx: { merchantName?: string | null }) => (tx.merchantName === 'Amazon' ? rule : null) },
    );
    await service.syncItem(item.id, 'user-1');

    const rows = await txRepo.find();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ externalId: 'plaid-posted-1', categoryId: shopping.id, categorizedByRuleId: rule.id });
  });

  it('inserts normally when the pending row was never stored', async () => {
    const { item } = await seedItem();
    const service = makeService({
      added: [plaidTx('plaid-posted-1', '2026-10-30', 36.43, 'AMAZON MKTPL', { pending_transaction_id: 'plaid-pending-never-seen' })],
      removed: [{ transaction_id: 'plaid-pending-never-seen' }],
    });
    await service.syncItem(item.id, 'user-1');
    const rows = await ds.getRepository(Transaction).find();
    expect(rows.map((r) => [r.externalId, r.pending])).toEqual([['plaid-posted-1', false]]);
  });

  it('leaves both rows alone when the posted id already exists (an earlier sync stored it)', async () => {
    const { item, account } = await seedItem();
    const txRepo = ds.getRepository(Transaction);
    await txRepo.save(txRepo.create({ userId: 'user-1', bankAccountId: account.id, externalId: 'plaid-pending-1', source: 'plaid', amount: -36.43, name: 'AMAZON', date: '2026-10-29', pending: true, categoryId: shopping.id }));
    await txRepo.save(txRepo.create({ userId: 'user-1', bankAccountId: account.id, externalId: 'plaid-posted-1', source: 'plaid', amount: -36.43, name: 'AMAZON', date: '2026-10-30', pending: false }));
    const service = makeService({
      added: [plaidTx('plaid-posted-1', '2026-10-30', 36.43, 'AMAZON', { pending_transaction_id: 'plaid-pending-1' })],
      removed: [{ transaction_id: 'plaid-pending-1' }],
    });
    await service.syncItem(item.id, 'user-1');
    const rows = await txRepo.find();
    expect(rows.map((r) => r.externalId)).toEqual(['plaid-posted-1']);
  });
});
