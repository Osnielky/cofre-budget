// DataSource for the TypeORM CLI (npm run migration:*). The app itself connects
// through database.config.ts; both share the entity and migration lists.
import 'dotenv/config';
import { DataSource } from 'typeorm';
import { ENTITIES } from './entities';
import { MIGRATIONS } from '../migrations';

export default new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST ?? 'localhost',
  port: Number(process.env.DB_PORT) || 5432,
  username: process.env.DB_USER ?? 'postgres',
  password: process.env.DB_PASS ?? 'postgres',
  database: process.env.DB_NAME ?? 'cofre_budget',
  entities: ENTITIES,
  migrations: MIGRATIONS,
});
