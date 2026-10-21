import { describe, it, expect, beforeEach } from 'vitest';
import { DataSource } from 'typeorm';
import { User } from '../users/user.entity';
import { BankAccount } from './bank-account.entity';
import { PlaidItem } from '../plaid/plaid-item.entity';
import { Transaction } from '../transactions/transaction.entity';
import { Category } from '../categories/category.entity';
import { ProjectCategory } from '../projects/project-category.entity';
import { CategorizationRule } from '../categorization-rules/categorization-rule.entity';
import { BankAccountsService, DEFAULT_CASH_ACCOUNT } from './bank-accounts.service';

const USER = 'user-1';
let ds: DataSource;
let service: BankAccountsService;

beforeEach(async () => {
  ds = new DataSource({
    type: 'better-sqlite3', database: ':memory:', dropSchema: true,
    entities: [User, BankAccount, PlaidItem, Transaction, Category, ProjectCategory, CategorizationRule],
    synchronize: true,
  });
  await ds.initialize();
  const users = ds.getRepository(User);
  await users.save([users.create({ id: USER, email: 'a@b.c', name: 'A' }), users.create({ id: 'user-2', email: 'b@b.c', name: 'B' })]);
  service = new BankAccountsService(ds.getRepository(BankAccount), ds.getRepository(Transaction), ds.getRepository(PlaidItem), {} as any);
});

describe('default cash account', () => {
  it('is created the first time a user lists their accounts', async () => {
    const list = await service.findAllByUser(USER);
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ accountName: DEFAULT_CASH_ACCOUNT.accountName, accountType: 'cash', provider: 'manual', txCount: 0 });
    expect(Number(list[0].balance)).toBe(0);
  });

  it('is created only once', async () => {
    await service.findAllByUser(USER);
    await service.findAllByUser(USER);
    expect(await ds.getRepository(BankAccount).countBy({ userId: USER })).toBe(1);
  });

  it('is not added for a user who already has an account', async () => {
    await service.create(USER, { bankName: 'Chase', accountName: 'Checking', accountType: 'checking', balance: 10 });
    const list = await service.findAllByUser(USER);
    expect(list.map((a) => a.accountType)).toEqual(['checking']);
  });

  it('stays deleted while the user keeps another account', async () => {
    const [cash] = await service.findAllByUser(USER);
    await service.create(USER, { bankName: 'Chase', accountName: 'Checking', accountType: 'checking', balance: 10 });
    await service.remove(cash.id, USER);
    expect((await service.findAllByUser(USER)).map((a) => a.accountType)).toEqual(['checking']);
  });

  it('belongs only to that user', async () => {
    await service.findAllByUser(USER);
    expect(await ds.getRepository(BankAccount).countBy({ userId: 'user-2' })).toBe(0);
  });
});
