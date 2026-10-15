import {
  Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, Index,
  CreateDateColumn, UpdateDateColumn,
} from 'typeorm';
import { User } from '../users/user.entity';
import type { CardGoal, ScoreBand } from './card-types';

/* What the card advisor needs to know that Plaid can't tell us. One per user. */
@Entity('card_profiles')
export class CardProfile {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @Index({ unique: true })
  @Column()
  userId: string;

  @Column({ type: 'varchar', nullable: true })
  goal: CardGoal | null;

  @Column({ type: 'boolean', nullable: true })
  annualFeeOk: boolean | null;

  @Column({ type: 'varchar', nullable: true })
  creditScoreBand: ScoreBand | null;

  @Column({ type: 'decimal', precision: 12, scale: 2, nullable: true })
  monthlyDebtBudget: number | null;

  @Column({ type: 'decimal', precision: 12, scale: 2, nullable: true })
  plannedPurchaseAmount: number | null;

  @Column({ type: 'varchar', length: 120, nullable: true })
  plannedPurchaseNote: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
