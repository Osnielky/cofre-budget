import { describe, it, expect, beforeEach } from 'vitest';
import { DataSource } from 'typeorm';
import { ConflictException } from '@nestjs/common';
import { User } from '../users/user.entity';
import { Category } from '../categories/category.entity';
import { Transaction } from '../transactions/transaction.entity';
import { BankAccount } from '../bank-accounts/bank-account.entity';
import { ProjectCategory } from '../projects/project-category.entity';
import { CategorizationRule } from './categorization-rule.entity';
import { CategorizationRulesService } from './categorization-rules.service';

const USER_ID = 'user-1';

async function makeDataSource() {
  const ds = new DataSource({
    type: 'better-sqlite3', database: ':memory:', dropSchema: true,
    entities: [User, Category, Transaction, BankAccount, ProjectCategory, CategorizationRule],
    synchronize: true,
  });
  await ds.initialize();
  return ds;
}

let ds: DataSource;
let service: CategorizationRulesService;
let categoryId: string;

beforeEach(async () => {
  ds = await makeDataSource();
  service = new CategorizationRulesService(
    ds.getRepository(CategorizationRule),
    ds.getRepository(Transaction),
    ds.getRepository(Category),
  );
  // Category and CategorizationRule both hold an FK to User.
  const userRepo = ds.getRepository(User);
  await userRepo.save(userRepo.create({ id: USER_ID, email: 'a@b.c', name: 'A', password: 'x' }));

  const catRepo = ds.getRepository(Category);
  const cat = await catRepo.save(catRepo.create({
    userId: USER_ID, name: 'Transport', icon: '🚗', color: '#4BA8D8', type: 'expense',
  }));
  categoryId = cat.id;
});

async function seedTx(over: Partial<Transaction> = {}) {
  const repo = ds.getRepository(Transaction);
  return repo.save(repo.create({
    userId: USER_ID, name: 'AUTOZONE', amount: -80, date: '2026-09-01',
    source: 'manual', pending: false, isSplitParent: false, ...over,
  }));
}

describe('CategorizationRulesService.create', () => {
  it('leaves existing uncategorized transactions alone', async () => {
    // The whole point: a rule describes what to do from now on. Back-filling
    // re-categorized rows the user had already looked at and chosen to leave be.
    const older = await seedTx();
    const seed = await seedTx({ categoryId });

    await service.create(USER_ID, seed.id, categoryId);

    const after = await ds.getRepository(Transaction).findOneByOrFail({ id: older.id });
    expect(after.categoryId).toBeNull();
    expect(after.categorizedByRuleId).toBeNull();
  });

  it('creates a rule that will match the same name in future', async () => {
    const seed = await seedTx({ categoryId });
    const rule = await service.create(USER_ID, seed.id, categoryId);

    expect(rule.matchValue).toBe('AUTOZONE');
    expect(rule.matchType).toBe('name');

    // Ingestion (Plaid sync, CSV import, manual add) categorizes through
    // matchRule, so this is what "applies to future transactions" rests on.
    const rules = await service.getActiveRules(USER_ID);
    expect(service.matchRule(rules, { name: 'autozone' })?.id).toBe(rule.id);
    expect(service.matchRule(rules, { name: 'PUBLIX' })).toBeNull();
  });

  it('still rejects a duplicate rule', async () => {
    const seed = await seedTx({ categoryId });
    await service.create(USER_ID, seed.id, categoryId);
    const other = await seedTx({ categoryId });
    await expect(service.create(USER_ID, other.id, categoryId)).rejects.toBeInstanceOf(ConflictException);
  });
});

describe('CategorizationRulesService.update', () => {
  it('leaves existing uncategorized transactions alone', async () => {
    const seed = await seedTx({ name: 'SHELL', categoryId });
    const rule = await service.create(USER_ID, seed.id, categoryId);

    const older = await seedTx({ name: 'AUTOZONE' });
    await service.update(rule.id, USER_ID, { matchValue: 'AUTOZONE' });

    const after = await ds.getRepository(Transaction).findOneByOrFail({ id: older.id });
    expect(after.categoryId).toBeNull();
  });

  it('applies the edited match to future transactions', async () => {
    const seed = await seedTx({ name: 'SHELL', categoryId });
    const rule = await service.create(USER_ID, seed.id, categoryId);

    await service.update(rule.id, USER_ID, { matchValue: 'AUTOZONE' });

    const rules = await service.getActiveRules(USER_ID);
    expect(service.matchRule(rules, { name: 'AUTOZONE' })?.id).toBe(rule.id);
    expect(service.matchRule(rules, { name: 'SHELL' })).toBeNull();
  });
});
