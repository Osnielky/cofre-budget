import { describe, it, expect, beforeEach, vi } from 'vitest';
import { DataSource } from 'typeorm';
import { BadRequestException } from '@nestjs/common';
import { User } from '../users/user.entity';
import { Transaction } from './transaction.entity';
import { Category } from '../categories/category.entity';
import { BankAccount } from '../bank-accounts/bank-account.entity';
import { Project } from '../projects/project.entity';
import { ProjectCategory } from '../projects/project-category.entity';
import { CategorizationRule } from '../categorization-rules/categorization-rule.entity';
import { TransactionsService } from './transactions.service';

const USER_ID = 'user-1';

async function makeDataSource() {
  const ds = new DataSource({
    type: 'better-sqlite3', database: ':memory:', dropSchema: true,
    entities: [User, Transaction, Category, BankAccount, Project, ProjectCategory, CategorizationRule],
    synchronize: true,
  });
  await ds.initialize();
  return ds;
}

/** Only deleteManual is under test, so its two collaborator services are stubs. */
function makeService(ds: DataSource) {
  const debts = { removePaymentByTransaction: vi.fn() };
  return new TransactionsService(
    ds.getRepository(Transaction),
    ds.getRepository(BankAccount),
    ds.getRepository(ProjectCategory),
    ds.getRepository(Project),
    debts as any,
    {} as any,
  );
}

let ds: DataSource;
let service: TransactionsService;

beforeEach(async () => {
  ds = await makeDataSource();
  service = makeService(ds);
});

async function seed(source: string, extra: Partial<Transaction> = {}) {
  const repo = ds.getRepository(Transaction);
  return repo.save(repo.create({
    userId: USER_ID, name: 'Rent', amount: -1300, date: '2026-09-01',
    source, pending: false, isSplitParent: false, ...extra,
  }));
}

describe('TransactionsService.deleteManual', () => {
  it.each(['manual', 'recurring', 'csv'])('deletes a %s transaction', async (source) => {
    const tx = await seed(source);
    await service.deleteManual(tx.id, USER_ID);
    expect(await ds.getRepository(Transaction).countBy({ id: tx.id })).toBe(0);
  });

  it('refuses a plaid transaction, which the next sync would restore anyway', async () => {
    const tx = await seed('plaid');
    await expect(service.deleteManual(tx.id, USER_ID)).rejects.toBeInstanceOf(BadRequestException);
    expect(await ds.getRepository(Transaction).countBy({ id: tx.id })).toBe(1);
  });

  it('refuses a split parent until it is recombined', async () => {
    const tx = await seed('manual', { isSplitParent: true });
    await expect(service.deleteManual(tx.id, USER_ID)).rejects.toBeInstanceOf(BadRequestException);
    expect(await ds.getRepository(Transaction).countBy({ id: tx.id })).toBe(1);
  });

  it("refuses to delete another user's transaction", async () => {
    const tx = await seed('manual');
    await expect(service.deleteManual(tx.id, 'someone-else')).rejects.toThrow();
    expect(await ds.getRepository(Transaction).countBy({ id: tx.id })).toBe(1);
  });
});
