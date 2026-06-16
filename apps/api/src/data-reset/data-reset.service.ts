import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Transaction } from '../transactions/transaction.entity';
import { Category } from '../categories/category.entity';
import { Project } from '../projects/project.entity';
import { ProjectCategory } from '../projects/project-category.entity';
import { BankAccount } from '../bank-accounts/bank-account.entity';
import { Budget } from '../budgets/budget.entity';
import { Debt } from '../debts/debt.entity';

export type ResetScope = 'transactions' | 'categories' | 'projects' | 'bankAccounts' | 'budgets' | 'debts';

export interface ResetOptions {
  scope: ResetScope[];
  dateFrom?: string;
  dateTo?: string;
  bankAccountId?: string;
}

export interface ResetResult {
  deleted: Partial<Record<ResetScope, number>>;
}

@Injectable()
export class DataResetService {
  constructor(
    @InjectRepository(Transaction)  private txRepo: Repository<Transaction>,
    @InjectRepository(Category)     private catRepo: Repository<Category>,
    @InjectRepository(Project)      private projectRepo: Repository<Project>,
    @InjectRepository(ProjectCategory) private projCatRepo: Repository<ProjectCategory>,
    @InjectRepository(BankAccount)  private accountRepo: Repository<BankAccount>,
    @InjectRepository(Budget)       private budgetRepo: Repository<Budget>,
    @InjectRepository(Debt)         private debtRepo: Repository<Debt>,
  ) {}

  async preview(userId: string, opts: ResetOptions): Promise<ResetResult> {
    const counts: Partial<Record<ResetScope, number>> = {};

    if (opts.scope.includes('transactions')) {
      const qb = this.txRepo.createQueryBuilder('tx').where('tx.userId = :userId', { userId });
      if (opts.bankAccountId) qb.andWhere('tx.bankAccountId = :aid', { aid: opts.bankAccountId });
      if (opts.dateFrom) qb.andWhere('tx.date >= :from', { from: opts.dateFrom });
      if (opts.dateTo)   qb.andWhere('tx.date <= :to',   { to: opts.dateTo });
      counts.transactions = await qb.getCount();
    }

    if (opts.scope.includes('categories')) {
      counts.categories = await this.catRepo.count({ where: { userId, isDefault: false } });
    }

    if (opts.scope.includes('projects')) {
      counts.projects = await this.projectRepo.count({ where: { userId } });
    }

    if (opts.scope.includes('bankAccounts')) {
      counts.bankAccounts = await this.accountRepo.count({ where: { userId } });
    }

    if (opts.scope.includes('budgets')) {
      counts.budgets = await this.budgetRepo.count({ where: { userId } });
    }

    if (opts.scope.includes('debts')) {
      counts.debts = await this.debtRepo.count({ where: { userId } });
    }

    return { deleted: counts };
  }

  async reset(userId: string, opts: ResetOptions): Promise<ResetResult> {
    const deleted: Partial<Record<ResetScope, number>> = {};

    /* Transactions first — avoids SET NULL side-effects after account removal */
    if (opts.scope.includes('transactions')) {
      const qb = this.txRepo.createQueryBuilder('tx').where('tx.userId = :userId', { userId });
      if (opts.bankAccountId) qb.andWhere('tx.bankAccountId = :aid', { aid: opts.bankAccountId });
      if (opts.dateFrom) qb.andWhere('tx.date >= :from', { from: opts.dateFrom });
      if (opts.dateTo)   qb.andWhere('tx.date <= :to',   { to: opts.dateTo });
      const txs = await qb.getMany();
      if (txs.length) await this.txRepo.remove(txs);
      deleted.transactions = txs.length;
    }

    if (opts.scope.includes('budgets')) {
      const budgets = await this.budgetRepo.find({ where: { userId } });
      if (budgets.length) await this.budgetRepo.remove(budgets);
      deleted.budgets = budgets.length;
    }

    /* Removing custom categories cascades their budgets (onDelete: CASCADE) */
    if (opts.scope.includes('categories')) {
      const cats = await this.catRepo.find({ where: { userId, isDefault: false } });
      if (cats.length) await this.catRepo.remove(cats);
      deleted.categories = cats.length;
    }

    if (opts.scope.includes('projects')) {
      const projects = await this.projectRepo.find({ where: { userId } });
      if (projects.length) await this.projectRepo.remove(projects);
      const projCats = await this.projCatRepo.find({ where: { userId } });
      if (projCats.length) await this.projCatRepo.remove(projCats);
      deleted.projects = projects.length;
    }

    if (opts.scope.includes('bankAccounts')) {
      const accounts = await this.accountRepo.find({ where: { userId } });
      if (accounts.length) await this.accountRepo.remove(accounts);
      deleted.bankAccounts = accounts.length;
    }

    /* Removing a debt cascades its payments (onDelete: CASCADE) */
    if (opts.scope.includes('debts')) {
      const debts = await this.debtRepo.find({ where: { userId } });
      if (debts.length) await this.debtRepo.remove(debts);
      deleted.debts = debts.length;
    }

    return { deleted };
  }
}
