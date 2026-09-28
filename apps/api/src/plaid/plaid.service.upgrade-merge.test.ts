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

/**
 * A user on the free plan builds up manual accounts and CSV-imported
 * transactions, upgrades to Pro, then connects the same bank through Plaid.
 * Linking must keep everything they already have and must not double up the
 * days their own history and Plaid's overlap.
 */
const USER = '33333333-3333-4333-8333-333333333333';

let ds: DataSource;
let checking: BankAccount;
let cash: BankAccount;

function plaidTx(id: string, date: string, amount: number, name: string, account = 'plaid-chk') {
  // Plaid: positive amount = money out
  return { transaction_id: id, account_id: account, date, amount, name, merchant_name: null, pending: false, category: [] };
}

function makeService(sync: { added: unknown[]; removed?: unknown[] }) {
  const service = new PlaidService(
    { get: (k: string, d?: string) => ({ PLAID_ENV: 'sandbox', JWT_SECRET: 'test-secret-at-least-this-long' } as Record<string, string>)[k] ?? d } as any,
    ds.getRepository(PlaidItem),
    ds.getRepository(BankAccount),
    ds.getRepository(Transaction),
    ds.getRepository(User),
    { getActiveRules: async () => [], matchRule: () => null } as any,
  );
  const accounts = [
    { account_id: 'plaid-chk', name: 'TOTAL CHECKING', mask: '7682', subtype: 'checking', balances: { current: 4516.7, iso_currency_code: 'USD' } },
    { account_id: 'plaid-sav', name: 'SAVINGS', mask: '9001', subtype: 'savings', balances: { current: 800, iso_currency_code: 'USD' } },
  ];
  (service as any).client = {
    itemPublicTokenExchange: async () => ({ data: { access_token: 'access-tok', item_id: 'item-chase' } }),
    accountsBalanceGet: async () => ({ data: { accounts } }),
    transactionsSync: async () => ({ data: { added: sync.added, modified: [], removed: sync.removed ?? [], next_cursor: 'c1', has_more: false } }),
  };
  return service;
}

const txsOf = (accountId: string) =>
  ds.getRepository(Transaction).find({ where: { bankAccountId: accountId }, order: { date: 'ASC', name: 'ASC' } });

beforeEach(async () => {
  ds = new DataSource({
    type: 'better-sqlite3', database: ':memory:', dropSchema: true, synchronize: true,
    entities: [PlaidItem, BankAccount, Transaction, User, Category, ProjectCategory, CategorizationRule],
  });
  await ds.initialize();
  await ds.getRepository(User).save({ id: USER, email: 'upgrader@x.dev', plan: 'pro' });
  const accounts = ds.getRepository(BankAccount);
  checking = await accounts.save({ userId: USER, bankName: 'Chase', accountName: 'Chase Checking', accountType: 'checking', balance: 4400, last4: '7682', provider: 'manual' });
  cash = await accounts.save({ userId: USER, bankName: 'Personal', accountName: 'My Cash', accountType: 'cash', balance: 300, provider: 'manual' });

  const txs = ds.getRepository(Transaction);
  await txs.save([
    { userId: USER, bankAccountId: checking.id, source: 'csv', externalId: 'csv_1001', date: '2026-09-01', amount: -50, name: 'Coffee' },
    { userId: USER, bankAccountId: checking.id, source: 'manual', date: '2026-09-10', amount: -1300, name: 'Rent' },
    { userId: USER, bankAccountId: checking.id, source: 'csv', externalId: 'csv_1002', date: '2026-09-20', amount: -12.5, name: 'Lunch' },
    { userId: USER, bankAccountId: cash.id, source: 'manual', date: '2026-09-15', amount: -20, name: 'Tip' },
  ]);
});

async function connectAndMerge(service: PlaidService) {
  const preview = await service.previewExchange(USER, 'public-tok', 'ins_3', 'Chase', 'pro');
  const chk = preview.accounts.find((a) => a.plaidAccountId === 'plaid-chk')!;
  expect(chk.suggestedMatch).toMatchObject({ id: checking.id, lastTransactionDate: '2026-09-20' });
  await service.confirmExchange(USER, preview.plaidItemId, [
    { plaidAccountId: 'plaid-chk', action: 'merge', mergeIntoAccountId: checking.id, cutoverDate: chk.suggestedMatch!.lastTransactionDate! },
    { plaidAccountId: 'plaid-sav', action: 'new' },
  ]);
}

describe('free → Pro: connecting a bank the user already tracked by hand', () => {
  it('keeps the merged account, its manual and imported history, and every other account', async () => {
    await connectAndMerge(makeService({ added: [plaidTx('p-late', '2026-09-25', 40, 'Gas')] }));

    const merged = await ds.getRepository(BankAccount).findOneByOrFail({ id: checking.id });
    expect(merged).toMatchObject({ accountName: 'Chase Checking', provider: 'plaid', plaidAccountId: 'plaid-chk' });

    const names = (await txsOf(checking.id)).map((t) => t.name);
    expect(names).toEqual(expect.arrayContaining(['Coffee', 'Rent', 'Lunch', 'Gas']));
    expect(await txsOf(cash.id)).toHaveLength(1);
    expect(await ds.getRepository(BankAccount).findOneByOrFail({ id: cash.id })).toMatchObject({ provider: 'manual', balance: 300 });
  });

  it('adds the new Plaid-only account alongside, without touching manual ones', async () => {
    await connectAndMerge(makeService({ added: [] }));
    const all = await ds.getRepository(BankAccount).find({ where: { userId: USER } });
    expect(all).toHaveLength(3);
    expect(all.find((a) => a.plaidAccountId === 'plaid-sav')).toMatchObject({ accountName: 'SAVINGS', provider: 'plaid' });
  });

  it('skips Plaid history before the cutover and does not duplicate the overlap day', async () => {
    await connectAndMerge(makeService({
      added: [
        plaidTx('p-old', '2026-09-01', 50, 'STARBUCKS'),     // before cutover — already imported
        plaidTx('p-dup', '2026-09-20', 12.5, 'LUNCH SPOT'),  // cutover day, same amount as the imported Lunch
        plaidTx('p-new', '2026-09-20', 7, 'Parking'),        // cutover day, not in the user's history
      ],
    }));

    const txs = await txsOf(checking.id);
    expect(txs.map((t) => t.name).sort()).toEqual(['Coffee', 'Lunch', 'Parking', 'Rent']);
  });

  it('matches overlap one-to-one: two real identical charges on the cutover day both survive', async () => {
    await connectAndMerge(makeService({
      added: [
        plaidTx('p-a', '2026-09-20', 12.5, 'LUNCH SPOT'),
        plaidTx('p-b', '2026-09-20', 12.5, 'LUNCH SPOT'),
      ],
    }));
    const lunches = (await txsOf(checking.id)).filter((t) => t.date === '2026-09-20' && Number(t.amount) === -12.5);
    expect(lunches).toHaveLength(2); // the imported one + the second, genuinely separate charge
  });

  it('a later Plaid "removed" never deletes the user\'s own transactions', async () => {
    await connectAndMerge(makeService({ added: [plaidTx('p-late', '2026-09-25', 40, 'Gas')] }));
    const later = makeService({ added: [], removed: [{ transaction_id: 'p-late' }, { transaction_id: 'csv_1001' }] });
    await later.syncItem((await ds.getRepository(PlaidItem).findOneByOrFail({ itemId: 'item-chase' })).id, USER);

    expect((await txsOf(checking.id)).map((t) => t.name).sort()).toEqual(['Coffee', 'Lunch', 'Rent']);
  });
});
