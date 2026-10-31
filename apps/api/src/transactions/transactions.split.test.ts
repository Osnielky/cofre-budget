import { describe, it, expect, beforeEach } from 'vitest';
import { DataSource } from 'typeorm';
import { User } from '../users/user.entity';
import { Transaction } from './transaction.entity';
import { Category } from '../categories/category.entity';
import { BankAccount } from '../bank-accounts/bank-account.entity';
import { Project } from '../projects/project.entity';
import { ProjectCategory } from '../projects/project-category.entity';
import { CategorizationRule } from '../categorization-rules/categorization-rule.entity';
import { TransactionsService } from './transactions.service';

let ds: DataSource;
let service: TransactionsService;

beforeEach(async () => {
  ds = new DataSource({
    type: 'better-sqlite3', database: ':memory:', dropSchema: true,
    entities: [User, Transaction, Category, BankAccount, Project, ProjectCategory, CategorizationRule],
    synchronize: true,
  });
  await ds.initialize();
  await ds.getRepository(User).save({ id: 'u1', email: 'u1@example.com' } as User);
  service = new TransactionsService(
    ds.getRepository(Transaction), ds.getRepository(BankAccount), ds.getRepository(ProjectCategory),
    ds.getRepository(Project), {} as any, {} as any, ds.getRepository(Category),
  );
});

describe('split: trading account attribution', () => {
  it('children without their own project inherit the account, the parent is nulled', async () => {
    const accounts = ds.getRepository(BankAccount);
    const acct = await accounts.save(accounts.create({ userId: 'u1', bankName: 'Topstep', accountName: '50K', accountType: 'investment', balance: 0 }));
    const project = await ds.getRepository(Project).save(ds.getRepository(Project).create({ userId: 'u1', name: 'Trading', type: 'trading' }));
    const txs = ds.getRepository(Transaction);
    const parent = await txs.save(txs.create({ userId: 'u1', name: 'TOPSTEP', amount: -100, date: '2026-10-01', projectId: project.id, tradingAccountId: acct.id }));

    const children = await service.split(parent.id, 'u1', [{ amount: 60 }, { amount: 40 }] as any);

    expect(children.map((c) => c.tradingAccountId)).toEqual([acct.id, acct.id]);
    expect(children.map((c) => c.projectId)).toEqual([project.id, project.id]);
    const reloaded = await txs.findOneByOrFail({ id: parent.id });
    expect(reloaded.tradingAccountId).toBeNull();
    expect(reloaded.projectId).toBeNull();
  });
});
