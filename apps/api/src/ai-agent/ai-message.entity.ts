import {
  Entity, PrimaryGeneratedColumn, Column,
  ManyToOne, JoinColumn, CreateDateColumn,
} from 'typeorm';
import { AiConversation } from './ai-conversation.entity';

export interface SavingsTrendWidgetData {
  months: { month: string; net: number }[];
  projected: number;
  sixMonthAvg: number;
  transactionCount: number;
  accountCount: number;
}

export interface SafeToSpendWidgetData {
  month: string;
  income: number;
  plannedSpending: number;
  safetyBuffer: number;
  safeAmount: number;
}

export type AiMessageWidget =
  | { type: 'proposal'; actionId: string; status?: 'pending' | 'confirmed' | 'rejected' }
  | { type: 'savings_trend'; data: SavingsTrendWidgetData }
  | { type: 'safe_to_spend'; data: SafeToSpendWidgetData };

@Entity('ai_messages')
export class AiMessage {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => AiConversation, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'conversationId' })
  conversation: AiConversation;

  @Column()
  conversationId: string;

  @Column({ type: 'varchar' })
  role: 'user' | 'assistant';

  @Column({ type: 'text' })
  text: string;

  @Column({ type: 'jsonb', nullable: true, default: null })
  widget: AiMessageWidget | null;

  @CreateDateColumn()
  createdAt: Date;
}
