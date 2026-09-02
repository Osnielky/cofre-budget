import {
  Entity, PrimaryGeneratedColumn, Column,
  ManyToOne, JoinColumn,
  CreateDateColumn, UpdateDateColumn,
} from 'typeorm';
import { User } from '../users/user.entity';

@Entity('plaid_items')
export class PlaidItem {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column()
  userId: string;

  @Column({ select: false })
  accessToken: string;

  @Column({ unique: true })
  itemId: string;

  @Column()
  institutionId: string;

  @Column()
  institutionName: string;

  @Column({ nullable: true })
  lastSync: Date;

  /* Plaid's /transactions/sync pagination cursor. Null until the first sync completes. */
  @Column({ type: 'text', nullable: true })
  cursor: string | null;

  /* 'active' | 'error' — set to 'error' by the webhook handler when Plaid reports the
     item needs attention (e.g. ITEM_LOGIN_REQUIRED); cleared back to 'active' by the
     next successful sync. */
  @Column({ default: 'active' })
  status: string;

  @Column({ type: 'varchar', nullable: true })
  errorCode: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
