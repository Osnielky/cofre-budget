import {
  Entity, PrimaryGeneratedColumn, Column,
  ManyToOne, JoinColumn,
  CreateDateColumn, UpdateDateColumn,
} from 'typeorm';
import { User } from '../users/user.entity';

@Entity('ai_conversations')
export class AiConversation {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column()
  userId: string;

  /* Set from the first user message, truncated; null until the first message arrives. */
  @Column({ type: 'varchar', nullable: true, default: null })
  title: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  /* Soft delete. A deleted conversation vanishes from the UI, but its messages
     keep counting toward the plan's message cap (countUserMessagesSince) — otherwise
     "clear history" would reset the limit. Rows are purged once they can no longer
     fall inside any plan's window, day or month (see purgeDeleted). */
  @Column({ type: 'timestamptz', nullable: true, default: null })
  deletedAt: Date | null;
}
