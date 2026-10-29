import { describe, it, expect, beforeEach } from 'vitest';
import { DataSource } from 'typeorm';
import { NotFoundException } from '@nestjs/common';
import { User } from '../users/user.entity';
import { Transaction } from '../transactions/transaction.entity';
import { Category } from '../categories/category.entity';
import { BankAccount } from '../bank-accounts/bank-account.entity';
import { ProjectCategory } from '../projects/project-category.entity';
import { CategorizationRule } from '../categorization-rules/categorization-rule.entity';
import { InvestmentsService } from './investments.service';

let ds: DataSource;
let service: InvestmentsService;
let schwab: BankAccount;

beforeEach(async () => {
  ds = new DataSource({
    type: 'better-sqlite3', database: ':memory:', dropSchema: true,
    entities: [User, Transaction, Category, BankAccount, ProjectCategory, CategorizationRule],
    synchronize: true,
  });
  await ds.initialize();
  const users = ds.getRepository(User);
  await users.save(users.create({ id: 'u1', email: 'u1@example.com' }));
  await users.save(users.create({ id: 'u2', email: 'u2@example.com' }));
  const accounts = ds.getRepository(BankAccount);
  schwab = await accounts.save(accounts.create({ userId: 'u1', bankName: 'Charles Schwab', accountName: 'Individual', accountType: 'investment', balance: 37799.53 }));
  const tx = ds.getRepository(Transaction);
  await tx.save(tx.create({ userId: 'u1', bankAccountId: schwab.id, name: 'TRANSFER FROM CHECKING', amount: 5000, date: '2026-09-01', plaidCategory: ['cash', 'deposit'] }));
  await tx.save(tx.create({ userId: 'u1', bankAccountId: schwab.id, name: 'BUY VTI', amount: -2401.2, date: '2026-10-12', plaidCategory: ['buy', 'buy'], symbol: 'VTI', securityName: 'Vanguard Total Stock Market ETF', quantity: 10, price: 240.12, fees: null }));
  await tx.save(tx.create({ userId: 'u1', bankAccountId: schwab.id, name: 'SELL VTI', amount: 2500, date: '2026-10-20', plaidCategory: ['sell', 'sell'], symbol: 'VTI', quantity: -10, price: 250, fees: 0 }));
  await tx.save(tx.create({ userId: 'u1', bankAccountId: schwab.id, name: 'DIVIDEND VTI', amount: 45.5, date: '2026-10-15', plaidCategory: ['cash', 'dividend'], symbol: 'VTI' }));
  service = new InvestmentsService(ds.getRepository(Transaction), ds.getRepository(BankAccount));
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
