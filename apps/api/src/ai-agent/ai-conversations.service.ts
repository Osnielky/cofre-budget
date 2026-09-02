import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { AiConversation } from './ai-conversation.entity';
import { AiMessage, AiMessageWidget } from './ai-message.entity';
import { AiPendingAction } from './ai-pending-action.entity';

const TITLE_MAX_LEN = 60;

@Injectable()
export class AiConversationsService {
  constructor(
    @InjectRepository(AiConversation) private conversations: Repository<AiConversation>,
    @InjectRepository(AiMessage) private messages: Repository<AiMessage>,
    @InjectRepository(AiPendingAction) private actions: Repository<AiPendingAction>,
  ) {}

  create(userId: string): Promise<AiConversation> {
    return this.conversations.save(this.conversations.create({ userId }));
  }

  findAllByUser(userId: string): Promise<AiConversation[]> {
    return this.conversations.find({ where: { userId }, order: { updatedAt: 'DESC' } });
  }

  async owned(conversationId: string, userId: string): Promise<AiConversation> {
    const conversation = await this.conversations.findOneBy({ id: conversationId });
    if (!conversation) throw new NotFoundException();
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
}
