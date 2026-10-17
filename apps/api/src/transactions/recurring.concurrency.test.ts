import { describe, it, expect, afterAll, beforeEach } from 'vitest';
import { DataSource } from 'typeorm';
import { RecurringRule } from './recurring-rule.entity';
import { Transaction } from './transaction.entity';
import { RecurringService } from './recurring.service';
import { User } from '../users/user.entity';
import { Category } from '../categories/category.entity';
import { BankAccount } from '../bank-accounts/bank-account.entity';
import { ProjectCategory } from '../projects/project-category.entity';
import { CategorizationRule } from '../categorization-rules/categorization-rule.entity';

/**
 * These tests need real Postgres: the bug they cover is a lost update between
 * two concurrent connections, and the fix is `SELECT … FOR UPDATE`. Neither
 * exists under the in-memory sqlite the other suites use — sqlite serialises
 * everything anyway, so it would pass whether or not the lock is there.
 *
 * They run against a throwaway schema so a developer's `cofre_budget` data is
 * never touched, and skip themselves when no database is reachable, which keeps
 * them harmless in an environment without Postgres.
 */
const URL = process.env.DATABASE_URL ?? 'postgres://postgres:postgres@localhost:5432/cofre_budget';
const SCHEMA = 'recurring_concurrency_test';

const USER_ID = '11111111-1111-4111-8111-111111111111';

async function connect(): Promise<DataSource | null> {
  const bootstrap = new DataSource({ type: 'postgres', url: URL });
  try {
    await bootstrap.initialize();
  } catch {
    return null;                                   // no Postgres here — skip
  }
  await bootstrap.query(`CREATE SCHEMA IF NOT EXISTS "${SCHEMA}"`);
  await bootstrap.destroy();

  const source = new DataSource({
    type: 'postgres',
    url: URL,
    schema: SCHEMA,
    dropSchema: true,
    synchronize: true,
    entities: [User, Transaction, RecurringRule, Category, BankAccount, ProjectCategory, CategorizationRule],
  });
  await source.initialize();
  return source;
}

// Connected up front rather than in beforeAll, so an unreachable database
// reports these as skipped instead of passing vacuously.
const ds = await connect();

afterAll(async () => {
  if (!ds) return;
  await ds.query(`DROP SCHEMA IF EXISTS "${SCHEMA}" CASCADE`);
  await ds.destroy();
});

beforeEach(async () => {
  if (!ds) return;
  await ds.query(`TRUNCATE "${SCHEMA}"."transactions", "${SCHEMA}"."recurring_rules" CASCADE`);
});

function makeService(source: DataSource) {
  return new RecurringService(
    source.getRepository(RecurringRule),
    source.getRepository(Transaction),
    source,
  );
}

/** A monthly rule that already has occurrences due, so a fetch must write them. */
function dueRule(startDaysAgo: number) {
  const start = new Date();
  start.setUTCDate(start.getUTCDate() - startDaysAgo);
  return {
    userId: USER_ID,
    amount: -1300,
    name: 'Rent',
    interval: 1,
    unit: 'month' as const,
    dayOfMonth: start.getUTCDate(),
    startDate: start.toISOString().slice(0, 10),
    endDate: null,
    occurrenceCount: null,
    lastRunDate: null,
    runCount: 0,
    active: true,
  };
}

describe.skipIf(!ds)('RecurringService concurrency', () => {
  // Non-null by construction: the block is skipped when there is no database.
  const db = ds!;

  it('writes an occurrence exactly once when two fetches overlap', async () => {
    const service = makeService(db);
    await db.getRepository(RecurringRule).save(db.getRepository(RecurringRule).create(dueRule(3)));

    // The transactions page fires two GET /api/transactions calls at once — the
    // current period and the prior period it compares against — and each one
    // calls materialiseDue. Before the row lock, both read lastRunDate = null,
    // neither saw the other's insert, and the user got the same rent twice.
    await Promise.all([service.materialiseDue(USER_ID), service.materialiseDue(USER_ID)]);

    const rows = await db.getRepository(Transaction).find({ where: { userId: USER_ID } });
    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe('Rent');
  });

  it('stays at one occurrence across many overlapping fetches', async () => {
    const service = makeService(db);
    await db.getRepository(RecurringRule).save(db.getRepository(RecurringRule).create(dueRule(3)));

    await Promise.all(Array.from({ length: 8 }, () => service.materialiseDue(USER_ID)));

    const count = await db.getRepository(Transaction).countBy({ userId: USER_ID });
    expect(count).toBe(1);
  });

  it('does not resurrect an occurrence the user deleted', async () => {
    const service = makeService(db);
    const txRepo = db.getRepository(Transaction);
    await db.getRepository(RecurringRule).save(db.getRepository(RecurringRule).create(dueRule(3)));

    await service.materialiseDue(USER_ID);
    const written = await txRepo.find({ where: { userId: USER_ID } });
    expect(written).toHaveLength(1);

    // Deleting the row is the whole point of the new trash icon; lastRunDate is
    // a high-water mark, so the next fetch must not write it back.
    await txRepo.delete({ id: written[0].id });
    await service.materialiseDue(USER_ID);

    expect(await txRepo.countBy({ userId: USER_ID })).toBe(0);
  });

  it('keeps producing later occurrences after one is deleted', async () => {
    const service = makeService(db);
    const txRepo = db.getRepository(Transaction);
    const ruleRepo = db.getRepository(RecurringRule);

    // Started 70 days ago, so two monthly occurrences are already due.
    const rule = await ruleRepo.save(ruleRepo.create(dueRule(70)));
    await service.materialiseDue(USER_ID);
    const written = await txRepo.find({ where: { userId: USER_ID }, order: { date: 'ASC' } });
    expect(written.length).toBeGreaterThanOrEqual(2);

    await txRepo.delete({ id: written[0].id });

    // The rule itself is untouched: still active, still pointed at the future.
    const after = await ruleRepo.findOneByOrFail({ id: rule.id });
    expect(after.active).toBe(true);
    expect(after.lastRunDate).toBe(written[written.length - 1].date);
  });
});
