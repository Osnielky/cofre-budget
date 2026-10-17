import { describe, it, expect, beforeEach } from 'vitest';
import { DataSource } from 'typeorm';
import { User } from '../users/user.entity';
import { BankAccount } from '../bank-accounts/bank-account.entity';
import { PlaidItem } from '../plaid/plaid-item.entity';
import { Transaction } from '../transactions/transaction.entity';
import { Category } from '../categories/category.entity';
import { ProjectCategory } from '../projects/project-category.entity';
import { CategorizationRule } from '../categorization-rules/categorization-rule.entity';
import { CreditCardDetail } from './credit-card-detail.entity';
import { CardProfile } from './card-profile.entity';
import { CreditCardsService } from './credit-cards.service';

async function makeDataSource() {
  const ds = new DataSource({
    type: 'better-sqlite3', database: ':memory:', dropSchema: true,
    entities: [User, BankAccount, PlaidItem, Transaction, Category, ProjectCategory, CategorizationRule, CreditCardDetail, CardProfile],
    synchronize: true,
  });
  await ds.initialize();
  return ds;
}

const NOW = new Date('2026-10-16T12:00:00Z');

describe('CreditCardsService.listDebitForUser', () => {
  let ds: DataSource;
  let service: CreditCardsService;
  let checking: BankAccount;

  beforeEach(async () => {
    ds = await makeDataSource();
    const users = ds.getRepository(User);
    await users.save(users.create({ id: 'u1', email: 'u1@example.com' }));
    await users.save(users.create({ id: 'u2', email: 'u2@example.com' }));
    const accounts = ds.getRepository(BankAccount);
    checking = await accounts.save(accounts.create({ userId: 'u1', bankName: 'Chase', accountName: 'Total Checking', accountType: 'checking', balance: 2400.5, last4: '7682' }));
    await accounts.save(accounts.create({ userId: 'u1', bankName: 'Chase', accountName: 'Savings', accountType: 'savings', balance: 900 }));
    await accounts.save(accounts.create({ userId: 'u1', bankName: 'BofA', accountName: 'RED BOA', accountType: 'credit', balance: 630 }));
    await accounts.save(accounts.create({ userId: 'u2', bankName: 'Wells', accountName: 'Everyday Checking', accountType: 'checking', balance: 50 }));

    const cats = ds.getRepository(Category);
    const food = await cats.save(cats.create({ userId: 'u1', name: 'Food', icon: '🍔', color: '#F07A3E', type: 'expense' }));
    const transfer = await cats.save(cats.create({ userId: 'u1', name: 'Transfer', icon: '🔁', color: '#999', type: 'transfer' }));
    const savings = await cats.save(cats.create({ userId: 'u1', name: 'Investments', icon: '📈', color: '#4FBF7F', type: 'savings' }));

    const tx = ds.getRepository(Transaction);
    const add = (o: Partial<Transaction>) => tx.save(tx.create({ userId: 'u1', bankAccountId: checking.id, name: 'x', ...o }));
    await add({ name: 'Publix', amount: -80.25, date: '2026-10-03', categoryId: food.id });
    await add({ name: 'Uncategorized buy', amount: -19.75, date: '2026-10-10' });
    await add({ name: 'Paycheck', amount: 2000, date: '2026-10-01' });
    await add({ name: 'To savings', amount: -500, date: '2026-10-04', categoryId: transfer.id });
    await add({ name: 'Brokerage', amount: -300, date: '2026-10-05', categoryId: savings.id });
    await add({ name: 'Last month', amount: -60, date: '2026-09-30', categoryId: food.id });
  });

  function makeService() {
    return new CreditCardsService(
      ds.getRepository(CreditCardDetail), ds.getRepository(CardProfile), ds.getRepository(BankAccount), ds.getRepository(PlaidItem),
      ds.getRepository(Transaction),
    );
  }

  it("lists the user's checking accounts with this month's spending", async () => {
    expect(await makeService().listDebitForUser('u1', NOW)).toEqual([{
      accountId: checking.id, bankName: 'Chase', accountName: 'Total Checking', last4: '7682',
      balance: 2400.5, spentThisMonth: 100, provider: 'manual', plaidItemStatus: null,
    }]);
  });

  it('a checking account with no spending reports 0', async () => {
    const [view] = await makeService().listDebitForUser('u2', NOW);
    expect(view).toMatchObject({ accountName: 'Everyday Checking', spentThisMonth: 0 });
  });

  it('a user with no checking accounts gets an empty list', async () => {
    await ds.getRepository(BankAccount).delete({ userId: 'u2' });
    expect(await makeService().listDebitForUser('u2', NOW)).toEqual([]);
  });
});
