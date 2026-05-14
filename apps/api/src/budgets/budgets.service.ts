import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Budget } from './budget.entity';
import { Transaction } from '../transactions/transaction.entity';

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
  ) {}

  async findWithSpent(userId: string, month: string): Promise<BudgetWithSpent[]> {
    const budgets = await this.repo.find({ where: { userId } });
    const startDate = `${month}-01`;
    const endDate   = lastDayOfMonth(month);

    return Promise.all(
      budgets.map(async (b) => {
        const raw = await this.txRepo
          .createQueryBuilder('tx')
          .select('COALESCE(SUM(ABS(tx.amount)), 0)', 'spent')
          .where('tx.userId = :userId', { userId })
          .andWhere('tx.categoryId = :categoryId', { categoryId: b.categoryId })
          .andWhere('tx.amount < 0')
          .andWhere('tx.date >= :startDate AND tx.date <= :endDate', { startDate, endDate })
          .getRawOne<{ spent: string }>();

        const spent      = parseFloat(raw?.spent ?? '0');
        const amount     = parseFloat(b.amount as any);
        const percentage = amount > 0 ? Math.round((spent / amount) * 100) : 0;
        const remaining  = amount - spent;

        return { ...b, spent, percentage, remaining };
      }),
    );
  }

  async create(userId: string, dto: { categoryId: string; amount: number }): Promise<Budget> {
    return this.repo.save(this.repo.create({ ...dto, userId }));
  }

  async update(id: string, userId: string, dto: { amount: number }): Promise<Budget> {
    const budget = await this.repo.findOneBy({ id });
    if (!budget) throw new NotFoundException();
    if (budget.userId !== userId) throw new ForbiddenException();
    budget.amount = dto.amount;
    return this.repo.save(budget);
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
