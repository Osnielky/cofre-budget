import { describe, it, expect, beforeEach } from 'vitest';
import { DataSource } from 'typeorm';
import { BadRequestException, NotFoundException } from '@nestjs/common';
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
let checking: BankAccount;

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
  schwab = await accounts.save(accounts.create({ userId: 'u1', bankName: 'Charles Schwab', accountName: 'Individual', accountType: 'investment', balance: 1, provider: 'plaid' }));
  checking = await accounts.save(accounts.create({ userId: 'u1', bankName: 'Chase', accountName: 'Checking', accountType: 'checking', balance: 1 }));
  service = new ProjectsService(ds.getRepository(Project), ds.getRepository(ProjectCategory), ds.getRepository(Transaction), ds.getRepository(BankAccount), ds.getRepository(ProjectAccount));
});

describe('manual trading accounts', () => {
  it('creates a manual investment account and follows it with prop-firm defaults', async () => {
    const project = await service.create('u1', { name: 'Trading', type: 'trading' });
    const linked = await service.addManualAccount(project.id, 'u1', { name: '50K #1', firm: 'Topstep', accountSize: 50000, startedAt: '2026-10-01' });

    expect(linked).toMatchObject({ bankName: 'Topstep', accountName: '50K #1', accountType: 'investment', provider: 'manual', kind: 'prop_firm', status: 'evaluation', firm: 'Topstep', accountSize: 50000, startedAt: '2026-10-01', endedAt: null });
    const account = await ds.getRepository(BankAccount).findOneByOrFail({ id: linked.id });
    expect(account).toMatchObject({ userId: 'u1', accountType: 'investment', provider: 'manual' });
    expect((await service.findAllByUser('u1'))[0].accounts.map((a) => a.id)).toEqual([linked.id]);
  });

  it('refuses a manual account on a non-trading project, on another user\'s project, and without a name', async () => {
    const car = await service.create('u1', { name: 'Civic', type: 'vehicle' });
    await expect(service.addManualAccount(car.id, 'u1', { name: 'x', firm: 'Topstep' })).rejects.toBeInstanceOf(BadRequestException);
    const trading = await service.create('u1', { name: 'Trading', type: 'trading' });
    await expect(service.addManualAccount(trading.id, 'u2', { name: 'x', firm: 'Topstep' })).rejects.toThrow();
    await expect(service.addManualAccount(trading.id, 'u1', { name: '  ', firm: 'Topstep' })).rejects.toBeInstanceOf(BadRequestException);
    expect(await ds.getRepository(BankAccount).count()).toBe(2);
  });

  it('updates metadata; failed/closed set endedAt when empty and reopening clears it', async () => {
    const project = await service.create('u1', { name: 'Trading', type: 'trading' });
    const linked = await service.addManualAccount(project.id, 'u1', { name: '50K #1', firm: 'Topstep' });

    const funded = await service.updateAccountMeta(project.id, linked.id, 'u1', { status: 'funded', notes: 'passed on day 9' });
    expect(funded).toMatchObject({ status: 'funded', notes: 'passed on day 9', endedAt: null });

    const failed = await service.updateAccountMeta(project.id, linked.id, 'u1', { status: 'failed' });
    expect(failed.status).toBe('failed');
    expect(failed.endedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);

    const explicit = await service.updateAccountMeta(project.id, linked.id, 'u1', { status: 'closed', endedAt: '2026-10-20' });
    expect(explicit).toMatchObject({ status: 'closed', endedAt: '2026-10-20' });

    const reopened = await service.updateAccountMeta(project.id, linked.id, 'u1', { status: 'evaluation' });
    expect(reopened).toMatchObject({ status: 'evaluation', endedAt: null });
  });

  it('rejects an unknown status or kind, and an account the project does not follow', async () => {
    const project = await service.create('u1', { name: 'Trading', type: 'trading' });
    const linked = await service.addManualAccount(project.id, 'u1', { name: '50K #1', firm: 'Topstep' });
    await expect(service.updateAccountMeta(project.id, linked.id, 'u1', { status: 'rich' as never })).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.updateAccountMeta(project.id, linked.id, 'u1', { kind: 'hedge' as never })).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.updateAccountMeta(project.id, schwab.id, 'u1', { status: 'funded' })).rejects.toBeInstanceOf(NotFoundException);
  });

  it('removes an account from the project without deleting it', async () => {
    const project = await service.create('u1', { name: 'Trading', type: 'trading', bankAccountIds: [schwab.id] });
    await service.removeAccount(project.id, schwab.id, 'u1');
    expect((await service.findAllByUser('u1'))[0].accounts).toEqual([]);
    expect(await ds.getRepository(BankAccount).countBy({ id: schwab.id })).toBe(1);
    await expect(service.removeAccount(project.id, schwab.id, 'u1')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('replaceLinks keeps the metadata of links that stay and defaults new manual accounts to prop_firm', async () => {
    const project = await service.create('u1', { name: 'Trading', type: 'trading' });
    const topstep = await service.addManualAccount(project.id, 'u1', { name: '50K #1', firm: 'Topstep', status: 'funded' });
    const updated = await service.update(project.id, 'u1', { name: 'Renamed', bankAccountIds: [topstep.id, schwab.id] });
    expect(updated.accounts.map((a) => [a.id, a.kind, a.status])).toEqual([[topstep.id, 'prop_firm', 'funded'], [schwab.id, 'broker', 'active']]);

    const manual = await ds.getRepository(BankAccount).save(ds.getRepository(BankAccount).create({ userId: 'u1', bankName: 'Apex', accountName: '100K', accountType: 'investment', balance: 0, provider: 'manual' }));
    const again = await service.update(project.id, 'u1', { bankAccountIds: [topstep.id, manual.id] });
    expect(again.accounts.map((a) => [a.id, a.kind, a.status])).toEqual([[topstep.id, 'prop_firm', 'funded'], [manual.id, 'prop_firm', 'evaluation']]);
    expect(await ds.getRepository(ProjectAccount).count()).toBe(2);
  });

  it('rejects a checking account as a manual trading account', async () => {
    const project = await service.create('u1', { name: 'Trading', type: 'trading' });
    await expect(service.update(project.id, 'u1', { bankAccountIds: [checking.id] })).rejects.toBeInstanceOf(BadRequestException);
  });

  const attributed = async (projectId: string, tradingAccountId: string) => {
    const txs = ds.getRepository(Transaction);
    return txs.save(txs.create({ userId: 'u1', bankAccountId: checking.id, source: 'manual', amount: -25, name: 'Eval fee', date: '2026-10-05', projectId, tradingAccountId }));
  };

  it('removeAccount clears attributions to that account and keeps the row and the bank account', async () => {
    const project = await service.create('u1', { name: 'Trading', type: 'trading', bankAccountIds: [schwab.id] });
    const tx = await attributed(project.id, schwab.id);
    await service.removeAccount(project.id, schwab.id, 'u1');
    const after = await ds.getRepository(Transaction).findOneByOrFail({ id: tx.id });
    expect(after.tradingAccountId).toBeNull();
    expect(after.projectId).toBe(project.id);
    expect(await ds.getRepository(BankAccount).countBy({ id: schwab.id })).toBe(1);
  });

  it('replaceLinks drops a link that leaves, clears its attributions and keeps the remaining link metadata', async () => {
    const project = await service.create('u1', { name: 'Trading', type: 'trading' });
    const topstep = await service.addManualAccount(project.id, 'u1', { name: '50K #1', firm: 'Topstep', status: 'funded' });
    await service.update(project.id, 'u1', { bankAccountIds: [topstep.id, schwab.id] });
    const dropped = await attributed(project.id, schwab.id);
    const kept = await attributed(project.id, topstep.id);

    const updated = await service.update(project.id, 'u1', { bankAccountIds: [topstep.id] });
    expect(updated.accounts.map((a) => [a.id, a.status])).toEqual([[topstep.id, 'funded']]);
    expect(await ds.getRepository(ProjectAccount).countBy({ bankAccountId: schwab.id })).toBe(0);
    const txs = ds.getRepository(Transaction);
    expect((await txs.findOneByOrFail({ id: dropped.id })).tradingAccountId).toBeNull();
    expect((await txs.findOneByOrFail({ id: kept.id })).tradingAccountId).toBe(topstep.id);
  });
});

describe('attributing project transactions to an account', () => {
  async function setup() {
    const project = await service.create('u1', { name: 'Trading', type: 'trading' });
    const topstep = await service.addManualAccount(project.id, 'u1', { name: '50K #1', firm: 'Topstep' });
    const txs = ds.getRepository(Transaction);
    const evalFee = await txs.save(txs.create({ userId: 'u1', bankAccountId: checking.id, name: 'TOPSTEP COMBINE', amount: -149, date: '2026-10-01', projectId: project.id }));
    const payout = await txs.save(txs.create({ userId: 'u1', bankAccountId: checking.id, name: 'TOPSTEP PAYOUT', amount: 1000, date: '2026-10-20', projectId: project.id }));
    const unrelated = await txs.save(txs.create({ userId: 'u1', bankAccountId: checking.id, name: 'GROCERIES', amount: -40, date: '2026-10-02' }));
    return { project, topstep, evalFee, payout, unrelated, txs };
  }

  it('assigns one or many rows, and clears with null', async () => {
    const { project, topstep, evalFee, payout, txs } = await setup();
    expect(await service.assignTradingAccount(project.id, 'u1', [evalFee.id, payout.id], topstep.id)).toEqual({ updated: 2 });
    expect((await txs.findOneByOrFail({ id: payout.id })).tradingAccountId).toBe(topstep.id);
    expect(await service.assignTradingAccount(project.id, 'u1', [payout.id], null)).toEqual({ updated: 1 });
    expect((await txs.findOneByOrFail({ id: payout.id })).tradingAccountId).toBeNull();
    expect((await txs.findOneByOrFail({ id: evalFee.id })).tradingAccountId).toBe(topstep.id);
  });

  it('refuses an account the project does not follow, and rows that are not the project\'s', async () => {
    const { project, topstep, evalFee, unrelated } = await setup();
    await expect(service.assignTradingAccount(project.id, 'u1', [evalFee.id], schwab.id)).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.assignTradingAccount(project.id, 'u1', [unrelated.id], topstep.id)).rejects.toBeInstanceOf(BadRequestException);
    const other = await service.create('u1', { name: 'Other', type: 'trading' });
    await expect(service.assignTradingAccount(other.id, 'u1', [evalFee.id], topstep.id)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('links with an account in one call, and unlinking or removing the account clears it', async () => {
    const { project, topstep, unrelated, txs } = await setup();
    await service.linkTransaction(project.id, unrelated.id, 'u1', undefined, topstep.id);
    expect((await txs.findOneByOrFail({ id: unrelated.id }))).toMatchObject({ projectId: project.id, tradingAccountId: topstep.id });
    await service.unlinkTransaction(unrelated.id, 'u1');
    expect((await txs.findOneByOrFail({ id: unrelated.id }))).toMatchObject({ projectId: null, tradingAccountId: null });

    const again = await txs.save(txs.create({ userId: 'u1', bankAccountId: checking.id, name: 'RESET', amount: -99, date: '2026-10-05', projectId: project.id, tradingAccountId: topstep.id }));
    await service.removeAccount(project.id, topstep.id, 'u1');
    expect((await txs.findOneByOrFail({ id: again.id })).tradingAccountId).toBeNull();
  });

  it('linking with an account the project does not follow fails before anything is saved', async () => {
    const { project, unrelated, txs } = await setup();
    await expect(service.linkTransaction(project.id, unrelated.id, 'u1', undefined, schwab.id)).rejects.toBeInstanceOf(BadRequestException);
    expect((await txs.findOneByOrFail({ id: unrelated.id })).projectId).toBeNull();
  });

  it('deleting the project leaves its transactions with no project, category or account', async () => {
    const { project, topstep, evalFee, txs } = await setup();
    await service.assignTradingAccount(project.id, 'u1', [evalFee.id], topstep.id);
    await service.remove(project.id, 'u1');
    expect(await txs.findOneByOrFail({ id: evalFee.id })).toMatchObject({ projectId: null, projectCategoryId: null, tradingAccountId: null });
  });
});
