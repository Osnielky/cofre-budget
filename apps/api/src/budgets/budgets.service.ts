import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Budget } from './budget.entity';
import { Transaction } from '../transactions/transaction.entity';
import { Project } from '../projects/project.entity';
import { Category } from '../categories/category.entity';
import { TRACKING_TYPES } from '../bank-accounts/account-types';

export interface BudgetWithSpent extends Budget {
  spent: number;
  percentage: number;
  remaining: number;
}

@Injectable()
export class BudgetsService {
  constructor(
    @InjectRepository(Budget) private repo: Repository<Budget>,
    @InjectRepository(Transaction) private txRepo: Repository<Transaction>,
    @InjectRepository(Project) private projectRepo: Repository<Project>,
    @InjectRepository(Category) private categoryRepo: Repository<Category>,
  ) {}

  /** Average monthly spend per category over the trailing `months` months,
      to suggest budget amounts. Expenses only; tracking accounts excluded. */
  async categoryAverages(userId: string, months = 3): Promise<Record<string, number>> {
    const n = Math.min(Math.max(months, 1), 12);
    const now = new Date();
    const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - n, 1));
    const startDate = start.toISOString().slice(0, 10);

    const rows = await this.txRepo
      .createQueryBuilder('tx')
      .leftJoin('tx.bankAccount', 'ba')
      .select('tx.categoryId', 'categoryId')
      .addSelect('COALESCE(SUM(ABS(tx.amount)), 0)', 'total')
      .where('tx.userId = :userId', { userId })
      .andWhere('tx.amount < 0')
      .andWhere('tx.categoryId IS NOT NULL')
      .andWhere('tx.date >= :startDate', { startDate })
      .andWhere('(ba."accountType" IS NULL OR ba."accountType" NOT IN (:...tracking))', { tracking: [...TRACKING_TYPES] })
      .groupBy('tx.categoryId')
      .getRawMany<{ categoryId: string; total: string }>();

    const map: Record<string, number> = {};
    for (const r of rows) map[r.categoryId] = parseFloat(r.total) / n;
    return map;
  }

  async findWithSpent(userId: string, month: string): Promise<BudgetWithSpent[]> {
    const all = await this.repo.find({ where: { userId, month } });
    // Drop orphaned budgets whose category was deleted out from under them —
    // they'd otherwise render as a phantom "Unknown" row. Self-heal by removing them.
    const orphans = all.filter(b => !b.category);
    if (orphans.length > 0) {
      await this.repo.remove(orphans);
    }
    const budgets = all.filter(b => b.category);
    const startDate = `${month}-01`;
    const endDate   = lastDayOfMonth(month);

    return Promise.all(
      budgets.map(async (b) => {
        // Income categories track earnings (positive amounts); the rest track spending.
        const isIncome = b.category?.type === 'income';
        const raw = await this.txRepo
          .createQueryBuilder('tx')
          .leftJoin('tx.bankAccount', 'ba')
          .select(isIncome ? 'COALESCE(SUM(tx.amount), 0)' : 'COALESCE(SUM(ABS(tx.amount)), 0)', 'spent')
          .where('tx.userId = :userId', { userId })
          .andWhere('tx.categoryId = :categoryId', { categoryId: b.categoryId })
          .andWhere(isIncome ? 'tx.amount > 0' : 'tx.amount < 0')
          .andWhere('tx.date >= :startDate AND tx.date <= :endDate', { startDate, endDate })
          // Tracking accounts (investment, mortgage, …) are net-worth only — keep them out of budget spend.
          .andWhere('(ba."accountType" IS NULL OR ba."accountType" NOT IN (:...tracking))', { tracking: [...TRACKING_TYPES] })
          .getRawOne<{ spent: string }>();

        const spent      = parseFloat(raw?.spent ?? '0');
        const amount     = parseFloat(b.amount as any);
        const percentage = amount > 0 ? Math.round((spent / amount) * 100) : 0;
        const remaining  = amount - spent;

        return { ...b, spent, percentage, remaining };
      }),
    );
  }

  /** Copy budgets from the most recent prior month if none exist for the target month. */
  async ensureMonthBudgets(userId: string, month: string): Promise<void> {
    const existing = await this.repo.find({ where: { userId, month } });
    if (existing.length > 0) return;

    const priorAnchor = await this.repo
      .createQueryBuilder('b')
      .where('b.userId = :userId', { userId })
      .andWhere('b.month < :month', { month })
      .orderBy('b.month', 'DESC')
      .getOne();

    if (!priorAnchor) return;

    const priorBudgets = await this.repo.find({ where: { userId, month: priorAnchor.month } });
    await Promise.all(
      priorBudgets.map(b =>
        // Preserve where the value originated so the new month shows "from <month>".
        this.repo.save(this.repo.create({ userId, categoryId: b.categoryId, amount: b.amount, month, sourceMonth: b.sourceMonth ?? b.month, projectId: b.projectId ?? null }))
      ),
    );
  }

  async copyMonth(userId: string, fromMonth: string, toMonth: string): Promise<void> {
    const source = await this.repo.find({ where: { userId, month: fromMonth } });
    if (source.length === 0) return;
    const existing = await this.repo.find({ where: { userId, month: toMonth } });
    if (existing.length > 0) await this.repo.remove(existing);
    await Promise.all(
      source.map(b =>
        this.repo.save(this.repo.create({ userId, categoryId: b.categoryId, amount: b.amount, month: toMonth, sourceMonth: b.sourceMonth ?? b.month, projectId: b.projectId ?? null }))
      ),
    );
  }

  async getMonthSummaries(userId: string): Promise<{ month: string; total: number; count: number }[]> {
    // Count only spending budgets (exclude income targets) so the total matches
    // the "Total Budget" shown on the page.
    const rows = await this.repo
      .createQueryBuilder('b')
      .leftJoin('b.category', 'c')
      .select('b.month', 'month')
      .addSelect('SUM(b.amount)', 'total')
      .addSelect('COUNT(*)', 'count')
      .where('b.userId = :userId', { userId })
      .andWhere("(c.type IS NULL OR c.type != 'income')")
      .groupBy('b.month')
      .orderBy('b.month', 'DESC')
      .getRawMany<{ month: string; total: string; count: string }>();

    return rows.map(r => ({ month: r.month, total: parseFloat(r.total), count: parseInt(r.count) }));
  }

  countByUser(userId: string): Promise<number> {
    return this.repo.count({ where: { userId } });
  }

  /** Apply an amount to every already-materialized future month for this category:
      update where a record exists, insert where it's missing. This is why a budget
      set (or added) this month also shows up next month — including categories that
      a future month didn't previously have. Past months are never touched. */
  private async propagateForward(userId: string, categoryId: string, amount: number, fromMonth: string, projectId?: string | null): Promise<void> {
    const futureMonths = await this.repo
      .createQueryBuilder('b')
      .select('DISTINCT b.month', 'month')
      .where('b.userId = :userId', { userId })
      .andWhere('b.month > :fromMonth', { fromMonth })
      .getRawMany<{ month: string }>();

    for (const { month } of futureMonths) {
      const existing = await this.repo.findOne({ where: { userId, categoryId, month } });
      if (existing) {
        existing.amount = amount;
        existing.sourceMonth = fromMonth;
        if (projectId !== undefined) existing.projectId = projectId ?? null;
        await this.repo.save(existing);
      } else {
        await this.repo.save(this.repo.create({ userId, categoryId, amount, month, sourceMonth: fromMonth, projectId: projectId ?? null }));
      }
    }
  }

  async create(userId: string, dto: { categoryId: string; amount: number; month: string; projectId?: string | null }): Promise<Budget> {
    // Guard against orphan budgets: the category must exist and belong to this user.
    // A stale id (e.g. a category deleted server-side but still in the client list)
    // would otherwise create a budget with no category — a phantom "Unknown" row.
    const cat = await this.categoryRepo.findOneBy({ id: dto.categoryId });
    if (!cat || cat.userId !== userId) throw new NotFoundException('Category not found');
    if (dto.projectId) {
      const proj = await this.projectRepo.findOneBy({ id: dto.projectId });
      if (!proj || proj.userId !== userId) throw new ForbiddenException();
    }
    // Explicitly set this month → the value now originates here.
    const existing = await this.repo.findOne({ where: { userId, categoryId: dto.categoryId, month: dto.month } });
    if (existing) {
      existing.amount = dto.amount;
      existing.sourceMonth = dto.month;
      if (dto.projectId !== undefined) existing.projectId = dto.projectId ?? null;
      await this.repo.save(existing);
    } else {
      await this.repo.save(this.repo.create({ ...dto, userId, sourceMonth: dto.month }));
    }
    await this.propagateForward(userId, dto.categoryId, dto.amount, dto.month, dto.projectId);
    return this.repo.findOne({ where: { userId, categoryId: dto.categoryId, month: dto.month } }) as Promise<Budget>;
  }

  async update(id: string, userId: string, dto: { amount: number; projectId?: string | null }): Promise<Budget> {
    const budget = await this.repo.findOneBy({ id });
    if (!budget) throw new NotFoundException();
    if (budget.userId !== userId) throw new ForbiddenException();
    if (dto.projectId) {
      const proj = await this.projectRepo.findOneBy({ id: dto.projectId });
      if (!proj || proj.userId !== userId) throw new ForbiddenException();
    }
    budget.amount = dto.amount;
    budget.sourceMonth = budget.month; // edited here → originates here
    if (dto.projectId !== undefined) budget.projectId = dto.projectId ?? null;
    await this.repo.save(budget);
    await this.propagateForward(userId, budget.categoryId, dto.amount, budget.month, dto.projectId);
    return this.repo.findOneBy({ id }) as Promise<Budget>;
  }

  async remove(id: string, userId: string): Promise<void> {
    const budget = await this.repo.findOneBy({ id });
    if (!budget) throw new NotFoundException();
    if (budget.userId !== userId) throw new ForbiddenException();
    await this.repo.remove(budget);
  }
}

function lastDayOfMonth(month: string): string {
  const [y, m] = month.split('-').map(Number);
  return new Date(y, m, 0).toISOString().slice(0, 10);
}
