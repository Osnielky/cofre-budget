import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BankAccount } from './bank-account.entity';
import { Transaction } from '../transactions/transaction.entity';
import { PlaidItem } from '../plaid/plaid-item.entity';
import { PlaidService } from '../plaid/plaid.service';
import { CreateBankAccountDto, BANK_ACCOUNT_FIELDS } from './dto/create-bank-account.dto';
import { pickFields } from '../common/http/pick-fields';

/** Everyone has some cash. New users get this account on their first visit; the
 *  balance stays $0 until they type what they have on hand. */
export const DEFAULT_CASH_ACCOUNT = {
  bankName: 'Cash', accountName: 'My Cash', accountType: 'cash', balance: 0, currency: 'USD', color: '#4FBF7F', provider: 'manual',
} as const;

@Injectable()
export class BankAccountsService {
  constructor(
    @InjectRepository(BankAccount)
    private repo: Repository<BankAccount>,
    @InjectRepository(Transaction)
    private txRepo: Repository<Transaction>,
    @InjectRepository(PlaidItem)
    private plaidItemRepo: Repository<PlaidItem>,
    private plaidService: PlaidService,
  ) {}

  /** Number of transactions booked to this account (ownership-checked). */
  async countTransactions(id: string, userId: string): Promise<number> {
    const account = await this.repo.findOneBy({ id });
    if (!account) throw new NotFoundException();
    if (account.userId !== userId) throw new ForbiddenException();
    return this.txRepo.count({ where: { bankAccountId: id } });
  }

  async findAllByUser(userId: string): Promise<(BankAccount & { txCount: number; plaidStatus: string | null })[]> {
    let accounts = await this.repo.find({ where: { userId }, order: { createdAt: 'ASC' } });
    // First visit, no accounts at all: start them off with a cash account. Only
    // when the list is empty, so a deleted cash account stays deleted as long as
    // the user keeps any other account.
    if (accounts.length === 0) {
      await this.repo.save(this.repo.create({ ...DEFAULT_CASH_ACCOUNT, userId }));
      accounts = await this.repo.find({ where: { userId }, order: { createdAt: 'ASC' } });
    }
    const counts = await this.txRepo
      .createQueryBuilder('t')
      .select('t.bankAccountId', 'id')
      .addSelect('COUNT(*)', 'c')
      .where('t.userId = :userId', { userId })
      .andWhere('t.bankAccountId IS NOT NULL')
      .groupBy('t.bankAccountId')
      .getRawMany<{ id: string; c: string }>();
    const byId = new Map(counts.map((r) => [r.id, Number(r.c)]));

    const plaidItems = await this.plaidItemRepo.find({ where: { userId } });
    const statusByPlaidItemId = new Map(plaidItems.map((p) => [p.id, p.status]));

    return accounts.map((a) => ({
      ...a,
      txCount: byId.get(a.id) ?? 0,
      plaidStatus: a.plaidItemId ? statusByPlaidItemId.get(a.plaidItemId) ?? null : null,
    }));
  }

  countByUser(userId: string): Promise<number> {
    return this.repo.count({ where: { userId } });
  }

  create(userId: string, dto: CreateBankAccountDto): Promise<BankAccount> {
    const account = this.repo.create({ ...pickFields(dto, BANK_ACCOUNT_FIELDS), userId });
    return this.repo.save(account);
  }

  async update(id: string, userId: string, dto: Partial<CreateBankAccountDto>): Promise<BankAccount> {
    const account = await this.repo.findOneBy({ id });
    if (!account) throw new NotFoundException();
    if (account.userId !== userId) throw new ForbiddenException();
    Object.assign(account, pickFields(dto, BANK_ACCOUNT_FIELDS));
    return this.repo.save(account);
  }

  async remove(id: string, userId: string, deleteTransactions = false): Promise<void> {
    const account = await this.repo.findOneBy({ id });
    if (!account) throw new NotFoundException();
    if (account.userId !== userId) throw new ForbiddenException();
    // Otherwise the relation's onDelete: 'SET NULL' orphans them ("Unknown Bank").
    if (deleteTransactions) {
      await this.txRepo.delete({ bankAccountId: id });
    }
    const { plaidItemId } = account;
    await this.repo.remove(account);

    /* An Item can back multiple accounts (e.g. checking + savings) — only tell Plaid
       to remove it once none of them reference it any more. */
    if (plaidItemId) {
      const remaining = await this.repo.count({ where: { plaidItemId } });
      if (remaining === 0) {
        await this.plaidService.removeItem(plaidItemId, userId);
      }
    }
  }
}
