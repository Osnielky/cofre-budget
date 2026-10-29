import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Transaction } from '../transactions/transaction.entity';
import { BankAccount } from '../bank-accounts/bank-account.entity';
import { ActivityRow, computePerformance, PerformanceSummary } from './performance';

/** One transaction row as the engine reads it. */
export function toActivityRow(t: Transaction): ActivityRow {
  return {
    date: t.date,
    amount: Number(t.amount),
    type: t.plaidCategory?.[0] ?? null,
    subtype: t.plaidCategory?.[1] ?? null,
    symbol: t.symbol ?? null,
    securityName: t.securityName ?? null,
    quantity: t.quantity == null ? null : Number(t.quantity),
    price: t.price == null ? null : Number(t.price),
    fees: t.fees == null ? null : Number(t.fees),
    name: t.name,
  };
}

@Injectable()
export class InvestmentsService {
  constructor(
    @InjectRepository(Transaction) private txRepo: Repository<Transaction>,
    @InjectRepository(BankAccount) private accountRepo: Repository<BankAccount>,
  ) {}

  /** Performance of one of the caller's accounts over its whole history. */
  async performance(userId: string, accountId: string): Promise<PerformanceSummary & { account: { id: string; bankName: string; accountName: string; accountType: string } }> {
    const account = await this.accountRepo.findOne({ where: { id: accountId, userId } });
    if (!account) throw new NotFoundException('Account not found');
    const rows = await this.txRepo.find({
      where: { userId, bankAccountId: account.id, isSplitParent: false },
      order: { date: 'ASC' },
    });
    const summary = computePerformance(rows.map(toActivityRow));
    return { ...summary, account: { id: account.id, bankName: account.bankName, accountName: account.accountName, accountType: account.accountType } };
  }
}
