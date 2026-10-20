import { describe, it, expect, beforeEach } from 'vitest';
import { DataSource } from 'typeorm';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { User } from '../users/user.entity';
import { Transaction } from '../transactions/transaction.entity';
import { Category } from './category.entity';
import { BankAccount } from '../bank-accounts/bank-account.entity';
import { Project } from '../projects/project.entity';
import { ProjectCategory } from '../projects/project-category.entity';
import { Budget } from '../budgets/budget.entity';
import { CategorizationRule } from '../categorization-rules/categorization-rule.entity';
import { RecurringRule } from '../transactions/recurring-rule.entity';
import { CategoriesService } from './categories.service';

const USER_ID = 'user-1';

async function makeDataSource() {
  const ds = new DataSource({
    type: 'better-sqlite3', database: ':memory:', dropSchema: true,
    entities: [User, Transaction, Category, BankAccount, Project, ProjectCategory, Budget, CategorizationRule, RecurringRule],
    synchronize: true,
  });
  await ds.initialize();
  return ds;
}

let ds: DataSource;
let service: CategoriesService;

beforeEach(async () => {
  ds = await makeDataSource();
  // sqlite enforces the user FK on categories and rules.
  await ds.getRepository(User).save([
    { id: USER_ID, email: 'owner@cofre.dev', name: 'Owner' },
    { id: 'user-2', email: 'other@cofre.dev', name: 'Other' },
  ]);
  service = new CategoriesService(
    ds.getRepository(Category),
    ds.getRepository(Transaction),
    ds.getRepository(Budget),
    ds.getRepository(CategorizationRule),
    ds,
  );
});

async function category(name: string, extra: Partial<Category> = {}) {
  const repo = ds.getRepository(Category);
  return repo.save(repo.create({ userId: USER_ID, name, icon: '🛒', color: '#4FBF7F', type: 'expense', ...extra }));
}
async function tx(categoryId: string, name = 'Whole Foods') {
  const repo = ds.getRepository(Transaction);
  return repo.save(repo.create({ userId: USER_ID, name, amount: -42, date: '2026-10-03', source: 'manual', pending: false, isSplitParent: false, categoryId }));
}
async function budget(categoryId: string, month: string, amount: number, extra: Partial<Budget> = {}) {
  const repo = ds.getRepository(Budget);
  return repo.save(repo.create({ userId: USER_ID, categoryId, month, amount, ...extra }));
}
async function rule(categoryId: string, matchValue: string) {
  const repo = ds.getRepository(CategorizationRule);
  return repo.save(repo.create({ userId: USER_ID, categoryId, matchType: 'merchant', matchValue, matchStrategy: 'exact' }));
}
async function recurring(categoryId: string, name: string) {
  const repo = ds.getRepository(RecurringRule);
  return repo.save(repo.create({ userId: USER_ID, categoryId, name, amount: -15, dayOfMonth: 7, interval: 1, unit: 'month', startDate: '2026-01-07', active: true }));
}

describe('CategoriesService.merge', () => {
  it('moves every transaction from the old category to the target and deletes the old one', async () => {
    const old = await category('Supermarket');
    const target = await category('Groceries');
    await tx(old.id); await tx(old.id, 'Costco'); await tx(target.id, 'Trader Joe’s');

    const merged = await service.merge(old.id, USER_ID, { targetId: target.id });

    expect(merged.id).toBe(target.id);
    expect(await ds.getRepository(Transaction).countBy({ categoryId: target.id })).toBe(3);
    expect(await ds.getRepository(Transaction).countBy({ categoryId: old.id })).toBe(0);
    expect(await ds.getRepository(Category).countBy({ id: old.id })).toBe(0);
  });

  it('renames the target when a name is given, keeping its icon and color', async () => {
    const old = await category('Supermarket', { icon: '🏪', color: '#111111' });
    const target = await category('Groceries', { icon: '🛒', color: '#4FBF7F' });

    const merged = await service.merge(old.id, USER_ID, { targetId: target.id, name: '  Food shopping ' });

    expect(merged).toMatchObject({ name: 'Food shopping', icon: '🛒', color: '#4FBF7F' });
  });

  it('keeps the target name when no name is given', async () => {
    const old = await category('Supermarket');
    const target = await category('Groceries');
    const merged = await service.merge(old.id, USER_ID, { targetId: target.id });
    expect(merged.name).toBe('Groceries');
  });

  it('moves a budget to the target for a month only the old category budgeted', async () => {
    const old = await category('Supermarket');
    const target = await category('Groceries');
    await budget(old.id, '2026-09', 120, { rollover: true });

    await service.merge(old.id, USER_ID, { targetId: target.id });

    const b = await ds.getRepository(Budget).findOneByOrFail({ categoryId: target.id, month: '2026-09' });
    expect(Number(b.amount)).toBe(120);
    expect(b.rollover).toBe(true);
  });

  it('adds the amounts when both categories budgeted the same month, keeping the target’s settings', async () => {
    const old = await category('Supermarket');
    const target = await category('Groceries');
    await budget(old.id, '2026-10', 120, { rollover: true, notifyEnabled: true });
    await budget(target.id, '2026-10', 300, { rollover: false, notifyEnabled: false, notifyThreshold: 90 });

    await service.merge(old.id, USER_ID, { targetId: target.id });

    const rows = await ds.getRepository(Budget).findBy({ month: '2026-10' });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ categoryId: target.id, rollover: false, notifyEnabled: false, notifyThreshold: 90 });
    expect(Number(rows[0].amount)).toBe(420);
  });

  it('retargets categorization rules and drops the ones that would collide', async () => {
    const old = await category('Supermarket');
    const target = await category('Groceries');
    await rule(old.id, 'WHOLE FOODS');     // target already has this match → dropped
    await rule(old.id, 'COSTCO');          // unique → retargeted
    await rule(target.id, 'whole foods');

    await service.merge(old.id, USER_ID, { targetId: target.id });

    const rules = await ds.getRepository(CategorizationRule).findBy({ userId: USER_ID });
    expect(rules).toHaveLength(2);
    expect(rules.every((r) => r.categoryId === target.id)).toBe(true);
    expect(rules.map((r) => r.matchValue.toLowerCase()).sort()).toEqual(['costco', 'whole foods']);
  });

  it('retargets recurring rules', async () => {
    const old = await category('Supermarket');
    const target = await category('Groceries');
    await recurring(old.id, 'HelloFresh');

    await service.merge(old.id, USER_ID, { targetId: target.id });

    const r = await ds.getRepository(RecurringRule).findOneByOrFail({ name: 'HelloFresh' });
    expect(r.categoryId).toBe(target.id);
  });

  it('refuses to merge a category into itself', async () => {
    const old = await category('Supermarket');
    await expect(service.merge(old.id, USER_ID, { targetId: old.id })).rejects.toBeInstanceOf(BadRequestException);
    expect(await ds.getRepository(Category).countBy({ id: old.id })).toBe(1);
  });

  it('refuses when either category belongs to someone else', async () => {
    const mine = await category('Supermarket');
    const theirs = await category('Groceries', { userId: 'user-2' });
    await expect(service.merge(mine.id, USER_ID, { targetId: theirs.id })).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.merge(theirs.id, USER_ID, { targetId: mine.id })).rejects.toBeInstanceOf(ForbiddenException);
    expect(await ds.getRepository(Category).count()).toBe(2);
  });

  it('404s when the target does not exist', async () => {
    const old = await category('Supermarket');
    await expect(service.merge(old.id, USER_ID, { targetId: 'nope' })).rejects.toBeInstanceOf(NotFoundException);
  });
});
