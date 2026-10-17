import {
  Entity, PrimaryGeneratedColumn, Column,
  ManyToOne, JoinColumn, CreateDateColumn,
} from 'typeorm';
import { AiConversation } from './ai-conversation.entity';

export type AiPendingActionType =
  | 'categorize_transactions'
  | 'create_category'
  | 'set_budget'
  | 'set_net_worth_target_date';

export interface AiUndoPayload {
  transactions: { transactionId: string; previousCategoryId: string | null }[];
}

@Entity('ai_pending_actions')
export class AiPendingAction {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => AiConversation, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'conversationId' })
  conversation: AiConversation;

  @Column()
  conversationId: string;

  /* The assistant message that proposed this action; null-safe since a message
     row doesn't exist yet at the moment the propose-tool runs mid-turn. */
  @Column({ type: 'uuid', nullable: true, default: null })
  messageId: string | null;

  @Column({ type: 'varchar' })
  type: AiPendingActionType;

  @Column({ type: 'jsonb' })
  payload: Record<string, unknown>;

  @Column({ type: 'varchar', default: 'pending' })
  status: 'pending' | 'confirmed' | 'rejected';

  /* Only set for confirmed 'categorize_transactions' actions — snapshot of each
     transaction's categoryId immediately before the mutation was applied. */
  @Column({ type: 'jsonb', nullable: true, default: null })
  undoPayload: AiUndoPayload | null;

  @Column({ type: 'timestamp', nullable: true, default: null })
  undoneAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @Column({ type: 'timestamp', nullable: true, default: null })
  resolvedAt: Date | null;
}
