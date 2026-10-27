import { Injectable, ForbiddenException, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { AiPendingAction } from './ai-pending-action.entity';
import { Transaction } from '../transactions/transaction.entity';
import { Category } from '../categories/category.entity';
import { Project } from '../projects/project.entity';
import { Debt } from '../debts/debt.entity';
import { ProjectsService } from '../projects/projects.service';

const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/;

@Injectable()
export class AiProposeToolsService {
  constructor(
    @InjectRepository(AiPendingAction) private actions: Repository<AiPendingAction>,
    @InjectRepository(Transaction) private txRepo: Repository<Transaction>,
    @InjectRepository(Category) private categoryRepo: Repository<Category>,
    @InjectRepository(Project) private projectRepo: Repository<Project>,
    @InjectRepository(Debt) private debtRepo: Repository<Debt>,
    private projects: ProjectsService,
  ) {}

  async proposeCategorizeTransactions(
    userId: string, conversationId: string,
    args: { transactionIds: string[]; categoryId: string },
  ): Promise<{ actionId: string; summary: string }> {
    if (!args.transactionIds?.length) throw new BadRequestException('transactionIds must be a non-empty array.');

    const [txs, category] = await Promise.all([
      this.txRepo.find({ where: { id: In(args.transactionIds), userId } }),
      this.categoryRepo.findOneBy({ id: args.categoryId }),
    ]);
    if (txs.length !== args.transactionIds.length) throw new NotFoundException('One or more transactions were not found.');
    if (!category || category.userId !== userId) throw new NotFoundException('Category not found.');

    const debtLinked = txs.find(tx => tx.debtId);
    if (debtLinked) {
      throw new BadRequestException('Cannot categorize a debt-payment transaction through this action — it is already categorized by the Debts flow.');
    }

    const action = await this.actions.save(this.actions.create({
      conversationId, type: 'categorize_transactions',
      payload: { transactionIds: args.transactionIds, categoryId: args.categoryId },
      status: 'pending',
    }));
    return { actionId: action.id, summary: `Categorize ${txs.length} transaction${txs.length === 1 ? '' : 's'} as ${category.name}` };
  }

  async proposeCreateCategory(
    userId: string, conversationId: string,
    args: { name: string; type?: string; wantNeed?: 'want' | 'need' | null; icon?: string; color?: string },
  ): Promise<{ actionId: string; summary: string }> {
    if (!args.name?.trim()) throw new BadRequestException('name is required.');
    const existing = await this.categoryRepo.findOne({ where: { userId, name: args.name.trim() } });
    if (existing) throw new BadRequestException(`A category named "${args.name}" already exists.`);

    const action = await this.actions.save(this.actions.create({
      conversationId, type: 'create_category',
      payload: {
        name: args.name.trim(), type: args.type ?? 'expense', wantNeed: args.wantNeed ?? null,
        icon: args.icon ?? '📦', color: args.color ?? '#5C5C78',
      },
      status: 'pending',
    }));
    return { actionId: action.id, summary: `Create a new category "${args.name.trim()}"` };
  }

  async proposeSetBudget(
    userId: string, conversationId: string,
    args: { categoryId: string; month: string; amount: number },
  ): Promise<{ actionId: string; summary: string }> {
    if (!(args.amount > 0)) throw new BadRequestException('amount must be greater than zero.');
    const category = await this.categoryRepo.findOneBy({ id: args.categoryId });
    if (!category || category.userId !== userId) throw new NotFoundException('Category not found.');

    const action = await this.actions.save(this.actions.create({
      conversationId, type: 'set_budget',
      payload: { categoryId: args.categoryId, month: args.month, amount: args.amount },
      status: 'pending',
    }));
    return { actionId: action.id, summary: `Set the ${category.name} budget for ${args.month} to $${args.amount.toFixed(2)}` };
  }

  async proposeSetNetWorthTargetDate(
    _userId: string, conversationId: string,
    args: { targetDate: string | null },
  ): Promise<{ actionId: string; summary: string }> {
    if (args.targetDate !== null && !DATE_ONLY_RE.test(args.targetDate)) {
      throw new BadRequestException('targetDate must be null or a YYYY-MM-DD string.');
    }
    const action = await this.actions.save(this.actions.create({
      conversationId, type: 'set_net_worth_target_date',
      payload: { targetDate: args.targetDate },
      status: 'pending',
    }));
    return {
      actionId: action.id,
      summary: args.targetDate ? `Set the net-worth goal's target date to ${args.targetDate}` : "Clear the net-worth goal's target date",
    };
  }

  /**
   * Link transactions to a project (and optionally one of its categories). The
   * app's convention is that a project row carries no budget category, so the
   * confirm step also clears categoryId. Closed projects are not offered.
   */
  async proposeLinkToProject(
    userId: string, conversationId: string,
    args: { transactionIds: string[]; projectId: string; projectCategoryId?: string | null },
  ): Promise<{ actionId: string; summary: string }> {
    if (!args.transactionIds?.length) throw new BadRequestException('transactionIds must be a non-empty array.');
    const [txs, project] = await Promise.all([
      this.txRepo.find({ where: { id: In(args.transactionIds), userId } }),
      this.projectRepo.findOneBy({ id: args.projectId }),
    ]);
    if (txs.length !== args.transactionIds.length) throw new NotFoundException('One or more transactions were not found.');
    if (!project || project.userId !== userId) throw new NotFoundException('Project not found.');
    if (project.status !== 'active') throw new BadRequestException(`"${project.name}" is closed; transactions can only be linked to active projects.`);
    if (txs.some((tx) => tx.debtId)) throw new BadRequestException('One of these transactions is a debt payment; it cannot be linked to a project.');

    let categoryName: string | null = null;
    if (args.projectCategoryId) {
      const cats = await this.projects.getCategories(project.id, userId);
      const cat = cats.find((c) => c.id === args.projectCategoryId);
      if (!cat) throw new NotFoundException(`That category does not belong to the "${project.name}" project.`);
      categoryName = cat.name;
    }

    const action = await this.actions.save(this.actions.create({
      conversationId, type: 'link_to_project',
      payload: { transactionIds: args.transactionIds, projectId: project.id, projectCategoryId: args.projectCategoryId ?? null },
      status: 'pending',
    }));
    const n = txs.length;
    return { actionId: action.id, summary: `Link ${n} transaction${n === 1 ? '' : 's'} to the ${project.icon} ${project.name} project${categoryName ? ` as ${categoryName}` : ''}` };
  }

  /** Record transactions as payments on a debt (money lent or owed). */
  async proposeLinkToDebt(
    userId: string, conversationId: string,
    args: { transactionIds: string[]; debtId: string },
  ): Promise<{ actionId: string; summary: string }> {
    if (!args.transactionIds?.length) throw new BadRequestException('transactionIds must be a non-empty array.');
    const [txs, debt] = await Promise.all([
      this.txRepo.find({ where: { id: In(args.transactionIds), userId } }),
      this.debtRepo.findOneBy({ id: args.debtId }),
    ]);
    if (txs.length !== args.transactionIds.length) throw new NotFoundException('One or more transactions were not found.');
    if (!debt || debt.userId !== userId) throw new NotFoundException('Debt not found.');
    if (debt.status !== 'open') throw new BadRequestException(`The debt with ${debt.borrowerName} is already settled.`);
    const already = txs.find((tx) => tx.debtId);
    if (already) throw new BadRequestException('One of these transactions is already recorded against a debt.');
    // Direction sanity: money you lent comes back as a deposit; money you owe goes out.
    const wrongWay = txs.find((tx) => (debt.direction === 'lent' ? Number(tx.amount) < 0 : Number(tx.amount) > 0));
    if (wrongWay) {
      throw new BadRequestException(debt.direction === 'lent'
        ? `"${wrongWay.name}" is an outgoing payment, but ${debt.borrowerName} owes the user — a repayment would be money coming in.`
        : `"${wrongWay.name}" is money coming in, but the user owes ${debt.borrowerName} — a repayment would be money going out.`);
    }

    const action = await this.actions.save(this.actions.create({
      conversationId, type: 'link_to_debt',
      payload: { transactionIds: args.transactionIds, debtId: debt.id },
      status: 'pending',
    }));
    const n = txs.length;
    return { actionId: action.id, summary: `Record ${n} transaction${n === 1 ? '' : 's'} as ${debt.direction === 'lent' ? 'repayment from' : 'payment to'} ${debt.borrowerName}` };
  }
}
