import { describe, it, expect, beforeEach } from 'vitest';
import { DataSource } from 'typeorm';
import { PlaidItem } from './plaid-item.entity';
import { BankAccount } from '../bank-accounts/bank-account.entity';
import { Transaction } from '../transactions/transaction.entity';
import { User } from '../users/user.entity';
import { Category } from '../categories/category.entity';
import { ProjectCategory } from '../projects/project-category.entity';
import { CategorizationRule } from '../categorization-rules/categorization-rule.entity';
import { CreditCardDetail } from '../cards/credit-card-detail.entity';
import { CardProfile } from '../cards/card-profile.entity';
import { CreditCardsService } from '../cards/credit-cards.service';
import { PlaidService } from './plaid.service';
import { deriveKey, encryptToken } from '../common/token-crypto.util';

const SECRET = 'test-secret-at-least-this-long';

async function makeDataSource() {
  const ds = new DataSource({
    type: 'better-sqlite3', database: ':memory:', dropSchema: true,
    entities: [PlaidItem, BankAccount, Transaction, User, Category, ProjectCategory, CategorizationRule, CreditCardDetail, CardProfile],
    synchronize: true,
  });
  await ds.initialize();
  return ds;
}

const plaidAccounts = [
  { account_id: 'p-card', type: 'credit', subtype: 'credit card', official_name: 'Venture Rewards', balances: { current: 900, limit: 5000 } },
  { account_id: 'p-chk', type: 'depository', subtype: 'checking', official_name: null, balances: { current: 100, limit: null } },
];
const creditLiab = {
  account_id: 'p-card',
  aprs: [{ apr_type: 'purchase_apr', apr_percentage: 26.99, balance_subject_to_apr: 900, interest_charge_amount: 20 }],
  is_overdue: false, last_payment_amount: 50, last_payment_date: '2026-09-30',
  last_statement_issue_date: '2026-10-03', last_statement_balance: 900,
  minimum_payment_amount: 30, next_payment_due_date: '2026-10-30',
};

function plaidError(code: string) {
  return Object.assign(new Error('plaid'), { response: { data: { error_code: code } } });
}

describe('PlaidService liabilities', () => {
  let ds: DataSource;
  let item: PlaidItem;

  beforeEach(async () => {
    ds = await makeDataSource();
    await ds.getRepository(User).save(ds.getRepository(User).create({ id: 'user-1', email: 'u@example.com' }));
    item = await ds.getRepository(PlaidItem).save(ds.getRepository(PlaidItem).create({
      userId: 'user-1', itemId: 'item-1', institutionId: 'ins', institutionName: 'Capital One',
      accessToken: encryptToken('access-tok', deriveKey(SECRET)),
    }));
    const accounts = ds.getRepository(BankAccount);
    await accounts.save(accounts.create({ userId: 'user-1', bankName: 'Capital One', accountName: 'Venture', accountType: 'credit', balance: 900, provider: 'plaid', plaidItemId: item.id, plaidAccountId: 'p-card' }));
    await accounts.save(accounts.create({ userId: 'user-1', bankName: 'Capital One', accountName: 'Checking', accountType: 'checking', balance: 100, provider: 'plaid', plaidItemId: item.id, plaidAccountId: 'p-chk' }));
  });

  // Real constructor order: (config, itemRepo, accountRepo, txRepo, userRepo, rulesService, creditCards).
  function makeService(client: any) {
    const creditCards = new CreditCardsService(
      ds.getRepository(CreditCardDetail), ds.getRepository(CardProfile), ds.getRepository(BankAccount), ds.getRepository(PlaidItem),
    );
    const service = new PlaidService(
      { get: (k: string, d?: string) => ({ PLAID_ENV: 'sandbox', JWT_SECRET: SECRET } as Record<string, string>)[k] ?? d } as any,
      ds.getRepository(PlaidItem), ds.getRepository(BankAccount), ds.getRepository(Transaction), ds.getRepository(User),
      { getActiveRules: async () => [], matchRule: () => null } as any,
      creditCards,
    );
    (service as any).client = client;
    return service;
  }

  const details = () => ds.getRepository(CreditCardDetail).find();

  it('stores Liabilities data for credit accounts only', async () => {
    const service = makeService({
      liabilitiesGet: async () => ({ data: { accounts: plaidAccounts, liabilities: { credit: [creditLiab], mortgage: null, student: null } } }),
    });
    await service.syncLiabilities(item, 'access-tok');
    const rows = await details();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ liabilitiesStatus: 'synced', officialName: 'Venture Rewards', nextPaymentDueDate: '2026-10-30' });
    expect(Number(rows[0].creditLimit)).toBe(5000);
    expect(rows[0].aprs?.[0]).toMatchObject({ type: 'purchase', percentage: 26.99 });
  });

  it('marks a credit account missing from the Liabilities response as unsupported', async () => {
    const service = makeService({
      liabilitiesGet: async () => ({ data: { accounts: plaidAccounts, liabilities: { credit: [], mortgage: null, student: null } } }),
    });
    await service.syncLiabilities(item, 'access-tok');
    const [row] = await details();
    expect(row.liabilitiesStatus).toBe('unsupported');
    expect(Number(row.creditLimit)).toBe(5000);
  });

  it('falls back to accountsGet when consent is missing', async () => {
    const service = makeService({
      liabilitiesGet: async () => { throw plaidError('ADDITIONAL_CONSENT_REQUIRED'); },
      accountsGet: async () => ({ data: { accounts: plaidAccounts } }),
    });
    await service.syncLiabilities(item, 'access-tok');
    const [row] = await details();
    expect(row.liabilitiesStatus).toBe('not_consented');
    expect(Number(row.creditLimit)).toBe(5000);
    expect(row.aprs).toBeNull();
  });

  it('never throws on a real Plaid failure and writes nothing', async () => {
    const service = makeService({ liabilitiesGet: async () => { throw plaidError('ITEM_LOGIN_REQUIRED'); } });
    await expect(service.syncLiabilities(item, 'access-tok')).resolves.toBeUndefined();
    expect(await details()).toHaveLength(0);
  });

  it('asks for Liabilities as an optional product on new links', async () => {
    let req: any;
    const service = makeService({
      userCreate: async () => ({ data: { user_id: 'plaid-user' } }),
      linkTokenCreate: async (r: any) => { req = r; return { data: { link_token: 'lt' } }; },
    });
    await service.createLinkToken('user-1');
    expect(req.products).toEqual(['transactions']);
    expect(req.optional_products).toEqual(['liabilities']);
  });

  it('builds an update-mode token that adds Liabilities consent', async () => {
    let req: any;
    const service = makeService({
      userCreate: async () => ({ data: { user_id: 'plaid-user' } }),
      linkTokenCreate: async (r: any) => { req = r; return { data: { link_token: 'lt-liab' } }; },
    });
    await expect(service.createLiabilitiesLinkToken('user-1', item.id)).resolves.toBe('lt-liab');
    expect(req.access_token).toBe('access-tok');
    expect(req.additional_consented_products).toEqual(['liabilities']);
    expect(req.products).toBeUndefined();
  });

  it("won't build a consent token for another user's item", async () => {
    const service = makeService({});
    await expect(service.createLiabilitiesLinkToken('someone-else', item.id)).rejects.toThrow(/not found/i);
  });
});
