import {
  Entity, PrimaryGeneratedColumn, Column,
  CreateDateColumn, UpdateDateColumn,
} from 'typeorm';

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  email: string;

  @Column({ nullable: true })
  name: string;

  @Column({ nullable: true, select: false })
  password: string;

  @Column({ nullable: true, unique: true })
  googleId: string;

  @Column({ nullable: true })
  avatarUrl: string;

  @Column({ default: 'free' })
  plan: 'free' | 'pro';

  /* User-set date for reaching the $1,000,000 net-worth mission; null = not set */
  @Column({ type: 'date', nullable: true, default: null })
  netWorthGoalTargetDate: string | null;

  /* Net worth snapshot captured the moment netWorthGoalTargetDate was first set */
  @Column({ type: 'decimal', precision: 12, scale: 2, nullable: true, default: null })
  netWorthGoalBaselineValue: string | null;

  /* Date netWorthGoalBaselineValue was captured */
  @Column({ type: 'date', nullable: true, default: null })
  netWorthGoalBaselineDate: string | null;

  @Column({ default: false })
  emailVerified: boolean;

  /* Plaid's persistent user identifier (from /user/create) — required by
     linkTokenCreate's `user_id` field for integrations approved after Dec 10, 2025
     (see PlaidService.getOrCreatePlaidUserId). Null until the user's first Plaid
     connection attempt. */
  @Column({ type: 'varchar', nullable: true, default: null })
  plaidUserId: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
