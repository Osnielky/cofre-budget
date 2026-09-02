import { Injectable, ForbiddenException, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { AiPendingAction } from './ai-pending-action.entity';
import { Transaction } from '../transactions/transaction.entity';
import { Category } from '../categories/category.entity';

const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/;

@Injectable()
export class AiProposeToolsService {
  constructor(
    @InjectRepository(AiPendingAction) private actions: Repository<AiPendingAction>,
    @InjectRepository(Transaction) private txRepo: Repository<Transaction>,
    @InjectRepository(Category) private categoryRepo: Repository<Category>,
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
}
