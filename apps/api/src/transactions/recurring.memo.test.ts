import { describe, it, expect, beforeEach, vi } from 'vitest';
import { DataSource } from 'typeorm';
import { RecurringRule } from './recurring-rule.entity';
import { Transaction } from './transaction.entity';
import { RecurringService } from './recurring.service';
import { User } from '../users/user.entity';
import { Category } from '../categories/category.entity';
import { BankAccount } from '../bank-accounts/bank-account.entity';
import { ProjectCategory } from '../projects/project-category.entity';
import { CategorizationRule } from '../categorization-rules/categorization-rule.entity';

/* The once-per-day memo around materialiseDue. The locked write path itself
   needs Postgres (recurring.concurrency.test.ts); here a user with no rules
   is enough to see whether the candidates query runs at all. */

const USER_ID = 'user-memo';
const NOW = new Date('2026-11-07T15:00:00Z');

let ds: DataSource;
let service: RecurringService;

beforeEach(async () => {
  ds = new DataSource({
    type: 'better-sqlite3', database: ':memory:', dropSchema: true,
    entities: [User, Category, BankAccount, ProjectCategory, CategorizationRule, Transaction, RecurringRule],
    synchronize: true,
  });
  await ds.initialize();
  service = new RecurringService(ds.getRepository(RecurringRule), ds.getRepository(Transaction), ds);
});

describe('RecurringService.materialiseDue memo', () => {
  it('queries the rules once per user per day, not on every list call', async () => {
    const qb = vi.spyOn(ds.getRepository(RecurringRule), 'createQueryBuilder');
    await service.materialiseDue(USER_ID, NOW);
    await service.materialiseDue(USER_ID, NOW);
    await service.materialiseDue(USER_ID, new Date(NOW.getTime() + 60_000));
    expect(qb).toHaveBeenCalledTimes(1);
  });

  it('runs again on the next day', async () => {
    const qb = vi.spyOn(ds.getRepository(RecurringRule), 'createQueryBuilder');
    await service.materialiseDue(USER_ID, NOW);
    await service.materialiseDue(USER_ID, new Date('2026-11-08T00:30:00Z'));
    expect(qb).toHaveBeenCalledTimes(2);
  });

  it('is per user', async () => {
    const qb = vi.spyOn(ds.getRepository(RecurringRule), 'createQueryBuilder');
    await service.materialiseDue(USER_ID, NOW);
    await service.materialiseDue('someone-else', NOW);
    expect(qb).toHaveBeenCalledTimes(2);
  });

  it('a rule change clears the memo so the next list call materialises again', async () => {
    const qb = vi.spyOn(ds.getRepository(RecurringRule), 'createQueryBuilder');
    await service.materialiseDue(USER_ID, NOW);
    await service.stop('00000000-0000-0000-0000-000000000000', USER_ID).catch(() => undefined);
    await service.materialiseDue(USER_ID, NOW);
    expect(qb.mock.calls.length).toBeGreaterThanOrEqual(2);
  });
});
