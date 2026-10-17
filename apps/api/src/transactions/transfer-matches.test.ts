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
const CHASE = 'acc-chase';
const BOFA = 'acc-bofa';

let ds: DataSource;
let service: TransactionsService;

async function makeDataSource() {
  const source = new DataSource({
    type: 'better-sqlite3', database: ':memory:', dropSchema: true,
    entities: [User, Transaction, Category, BankAccount, Project, ProjectCategory, CategorizationRule],
    synchronize: true,
  });
  await source.initialize();
  return source;
}

beforeEach(async () => {
  ds = await makeDataSource();
  // Transaction holds FKs to User and BankAccount.
  const userRepo = ds.getRepository(User);
  await userRepo.save(userRepo.create({ id: USER_ID, email: 'a@b.c', name: 'A', password: 'x' }));
  const accRepo = ds.getRepository(BankAccount);
  for (const [id, bankName] of [[CHASE, 'Chase'], [BOFA, 'Bank of America']]) {
    await accRepo.save(accRepo.create({
      id, userId: USER_ID, bankName, accountName: 'Credit card',
      accountType: 'credit', balance: 0, currency: 'USD', color: '#4BA8D8', provider: 'manual',
    }));
  }

  service = new TransactionsService(
    ds.getRepository(Transaction),
    ds.getRepository(BankAccount),
    ds.getRepository(ProjectCategory),
    ds.getRepository(Project),
    { removePaymentByTransaction: vi.fn() } as any,
    {} as any,
  );
});

/** One candidate sitting in the other account, ready to be offered as a match. */
async function seed(amount: number, date: string, bankAccountId = BOFA, name = 'SUNPASS') {
  const repo = ds.getRepository(Transaction);
  return repo.save(repo.create({
    userId: USER_ID, name, amount, date, bankAccountId,
    source: 'plaid', pending: false, isSplitParent: false,
  }));
}

/* The deposit from the screenshot: +$9.50 into Chase on 2026-03-13. */
const DEPOSIT = { amount: 9.5, date: '2026-03-13', excludeAccount: CHASE };

function matchesFor() {
  return service.findTransferMatches(USER_ID, DEPOSIT.amount, DEPOSIT.date, DEPOSIT.excludeAccount);
}

describe('findTransferMatches', () => {
  it('offers the opposite leg when the amounts are equal', async () => {
    const leg = await seed(-9.5, '2026-03-14');
    const found = await matchesFor();
    expect(found.map((t) => t.id)).toEqual([leg.id]);
  });

  it('does not offer a payment for a different amount', async () => {
    // The reported bug: a +$9.50 deposit was offered a -$10.00 payment and the
    // UI called it "Same amount". Two legs of one transfer move identical money.
    await seed(-10, '2026-03-14');
    expect(await matchesFor()).toEqual([]);
  });

  it('does not offer another deposit as the other leg', async () => {
    // A transfer is one outflow paired with one inflow. Same-sign candidates
    // were never excluded, so two deposits could be linked to each other.
    await seed(9.5, '2026-03-13');
    expect(await matchesFor()).toEqual([]);
  });

  it('does not offer a transaction from the same account', async () => {
    await seed(-9.5, '2026-03-13', CHASE);
    expect(await matchesFor()).toEqual([]);
  });

  it('ignores anything outside the five-day window', async () => {
    await seed(-9.5, '2026-03-20');
    expect(await matchesFor()).toEqual([]);
  });

  it('still matches a leg that settled several days later', async () => {
    // Real transfers routinely post a few days apart, so the window stays wide.
    const leg = await seed(-9.5, '2026-03-17');
    const found = await matchesFor();
    expect(found.map((t) => t.id)).toEqual([leg.id]);
  });

  it('puts the closest date first', async () => {
    const far = await seed(-9.5, '2026-03-16', BOFA, 'FAR');
    const near = await seed(-9.5, '2026-03-13', BOFA, 'NEAR');
    const found = await matchesFor();
    expect(found.map((t) => t.id)).toEqual([near.id, far.id]);
  });

  it('matches an outgoing payment against an incoming deposit', async () => {
    const leg = await seed(25, '2026-03-13');
    const found = await service.findTransferMatches(USER_ID, -25, '2026-03-13', CHASE);
    expect(found.map((t) => t.id)).toEqual([leg.id]);
  });
});
