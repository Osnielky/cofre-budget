import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DataSource } from 'typeorm';
import { TypeOrmLogger } from './typeorm-logger';
import { setLogSink } from './log';

let lines: Array<Record<string, any>> = [];
beforeEach(() => { lines = []; setLogSink((l) => lines.push(JSON.parse(l))); });
afterEach(() => setLogSink(null));

describe('TypeOrmLogger', () => {
  const logger = new TypeOrmLogger();

  it('logs a slow query with its duration and SQL, never its parameters', () => {
    logger.logQuerySlow(812, 'SELECT * FROM "users" WHERE "email" = $1', ['owner@cofre.dev']);
    expect(lines[0]).toMatchObject({ severity: 'WARNING', dbSlowQuery: true, durationMs: 812 });
    expect(lines[0].sql).toContain('SELECT * FROM "users"');
    expect(JSON.stringify(lines)).not.toContain('owner@cofre.dev');
  });

  it('logs a failed query at WARNING without parameters', () => {
    logger.logQueryError(new Error('duplicate key'), 'INSERT INTO "users" VALUES ($1)', ['secret']);
    expect(lines[0]).toMatchObject({ severity: 'WARNING', dbQueryError: true, error: 'duplicate key' });
    expect(JSON.stringify(lines)).not.toContain('secret');
  });

  it('stays quiet for ordinary queries', () => {
    logger.logQuery('SELECT 1');
    expect(lines).toHaveLength(0);
  });

  it('is what TypeORM calls for a query slower than maxQueryExecutionTime', async () => {
    const ds = new DataSource({ type: 'better-sqlite3', database: ':memory:', logger, maxQueryExecutionTime: 1 });
    await ds.initialize();
    await ds.query(`WITH RECURSIVE c(x) AS (SELECT 1 UNION ALL SELECT x+1 FROM c WHERE x < 300000) SELECT count(*) FROM c`);
    await ds.destroy();
    expect(lines.some((l) => l.dbSlowQuery)).toBe(true);
  });
});
