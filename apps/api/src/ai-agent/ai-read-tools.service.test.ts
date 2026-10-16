import { describe, it, expect, beforeEach } from 'vitest';
import { DataSource } from 'typeorm';
import { User } from '../users/user.entity';
import { Transaction } from '../transactions/transaction.entity';
import { Category } from '../categories/category.entity';
import { BankAccount } from '../bank-accounts/bank-account.entity';
import { ProjectCategory } from '../projects/project-category.entity';
import { CategorizationRule } from '../categorization-rules/categorization-rule.entity';
import { AiReadToolsService } from './ai-read-tools.service';

async function makeDataSource() {
  const ds = new DataSource({
    type: 'better-sqlite3', database: ':memory:', dropSchema: true,
    // Transaction relates to BankAccount, Category, ProjectCategory and CategorizationRule;
    // TypeORM needs every related entity registered.
    entities: [User, Transaction, Category, BankAccount, ProjectCategory, CategorizationRule],
    synchronize: true,
  });
  await ds.initialize();
  return ds;
}

describe('AiReadToolsService', () => {
  let ds: DataSource;
  let grey: BankAccount;
  let red: BankAccount;

  // Real constructor order: (txRepo, transactions, categories, budgets, netWorthGoal,
  // bankAccounts, debts, creditCards). Only what each test touches is real.
  function makeService(creditCards: any = {}) {
    return new AiReadToolsService(
      ds.getRepository(Transaction), {} as any, {} as any, {} as any, {} as any, {} as any, {} as any, creditCards,
    );
  }

  beforeEach(async () => {
    ds = await makeDataSource();
    await ds.getRepository(User).save(ds.getRepository(User).create({ id: 'u1', email: 'u1@example.com' }));
    await ds.getRepository(User).save(ds.getRepository(User).create({ id: 'u2', email: 'u2@example.com' }));
    const accounts = ds.getRepository(BankAccount);
    grey = await accounts.save(accounts.create({ userId: 'u1', bankName: 'Bank of America', accountName: 'GREY BOA', accountType: 'credit', balance: 1645.96 }));
    red = await accounts.save(accounts.create({ userId: 'u1', bankName: 'Bank of America', accountName: 'RED BOA', accountType: 'credit', balance: 630.32 }));
    const tx = ds.getRepository(Transaction);
    await tx.save(tx.create({ userId: 'u1', bankAccountId: grey.id, name: 'Chevron', amount: -40, date: '2026-10-05' }));
    await tx.save(tx.create({ userId: 'u1', bankAccountId: red.id, name: 'Publix', amount: -58, date: '2026-10-06' }));
    await tx.save(tx.create({ userId: 'u1', name: 'Cash gift', amount: 20, date: '2026-10-07' }));
  });

  it('tags each transaction with its account', async () => {
    const rows = await makeService().getTransactions('u1', {});
    const byName = Object.fromEntries(rows.map((r) => [r.name, r]));
    expect(byName.Chevron).toMatchObject({ accountId: grey.id, account: 'GREY BOA' });
    expect(byName.Publix).toMatchObject({ accountId: red.id, account: 'RED BOA' });
    expect(byName['Cash gift']).toMatchObject({ accountId: null, account: null });
  });

  it('filters by account', async () => {
    const rows = await makeService().getTransactions('u1', { accountId: red.id });
    expect(rows.map((r) => r.name)).toEqual(['Publix']);
  });

  it("an account filter never reaches another user's transactions", async () => {
    expect(await makeService().getTransactions('u2', { accountId: grey.id })).toEqual([]);
  });

  it('get_credit_cards combines cards and the card profile', async () => {
    const service = makeService({
      listForUser: async (userId: string) => (userId === 'u1' ? [] : null),
      getProfile: async () => null,
    });
    expect(await service.getCreditCards('u1')).toEqual({
      cards: [], totals: { balance: 0, creditLimit: 0, utilizationPct: null }, profile: null,
    });
  });
});
