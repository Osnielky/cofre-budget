import { describe, it, expect, beforeEach } from 'vitest';
import { DataSource } from 'typeorm';
import { BadRequestException } from '@nestjs/common';
import { User } from '../users/user.entity';
import { Project } from './project.entity';
import { ProjectCategory } from './project-category.entity';
import { ProjectAccount } from './project-account.entity';
import { Transaction } from '../transactions/transaction.entity';
import { Category } from '../categories/category.entity';
import { BankAccount } from '../bank-accounts/bank-account.entity';
import { CategorizationRule } from '../categorization-rules/categorization-rule.entity';
import { ProjectsService } from './projects.service';

let ds: DataSource;
let service: ProjectsService;
let schwab: BankAccount;
let futures: BankAccount;
let webull: BankAccount;
let checking: BankAccount;
let foreign: BankAccount;

beforeEach(async () => {
  ds = new DataSource({
    type: 'better-sqlite3', database: ':memory:', dropSchema: true,
    entities: [User, Project, ProjectCategory, ProjectAccount, Transaction, Category, BankAccount, CategorizationRule],
    synchronize: true,
  });
  await ds.initialize();
  const users = ds.getRepository(User);
  await users.save(users.create({ id: 'u1', email: 'u1@example.com' }));
  await users.save(users.create({ id: 'u2', email: 'u2@example.com' }));
  const accounts = ds.getRepository(BankAccount);
  const mk = (userId: string, bankName: string, accountName: string, accountType: string) =>
    accounts.save(accounts.create({ userId, bankName, accountName, accountType, balance: 1 }));
  schwab = await mk('u1', 'Charles Schwab', 'Individual', 'investment');
  futures = await mk('u1', 'Apex Trader Funding', 'NQ 50K', 'investment');
  webull = await mk('u1', 'Webull', 'Margin', 'investment');
  checking = await mk('u1', 'Chase', 'Checking', 'checking');
  foreign = await mk('u2', 'Fidelity', 'Brokerage', 'investment');
  service = new ProjectsService(ds.getRepository(Project), ds.getRepository(ProjectCategory), ds.getRepository(Transaction), ds.getRepository(BankAccount), ds.getRepository(ProjectAccount));
});

const ids = (list: { id: string }[]) => list.map((a) => a.id);

describe('project ↔ investment accounts', () => {
  it('links several accounts on create, lists them in link order, and replaces the set on update', async () => {
    const created = await service.create('u1', { name: 'Trading', type: 'trading', bankAccountIds: [schwab.id, futures.id] });
    expect(ids(created.accounts)).toEqual([schwab.id, futures.id]);
    expect(created.accounts[1]).toMatchObject({ bankName: 'Apex Trader Funding', accountName: 'NQ 50K', accountType: 'investment' });

    const updated = await service.update(created.id, 'u1', { bankAccountIds: [webull.id, schwab.id] });
    expect(ids(updated.accounts)).toEqual([webull.id, schwab.id]);
    expect(await ds.getRepository(ProjectAccount).count()).toBe(2);

    const cleared = await service.update(created.id, 'u1', { bankAccountIds: [] });
    expect(cleared.accounts).toEqual([]);
    expect((await service.findAllByUser('u1'))[0].accounts).toEqual([]);
  });

  it('refuses a checking account, another user\'s brokerage, and an account another project already follows', async () => {
    await expect(service.create('u1', { name: 'x', type: 'trading', bankAccountIds: [schwab.id, checking.id] })).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.create('u1', { name: 'x', type: 'trading', bankAccountIds: [foreign.id] })).rejects.toBeInstanceOf(BadRequestException);
    expect(await ds.getRepository(Project).count()).toBe(0);

    const first = await service.create('u1', { name: 'first', type: 'trading', bankAccountIds: [schwab.id] });
    await expect(service.create('u1', { name: 'second', type: 'trading', bankAccountIds: [schwab.id] })).rejects.toThrow(/another project/);
    // Re-sending its own account on the first project is fine.
    expect(ids((await service.update(first.id, 'u1', { bankAccountIds: [schwab.id, futures.id] })).accounts)).toEqual([schwab.id, futures.id]);
  });

  it('leaves the links alone when the update does not mention them, and drops them with the project', async () => {
    const created = await service.create('u1', { name: 'Trading', type: 'trading', bankAccountIds: [schwab.id] });
    expect(ids((await service.update(created.id, 'u1', { name: 'Renamed' })).accounts)).toEqual([schwab.id]);
    await service.remove(created.id, 'u1');
    expect(await ds.getRepository(ProjectAccount).count()).toBe(0);
  });

  it('refuses to file a transaction on a followed account, or a transfer to / from one, under the project', async () => {
    const project = await service.create('u1', { name: 'Trading', type: 'trading', bankAccountIds: [schwab.id] });
    const txs = ds.getRepository(Transaction);
    const mk = (over: Partial<Transaction>) => txs.save(txs.create({ userId: 'u1', name: 'x', amount: 900, date: '2026-10-20', source: 'manual', ...over }));
    const onSchwab = await mk({ bankAccountId: schwab.id, amount: -900 });
    const arrival = await mk({ bankAccountId: checking.id, transferAccountId: schwab.id });
    const unrelated = await mk({ bankAccountId: checking.id, name: 'Apex payout' });

    await expect(service.linkTransaction(project.id, onSchwab.id, 'u1')).rejects.toThrow(/already follows Charles Schwab · Individual/);
    await expect(service.linkTransaction(project.id, arrival.id, 'u1')).rejects.toBeInstanceOf(BadRequestException);
    await service.linkTransaction(project.id, unrelated.id, 'u1');
    expect((await txs.findOneBy({ id: unrelated.id }))!.projectId).toBe(project.id);
    expect((await txs.findOneBy({ id: arrival.id }))!.projectId).toBeNull();

    // Another project (not following Schwab) may still take the arrival — e.g. a prop-firm payout model.
    const other = await service.create('u1', { name: 'Other', type: 'trading' });
    await service.linkTransaction(other.id, arrival.id, 'u1');
    expect((await txs.findOneBy({ id: arrival.id }))!.projectId).toBe(other.id);
  });

  it('findOne carries the accounts too', async () => {
    const created = await service.create('u1', { name: 'Trading', type: 'trading', bankAccountIds: [futures.id] });
    expect(ids((await service.findOne(created.id, 'u1')).accounts)).toEqual([futures.id]);
  });
});
