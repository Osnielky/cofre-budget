import { Injectable, NotFoundException, ForbiddenException, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, LessThan, Repository } from 'typeorm';
import { AiConversation } from './ai-conversation.entity';
import { AiMessage, AiMessageWidget } from './ai-message.entity';
import { AiPendingAction } from './ai-pending-action.entity';

const TITLE_MAX_LEN = 60;

@Injectable()
export class AiConversationsService implements OnModuleInit {
  constructor(
    @InjectRepository(AiConversation) private conversations: Repository<AiConversation>,
    @InjectRepository(AiMessage) private messages: Repository<AiMessage>,
    @InjectRepository(AiPendingAction) private actions: Repository<AiPendingAction>,
  ) {}

  async onModuleInit() {
    await this.purgeDeleted().catch(() => undefined);
  }

  create(userId: string): Promise<AiConversation> {
    return this.conversations.save(this.conversations.create({ userId }));
  }

  findAllByUser(userId: string): Promise<AiConversation[]> {
    return this.conversations.find({ where: { userId, deletedAt: IsNull() }, order: { updatedAt: 'DESC' } });
  }

  /**
   * Soft-delete one conversation. It disappears from the list and can no longer be
   * opened, but its user messages still count toward the plan's message cap — a
   * hard delete would let anyone reset the limit by clearing their history.
   */
  async remove(conversationId: string, userId: string): Promise<void> {
    await this.owned(conversationId, userId);
    await this.conversations.update({ id: conversationId, userId }, { deletedAt: new Date() });
  }

  /** Soft-delete every conversation the user has. Returns how many were removed. */
  async removeAll(userId: string): Promise<number> {
    const result = await this.conversations.update({ userId, deletedAt: IsNull() }, { deletedAt: new Date() });
    return result.affected ?? 0;
  }

  /**
   * Hard-delete conversations soft-deleted before yesterday (UTC). By then their
   * messages cannot be inside today's usage window, so nothing is lost by purging;
   * messages and pending proposals follow by FK cascade. Runs at boot.
   */
  async purgeDeleted(): Promise<number> {
    // A conversation deleted before the previous UTC month began cannot hold a
    // message inside any plan's current window (Elite counts the whole month).
    const now = new Date();
    const cutoff = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
    const result = await this.conversations.delete({ deletedAt: LessThan(cutoff) });
    return result.affected ?? 0;
  }

  async owned(conversationId: string, userId: string): Promise<AiConversation> {
    const conversation = await this.conversations.findOneBy({ id: conversationId });
    if (!conversation || conversation.deletedAt) throw new NotFoundException();
    if (conversation.userId !== userId) throw new ForbiddenException();
    return conversation;
  }

  async findMessages(conversationId: string, userId: string): Promise<AiMessage[]> {
    await this.owned(conversationId, userId);
    const rows = await this.messages.find({ where: { conversationId }, order: { createdAt: 'ASC' } });
    return this.withLiveProposalStatus(rows);
  }

  /**
   * A stored proposal widget only carries an actionId — the frontend has no way to
   * tell whether it was already confirmed/rejected after a page reload. Enrich each
   * proposal widget with the pending action's current status (without touching the
   * stored row) so the UI can render the right state instead of defaulting to "pending".
   */
  private async withLiveProposalStatus(rows: AiMessage[]): Promise<AiMessage[]> {
    const actionIds = rows
      .map((m) => m.widget)
      .filter((w): w is Extract<AiMessageWidget, { type: 'proposal' }> => w?.type === 'proposal')
      .map((w) => w.actionId);
    if (actionIds.length === 0) return rows;

    const actions = await this.actions.find({ where: { id: In(actionIds) } });
    const statusById = new Map(actions.map((a) => [a.id, a.status]));

    return rows.map((m) => {
      if (m.widget?.type !== 'proposal') return m;
      const status = statusById.get(m.widget.actionId);
      return { ...m, widget: { ...m.widget, status } };
    });
  }

  async historyForModel(conversationId: string, userId: string): Promise<{ role: 'user' | 'assistant'; content: string }[]> {
    const rows = await this.findMessages(conversationId, userId);
    return rows.map((m) => ({ role: m.role, content: m.text }));
  }

  async appendUserMessage(conversationId: string, userId: string, text: string): Promise<AiMessage> {
    const conversation = await this.owned(conversationId, userId);
    if (conversation.title == null) {
      conversation.title = text.length > TITLE_MAX_LEN ? `${text.slice(0, TITLE_MAX_LEN)}…` : text;
    }
    conversation.updatedAt = new Date();
    await this.conversations.save(conversation);
    return this.messages.save(this.messages.create({ conversationId, role: 'user', text, widget: null }));
  }

  async appendAssistantMessage(conversationId: string, text: string, widget: AiMessageWidget | null): Promise<AiMessage> {
    await this.conversations.update(conversationId, { updatedAt: new Date() });
    return this.messages.save(this.messages.create({ conversationId, role: 'assistant', text, widget }));
  }

  /** User messages sent since `since` — the plan's window start from
   *  usageWindowStart() (UTC midnight for Pro, the 1st of the month for Elite).
   *  Deliberately counts soft-deleted conversations too (no deletedAt filter). */
  async countUserMessagesSince(userId: string, since: Date): Promise<number> {
    return this.messages.createQueryBuilder('m')
      .innerJoin(AiConversation, 'c', 'c.id = m."conversationId"')
      .where('c."userId" = :userId', { userId })
      .andWhere("m.role = 'user'")
      .andWhere('m."createdAt" >= :since', { since })
      .getCount();
  }
}
