import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BankAccount } from '../bank-accounts/bank-account.entity';
import { PlaidItem } from '../plaid/plaid-item.entity';
import { CreditCardDetail } from './credit-card-detail.entity';
import { CardProfile } from './card-profile.entity';
import type { CardProfileView, CardView, LiabilitiesStatus, PlaidCardData } from './card-types';
import { MANUAL_FIELDS, mergePlaidData, mergeSnapshot } from './detail-merge';
import { validateDetailPatch, validateProfile } from './card-validation';

export interface PlaidCardReport {
  plaidAccountId: string;
  data: PlaidCardData;
  status: LiabilitiesStatus;
}

const PROFILE_FIELDS = ['goal', 'annualFeeOk', 'creditScoreBand', 'monthlyDebtBudget', 'plannedPurchaseAmount', 'plannedPurchaseNote'] as const;

/* Postgres returns decimals as strings; sqlite as numbers. */
const num = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v));

@Injectable()
export class CreditCardsService {
  constructor(
    @InjectRepository(CreditCardDetail) private details: Repository<CreditCardDetail>,
    @InjectRepository(CardProfile) private profiles: Repository<CardProfile>,
    @InjectRepository(BankAccount) private accounts: Repository<BankAccount>,
    @InjectRepository(PlaidItem) private items: Repository<PlaidItem>,
  ) {}

  async listForUser(userId: string): Promise<CardView[]> {
    const cards = await this.accounts.find({ where: { userId, accountType: 'credit' }, order: { createdAt: 'ASC' } });
    if (cards.length === 0) return [];
    const items = await this.items.find({ where: { userId } });
    const statusByItem = new Map(items.map((i) => [i.id, i.status]));
    const views: CardView[] = [];
    for (const account of cards) {
      const detail = await this.ensureDetail(account);
      views.push(toView(account, detail, account.plaidItemId ? statusByItem.get(account.plaidItemId) ?? null : null));
    }
    return views;
  }

  async updateDetail(userId: string, accountId: string, body: unknown): Promise<CardView> {
    const patch = validateDetailPatch(body);
    const account = await this.ownedCreditAccount(userId, accountId);
    const detail = await this.ensureDetail(account);
    const edited = new Set(detail.manualFields ?? []);
    for (const key of MANUAL_FIELDS) {
      if (!(key in patch)) continue;
      (detail as unknown as Record<string, unknown>)[key] = patch[key];
      edited.add(key);
    }
    detail.manualFields = [...edited];
    detail.manualEditedAt = new Date();
    await this.details.save(detail);
    return this.viewOf(account, detail);
  }

  async useBankData(userId: string, accountId: string): Promise<CardView> {
    const account = await this.ownedCreditAccount(userId, accountId);
    if (account.provider !== 'plaid') throw new BadRequestException('This card is not connected to a bank');
    const detail = await this.ensureDetail(account);
    detail.manualFields = [];
    detail.manualEditedAt = null;
    if (detail.plaidData) Object.assign(detail, mergePlaidData({ manualFields: [], manualEditedAt: null }, detail.plaidData).values);
    await this.details.save(detail);
    return this.viewOf(account, detail);
  }

  /* Called by PlaidService for each credit account on an Item. Unknown accounts, other
     users' accounts and non-credit accounts are skipped. */
  async applyPlaidReport(userId: string, report: PlaidCardReport): Promise<void> {
    const account = await this.accounts.findOneBy({ userId, plaidAccountId: report.plaidAccountId });
    if (!account || account.accountType !== 'credit') return;
    const detail = await this.ensureDetail(account);
    const merged = mergePlaidData({ manualFields: detail.manualFields ?? [], manualEditedAt: detail.manualEditedAt }, report.data);
    Object.assign(detail, merged.values);
    detail.manualFields = merged.manualFields;
    detail.plaidData = mergeSnapshot(detail.plaidData, report.data);
    detail.liabilitiesStatus = report.status;
    if (report.status === 'synced') detail.liabilitiesSyncedAt = new Date();
    await this.details.save(detail);
  }

  async getProfile(userId: string): Promise<CardProfileView | null> {
    const profile = await this.profiles.findOneBy({ userId });
    return profile ? profileView(profile) : null;
  }

  async saveProfile(userId: string, body: unknown): Promise<CardProfileView> {
    const input = validateProfile(body);
    const profile = (await this.profiles.findOneBy({ userId })) ?? this.profiles.create({ userId });
    for (const key of PROFILE_FIELDS) {
      if (key in input) (profile as unknown as Record<string, unknown>)[key] = input[key];
    }
    return profileView(await this.profiles.save(profile));
  }

  private async ownedCreditAccount(userId: string, accountId: string): Promise<BankAccount> {
    const account = await this.accounts.findOneBy({ id: accountId, userId });
    if (!account || account.accountType !== 'credit') throw new NotFoundException('Card not found');
    return account;
  }

  /* Lazily creates the detail row. Two requests can race to create it; the unique
     index on bankAccountId makes the loser fail, and it re-reads the winner's row. */
  private async ensureDetail(account: BankAccount): Promise<CreditCardDetail> {
    const existing = await this.details.findOneBy({ bankAccountId: account.id });
    if (existing) return existing;
    try {
      return await this.details.save(this.details.create({
        userId: account.userId,
        bankAccountId: account.id,
        liabilitiesStatus: account.provider === 'plaid' ? 'pending' : 'manual',
        manualFields: [],
      }));
    } catch (err) {
      const winner = await this.details.findOneBy({ bankAccountId: account.id });
      if (winner) return winner;
      throw err;
    }
  }

  private async viewOf(account: BankAccount, detail: CreditCardDetail): Promise<CardView> {
    const item = account.plaidItemId ? await this.items.findOneBy({ id: account.plaidItemId }) : null;
    return toView(account, detail, item?.status ?? null);
  }
}

function toView(account: BankAccount, d: CreditCardDetail, plaidItemStatus: string | null): CardView {
  return {
    accountId: account.id,
    bankName: account.bankName,
    accountName: account.accountName,
    last4: account.last4 ?? null,
    // Plaid reports amount owed as a positive `current`; negative means overpaid, not debt.
    // Manual accounts may have owed amounts typed as negatives.
    balance: account.provider === 'plaid' ? Math.max(0, Number(account.balance)) : Math.abs(Number(account.balance)),
    provider: account.provider === 'plaid' ? 'plaid' : 'manual',
    plaidItemId: account.plaidItemId ?? null,
    plaidItemStatus,
    creditLimit: num(d.creditLimit),
    officialName: d.officialName,
    aprs: d.aprs ?? [],
    lastStatementBalance: num(d.lastStatementBalance),
    lastStatementDate: d.lastStatementDate,
    minimumPayment: num(d.minimumPayment),
    nextPaymentDueDate: d.nextPaymentDueDate,
    lastPaymentAmount: num(d.lastPaymentAmount),
    lastPaymentDate: d.lastPaymentDate,
    isOverdue: d.isOverdue,
    promoAprEndsOn: d.promoAprEndsOn,
    rewardsBalance: num(d.rewardsBalance),
    liabilitiesStatus: d.liabilitiesStatus,
    manualFields: d.manualFields ?? [],
    liabilitiesSyncedAt: d.liabilitiesSyncedAt ? new Date(d.liabilitiesSyncedAt).toISOString() : null,
    hasBankData: d.plaidData !== null && d.plaidData !== undefined,
  };
}

function profileView(p: CardProfile): CardProfileView {
  return {
    goal: p.goal ?? null,
    annualFeeOk: p.annualFeeOk ?? null,
    creditScoreBand: p.creditScoreBand ?? null,
    monthlyDebtBudget: num(p.monthlyDebtBudget),
    plannedPurchaseAmount: num(p.plannedPurchaseAmount),
    plannedPurchaseNote: p.plannedPurchaseNote ?? null,
  };
}
