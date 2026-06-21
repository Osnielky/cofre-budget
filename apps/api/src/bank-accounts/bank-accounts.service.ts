import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BankAccount } from './bank-account.entity';
import { Transaction } from '../transactions/transaction.entity';
import { CreateBankAccountDto } from './dto/create-bank-account.dto';

@Injectable()
export class BankAccountsService {
  constructor(
    @InjectRepository(BankAccount)
    private repo: Repository<BankAccount>,
    @InjectRepository(Transaction)
    private txRepo: Repository<Transaction>,
  ) {}

  /** Number of transactions booked to this account (ownership-checked). */
  async countTransactions(id: string, userId: string): Promise<number> {
    const account = await this.repo.findOneBy({ id });
    if (!account) throw new NotFoundException();
    if (account.userId !== userId) throw new ForbiddenException();
    return this.txRepo.count({ where: { bankAccountId: id } });
  }

  async findAllByUser(userId: string): Promise<(BankAccount & { txCount: number })[]> {
    const accounts = await this.repo.find({ where: { userId }, order: { createdAt: 'ASC' } });
    const counts = await this.txRepo
      .createQueryBuilder('t')
      .select('t.bankAccountId', 'id')
      .addSelect('COUNT(*)', 'c')
      .where('t.userId = :userId', { userId })
      .andWhere('t.bankAccountId IS NOT NULL')
      .groupBy('t.bankAccountId')
      .getRawMany<{ id: string; c: string }>();
    const byId = new Map(counts.map((r) => [r.id, Number(r.c)]));
    return accounts.map((a) => ({ ...a, txCount: byId.get(a.id) ?? 0 }));
  }

  countByUser(userId: string): Promise<number> {
    return this.repo.count({ where: { userId } });
  }

  create(userId: string, dto: CreateBankAccountDto): Promise<BankAccount> {
    const account = this.repo.create({ ...dto, userId });
    return this.repo.save(account);
  }

  async update(id: string, userId: string, dto: Partial<CreateBankAccountDto>): Promise<BankAccount> {
    const account = await this.repo.findOneBy({ id });
    if (!account) throw new NotFoundException();
    if (account.userId !== userId) throw new ForbiddenException();
    Object.assign(account, dto);
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
    await this.repo.remove(account);
  }
}
