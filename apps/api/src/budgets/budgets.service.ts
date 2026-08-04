import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Budget } from './budget.entity';
import { Transaction } from '../transactions/transaction.entity';
import { Project } from '../projects/project.entity';
import { Category } from '../categories/category.entity';
import { ProjectCategory } from '../projects/project-category.entity';
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
    @InjectRepository(ProjectCategory) private projectCategoryRepo: Repository<ProjectCategory>,
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
    // A project-category budget legitimately has categoryId=null (it references a
    // ProjectCategory), so we only treat a budget as orphaned when its categoryId
    // is non-null but the eager-loaded category relation resolved to null (deleted).
    // Also sweep out any budget with neither a real category nor a projectCategoryId
    // (e.g. created with categoryId='' before the empty-string guard was added).
    const orphans = all.filter(b => (b.categoryId && !b.category) || (!b.category && !b.projectCategoryId));
    if (orphans.length > 0) {
      await this.repo.remove(orphans);
    }
    const budgets = all.filter(b => b.category || b.projectCategoryId);
    const startDate = `${month}-01`;
    const endDate   = lastDayOfMonth(month);

    return Promise.all(
      budgets.map(async (b) => {
        // Income categories track earnings (positive amounts); the rest track spending.
        const isIncome = b.category?.type === 'income' || !!b.projectCategoryId;
        const qb = this.txRepo
          .createQueryBuilder('tx')
          .leftJoin('tx.bankAccount', 'ba')
          .select(isIncome ? 'COALESCE(SUM(tx.amount), 0)' : 'COALESCE(SUM(ABS(tx.amount)), 0)', 'spent')
          .where('tx.userId = :userId', { userId })
          .andWhere(isIncome ? 'tx.amount > 0' : 'tx.amount < 0')
          .andWhere('tx.date >= :startDate AND tx.date <= :endDate', { startDate, endDate })
          .andWhere('(ba."accountType" IS NULL OR ba."accountType" NOT IN (:...tracking))', { tracking: [...TRACKING_TYPES] });

        if (b.projectCategoryId) {
          qb.andWhere('tx.projectId = :projectId', { projectId: b.projectId })
            .andWhere('tx.projectCategoryId = :pcid', { pcid: b.projectCategoryId });
        } else {
          qb.andWhere('tx.categoryId = :categoryId', { categoryId: b.categoryId });
        }
        const raw = await qb.getRawOne<{ spent: string }>();

        const spent      = parseFloat(raw?.spent ?? '0');
        const amount     = parseFloat(b.amount as any);
        const percentage = amount > 0 ? Math.round((spent / amount) * 100) : 0;
        const remaining  = amount - spent;

        return { ...b, spent, percentage, remaining };
      }),
    );
  }

  /** Copy budgets from the most recent prior month if none exist for the target month.
      Falls back to the nearest future month so past months (before the first entry)
      still inherit a sensible set of budgets. */
  async ensureMonthBudgets(userId: string, month: string): Promise<void> {
    const existing = await this.repo.find({ where: { userId, month } });
    if (existing.length > 0) return;

    const anchor = await this.repo
      .createQueryBuilder('b')
      .where('b.userId = :userId', { userId })
      .andWhere('b.month < :month', { month })
      .orderBy('b.month', 'DESC')
      .getOne()
      ?? await this.repo
        .createQueryBuilder('b')
        .where('b.userId = :userId', { userId })
        .andWhere('b.month > :month', { month })
        .orderBy('b.month', 'ASC')
        .getOne();

    if (!anchor) return;

    const sourceBudgets = await this.repo.find({ where: { userId, month: anchor.month } });
    await Promise.all(
      sourceBudgets.map(b =>
        this.repo.save(this.repo.create({ userId, categoryId: b.categoryId, projectCategoryId: b.projectCategoryId ?? null, amount: b.amount, month, sourceMonth: b.sourceMonth ?? b.month, projectId: b.projectId ?? null }))
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
        this.repo.save(this.repo.create({ userId, categoryId: b.categoryId, projectCategoryId: b.projectCategoryId ?? null, amount: b.amount, month: toMonth, sourceMonth: b.sourceMonth ?? b.month, projectId: b.projectId ?? null }))
      ),
    );
  }

  /** Spending-budget totals vs. actual spend for each of the last N calendar months
      (ending at the current month), for the plan-history sparkline. */
  async history(userId: string, months = 6): Promise<{ month: string; budget: number; spent: number }[]> {
    const n = Math.min(Math.max(months, 1), 24);
    const now = new Date();
    const keys = Array.from({ length: n }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() - (n - 1 - i), 1);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    });
    return Promise.all(keys.map(async (month) => {
      const rows = await this.findWithSpent(userId, month);
      const spending = rows.filter((b) => (b.category ? b.category.type !== 'income' : true) && !b.projectCategoryId);
      return {
        month,
        budget: +spending.reduce((s, b) => s + Number(b.amount), 0).toFixed(2),
        spent: +spending.reduce((s, b) => s + Number(b.spent), 0).toFixed(2),
      };
    }));
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

  private async futureMonths(userId: string, fromMonth: string): Promise<string[]> {
    const rows = await this.repo
      .createQueryBuilder('b')
      .select('DISTINCT b.month', 'month')
      .where('b.userId = :userId', { userId })
      .andWhere('b.month > :fromMonth', { fromMonth })
      .getRawMany<{ month: string }>();
    return rows.map(r => r.month);
  }

  /** Propagate a regular category budget amount to all future months that already exist. */
  private async propagateForward(userId: string, categoryId: string, amount: number, fromMonth: string, projectId?: string | null): Promise<void> {
    for (const month of await this.futureMonths(userId, fromMonth)) {
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

  /** Propagate a project-category income target to all future months that already exist. */
  private async propagateProjectCategoryForward(userId: string, projectCategoryId: string, projectId: string | null, amount: number, fromMonth: string): Promise<void> {
    for (const month of await this.futureMonths(userId, fromMonth)) {
      const existing = await this.repo.findOne({ where: { userId, projectCategoryId, projectId: projectId ?? null, month } });
      if (existing) {
        existing.amount = amount;
        existing.sourceMonth = fromMonth;
        await this.repo.save(existing);
      } else {
        await this.repo.save(this.repo.create({ userId, categoryId: null, projectCategoryId, amount, month, sourceMonth: fromMonth, projectId: projectId ?? null }));
      }
    }
  }

  async create(userId: string, dto: { categoryId?: string | null; amount: number; month: string; projectId?: string | null; projectCategoryId?: string | null }): Promise<Budget> {
    // Normalize empty strings to null so callers can't sneak in a budget with
    // neither a real category nor a project category (which would render as "Unknown").
    if (!dto.categoryId) dto = { ...dto, categoryId: null };
    if (!dto.projectCategoryId) dto = { ...dto, projectCategoryId: null };

    // Require exactly one of categoryId or projectCategoryId.
    if (!dto.categoryId && !dto.projectCategoryId) {
      throw new NotFoundException('A category or project category is required');
    }

    if (dto.projectId) {
      const proj = await this.projectRepo.findOneBy({ id: dto.projectId });
      if (!proj || proj.userId !== userId) throw new ForbiddenException();
    }
    // Guard against orphan/cross-tenant budgets: any referenced category must
    // exist and belong to this user. A stale or foreign id would otherwise
    // create a budget pointing at someone else's (or a deleted) category.
    if (dto.categoryId) {
      const cat = await this.categoryRepo.findOneBy({ id: dto.categoryId });
      if (!cat || cat.userId !== userId) throw new NotFoundException('Category not found');
    }
    if (dto.projectCategoryId) {
      const pc = await this.projectCategoryRepo.findOneBy({ id: dto.projectCategoryId });
      if (!pc || pc.userId !== userId) throw new ForbiddenException();
    }

    // Project-category budgets: unique by (userId, projectId, projectCategoryId, month)
    if (dto.projectCategoryId) {
      const existing = await this.repo.findOne({ where: { userId, projectId: dto.projectId ?? null, projectCategoryId: dto.projectCategoryId, month: dto.month } });
      if (existing) {
        existing.amount = dto.amount;
        existing.sourceMonth = dto.month;
        await this.repo.save(existing);
      } else {
        await this.repo.save(this.repo.create({ userId, categoryId: null, projectCategoryId: dto.projectCategoryId, amount: dto.amount, month: dto.month, sourceMonth: dto.month, projectId: dto.projectId ?? null }));
      }
      await this.propagateProjectCategoryForward(userId, dto.projectCategoryId, dto.projectId ?? null, dto.amount, dto.month);
      return this.repo.findOne({ where: { userId, projectCategoryId: dto.projectCategoryId, projectId: dto.projectId ?? null, month: dto.month } }) as Promise<Budget>;
    }

    // Regular category budget.
    const existing = await this.repo.findOne({ where: { userId, categoryId: dto.categoryId, month: dto.month } });
    if (existing) {
      existing.amount = dto.amount;
      existing.sourceMonth = dto.month;
      if (dto.projectId !== undefined) existing.projectId = dto.projectId ?? null;
      await this.repo.save(existing);
    } else {
      await this.repo.save(this.repo.create({ ...dto, userId, sourceMonth: dto.month }));
    }
    await this.propagateForward(userId, dto.categoryId!, dto.amount, dto.month, dto.projectId);
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
    budget.sourceMonth = budget.month;
    if (dto.projectId !== undefined) budget.projectId = dto.projectId ?? null;
    await this.repo.save(budget);
    if (budget.projectCategoryId) {
      await this.propagateProjectCategoryForward(userId, budget.projectCategoryId, budget.projectId ?? null, dto.amount, budget.month);
    } else {
      await this.propagateForward(userId, budget.categoryId, dto.amount, budget.month, dto.projectId);
    }
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
