import { describe, it, expect, beforeEach } from 'vitest';
import { DataSource } from 'typeorm';
import { PlaidItem } from './plaid-item.entity';
import { BankAccount } from '../bank-accounts/bank-account.entity';
import { Transaction } from '../transactions/transaction.entity';
import { TransactionTombstone } from '../transactions/transaction-tombstone.entity';
import { User } from '../users/user.entity';
import { Category } from '../categories/category.entity';
import { ProjectCategory } from '../projects/project-category.entity';
import { CategorizationRule } from '../categorization-rules/categorization-rule.entity';
import { PlaidService } from './plaid.service';
import { encryptToken, deriveKey } from '../common/token-crypto.util';

const SECRET = 'test-secret-at-least-this-long';
let ds: DataSource;

beforeEach(async () => {
  ds = new DataSource({
    type: 'better-sqlite3', database: ':memory:', dropSchema: true,
    entities: [PlaidItem, BankAccount, Transaction, TransactionTombstone, User, Category, ProjectCategory, CategorizationRule],
    synchronize: true,
  });
  await ds.initialize();
  await ds.getRepository(User).save(ds.getRepository(User).create({ id: 'user-1', email: 'user-1@example.com' }));
});

const securities = [{ security_id: 'sec-vti', name: 'Vanguard Total Stock Market ETF', ticker_symbol: 'VTI' }];
function itx(id: string, over: Record<string, unknown> = {}) {
  return { investment_transaction_id: id, account_id: 'plaid-inv', security_id: 'sec-vti', date: '2026-10-12', name: `TX ${id}`, quantity: 1, amount: 100, price: 100, fees: null, type: 'buy', subtype: 'buy', ...over };
}

/** `pages` is what each /investments/transactions/get call answers; `calls` records every request. */
function makeService(opts: { pages?: any[]; error?: string; enabled?: boolean; calls?: any[] }) {
  const env: Record<string, string> = { PLAID_ENV: 'sandbox', JWT_SECRET: SECRET };
  if (opts.enabled !== false) env.PLAID_INVESTMENTS_ENABLED = 'true';
  const service = new PlaidService(
    { get: (k: string, d?: string) => env[k] ?? d } as any,
    ds.getRepository(PlaidItem), ds.getRepository(BankAccount), ds.getRepository(Transaction), ds.getRepository(User),
    { getActiveRules: async () => [], matchRule: () => null } as any,
    { applyPlaidReport: async () => undefined } as any,
    ds.getRepository(TransactionTombstone),
  );
  let call = 0;
  (service as any).client = {
    investmentsTransactionsGet: async (req: any) => {
      opts.calls?.push(req);
      if (opts.error) { const e: any = new Error(opts.error); e.response = { data: { error_code: opts.error } }; throw e; }
      const page = opts.pages![Math.min(call++, opts.pages!.length - 1)];
      return { data: { investment_transactions: page.txs, securities, total_investment_transactions: page.total ?? page.txs.length } };
    },
  };
  return service;
}

async function seed(opts: { investmentsStatus?: string | null; syncedThrough?: string | null; withInvestment?: boolean } = {}) {
  const item = await ds.getRepository(PlaidItem).save(ds.getRepository(PlaidItem).create({
    userId: 'user-1', itemId: 'item-schwab', institutionId: 'ins', institutionName: 'Charles Schwab',
    accessToken: encryptToken('tok', deriveKey(SECRET)), investmentsStatus: opts.investmentsStatus ?? null, investmentsSyncedThrough: opts.syncedThrough ?? null,
  }));
  const repo = ds.getRepository(BankAccount);
  await repo.save(repo.create({ userId: 'user-1', bankName: 'Charles Schwab', accountName: 'Checking', accountType: 'checking', balance: 1, currency: 'USD', color: '#000', provider: 'plaid', plaidItemId: item.id, plaidAccountId: 'plaid-chk' }));
  const inv = opts.withInvestment === false ? null : await repo.save(repo.create({ userId: 'user-1', bankName: 'Charles Schwab', accountName: 'Individual', accountType: 'investment', balance: 1, currency: 'USD', color: '#000', provider: 'plaid', plaidItemId: item.id, plaidAccountId: 'plaid-inv' }));
  return { item, inv };
}

describe('syncInvestments', () => {
  it('stores brokerage activity on the investment account and remembers how far it got', async () => {
    const { item, inv } = await seed();
    const calls: any[] = [];
    const service = makeService({ calls, pages: [{ txs: [
      itx('i-buy', { amount: 2401.2, quantity: 10, price: 240.12, name: 'BUY VTI' }),
      itx('i-div', { type: 'cash', subtype: 'dividend', amount: -45.5, quantity: 0, price: 0, name: 'DIVIDEND VTI', date: '2026-10-15' }),
    ] }] });

    await service.syncInvestments(item, 'tok');

    const rows = await ds.getRepository(Transaction).find({ order: { date: 'ASC' } });
    expect(rows.map((r) => [r.externalId, r.bankAccountId, Number(r.amount), r.name, r.source, r.note, r.plaidCategory])).toEqual([
      ['i-buy', inv!.id, -2401.2, 'BUY VTI', 'plaid', 'Buy · 10 × VTI @ $240.12', ['buy', 'buy']],
      ['i-div', inv!.id, 45.5, 'DIVIDEND VTI', 'plaid', 'Dividend · VTI', ['cash', 'dividend']],
    ]);
    expect(rows.map((r) => [r.symbol, r.securityName, r.quantity == null ? null : Number(r.quantity), r.price == null ? null : Number(r.price), r.fees])).toEqual([
      ['VTI', 'Vanguard Total Stock Market ETF', 10, 240.12, null],
      ['VTI', 'Vanguard Total Stock Market ETF', null, null, null],
    ]);
    const after = await ds.getRepository(PlaidItem).findOneByOrFail({ id: item.id });
    expect(after.investmentsStatus).toBe('synced');
    expect(after.investmentsSyncedThrough).toBe(new Date().toISOString().slice(0, 10));
    expect(calls[0].options.account_ids).toEqual(['plaid-inv']);
    expect(calls[0].start_date < calls[0].end_date).toBe(true);
  });

  it('updates a row it already holds instead of duplicating it, and keeps the user\'s note', async () => {
    const { item, inv } = await seed({ syncedThrough: '2026-10-20' });
    const txRepo = ds.getRepository(Transaction);
    await txRepo.save(txRepo.create({ userId: 'user-1', bankAccountId: inv!.id, externalId: 'i-buy', source: 'plaid', amount: -2401.2, name: 'BUY VTI', date: '2026-10-12', pending: false, note: 'my own note' }));
    const service = makeService({ pages: [{ txs: [itx('i-buy', { amount: 2401.85, name: 'BUY VTI (adjusted)' })] }] });

    await service.syncInvestments(item, 'tok');

    const rows = await txRepo.find();
    expect(rows).toHaveLength(1);
    expect([Number(rows[0].amount), rows[0].name, rows[0].note]).toEqual([-2401.85, 'BUY VTI (adjusted)', 'my own note']);
    // The structured columns are refreshed on update — this is how a re-download backfills rows synced before they existed.
    expect([rows[0].symbol, Number(rows[0].quantity), Number(rows[0].price)]).toEqual(['VTI', 1, 100]);
  });

  it('pulls the full window again when trades synced before the trade columns existed lack a symbol', async () => {
    const { item, inv } = await seed({ investmentsStatus: 'synced', syncedThrough: '2026-10-20' });
    const txRepo = ds.getRepository(Transaction);
    await txRepo.save(txRepo.create({ userId: 'user-1', bankAccountId: inv!.id, externalId: 'i-old', source: 'plaid', amount: -100, name: 'BUY', date: '2026-03-01', pending: false, plaidCategory: ['buy', 'buy'] }));
    const calls: any[] = [];
    await makeService({ calls, pages: [{ txs: [itx('i-old', { date: '2026-03-01', quantity: 1, price: 100 })] }] }).syncInvestments(item, 'tok');
    const twoYearsAgo = new Date(Date.now() - 730 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    expect(calls[0].start_date).toBe(twoYearsAgo);
    const after = await txRepo.findOneByOrFail({ externalId: 'i-old' });
    expect([after.symbol, Number(after.quantity)]).toEqual(['VTI', 1]);
    // Filled now, so the next sync is back to the short overlap window.
    await makeService({ calls, pages: [{ txs: [] }] }).syncInvestments(item, 'tok');
    expect(calls[1].start_date > twoYearsAgo).toBe(true);
  });

  it('a cancel entry removes the row it cancels, with a tombstone, and is not stored itself', async () => {
    const { item, inv } = await seed();
    const txRepo = ds.getRepository(Transaction);
    await txRepo.save(txRepo.create({ userId: 'user-1', bankAccountId: inv!.id, externalId: 'i-buy', source: 'plaid', amount: -100, name: 'BUY', date: '2026-10-12', pending: false }));
    const service = makeService({ pages: [{ txs: [itx('i-cancel', { cancel_transaction_id: 'i-buy', type: 'cancel', subtype: 'cancel' })] }] });

    await service.syncInvestments(item, 'tok');

    expect(await txRepo.count()).toBe(0);
    const stones = await ds.getRepository(TransactionTombstone).find();
    expect(stones.map((s) => [s.reason, s.externalId])).toEqual([['plaid_cancelled', 'i-buy']]);
  });

  it('pages through a long history', async () => {
    const { item } = await seed();
    const calls: any[] = [];
    const service = makeService({ calls, pages: [
      { txs: [itx('i-1'), itx('i-2')], total: 3 },
      { txs: [itx('i-3')], total: 3 },
    ] });
    await service.syncInvestments(item, 'tok');
    expect(calls.map((c) => c.options.offset)).toEqual([0, 2]);
    expect(await ds.getRepository(Transaction).count()).toBe(3);
  });

  it('records why Plaid declined and leaves the rows alone', async () => {
    for (const [code, status] of [['ADDITIONAL_CONSENT_REQUIRED', 'not_consented'], ['PRODUCT_NOT_READY', 'pending'], ['PRODUCTS_NOT_SUPPORTED', 'unsupported']] as const) {
      const { item } = await seed();
      await makeService({ error: code }).syncInvestments(item, 'tok');
      expect((await ds.getRepository(PlaidItem).findOneByOrFail({ id: item.id })).investmentsStatus).toBe(status);
      await ds.getRepository(PlaidItem).delete({ id: item.id });
    }
  });

  it('never calls Plaid for a bank without an investment account, when the flag is off, or once marked unsupported', async () => {
    const calls: any[] = [];
    const a = await seed({ withInvestment: false });
    await makeService({ calls, pages: [{ txs: [itx('x')] }] }).syncInvestments(a.item, 'tok');
    await ds.getRepository(PlaidItem).delete({ id: a.item.id });
    const b = await seed();
    await makeService({ calls, pages: [{ txs: [itx('x')] }], enabled: false }).syncInvestments(b.item, 'tok');
    await ds.getRepository(PlaidItem).delete({ id: b.item.id });
    const c = await seed({ investmentsStatus: 'unsupported' });
    await makeService({ calls, pages: [{ txs: [itx('x')] }] }).syncInvestments(c.item, 'tok');
    expect(calls).toEqual([]);
    expect(await ds.getRepository(Transaction).count()).toBe(0);
  });

  it('a real Plaid failure is logged, not thrown, and changes nothing', async () => {
    const { item } = await seed({ investmentsStatus: 'synced', syncedThrough: '2026-10-20' });
    await expect(makeService({ error: 'RATE_LIMIT_EXCEEDED' }).syncInvestments(item, 'tok')).resolves.toBeUndefined();
    const after = await ds.getRepository(PlaidItem).findOneByOrFail({ id: item.id });
    expect([after.investmentsStatus, after.investmentsSyncedThrough]).toEqual(['synced', '2026-10-20']);
  });
});

describe('completeInvestmentsConsent', () => {
  it('clears the old status, pulls the full history and reports the outcome', async () => {
    const { item } = await seed({ investmentsStatus: 'not_consented', syncedThrough: '2026-10-01' });
    const calls: any[] = [];
    const service = makeService({ calls, pages: [{ txs: [itx('i-1')] }] });
    const result = await service.completeInvestmentsConsent(item.id, 'user-1');
    expect(result).toEqual({ status: 'synced' });
    const twoYearsAgo = new Date(Date.now() - 730 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    expect(calls[0].start_date).toBe(twoYearsAgo);
  });
});
