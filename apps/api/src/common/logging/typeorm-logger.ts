import type { Logger } from 'typeorm';
import { log, describeError } from './log';

export const slowQueryMs = () => Number(process.env.SLOW_QUERY_MS) || 500;
const sqlText = (q: string) => (q.length > 2000 ? `${q.slice(0, 2000)}…` : q);

/**
 * TypeORM logger: slow and failed queries only, SQL text without parameter
 * values (they carry emails, amounts, tokens). Query errors are WARNING —
 * many are handled (unique violations); one that becomes a 500 is reported by
 * the exception filter.
 */
export class TypeOrmLogger implements Logger {
  logQuery(): void {}
  logSchemaBuild(): void {}

  logQuerySlow(time: number, query: string): void {
    log('WARNING', `Slow query ${time}ms`, { context: 'Database', dbSlowQuery: true, durationMs: time, sql: sqlText(query) });
  }

  logQueryError(error: string | Error, query: string): void {
    const message = describeError(error);
    log('WARNING', `Query failed: ${message}`, { context: 'Database', dbQueryError: true, error: message, sql: sqlText(query) });
  }

  logMigration(message: string): void {
    log('INFO', message, { context: 'Migrations' });
  }

  log(level: 'log' | 'info' | 'warn', message: unknown): void {
    if (level === 'warn') log('WARNING', describeError(message), { context: 'Database' });
  }
}
