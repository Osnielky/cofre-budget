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
  function makeService(creditCards: any = {}, projects: any = {}, extra: { categories?: any; budgets?: any; netWorthGoal?: any; bankAccounts?: any } = {}) {
    return new AiReadToolsService(
      ds.getRepository(Transaction), {} as any, extra.categories ?? {}, extra.budgets ?? {}, extra.netWorthGoal ?? {}, extra.bankAccounts ?? {}, {} as any, creditCards, projects as any,
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

  it('exposes project and debt links, and keeps linked rows out of the uncategorized list', async () => {
    const pcats = ds.getRepository(ProjectCategory);
    const fees = await pcats.save(pcats.create({ userId: 'u1', projectType: 'trading', type: 'expense', name: 'Platform fees' }));
    const tx = ds.getRepository(Transaction);
    await tx.save(tx.create({ userId: 'u1', name: 'TOPSTEP', amount: -85, date: '2026-10-08', projectId: 'proj-1', projectCategoryId: fees.id }));
    await tx.save(tx.create({ userId: 'u1', name: 'Zelle from Osmany', amount: 1900, date: '2026-10-09', debtId: 'debt-1' }));

    const all = await makeService().getTransactions('u1', {});
    const byName = Object.fromEntries(all.map((r) => [r.name, r]));
    expect(byName.TOPSTEP).toMatchObject({ projectId: 'proj-1', projectCategory: 'Platform fees', categoryId: null, debtId: null });
    expect(byName['Zelle from Osmany']).toMatchObject({ debtId: 'debt-1', projectId: null });

    const uncat = await makeService().getTransactions('u1', { uncategorizedOnly: true });
    expect(uncat.map((r) => r.name).sort()).toEqual(['Cash gift', 'Chevron', 'Publix']);
  });

  it('lists projects with the categories they accept and flags closed ones', async () => {
    const findAllByUser = async () => [
      { id: 'p1', name: 'Trading', type: 'trading', icon: '📈', status: 'active', expenses: 340, income: 991, txCount: 5,
        categories: [{ id: 'c1', name: 'Platform fees', type: 'expense', description: null }] },
      { id: 'p2', name: 'Civic flip', type: 'vehicle', icon: '🚗', status: 'sold', expenses: 0, income: 0, txCount: 0, categories: [] },
    ];
    const rows = await makeService({}, { findAllByUser }).getProjects('u1');
    expect(rows[0]).toMatchObject({ id: 'p1', closed: false, categories: [{ id: 'c1', name: 'Platform fees' }] });
    expect(rows[1]).toMatchObject({ id: 'p2', closed: true });
  });

  it('keeps brokerage trades out unless asked, and tags them when included', async () => {
    const accounts = ds.getRepository(BankAccount);
    const schwab = await accounts.save(accounts.create({ userId: 'u1', bankName: 'Charles Schwab', accountName: 'Individual', accountType: 'investment', balance: 37799.53 }));
    const tx = ds.getRepository(Transaction);
    await tx.save(tx.create({ userId: 'u1', bankAccountId: schwab.id, name: 'BUY VTI', amount: -2401.2, date: '2026-10-12', plaidCategory: ['buy', 'buy'] }));
    await tx.save(tx.create({ userId: 'u1', bankAccountId: schwab.id, name: 'SOFI - SOLDTOOPEN', amount: 168.55, date: '2026-10-29', plaidCategory: ['sell', 'sell short'] }));
    await tx.save(tx.create({ userId: 'u1', bankAccountId: schwab.id, name: 'DIVIDEND VTI', amount: 45.5, date: '2026-10-15', plaidCategory: ['cash', 'dividend'] }));
    await tx.save(tx.create({ userId: 'u1', bankAccountId: schwab.id, name: 'TRANSFER FROM CHECKING', amount: 1000, date: '2026-10-01', plaidCategory: ['transfer', 'deposit'] }));

    const names = (rows: { name: string }[]) => rows.map((r) => r.name).sort();
    expect(names(await makeService().getTransactions('u1', { accountId: schwab.id })))
      .toEqual(['DIVIDEND VTI', 'TRANSFER FROM CHECKING']);
    const all = await makeService().getTransactions('u1', { accountId: schwab.id, includeTrades: true });
    expect(names(all)).toEqual(['BUY VTI', 'DIVIDEND VTI', 'SOFI - SOLDTOOPEN', 'TRANSFER FROM CHECKING']);
    const byName = Object.fromEntries(all.map((r) => [r.name, r as any]));
    expect(byName['BUY VTI'].trade).toBe('buy');
    expect(byName['SOFI - SOLDTOOPEN'].trade).toBe('sell (sell short)');
    expect(byName['DIVIDEND VTI'].trade).toBeUndefined();
    // Ordinary Plaid categories never look like a trade.
    expect(names(await makeService().getTransactions('u1', {}))).toContain('Chevron');
  });

  it('filters by account', async () => {
    const rows = await makeService().getTransactions('u1', { accountId: red.id });
    expect(rows.map((r) => r.name)).toEqual(['Publix']);
  });

  it("an account filter never reaches another user's transactions", async () => {
    expect(await makeService().getTransactions('u2', { accountId: grey.id })).toEqual([]);
  });

  describe('getSpendingSummary', () => {
    /** Adds the rows every grouping test shares: two categories, a transfer, savings, a debt
     *  payment, a trade and a tracking-account row — only the first two are spending. */
    async function seedSpending() {
      const cats = ds.getRepository(Category);
      const groceries = await cats.save(cats.create({ userId: 'u1', name: 'Groceries', type: 'expense', icon: '🛒', color: '#4FBF7F' }));
      const transfer = await cats.save(cats.create({ userId: 'u1', name: 'Internal Transfer', type: 'transfer', icon: '↔', color: '#999' }));
      const savings = await cats.save(cats.create({ userId: 'u1', name: 'Investments', type: 'savings', icon: '📈', color: '#9B6DFF' }));
      const accounts = ds.getRepository(BankAccount);
      const schwab = await accounts.save(accounts.create({ userId: 'u1', bankName: 'Schwab', accountName: 'Individual', accountType: 'investment', balance: 1 }));
      const tx = ds.getRepository(Transaction);
      await tx.update({ userId: 'u1', name: 'Publix' }, { categoryId: groceries.id, merchantName: 'Publix' });
      await tx.save(tx.create({ userId: 'u1', bankAccountId: red.id, name: 'PUBLIX #112', merchantName: 'Publix', amount: -22, date: '2026-10-20', categoryId: groceries.id }));
      await tx.save(tx.create({ userId: 'u1', bankAccountId: grey.id, name: 'Transfer to savings', amount: -500, date: '2026-10-10', categoryId: transfer.id }));
      await tx.save(tx.create({ userId: 'u1', bankAccountId: grey.id, name: 'Schwab deposit', amount: -300, date: '2026-10-11', categoryId: savings.id }));
      await tx.save(tx.create({ userId: 'u1', bankAccountId: grey.id, name: 'Zelle to Osmany', amount: -200, date: '2026-10-12', debtId: 'debt-1' }));
      await tx.save(tx.create({ userId: 'u1', bankAccountId: schwab.id, name: 'BUY VTI', amount: -1000, date: '2026-10-13', plaidCategory: ['buy', 'buy'] }));
      await tx.save(tx.create({ userId: 'u1', bankAccountId: schwab.id, name: 'ADR fee', amount: -3, date: '2026-10-14' }));
      await tx.save(tx.create({ userId: 'u1', name: 'Rent', amount: -1200, date: '2026-09-01' }));
    }

    it('groups the period\'s spending by category, largest first, with only cash-flow rows', async () => {
      await seedSpending();
      const out = await makeService().getSpendingSummary('u1', { startDate: '2026-10-01', endDate: '2026-10-31', groupBy: 'category' });
      expect(out.groups).toEqual([
        { name: 'Groceries', total: 80, count: 2 },
        { name: 'Uncategorized', total: 40, count: 1 },
      ]);
      expect(out.total).toBe(120);
      expect(out.period).toEqual({ startDate: '2026-10-01', endDate: '2026-10-31' });
    });

    it('groups by merchant, falling back to the transaction name', async () => {
      await seedSpending();
      const out = await makeService().getSpendingSummary('u1', { startDate: '2026-10-01', endDate: '2026-10-31', groupBy: 'merchant' });
      expect(out.groups).toEqual([
        { name: 'Publix', total: 80, count: 2 },
        { name: 'Chevron', total: 40, count: 1 },
      ]);
    });

    it('groups by month in calendar order', async () => {
      await seedSpending();
      const out = await makeService().getSpendingSummary('u1', { startDate: '2026-09-01', endDate: '2026-10-31', groupBy: 'month' });
      expect(out.groups).toEqual([
        { name: '2026-09', total: 1200, count: 1 },
        { name: '2026-10', total: 120, count: 3 },
      ]);
    });

    it('folds everything past the top 25 groups into Other', async () => {
      const tx = ds.getRepository(Transaction);
      for (let i = 0; i < 30; i++) {
        await tx.save(tx.create({ userId: 'u1', name: `Shop ${String(i).padStart(2, '0')}`, amount: -(100 - i), date: '2026-10-15' }));
      }
      const out = await makeService().getSpendingSummary('u1', { startDate: '2026-10-15', endDate: '2026-10-15', groupBy: 'merchant' });
      expect(out.groups).toHaveLength(26);
      expect(out.groups[0]).toEqual({ name: 'Shop 00', total: 100, count: 1 });
      expect(out.groups[25]).toEqual({ name: 'Other (5 more)', total: 71 + 72 + 73 + 74 + 75, count: 5 });
    });

    it('never counts another user\'s rows', async () => {
      const out = await makeService().getSpendingSummary('u2', { startDate: '2026-10-01', endDate: '2026-10-31', groupBy: 'category' });
      expect(out).toMatchObject({ total: 0, groups: [] });
    });
  });

  describe('getSnapshot', () => {
    it('gathers the accounts, goal, month totals and category names for the prompt', async () => {
      const cats = ds.getRepository(Category);
      const groceries = await cats.save(cats.create({ userId: 'u1', name: 'Groceries', type: 'expense', icon: '🛒', color: '#4FBF7F' }));
      const salary = await cats.save(cats.create({ userId: 'u1', name: 'Salary', type: 'income', icon: '💼', color: '#4BA8D8' }));
      const service = makeService({}, {}, {
        categories: { findAllByUser: async () => [groceries, salary] },
        budgets: { findWithSpent: async (_u: string, month: string) => (month === '2026-10' ? [
          { amount: '300', spent: 98, category: { type: 'expense' }, projectCategoryId: null },
          { amount: '5000', spent: 0, category: { type: 'income' }, projectCategoryId: null },
          { amount: '900', spent: 10, category: null, projectCategoryId: 'pc1' },
        ] : []) },
        netWorthGoal: { get: async () => ({ target: 1_000_000, current: 2255.28, projectedDate: null }) },
        bankAccounts: { findAllByUser: async () => [grey, red] },
      });
      const snap = await service.getSnapshot('u1', '2026-10');
      expect(snap.accounts).toEqual([
        { name: 'GREY BOA', type: 'credit', balance: 1645.96 },
        { name: 'RED BOA', type: 'credit', balance: 630.32 },
      ]);
      expect(snap.netWorth).toEqual({ current: 2255.28, target: 1_000_000, projectedDate: null });
      expect(snap.month).toEqual({ key: '2026-10', income: 20, spending: 98, budgeted: 300, budgetSpent: 98 });
      expect(snap.categories).toEqual([{ name: 'Groceries', type: 'expense' }, { name: 'Salary', type: 'income' }]);
      expect(snap.focusMonth).toBe('2026-10');
    });

    it('still answers when the goal lookup fails', async () => {
      const service = makeService({}, {}, {
        categories: { findAllByUser: async () => [] },
        budgets: { findWithSpent: async () => [] },
        netWorthGoal: { get: async () => { throw new Error('no snapshot table'); } },
        bankAccounts: { findAllByUser: async () => [] },
      });
      const snap = await service.getSnapshot('u1', null);
      expect(snap.netWorth).toBeNull();
      expect(snap.month?.income).toBe(0);
    });
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
