import { describe, it, expect, beforeEach } from 'vitest';
import { DataSource } from 'typeorm';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { User } from '../users/user.entity';
import { BankAccount } from '../bank-accounts/bank-account.entity';
import { PlaidItem } from '../plaid/plaid-item.entity';
import { CreditCardDetail } from './credit-card-detail.entity';
import { CardProfile } from './card-profile.entity';
import { CreditCardsService } from './credit-cards.service';
import type { PlaidCardData } from './card-types';

async function makeDataSource() {
  const ds = new DataSource({
    type: 'better-sqlite3', database: ':memory:', dropSchema: true,
    entities: [User, BankAccount, PlaidItem, CreditCardDetail, CardProfile],
    synchronize: true,
  });
  await ds.initialize();
  return ds;
}

const plaidData: PlaidCardData = {
  creditLimit: 8000, officialName: 'Citi Double Cash',
  aprs: [{ type: 'purchase', percentage: 19.24, balanceSubjectTo: 1200, interestCharged: 19 }],
  lastStatementBalance: 1200, lastStatementDate: '2026-10-02', minimumPayment: 40, nextPaymentDueDate: '2026-10-29',
  lastPaymentAmount: 300, lastPaymentDate: '2026-09-28', isOverdue: false,
};

describe('CreditCardsService', () => {
  let ds: DataSource;
  let service: CreditCardsService;
  let card: BankAccount;

  beforeEach(async () => {
    ds = await makeDataSource();
    const users = ds.getRepository(User);
    await users.save(users.create({ id: 'u1', email: 'u1@example.com' }));
    await users.save(users.create({ id: 'u2', email: 'u2@example.com' }));
    const accounts = ds.getRepository(BankAccount);
    card = await accounts.save(accounts.create({
      userId: 'u1', bankName: 'Citi', accountName: 'Double Cash', accountType: 'credit',
      balance: 1234.5, provider: 'plaid', plaidAccountId: 'p-card',
    }));
    await accounts.save(accounts.create({ userId: 'u1', bankName: 'Citi', accountName: 'Checking', accountType: 'checking', balance: 50 }));
    service = new CreditCardsService(
      ds.getRepository(CreditCardDetail), ds.getRepository(CardProfile),
      ds.getRepository(BankAccount), ds.getRepository(PlaidItem),
    );
  });

  it('lists only credit accounts, creating a pending detail row for Plaid cards', async () => {
    const list = await service.listForUser('u1');
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ accountId: card.id, balance: 1234.5, liabilitiesStatus: 'pending', aprs: [], hasBankData: false });
    expect(await ds.getRepository(CreditCardDetail).count()).toBe(1);
  });

  it('shows an overpaid Plaid card (negative current) as zero debt, not debt', async () => {
    await ds.getRepository(BankAccount).update({ id: card.id }, { balance: -25 });
    const list = await service.listForUser('u1');
    expect(list[0].balance).toBe(0);
  });

  it('gives manual credit accounts the manual status', async () => {
    const accounts = ds.getRepository(BankAccount);
    await accounts.save(accounts.create({ userId: 'u2', bankName: 'Amex', accountName: 'Blue', accountType: 'credit', balance: 10 }));
    const [view] = await service.listForUser('u2');
    expect(view.liabilitiesStatus).toBe('manual');
  });

  it('concurrent list creates one row', async () => {
    await Promise.all([service.listForUser('u1'), service.listForUser('u1')]);
    expect(await ds.getRepository(CreditCardDetail).count()).toBe(1);
  });

  it('applyPlaidReport stores values, snapshot and status', async () => {
    await service.applyPlaidReport('u1', { plaidAccountId: 'p-card', data: plaidData, status: 'synced' });
    const [view] = await service.listForUser('u1');
    expect(view).toMatchObject({
      creditLimit: 8000, officialName: 'Citi Double Cash', minimumPayment: 40,
      nextPaymentDueDate: '2026-10-29', liabilitiesStatus: 'synced', hasBankData: true,
    });
    expect(view.aprs[0].percentage).toBe(19.24);
    expect(view.liabilitiesSyncedAt).not.toBeNull();
  });

  it('applyPlaidReport ignores accounts of other users and non-credit accounts', async () => {
    await service.applyPlaidReport('u2', { plaidAccountId: 'p-card', data: plaidData, status: 'synced' });
    expect(await ds.getRepository(CreditCardDetail).count()).toBe(0);
  });

  it('a manual edit survives the next sync', async () => {
    await service.applyPlaidReport('u1', { plaidAccountId: 'p-card', data: plaidData, status: 'synced' });
    await service.updateDetail('u1', card.id, { creditLimit: 9500 });
    await service.applyPlaidReport('u1', { plaidAccountId: 'p-card', data: { ...plaidData, creditLimit: 8000 }, status: 'synced' });
    const [view] = await service.listForUser('u1');
    expect(view.creditLimit).toBe(9500);
    expect(view.manualFields).toEqual(['creditLimit']);
  });

  it('useBankData restores the Plaid values', async () => {
    await service.applyPlaidReport('u1', { plaidAccountId: 'p-card', data: plaidData, status: 'synced' });
    await service.updateDetail('u1', card.id, { creditLimit: 9500 });
    const view = await service.useBankData('u1', card.id);
    expect(view.creditLimit).toBe(8000);
    expect(view.manualFields).toEqual([]);
  });

  it('useBankData on a manual card is a 400', async () => {
    const accounts = ds.getRepository(BankAccount);
    const manual = await accounts.save(accounts.create({ userId: 'u1', bankName: 'Amex', accountName: 'Blue', accountType: 'credit', balance: 0 }));
    await expect(service.useBankData('u1', manual.id)).rejects.toThrow(BadRequestException);
  });

  it("rejects other user's account", async () => {
    await expect(service.updateDetail('u2', card.id, { creditLimit: 1 })).rejects.toThrow(NotFoundException);
    expect(await ds.getRepository(CreditCardDetail).count()).toBe(0);
  });

  it('rejects non-credit account', async () => {
    const checking = await ds.getRepository(BankAccount).findOneByOrFail({ accountName: 'Checking' });
    await expect(service.updateDetail('u1', checking.id, { creditLimit: 1 })).rejects.toThrow(NotFoundException);
  });

  it('ignores client-sent id / userId / status on PATCH', async () => {
    const view = await service.updateDetail('u1', card.id, { creditLimit: 500, userId: 'u2', id: 'x', liabilitiesStatus: 'synced' });
    expect(view.creditLimit).toBe(500);
    const row = await ds.getRepository(CreditCardDetail).findOneByOrFail({ bankAccountId: card.id });
    expect(row.userId).toBe('u1');
    expect(row.liabilitiesStatus).toBe('pending');
  });

  it('saves and reads the card profile, ignoring userId in the body', async () => {
    expect(await service.getProfile('u1')).toBeNull();
    await service.saveProfile('u1', { goal: 'cashback', monthlyDebtBudget: 400, userId: 'u2' });
    const saved = await service.saveProfile('u1', { annualFeeOk: true });
    expect(saved).toEqual({
      goal: 'cashback', annualFeeOk: true, creditScoreBand: null,
      monthlyDebtBudget: 400, plannedPurchaseAmount: null, plannedPurchaseNote: null,
    });
    expect(await service.getProfile('u2')).toBeNull();
  });
});
