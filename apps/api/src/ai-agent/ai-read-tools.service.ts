import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Transaction } from '../transactions/transaction.entity';
import { TransactionsService } from '../transactions/transactions.service';
import { CategoriesService } from '../categories/categories.service';
import { BudgetsService } from '../budgets/budgets.service';
import { NetWorthGoalService } from '../net-worth-goal/net-worth-goal.service';
import { BankAccountsService } from '../bank-accounts/bank-accounts.service';
import { DebtsService } from '../debts/debts.service';
import { TRACKING_TYPES } from '../bank-accounts/account-types';
import { computeSavingsTrend } from './ai-savings-trend.math';
import type { SavingsTrendWidgetData } from './ai-message.entity';

export interface GetTransactionsArgs {
  startDate?: string;
  endDate?: string;
  categoryId?: string;
  uncategorizedOnly?: boolean;
  merchant?: string;
  limit?: number;
}

function currentMonthKey(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

@Injectable()
export class AiReadToolsService {
  constructor(
    @InjectRepository(Transaction) private txRepo: Repository<Transaction>,
    private transactions: TransactionsService,
    private categories: CategoriesService,
    private budgets: BudgetsService,
    private netWorthGoal: NetWorthGoalService,
    private bankAccounts: BankAccountsService,
    private debts: DebtsService,
  ) {}

  async getTransactions(userId: string, args: GetTransactionsArgs) {
    const qb = this.txRepo.createQueryBuilder('tx')
      .leftJoinAndSelect('tx.categoryRef', 'categoryRef')
      .where('tx.userId = :userId', { userId })
      .andWhere('tx.isSplitParent = false')
      .orderBy('tx.date', 'DESC')
      .limit(Math.min(args.limit ?? 100, 500));

    if (args.startDate) qb.andWhere('tx.date >= :start', { start: args.startDate });
    if (args.endDate) qb.andWhere('tx.date <= :end', { end: args.endDate });
    if (args.categoryId) qb.andWhere('tx.categoryId = :categoryId', { categoryId: args.categoryId });
    if (args.uncategorizedOnly) qb.andWhere('tx.categoryId IS NULL');
    if (args.merchant) qb.andWhere('(tx.merchantName ILIKE :m OR tx.name ILIKE :m)', { m: `%${args.merchant}%` });

    const rows = await qb.getMany();
    return rows.map((t) => ({
      id: t.id, date: t.date, name: t.name, merchantName: t.merchantName ?? null,
      amount: Number(t.amount), categoryId: t.categoryId ?? null, category: t.categoryRef?.name ?? null,
    }));
  }

  async getCategories(userId: string) {
    const rows = await this.categories.findAllByUser(userId);
    return rows.map((c) => ({ id: c.id, name: c.name, type: c.type, wantNeed: c.wantNeed }));
  }

  async getBudgets(userId: string, args: { month?: string }) {
    const rows = await this.budgets.findWithSpent(userId, args.month ?? currentMonthKey());
    return rows.map((b) => ({
      id: b.id, categoryId: b.categoryId, category: b.category?.name ?? null,
      amount: Number(b.amount), spent: b.spent, remaining: b.remaining, percentage: b.percentage,
    }));
  }

  getNetWorthSummary(userId: string) {
    return this.netWorthGoal.get(userId);
  }

  async getAccounts(userId: string) {
    const rows = await this.bankAccounts.findAllByUser(userId);
    return rows.map((a) => ({ id: a.id, name: a.accountName, type: a.accountType, balance: Number(a.balance) }));
  }

  async getDebts(userId: string) {
    const rows = await this.debts.findAll(userId);
    return rows.map((d) => ({
      id: d.id, borrowerName: d.borrowerName, direction: d.direction,
      status: d.status, remaining: d.remaining, principal: Number(d.principal),
    }));
  }

  async getSavingsTrend(userId: string): Promise<SavingsTrendWidgetData> {
    const months = 6;
    const now = new Date();
    const keys = Array.from({ length: months }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() - (months - 1 - i), 1);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    });

    const rows = await this.txRepo.createQueryBuilder('tx')
      .leftJoin('tx.categoryRef', 'cat')
      .leftJoin('tx.bankAccount', 'ba')
      .select('SUBSTRING(tx.date::text, 1, 7)', 'month')
      .addSelect('COALESCE(SUM(tx.amount), 0)', 'net')
      .where('tx.userId = :userId', { userId })
      .andWhere("(cat.type IS NULL OR cat.type != 'transfer')")
      .andWhere('tx.debtId IS NULL')
      .andWhere('(ba."accountType" IS NULL OR ba."accountType" NOT IN (:...tracking))', { tracking: [...TRACKING_TYPES] })
      .andWhere('SUBSTRING(tx.date::text, 1, 7) IN (:...keys)', { keys })
      .groupBy("SUBSTRING(tx.date::text, 1, 7)")
      .getRawMany<{ month: string; net: string }>();

    const byMonth = new Map(rows.map((r) => [r.month, parseFloat(r.net)]));
    const monthlyNets = keys.map((k) => ({ month: k, net: byMonth.get(k) ?? 0 }));
    const { projected, sixMonthAvg } = computeSavingsTrend(monthlyNets, now);

    const [transactionCount, accounts] = await Promise.all([
      this.txRepo.count({ where: { userId } }),
      this.bankAccounts.findAllByUser(userId),
    ]);

    return { months: monthlyNets, projected, sixMonthAvg, transactionCount, accountCount: accounts.length };
  }
}
