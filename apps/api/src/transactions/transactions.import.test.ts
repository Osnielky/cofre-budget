import { describe, it, expect, beforeEach, vi } from 'vitest';
import { DataSource } from 'typeorm';
import { User } from '../users/user.entity';
import { Transaction } from './transaction.entity';
import { Category } from '../categories/category.entity';
import { BankAccount } from '../bank-accounts/bank-account.entity';
import { Project } from '../projects/project.entity';
import { ProjectCategory } from '../projects/project-category.entity';
import { CategorizationRule } from '../categorization-rules/categorization-rule.entity';
import { TransactionsService } from './transactions.service';
import type { CsvRow } from './transactions.service';

let USER_ID = '';

async function makeDataSource() {
  const ds = new DataSource({
    type: 'better-sqlite3', database: ':memory:', dropSchema: true,
    entities: [User, Transaction, Category, BankAccount, Project, ProjectCategory, CategorizationRule],
    synchronize: true,
  });
  await ds.initialize();
  return ds;
}

function makeService(ds: DataSource) {
  const rules = { getActiveRules: vi.fn(async () => []), matchRule: vi.fn(() => null) };
  return new TransactionsService(
    ds.getRepository(Transaction),
    ds.getRepository(BankAccount),
    ds.getRepository(ProjectCategory),
    ds.getRepository(Project),
    {} as any,
    rules as any,
  );
}

let ds: DataSource;
let service: TransactionsService;
let cardA: BankAccount;
let cardB: BankAccount;
let OTHER_USER_ID = '';

beforeEach(async () => {
  ds = await makeDataSource();
  service = makeService(ds);
  const users = ds.getRepository(User);
  USER_ID = (await users.save(users.create({ email: 'a@example.com' }))).id;
  const other = await users.save(users.create({ email: 'b@example.com' }));
  OTHER_USER_ID = other.id;
  const accounts = ds.getRepository(BankAccount);
  cardA = await accounts.save(accounts.create({ userId: USER_ID, bankName: 'Bank of America', accountName: 'Credit ••1372', accountType: 'credit', color: '#000', currency: 'USD', balance: 0 }));
  cardB = await accounts.save(accounts.create({ userId: USER_ID, bankName: 'Bank of America', accountName: 'RED-BOM', accountType: 'credit', color: '#000', currency: 'USD', balance: 0 }));
});

async function seed(extra: Partial<Transaction>) {
  const repo = ds.getRepository(Transaction);
  return repo.save(repo.create({
    userId: USER_ID, name: 'PUBLIX', amount: -34.35, date: '2026-09-23',
    source: 'csv', pending: false, isSplitParent: false, ...extra,
  }));
}

const row = (ref: string, over: Partial<CsvRow> = {}): CsvRow =>
  ({ date: '2026-09-23', referenceNumber: ref, name: 'PUBLIX', amount: -34.35, ...over });

/* The preview must answer the same question the import does: "will this row be
   saved?" — otherwise a row can show as "new" forever while every import skips it. */
describe('checkDuplicates mirrors importCsv', () => {
  it('counts a row already in THIS account as a duplicate', async () => {
    await seed({ bankAccountId: cardA.id, externalId: 'csv_R1' });
    const check = await service.checkDuplicates(USER_ID, cardA.id, [row('R1'), row('R2', { amount: -1.1 })]);
    expect(check.newCount).toBe(1);
    expect(check.duplicateExternalIds).toEqual(['csv_R1']);
  });

  it('counts a row already imported into ANOTHER of the user\'s accounts as a duplicate', async () => {
    await seed({ bankAccountId: cardB.id, externalId: 'csv_R1' });
    const rows = [row('R1'), row('R2', { amount: -1.1 })];

    const check = await service.checkDuplicates(USER_ID, cardA.id, rows);
    const result = await service.importCsv(USER_ID, cardA.id, rows);

    expect(result).toMatchObject({ imported: 1, skipped: 1 });
    expect(check.newCount).toBe(result.imported);
    expect(check.duplicateCount).toBe(result.skipped);
    expect(check.elsewhereCount).toBe(1);
    expect(check.elsewhereAccounts).toEqual(['Bank of America — RED-BOM']);
  });

  it('counts a row orphaned by a deleted account as a duplicate', async () => {
    await seed({ bankAccountId: null as any, externalId: 'csv_R1' });
    const rows = [row('R1')];

    const check = await service.checkDuplicates(USER_ID, cardA.id, rows);
    const result = await service.importCsv(USER_ID, cardA.id, rows);

    expect(result).toMatchObject({ imported: 0, skipped: 1 });
    expect(check.newCount).toBe(0);
    expect(check.elsewhereCount).toBe(1);
    expect(check.elsewhereAccounts).toEqual(['a deleted account']);
  });

  it('counts a same-key row of another source (plaid) in this account as a duplicate', async () => {
    await seed({ bankAccountId: cardA.id, externalId: 'csv_R1', source: 'plaid' });
    const check = await service.checkDuplicates(USER_ID, cardA.id, [row('R1')]);
    const result = await service.importCsv(USER_ID, cardA.id, [row('R1')]);
    expect(result.imported).toBe(0);
    expect(check.newCount).toBe(0);
    expect(check.elsewhereCount).toBe(0);
  });

  it("ignores another user's transaction with the same key", async () => {
    await seed({ userId: OTHER_USER_ID, bankAccountId: null as any, externalId: 'csv_R1' });
    const check = await service.checkDuplicates(USER_ID, cardA.id, [row('R1')]);
    expect(check.newCount).toBe(1);
  });

  it('still matches by fields when the stored row has no externalId', async () => {
    await seed({ bankAccountId: cardA.id, externalId: null as any });
    const check = await service.checkDuplicates(USER_ID, cardA.id, [row('R9')]);
    expect(check.newCount).toBe(0);
    expect(check.duplicateExternalIds).toEqual(['csv_2026-09-23|PUBLIX|-34.35']);
  });

  it('importing twice reports everything as duplicates the second time', async () => {
    const rows = [row('R1'), row('R2', { amount: -1.1 }), row('R3', { amount: 758, name: 'PAYMENT' })];
    await service.importCsv(USER_ID, cardA.id, rows);
    const check = await service.checkDuplicates(USER_ID, cardA.id, rows);
    expect(check).toMatchObject({ newCount: 0, duplicateCount: 3, elsewhereCount: 0 });
  });
});
