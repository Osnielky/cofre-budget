import { describe, it, expect, beforeEach } from 'vitest';
import { DataSource } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import { User } from '../users/user.entity';
import { BankAccount } from '../bank-accounts/bank-account.entity';
import { PlaidItem } from '../plaid/plaid-item.entity';
import { Transaction } from '../transactions/transaction.entity';
import { RecurringRule } from '../transactions/recurring-rule.entity';
import { Category } from '../categories/category.entity';
import { Budget } from '../budgets/budget.entity';
import { Project } from '../projects/project.entity';
import { ProjectCategory } from '../projects/project-category.entity';
import { Debt } from '../debts/debt.entity';
import { DebtPayment } from '../debts/debt-payment.entity';
import { ConnectedApp } from '../connected-apps/connected-app.entity';
import { CategorizationRule } from '../categorization-rules/categorization-rule.entity';
import { Subscription } from '../billing/subscription.entity';
import { NetWorthSnapshot } from '../net-worth-goal/net-worth-snapshot.entity';
import { CreditCardDetail } from '../cards/credit-card-detail.entity';
import { CardProfile } from '../cards/card-profile.entity';
import { DemoService, DEMO_OWNER_EMAIL, DEMO_OWNER_PASSWORD } from './demo.service';

/* jsonb columns (AI messages, receipts) are not supported by sqlite, so this
   suite covers every other table; populate() skips the conversation when the
   repository is absent. */
const ENTITIES = [User, BankAccount, PlaidItem, Transaction, RecurringRule, Category, Budget, Project, ProjectCategory, Debt, DebtPayment, ConnectedApp, CategorizationRule, Subscription, NetWorthSnapshot, CreditCardDetail, CardProfile];

let ds: DataSource;
let service: DemoService;
const NOW = new Date('2026-10-20T15:00:00Z');

beforeEach(async () => {
  ds = new DataSource({ type: 'better-sqlite3', database: ':memory:', dropSchema: true, entities: ENTITIES, synchronize: true });
  await ds.initialize();
  service = new DemoService(ds);
});

async function rowsOwnedBy(userId: string): Promise<Record<string, number>> {
  const r = (e: any) => ds.getRepository(e);
  const debtIds = (await r(Debt).findBy({ userId })).map((d) => d.id);
  return {
    transactions: await r(Transaction).countBy({ userId }),
    accounts: await r(BankAccount).countBy({ userId }),
    categories: await r(Category).countBy({ userId }),
    budgets: await r(Budget).countBy({ userId }),
    recurring: await r(RecurringRule).countBy({ userId }),
    rules: await r(CategorizationRule).countBy({ userId }),
    debts: debtIds.length,
    payments: debtIds.length ? (await r(DebtPayment).find()).filter((p) => debtIds.includes(p.debtId)).length : 0,
    projects: await r(Project).countBy({ userId }),
    projectCategories: await r(ProjectCategory).countBy({ userId }),
    cardDetails: await r(CreditCardDetail).countBy({ userId }),
    cardProfiles: await r(CardProfile).countBy({ userId }),
    snapshots: await r(NetWorthSnapshot).countBy({ userId }),
  };
}

describe('DemoService visitors', () => {
  it('startVisitor creates a Pro sandbox user full of data', async () => {
    const user = await service.startVisitor(NOW);
    expect(user.isDemo).toBe(true);
    expect(user.plan).toBe('pro');
    expect(user.emailVerified).toBe(true);
    const rows = await rowsOwnedBy(user.id);
    expect(rows.transactions).toBeGreaterThan(900);
    expect(rows.accounts).toBe(7);
    expect(rows.budgets).toBeGreaterThanOrEqual(12 * 10);
    expect(rows.recurring).toBe(5);
    expect(rows.projects).toBe(2);
    expect(rows.debts).toBe(3);
    expect(rows.payments).toBe(3);
    expect(rows.cardDetails).toBe(2);
    expect(rows.cardProfiles).toBe(1);
    expect(rows.snapshots).toBe(10);
    const fresh = await ds.getRepository(User).findOneByOrFail({ id: user.id });
    expect(fresh.netWorthGoalTargetDate).toBe('2041-01-01');
  });

  it('links transfer pairs, recurring rules and project purchases on the written rows', async () => {
    const user = await service.startVisitor(NOW);
    const txs = await ds.getRepository(Transaction).findBy({ userId: user.id });
    const paired = txs.filter((t) => t.counterpartTxId);
    expect(paired.length).toBeGreaterThan(40);
    const one = paired[0];
    const other = txs.find((t) => t.id === one.counterpartTxId)!;
    expect(other.counterpartTxId).toBe(one.id);
    expect(other.bankAccountId).toBe(one.transferAccountId);
    expect(txs.filter((t) => t.recurringRuleId).length).toBe(60);
    const civic = await ds.getRepository(Project).findOneByOrFail({ userId: user.id, name: '2016 Honda Civic flip' });
    expect(civic.purchaseTxId).toBeTruthy();
    expect(civic.status).toBe('sold');
  });

  it('wipe removes every row the visitor owns, and the visitor itself', async () => {
    const user = await service.startVisitor(NOW);
    await service.wipe(user.id);
    const rows = await rowsOwnedBy(user.id);
    for (const [table, n] of Object.entries(rows)) expect({ table, n }).toEqual({ table, n: 0 });
    expect(await ds.getRepository(User).countBy({ id: user.id })).toBe(0);
  });

  it('wipe never touches another user’s rows', async () => {
    const a = await service.startVisitor(NOW);
    const b = await service.startVisitor(NOW);
    await service.wipe(a.id);
    expect((await rowsOwnedBy(b.id)).transactions).toBeGreaterThan(900);
  });

  it('sweepStaleVisitors deletes sandboxes older than 24h and keeps fresh ones', async () => {
    const old = await service.startVisitor(new Date(NOW.getTime() - 25 * 3600 * 1000));
    const fresh = await service.startVisitor(new Date(NOW.getTime() - 1 * 3600 * 1000));
    await ds.getRepository(User).update(old.id, { createdAt: new Date(NOW.getTime() - 25 * 3600 * 1000) });
    const swept = await service.sweepStaleVisitors(NOW);
    expect(swept).toBe(1);
    expect(await ds.getRepository(User).countBy({ id: old.id })).toBe(0);
    expect(await ds.getRepository(User).countBy({ id: fresh.id })).toBe(1);
  });
});

describe('DemoService owner (Rockefeller)', () => {
  it('ensureOwner creates the account once with the demo password and a Pro plan', async () => {
    const first = await service.ensureOwner(NOW);
    const second = await service.ensureOwner(NOW);
    expect(second.id).toBe(first.id);
    expect(await ds.getRepository(User).countBy({ email: DEMO_OWNER_EMAIL })).toBe(1);
    const withPw = await ds.getRepository(User).createQueryBuilder('u').addSelect('u.password').where('u.id = :id', { id: first.id }).getOne();
    expect(await bcrypt.compare(DEMO_OWNER_PASSWORD, withPw!.password)).toBe(true);
    expect(first).toMatchObject({ name: 'Rockefeller', plan: 'pro', isDemo: false, emailVerified: true });
    expect((await rowsOwnedBy(first.id)).transactions).toBeGreaterThan(900);
  });

  it('wipe keeps the owner’s user row', async () => {
    const owner = await service.ensureOwner(NOW);
    await service.wipe(owner.id);
    expect((await rowsOwnedBy(owner.id)).transactions).toBe(0);
    expect(await ds.getRepository(User).countBy({ id: owner.id })).toBe(1);
  });

  it('resetOwner restores the seed, the name and the password after the owner was changed', async () => {
    const owner = await service.ensureOwner(NOW);
    await ds.getRepository(Transaction).delete({ userId: owner.id });
    await ds.getRepository(User).update(owner.id, { name: 'Hacked', password: await bcrypt.hash('something-else', 4) });
    const after = await service.resetOwner(NOW);
    expect(after.id).toBe(owner.id);
    expect(after.name).toBe('Rockefeller');
    expect((await rowsOwnedBy(owner.id)).transactions).toBeGreaterThan(900);
    const withPw = await ds.getRepository(User).createQueryBuilder('u').addSelect('u.password').where('u.id = :id', { id: owner.id }).getOne();
    expect(await bcrypt.compare(DEMO_OWNER_PASSWORD, withPw!.password)).toBe(true);
  });
});
