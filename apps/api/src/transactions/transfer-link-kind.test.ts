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

const USER_ID = 'user-1';
const CHECKING = 'acc-checking';
const SCHWAB = 'acc-schwab';
const CARD = 'acc-card';

let ds: DataSource;
let service: TransactionsService;

beforeEach(async () => {
  ds = new DataSource({
    type: 'better-sqlite3', database: ':memory:', dropSchema: true,
    entities: [User, Transaction, Category, BankAccount, Project, ProjectCategory, CategorizationRule],
    synchronize: true,
  });
  await ds.initialize();
  const users = ds.getRepository(User);
  await users.save(users.create({ id: USER_ID, email: 'a@b.c', name: 'A', password: 'x' }));
  const accounts = ds.getRepository(BankAccount);
  for (const [id, bankName, accountType] of [[CHECKING, 'Chase', 'checking'], [SCHWAB, 'Charles Schwab', 'investment'], [CARD, 'Amex', 'credit']]) {
    await accounts.save(accounts.create({ id, userId: USER_ID, bankName, accountName: 'Main', accountType, balance: 1000, currency: 'USD', color: '#4BA8D8', provider: 'manual' }));
  }
  service = new TransactionsService(
    ds.getRepository(Transaction), ds.getRepository(BankAccount), ds.getRepository(ProjectCategory), ds.getRepository(Project),
    { removePaymentByTransaction: vi.fn() } as any, {} as any, ds.getRepository(Category),
  );
});

async function tx(bankAccountId: string, amount: number, extra: Partial<Transaction> = {}) {
  const repo = ds.getRepository(Transaction);
  return repo.save(repo.create({ userId: USER_ID, bankAccountId, name: 'Transfer', amount, date: '2026-10-05', source: 'manual', pending: false, isSplitParent: false, ...extra }));
}
async function category(name: string, type: string) {
  const repo = ds.getRepository(Category);
  return repo.save(repo.create({ userId: USER_ID, name, icon: 'x', color: '#000', type, isDefault: true }));
}
const catOf = async (id: string) => {
  const t = await ds.getRepository(Transaction).findOne({ where: { id }, relations: ['categoryRef'] });
  return t?.categoryRef?.name ?? null;
};
const balanceOf = async (id: string) => Number((await ds.getRepository(BankAccount).findOneByOrFail({ id })).balance);

describe('updateTransferAccount with a transfer kind', () => {
  it('savings: sending side gets Investments, receiving side Internal Transfer, link and balances as before', async () => {
    const investments = await category('Investments', 'savings');
    await category('Internal Transfer', 'transfer');
    const out = await tx(CHECKING, -1000, { categoryId: investments.id });
    const inn = await tx(SCHWAB, 1000);

    const result = await service.updateTransferAccount(out.id, USER_ID, SCHWAB, inn.id, 'savings');

    expect(await catOf(out.id)).toBe('Investments');
    expect(await catOf(inn.id)).toBe('Internal Transfer');
    const fresh = await ds.getRepository(Transaction).findOneByOrFail({ id: inn.id });
    expect(fresh.counterpartTxId).toBe(out.id);
    expect(fresh.transferAccountId).toBe(CHECKING);
    expect(await balanceOf(SCHWAB)).toBe(2000);
    expect(result.counterpart).toMatchObject({ id: inn.id, categoryId: expect.any(String) });
  });

  it('works the same when the link starts from the receiving side (no category is copied across)', async () => {
    await category('Investments', 'savings');
    const internal = await category('Internal Transfer', 'transfer');
    const out = await tx(CHECKING, -1000);
    const inn = await tx(SCHWAB, 1000, { categoryId: internal.id });

    await service.updateTransferAccount(inn.id, USER_ID, CHECKING, out.id, 'savings');

    expect(await catOf(out.id)).toBe('Investments');
    expect(await catOf(inn.id)).toBe('Internal Transfer');
  });

  it('investment income: the money arriving in checking is income, and the category is created if missing', async () => {
    await category('Internal Transfer', 'transfer');
    const out = await tx(SCHWAB, -500);
    const inn = await tx(CHECKING, 500);

    await service.updateTransferAccount(inn.id, USER_ID, SCHWAB, out.id, 'investment_income');

    expect(await catOf(inn.id)).toBe('Investment income');
    expect(await catOf(out.id)).toBe('Internal Transfer');
    const created = await ds.getRepository(Category).findOneByOrFail({ userId: USER_ID, name: 'Investment income' });
    expect(created.type).toBe('income');
  });

  it('capital return: money back from Schwab is a withdrawal of savings, not income', async () => {
    const out = await tx(SCHWAB, -300);
    const inn = await tx(CHECKING, 300);
    await service.updateTransferAccount(inn.id, USER_ID, SCHWAB, out.id, 'capital_return');
    expect(await catOf(inn.id)).toBe('Investments');
    expect(await catOf(out.id)).toBe('Internal Transfer');
  });

  it('infers the kind from the account types when none is given', async () => {
    const out = await tx(CHECKING, -200);
    const inn = await tx(CARD, 200);
    await service.updateTransferAccount(out.id, USER_ID, CARD, inn.id);
    expect(await catOf(out.id)).toBe('Credit Card Payment');
    expect(await catOf(inn.id)).toBe('Credit Card Payment');
  });

  it('rejects a kind the account pair does not allow', async () => {
    const out = await tx(CHECKING, -200);
    const inn = await tx(CARD, 200);
    await expect(service.updateTransferAccount(out.id, USER_ID, CARD, inn.id, 'investment_income')).rejects.toThrow();
  });

  it('linking to a bare account (no counterpart) leaves the category alone', async () => {
    const internal = await category('Internal Transfer', 'transfer');
    const out = await tx(CHECKING, -50, { categoryId: internal.id });
    await service.updateTransferAccount(out.id, USER_ID, SCHWAB, null);
    expect(await catOf(out.id)).toBe('Internal Transfer');
    expect(await balanceOf(SCHWAB)).toBe(1050);
  });
});
