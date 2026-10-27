import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AiPendingAction } from './ai-pending-action.entity';
import { AiConversation } from './ai-conversation.entity';
import { Transaction } from '../transactions/transaction.entity';
import { Category } from '../categories/category.entity';
import { TransactionsService } from '../transactions/transactions.service';
import { CategoriesService } from '../categories/categories.service';
import { BudgetsService } from '../budgets/budgets.service';
import { NetWorthGoalService } from '../net-worth-goal/net-worth-goal.service';
import { ProjectsService } from '../projects/projects.service';

interface CategorizeTransactionsPayload { transactionIds: string[]; categoryId: string }
interface LinkToProjectPayload { transactionIds: string[]; projectId: string; projectCategoryId: string | null }
interface LinkToDebtPayload { transactionIds: string[]; debtId: string }
interface CreateCategoryPayload { name: string; type: string; wantNeed: 'want' | 'need' | null; icon: string; color: string }
interface SetBudgetPayload { categoryId: string; month: string; amount: number }
interface SetNetWorthTargetDatePayload { targetDate: string | null }

@Injectable()
export class AiActionsService {
  constructor(
    @InjectRepository(AiPendingAction) private actions: Repository<AiPendingAction>,
    @InjectRepository(AiConversation) private conversations: Repository<AiConversation>,
    @InjectRepository(Transaction) private txRepo: Repository<Transaction>,
    @InjectRepository(Category) private categoryRepo: Repository<Category>,
    private transactions: TransactionsService,
    private categories: CategoriesService,
    private budgets: BudgetsService,
    private netWorthGoal: NetWorthGoalService,
    private projects: ProjectsService,
  ) {}

  private async owned(actionId: string, userId: string): Promise<AiPendingAction> {
    const action = await this.actions.findOneBy({ id: actionId });
    if (!action) throw new NotFoundException();
    const conversation = await this.conversations.findOneBy({ id: action.conversationId });
    if (!conversation || conversation.userId !== userId) throw new ForbiddenException();
    return action;
  }

  async confirm(actionId: string, userId: string): Promise<{ action: AiPendingAction; resultText: string }> {
    const action = await this.owned(actionId, userId);
    if (action.status !== 'pending') throw new BadRequestException('This proposal was already resolved.');

    let resultText: string;
    if (action.type === 'categorize_transactions') {
      const payload = action.payload as unknown as CategorizeTransactionsPayload;
      const undoEntries: { transactionId: string; previousCategoryId: string | null }[] = [];
      let applied = 0;
      for (const transactionId of payload.transactionIds) {
        const before = await this.txRepo.findOneBy({ id: transactionId, userId });
        if (!before) continue; // vanished since the proposal was made — skip it
        if (before.debtId) continue; // became debt-linked since the proposal was made — skip it
        undoEntries.push({ transactionId, previousCategoryId: before.categoryId });
        await this.transactions.updateCategory(transactionId, userId, payload.categoryId);
        applied++;
      }
      action.undoPayload = { transactions: undoEntries };
      resultText = `Categorized ${applied} of ${payload.transactionIds.length} transaction${payload.transactionIds.length === 1 ? '' : 's'}.`;
    } else if (action.type === 'link_to_project') {
      const payload = action.payload as unknown as LinkToProjectPayload;
      const undoEntries: NonNullable<AiPendingAction['undoPayload']>['transactions'] = [];
      let applied = 0;
      for (const transactionId of payload.transactionIds) {
        const before = await this.txRepo.findOneBy({ id: transactionId, userId });
        if (!before || before.debtId) continue; // vanished or became a debt payment since the proposal
        undoEntries.push({
          transactionId, previousCategoryId: before.categoryId ?? null,
          previousProjectId: before.projectId ?? null, previousProjectCategoryId: before.projectCategoryId ?? null,
        });
        await this.projects.linkTransaction(payload.projectId, transactionId, userId, payload.projectCategoryId ?? undefined);
        // Project rows carry no budget category (same as the Transactions page's link flow).
        if (before.categoryId) await this.transactions.updateCategory(transactionId, userId, null);
        applied++;
      }
      action.undoPayload = { transactions: undoEntries };
      resultText = `Linked ${applied} of ${payload.transactionIds.length} transaction${payload.transactionIds.length === 1 ? '' : 's'} to the project.`;
    } else if (action.type === 'link_to_debt') {
      const payload = action.payload as unknown as LinkToDebtPayload;
      let applied = 0;
      for (const transactionId of payload.transactionIds) {
        const before = await this.txRepo.findOneBy({ id: transactionId, userId });
        if (!before || before.debtId) continue; // vanished or already recorded against a debt
        await this.transactions.updateDebt(transactionId, userId, payload.debtId); // clears the category and records the payment
        applied++;
      }
      resultText = `Recorded ${applied} of ${payload.transactionIds.length} transaction${payload.transactionIds.length === 1 ? '' : 's'} on the debt.`;
    } else if (action.type === 'create_category') {
      const payload = action.payload as unknown as CreateCategoryPayload;
      const created = await this.categories.create(userId, payload);
      resultText = `Created the "${created.name}" category.`;
    } else if (action.type === 'set_budget') {
      const payload = action.payload as unknown as SetBudgetPayload;
      await this.budgets.create(userId, payload);
      resultText = `Budget updated.`;
    } else {
      const payload = action.payload as unknown as SetNetWorthTargetDatePayload;
      await this.netWorthGoal.setTargetDate(userId, payload.targetDate);
      resultText = payload.targetDate ? `Net-worth goal target date set to ${payload.targetDate}.` : `Net-worth goal target date cleared.`;
    }

    action.status = 'confirmed';
    action.resolvedAt = new Date();
    await this.actions.save(action);
    return { action, resultText };
  }

  async reject(actionId: string, userId: string): Promise<AiPendingAction> {
    const action = await this.owned(actionId, userId);
    if (action.status !== 'pending') throw new BadRequestException('This proposal was already resolved.');
    action.status = 'rejected';
    action.resolvedAt = new Date();
    return this.actions.save(action);
  }

  async undo(actionId: string, userId: string): Promise<{ reverted: number; skipped: number }> {
    const action = await this.owned(actionId, userId);
    if (action.type !== 'categorize_transactions' && action.type !== 'link_to_project') {
      throw new BadRequestException(action.type === 'link_to_debt'
        ? 'A debt payment is undone from the Debts page, where its payment record lives.'
        : 'Only categorization changes can be undone.');
    }
    if (action.status !== 'confirmed') throw new BadRequestException('Only a confirmed action can be undone.');
    if (action.undoneAt) throw new BadRequestException('This action was already undone.');

    const undoPayload = action.undoPayload!;
    let reverted = 0, skipped = 0;

    if (action.type === 'link_to_project') {
      const payload = action.payload as unknown as LinkToProjectPayload;
      for (const entry of undoPayload.transactions) {
        const current = await this.txRepo.findOneBy({ id: entry.transactionId, userId });
        if (!current || current.projectId !== payload.projectId) { skipped++; continue; } // relinked since — don't clobber
        if (entry.previousProjectId) await this.projects.linkTransaction(entry.previousProjectId, entry.transactionId, userId, entry.previousProjectCategoryId ?? undefined);
        else await this.projects.unlinkTransaction(entry.transactionId, userId);
        if (entry.previousCategoryId) await this.transactions.updateCategory(entry.transactionId, userId, entry.previousCategoryId);
        reverted++;
      }
      action.undoneAt = new Date();
      await this.actions.save(action);
      return { reverted, skipped };
    }

    const payload = action.payload as unknown as CategorizeTransactionsPayload;
    for (const entry of undoPayload.transactions) {
      const current = await this.txRepo.findOneBy({ id: entry.transactionId, userId });
      if (!current || current.categoryId !== payload.categoryId) { skipped++; continue; } // changed since — don't clobber
      await this.transactions.updateCategory(entry.transactionId, userId, entry.previousCategoryId);
      reverted++;
    }
    action.undoneAt = new Date();
    await this.actions.save(action);
    return { reverted, skipped };
  }

  async recent(userId: string): Promise<{ id: string; label: string; createdAt: Date }[]> {
    const rows = await this.actions.createQueryBuilder('a')
      .innerJoin(AiConversation, 'c', 'c.id = a."conversationId"')
      .where('c."userId" = :userId', { userId })
      .andWhere("a.type = 'categorize_transactions'")
      .andWhere("a.status = 'confirmed'")
      .andWhere('a."undoneAt" IS NULL')
      .orderBy('a.resolvedAt', 'DESC')
      .limit(20)
      .getMany();

    return Promise.all(rows.map(async (a) => ({ id: a.id, label: await this.labelFor(a), createdAt: a.resolvedAt! })));
  }

  private async labelFor(action: AiPendingAction): Promise<string> {
    const payload = action.payload as unknown as CategorizeTransactionsPayload;
    const category = await this.categoryRepo.findOneBy({ id: payload.categoryId });
    const categoryName = category?.name ?? 'a category';
    const count = payload.transactionIds.length;
    const txs = await this.txRepo.find({ where: payload.transactionIds.map((id) => ({ id })) });
    const merchants = new Set(txs.map((t) => t.merchantName).filter((m): m is string => !!m));
    if (merchants.size === 1) {
      const [merchant] = merchants;
      return `${count} ${merchant} charge${count === 1 ? '' : 's'} → ${categoryName}`;
    }
    return `${count} transaction${count === 1 ? '' : 's'} → ${categoryName}`;
  }
}
