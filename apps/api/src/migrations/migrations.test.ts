import { describe, it, expect, afterAll } from 'vitest';
import { DataSource } from 'typeorm';
import { ENTITIES } from '../config/entities';
import { MIGRATIONS } from './index';

/**
 * Real Postgres, like recurring.concurrency.test.ts: the thing under test is the
 * Postgres DDL the migrations emit. Each case gets its own throwaway schema and
 * the suite skips itself when no database is reachable.
 */
const URL = process.env.DATABASE_URL ?? 'postgres://postgres:postgres@localhost:5432/cofre_budget';
const SCHEMAS = ['migrations_test_fresh', 'migrations_test_synced'];

async function reachable(): Promise<boolean> {
  const probe = new DataSource({ type: 'postgres', url: URL });
  try {
    await probe.initialize();
  } catch {
    return false;
  }
  for (const s of SCHEMAS) await probe.query(`DROP SCHEMA IF EXISTS "${s}" CASCADE`);
  for (const s of SCHEMAS) await probe.query(`CREATE SCHEMA "${s}"`);
  await probe.destroy();
  return true;
}

// Migration SQL is unqualified, so put the test schema first on search_path the
// way the app's connection resolves to `public` (kept second for extensions).
function source(schema: string, opts: { synchronize?: boolean } = {}) {
  return new DataSource({
    type: 'postgres',
    url: URL,
    schema,
    extra: { options: `-c search_path=${schema},public` },
    entities: ENTITIES,
    migrations: MIGRATIONS,
    synchronize: opts.synchronize ?? false,
  });
}

const hasDb = await reachable();
const opened: DataSource[] = [];

afterAll(async () => {
  for (const ds of opened) if (ds.isInitialized) await ds.destroy();
  if (!hasDb) return;
  const cleanup = new DataSource({ type: 'postgres', url: URL });
  await cleanup.initialize();
  for (const s of SCHEMAS) await cleanup.query(`DROP SCHEMA IF EXISTS "${s}" CASCADE`);
  await cleanup.destroy();
});

// Building and diffing 18 tables takes a few seconds.
describe.skipIf(!hasDb)('database migrations', { timeout: 30_000 }, () => {
  it('build exactly the entity schema on an empty database', async () => {
    const ds = source('migrations_test_fresh');
    opened.push(ds);
    await ds.initialize();

    await ds.runMigrations();

    // The same diff `migration:generate` computes. Anything here means an
    // entity changed without a migration.
    const pending = await ds.driver.createSchemaBuilder().log();
    expect(pending.upQueries.map((q) => q.query)).toEqual([]);
  });

  it('adopt a database that synchronize already built, without touching its data', async () => {
    // Production today: tables made by synchronize, no migrations table.
    const synced = source('migrations_test_synced', { synchronize: true });
    await synced.initialize();
    await synced.query(`INSERT INTO "users" ("email", "name") VALUES ('owner@cofre.dev', 'Owner')`);
    await synced.destroy();

    const ds = source('migrations_test_synced');
    opened.push(ds);
    await ds.initialize();

    const ran = await ds.runMigrations();

    expect(ran.map((m) => m.name)).toEqual(MIGRATIONS.map((m) => m.name));
    const [{ count }] = await ds.query(`SELECT count(*)::int AS count FROM "users"`);
    expect(count).toBe(1);
    expect(await ds.showMigrations()).toBe(false);
  });
});
