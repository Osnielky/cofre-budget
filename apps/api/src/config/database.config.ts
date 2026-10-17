import { registerAs } from '@nestjs/config';
import { TypeOrmModuleOptions } from '@nestjs/typeorm';
import * as fs from 'fs';
import * as path from 'path';
import { ENTITIES } from './entities';
import { MIGRATIONS } from '../migrations';
import { TypeOrmLogger, slowQueryMs } from '../common/logging/typeorm-logger';

export default registerAs('database', (): TypeOrmModuleOptions => ({
  type: 'postgres',
  host: process.env.DB_HOST ?? 'localhost',
  port: Number(process.env.DB_PORT) || 5432,
  username: process.env.DB_USER ?? 'postgres',
  password: process.env.DB_PASS ?? 'postgres',
  database: process.env.DB_NAME ?? 'cofre_budget',
  entities: ENTITIES,
  // Schema changes ship as migrations (apps/api/src/migrations), applied on boot.
  // Never synchronize: it can drop columns in production when an entity changes.
  synchronize: false,
  migrations: MIGRATIONS,
  migrationsRun: true,
  // Slow (> SLOW_QUERY_MS) and failed queries only, without parameter values.
  logger: new TypeOrmLogger(),
  maxQueryExecutionTime: slowQueryMs(),
  ssl: (() => {
    if (!process.env.DB_HOST?.includes('supabase.co')) return false;
    const caPath = ['supabase-ca.crt.crt', 'supabase-ca.crt'].map(f => path.resolve(process.cwd(), f)).find(p => fs.existsSync(p)) ?? '';
    if (caPath) return { rejectUnauthorized: true, ca: fs.readFileSync(caPath).toString() };
    return { rejectUnauthorized: false };
  })(),
}));
