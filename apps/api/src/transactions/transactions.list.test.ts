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
import { clampListLimit, DEFAULT_LIST_LIMIT, MAX_LIST_LIMIT } from './list-limit';

let USER_ID = '';

let ds: DataSource;
let service: TransactionsService;

beforeEach(async () => {
  ds = new DataSource({
    type: 'better-sqlite3', database: ':memory:', dropSchema: true,
    entities: [User, Transaction, Category, BankAccount, Project, ProjectCategory, CategorizationRule],
    synchronize: true,
  });
  await ds.initialize();
  // Accounts and categories carry a real foreign key to users.
  const users = ds.getRepository(User);
  USER_ID = (await users.save(users.create({ email: 'list@test.cofre', name: 'List', plan: 'pro' } as Partial<User>))).id;
  service = new TransactionsService(
    ds.getRepository(Transaction), ds.getRepository(BankAccount), ds.getRepository(ProjectCategory),
    ds.getRepository(Project), { removePaymentByTransaction: vi.fn() } as any, {} as any, ds.getRepository(Category),
  );
});

describe('TransactionsService.findByUser (list payload)', () => {
  it('returns slim joined objects: the fields the UI reads, not the whole account row', async () => {
    const accounts = ds.getRepository(BankAccount);
    const acc = await accounts.save(accounts.create({
      userId: USER_ID, bankName: 'Chase', accountName: 'Checking', accountType: 'checking',
      balance: 1234.56, color: '#123456', provider: 'plaid', plaidAccountId: 'plaid-acc-1',
    } as Partial<BankAccount>));
    const cats = ds.getRepository(Category);
    const cat = await cats.save(cats.create({ userId: USER_ID, name: 'Groceries', icon: '🛒', color: '#0f0', type: 'expense', isFixed: false, wantNeed: 'need' } as Partial<Category>));
    const txs = ds.getRepository(Transaction);
    await txs.save(txs.create({
      userId: USER_ID, bankAccountId: acc.id, categoryId: cat.id, name: 'Whole Foods', amount: -42,
      date: '2026-11-03', source: 'plaid', pending: false, isSplitParent: false,
    }));

    const [row] = await service.findByUser(USER_ID, undefined, '2026-11-01', '2026-11-30');
    expect(row.name).toBe('Whole Foods');
    expect(row.amount).toBe(-42);
    expect(row.bankAccount).toMatchObject({ id: acc.id, bankName: 'Chase', accountName: 'Checking', accountType: 'checking', color: '#123456' });
    expect(row.bankAccount).not.toHaveProperty('plaidAccountId');
    expect(row.bankAccount).not.toHaveProperty('balance');
    expect(row.categoryRef).toMatchObject({ id: cat.id, name: 'Groceries', icon: '🛒', color: '#0f0', type: 'expense', isFixed: false, wantNeed: 'need' });
    expect(row.categoryRef).not.toHaveProperty('description');
  });

  it('keeps the limit and the date filter', async () => {
    const txs = ds.getRepository(Transaction);
    for (let d = 1; d <= 5; d++) {
      await txs.save(txs.create({ userId: USER_ID, name: `t${d}`, amount: -1, date: `2026-11-0${d}`, source: 'manual', pending: false, isSplitParent: false }));
    }
    expect((await service.findByUser(USER_ID, undefined, '2026-11-02', '2026-11-04')).map((t) => t.name)).toEqual(['t4', 't3', 't2']);
    expect(await service.findByUser(USER_ID, undefined, undefined, undefined, 2)).toHaveLength(2);
  });
});

describe('clampListLimit', () => {
  it('defaults when missing or malformed', () => {
    expect(clampListLimit(undefined)).toBe(DEFAULT_LIST_LIMIT);
    expect(clampListLimit('')).toBe(DEFAULT_LIST_LIMIT);
    expect(clampListLimit('abc')).toBe(DEFAULT_LIST_LIMIT);
    expect(clampListLimit('0')).toBe(DEFAULT_LIST_LIMIT);
    expect(clampListLimit('-5')).toBe(DEFAULT_LIST_LIMIT);
  });
  it('passes a sane value through and caps the rest', () => {
    expect(clampListLimit('5000')).toBe(5000);
    expect(clampListLimit('20000')).toBe(MAX_LIST_LIMIT); // what Reports asks for: never truncated
    expect(clampListLimit('999999')).toBe(MAX_LIST_LIMIT);
  });
});
