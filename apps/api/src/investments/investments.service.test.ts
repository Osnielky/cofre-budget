import { describe, it, expect, beforeEach } from 'vitest';
import { DataSource } from 'typeorm';
import { NotFoundException } from '@nestjs/common';
import { User } from '../users/user.entity';
import { Transaction } from '../transactions/transaction.entity';
import { Category } from '../categories/category.entity';
import { BankAccount } from '../bank-accounts/bank-account.entity';
import { Project } from '../projects/project.entity';
import { ProjectCategory } from '../projects/project-category.entity';
import { ProjectAccount } from '../projects/project-account.entity';
import { CategorizationRule } from '../categorization-rules/categorization-rule.entity';
import { InvestmentsService } from './investments.service';

let ds: DataSource;
let service: InvestmentsService;
let schwab: BankAccount;
let futures: BankAccount;
let project: Project;

beforeEach(async () => {
  ds = new DataSource({
    type: 'better-sqlite3', database: ':memory:', dropSchema: true,
    entities: [User, Transaction, Category, BankAccount, Project, ProjectCategory, ProjectAccount, CategorizationRule],
    synchronize: true,
  });
  await ds.initialize();
  const users = ds.getRepository(User);
  await users.save(users.create({ id: 'u1', email: 'u1@example.com' }));
  await users.save(users.create({ id: 'u2', email: 'u2@example.com' }));
  const accounts = ds.getRepository(BankAccount);
  schwab = await accounts.save(accounts.create({ userId: 'u1', bankName: 'Charles Schwab', accountName: 'Individual', accountType: 'investment', balance: 37799.53 }));
  futures = await accounts.save(accounts.create({ userId: 'u1', bankName: 'Apex Trader Funding', accountName: 'NQ 50K', accountType: 'investment', balance: 50000 }));
  const tx = ds.getRepository(Transaction);
  await tx.save(tx.create({ userId: 'u1', bankAccountId: schwab.id, name: 'TRANSFER FROM CHECKING', amount: 5000, date: '2026-09-01', plaidCategory: ['cash', 'deposit'] }));
  await tx.save(tx.create({ userId: 'u1', bankAccountId: schwab.id, name: 'BUY VTI', amount: -2401.2, date: '2026-10-12', plaidCategory: ['buy', 'buy'], symbol: 'VTI', securityName: 'Vanguard Total Stock Market ETF', quantity: 10, price: 240.12, fees: null }));
  await tx.save(tx.create({ userId: 'u1', bankAccountId: schwab.id, name: 'SELL VTI', amount: 2500, date: '2026-10-20', plaidCategory: ['sell', 'sell'], symbol: 'VTI', quantity: -10, price: 250, fees: 0 }));
  await tx.save(tx.create({ userId: 'u1', bankAccountId: schwab.id, name: 'DIVIDEND VTI', amount: 45.5, date: '2026-10-15', plaidCategory: ['cash', 'dividend'], symbol: 'VTI' }));
  await tx.save(tx.create({ userId: 'u1', bankAccountId: futures.id, name: 'BUY MNQ', amount: -200, date: '2026-10-05', plaidCategory: ['buy', 'buy'], symbol: 'MNQ', quantity: 2, price: 100 }));
  await tx.save(tx.create({ userId: 'u1', bankAccountId: futures.id, name: 'SELL MNQ', amount: 180, date: '2026-10-06', plaidCategory: ['sell', 'sell'], symbol: 'MNQ', quantity: -2, price: 90 }));
  const projects = ds.getRepository(Project);
  project = await projects.save(projects.create({ userId: 'u1', name: 'Trading', type: 'trading', icon: '📈', purchasePrice: 0, status: 'active' }));
  const links = ds.getRepository(ProjectAccount);
  await links.save(links.create({ userId: 'u1', projectId: project.id, bankAccountId: schwab.id }));
  await links.save(links.create({ userId: 'u1', projectId: project.id, bankAccountId: futures.id }));
  service = new InvestmentsService(ds.getRepository(Transaction), ds.getRepository(BankAccount), ds.getRepository(Project), ds.getRepository(ProjectAccount));
});

describe('InvestmentsService.performance', () => {
  it('reads the structured columns off the account rows and names the account', async () => {
    const p = await service.performance('u1', schwab.id);
    expect(p.account).toEqual({ id: schwab.id, bankName: 'Charles Schwab', accountName: 'Individual', accountType: 'investment' });
    expect(p).toMatchObject({ rows: 4, realizedPnl: 98.8, income: 45.5, contributions: 5000, netResult: 144.3 });
    expect(p.bySymbol[0]).toMatchObject({ symbol: 'VTI', name: 'Vanguard Total Stock Market ETF', realized: 98.8, closedTrades: 1, wins: 1 });
  });

  it("never reads another user's account", async () => {
    await expect(service.performance('u2', schwab.id)).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('InvestmentsService.performanceForProject', () => {
  it('returns each linked account on its own plus the combined result', async () => {
    const p = await service.performanceForProject('u1', project.id);
    expect(p.project).toEqual({ id: project.id, name: 'Trading' });
    expect(p.accounts.map((a) => [a.account.bankName, a.realizedPnl])).toEqual([['Charles Schwab', 98.8], ['Apex Trader Funding', -20]]);
    expect(p.combined).toMatchObject({ rows: 6, realizedPnl: 78.8, income: 45.5, contributions: 5000, netResult: 124.3 });
    expect(p.combined.trades).toMatchObject({ closed: 2, wins: 1, losses: 1, winRate: 50 });
    expect(p.combined.trades.largestLoss).toMatchObject({ symbol: 'MNQ', account: 'Apex Trader Funding' });
    expect(p.combined.recentClosed.map((t) => [t.symbol, t.account])).toEqual([['VTI', 'Charles Schwab'], ['MNQ', 'Apex Trader Funding']]);
  });

  it('a project without links is an empty combined summary', async () => {
    await ds.getRepository(ProjectAccount).delete({ projectId: project.id });
    const p = await service.performanceForProject('u1', project.id);
    expect(p.accounts).toEqual([]);
    expect(p.combined).toMatchObject({ rows: 0, realizedPnl: 0 });
  });

  it("never reads another user's project", async () => {
    await expect(service.performanceForProject('u2', project.id)).rejects.toBeInstanceOf(NotFoundException);
  });
});
