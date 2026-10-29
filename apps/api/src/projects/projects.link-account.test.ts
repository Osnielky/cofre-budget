import { describe, it, expect, beforeEach } from 'vitest';
import { DataSource } from 'typeorm';
import { BadRequestException } from '@nestjs/common';
import { User } from '../users/user.entity';
import { Project } from './project.entity';
import { ProjectCategory } from './project-category.entity';
import { Transaction } from '../transactions/transaction.entity';
import { Category } from '../categories/category.entity';
import { BankAccount } from '../bank-accounts/bank-account.entity';
import { CategorizationRule } from '../categorization-rules/categorization-rule.entity';
import { ProjectsService } from './projects.service';

let ds: DataSource;
let service: ProjectsService;
let brokerage: BankAccount;
let checking: BankAccount;
let foreign: BankAccount;

beforeEach(async () => {
  ds = new DataSource({
    type: 'better-sqlite3', database: ':memory:', dropSchema: true,
    entities: [User, Project, ProjectCategory, Transaction, Category, BankAccount, CategorizationRule],
    synchronize: true,
  });
  await ds.initialize();
  const users = ds.getRepository(User);
  await users.save(users.create({ id: 'u1', email: 'u1@example.com' }));
  await users.save(users.create({ id: 'u2', email: 'u2@example.com' }));
  const accounts = ds.getRepository(BankAccount);
  brokerage = await accounts.save(accounts.create({ userId: 'u1', bankName: 'Charles Schwab', accountName: 'Individual', accountType: 'investment', balance: 1 }));
  checking = await accounts.save(accounts.create({ userId: 'u1', bankName: 'Chase', accountName: 'Checking', accountType: 'checking', balance: 1 }));
  foreign = await accounts.save(accounts.create({ userId: 'u2', bankName: 'Fidelity', accountName: 'Brokerage', accountType: 'investment', balance: 1 }));
  service = new ProjectsService(ds.getRepository(Project), ds.getRepository(ProjectCategory), ds.getRepository(Transaction), ds.getRepository(BankAccount));
});

describe('project ↔ investment account link', () => {
  it('links on create and on update, and unlinks with null', async () => {
    const created = await service.create('u1', { name: 'Schwab trading', type: 'trading', bankAccountId: brokerage.id });
    expect(created.bankAccountId).toBe(brokerage.id);
    const unlinked = await service.update(created.id, 'u1', { bankAccountId: null });
    expect(unlinked.bankAccountId).toBeNull();
    const relinked = await service.update(created.id, 'u1', { bankAccountId: brokerage.id });
    expect(relinked.bankAccountId).toBe(brokerage.id);
    expect((await service.findAllByUser('u1'))[0].bankAccountId).toBe(brokerage.id);
  });

  it('refuses a checking account and another user\'s brokerage', async () => {
    await expect(service.create('u1', { name: 'x', type: 'trading', bankAccountId: checking.id })).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.create('u1', { name: 'x', type: 'trading', bankAccountId: foreign.id })).rejects.toBeInstanceOf(BadRequestException);
    expect(await ds.getRepository(Project).count()).toBe(0);
  });

  it('leaves the link alone when the update does not mention it', async () => {
    const created = await service.create('u1', { name: 'Schwab trading', type: 'trading', bankAccountId: brokerage.id });
    const renamed = await service.update(created.id, 'u1', { name: 'Renamed' });
    expect(renamed.bankAccountId).toBe(brokerage.id);
  });
});
