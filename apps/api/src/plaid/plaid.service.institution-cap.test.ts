import { describe, it, expect, beforeEach } from 'vitest';
import { DataSource } from 'typeorm';
import { PlaidItem } from './plaid-item.entity';
import { BankAccount } from '../bank-accounts/bank-account.entity';
import { Transaction } from '../transactions/transaction.entity';
import { User } from '../users/user.entity';
import { Category } from '../categories/category.entity';
import { ProjectCategory } from '../projects/project-category.entity';
import { CategorizationRule } from '../categorization-rules/categorization-rule.entity';
import { PlaidService } from './plaid.service';

async function makeDataSource() {
  const ds = new DataSource({
    type: 'better-sqlite3', database: ':memory:', dropSchema: true,
    // Transaction has @ManyToOne relations to Category, ProjectCategory, and
    // CategorizationRule — TypeORM requires every entity referenced by a relation
    // to be registered in the DataSource, even though this test never touches them.
    entities: [PlaidItem, BankAccount, Transaction, User, Category, ProjectCategory, CategorizationRule],
    synchronize: true,
  });
  await ds.initialize();
  return ds;
}

function fakeConfig(env: Record<string, string> = {}) {
  return { get: (key: string, fallback?: string) => env[key] ?? fallback } as any;
}

describe('PlaidService institution cap', () => {
  let ds: Awaited<ReturnType<typeof makeDataSource>>;

  beforeEach(async () => {
    ds = await makeDataSource();
    // PlaidItem.userId has a real FK to users; better-sqlite3 enforces it, so
    // seed the referenced User row (id chosen to match the literal 'user-1'
    // used throughout this file's test data).
    await ds.getRepository(User).save(
      ds.getRepository(User).create({ id: 'user-1', email: 'user-1@example.com' }),
    );
  });

  // Matches PlaidService's real constructor order: (config, itemRepo, accountRepo,
  // txRepo, userRepo, rulesService) — read plaid.service.ts:50-56 before touching this.
  function makeService(fakeClient: any) {
    const service = new PlaidService(
      fakeConfig({ PLAID_ENV: 'sandbox', JWT_SECRET: 'test-secret-at-least-this-long' }),
      ds.getRepository(PlaidItem),
      ds.getRepository(BankAccount),
      ds.getRepository(Transaction),
      ds.getRepository(User),
      { matchNewTransaction: async () => null } as any, // CategorizationRulesService stub
    );
    (service as any).client = fakeClient;
    return service;
  }

  it('rejects a 5th institution for a Pro user and releases the Plaid item', async () => {
    for (let i = 0; i < 4; i++) {
      await ds.getRepository(PlaidItem).save(ds.getRepository(PlaidItem).create({
        userId: 'user-1', itemId: `item-${i}`, institutionId: 'inst', institutionName: 'Bank',
        accessToken: 'enc',
      }));
    }
    const itemRemove = async () => ({});
    const service = makeService({
      itemPublicTokenExchange: async () => ({ data: { access_token: 'tok', item_id: 'item-new' } }),
      itemRemove,
    });

    await expect(
      service.previewExchange('user-1', 'public-token', 'inst', 'Bank', 'pro' as any),
    ).rejects.toThrow(/4 linked institutions/i);

    const count = await ds.getRepository(PlaidItem).count({ where: { userId: 'user-1' } });
    expect(count).toBe(4); // the 5th was never persisted
  });

  it('allows a 5th institution for an Elite user', async () => {
    for (let i = 0; i < 4; i++) {
      await ds.getRepository(PlaidItem).save(ds.getRepository(PlaidItem).create({
        userId: 'user-1', itemId: `item-${i}`, institutionId: 'inst', institutionName: 'Bank',
        accessToken: 'enc',
      }));
    }
    const service = makeService({
      itemPublicTokenExchange: async () => ({ data: { access_token: 'tok', item_id: 'item-new' } }),
      accountsBalanceGet: async () => ({ data: { accounts: [] } }),
    });

    await expect(
      service.previewExchange('user-1', 'public-token', 'inst', 'Bank', 'elite' as any),
    ).resolves.toBeDefined();
  });

  it('allows a Pro user below the cap', async () => {
    const service = makeService({
      itemPublicTokenExchange: async () => ({ data: { access_token: 'tok', item_id: 'item-new' } }),
      accountsBalanceGet: async () => ({ data: { accounts: [] } }),
    });

    await expect(
      service.previewExchange('user-1', 'public-token', 'inst', 'Bank', 'pro' as any),
    ).resolves.toBeDefined();
  });
});
