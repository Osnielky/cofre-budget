import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AiConversation } from './ai-conversation.entity';
import { AiMessage, AiMessageWidget } from './ai-message.entity';

const TITLE_MAX_LEN = 60;

@Injectable()
export class AiConversationsService {
  constructor(
    @InjectRepository(AiConversation) private conversations: Repository<AiConversation>,
    @InjectRepository(AiMessage) private messages: Repository<AiMessage>,
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
    return this.messages.find({ where: { conversationId }, order: { createdAt: 'ASC' } });
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
