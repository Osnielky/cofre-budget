import {
  Entity, PrimaryGeneratedColumn, Column,
  CreateDateColumn, UpdateDateColumn,
} from 'typeorm';

@Entity('subscriptions')
export class Subscription {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  userId: string;

  @Column()
  stripeSubscriptionId: string;

  @Column()
  tier: 'pro' | 'elite';

  @Column()
  interval: 'month' | 'year';

  @Column()
  status: 'trialing' | 'active' | 'past_due' | 'canceled';

  @Column({ type: Date, nullable: true })
  currentPeriodEnd: Date | null;

  @Column({ type: Date, nullable: true })
  trialEnd: Date | null;

  @Column({ default: false })
  cancelAtPeriodEnd: boolean;

  /** When Stripe first reported the current past-due spell; null while not past due.
      BillingService.sweepPastDue drops the user to free 24 h after it. */
  @Column({ type: Date, nullable: true })
  pastDueSince: Date | null;

  /** When Cofre's "trial ends in 3 days" email went out (BillingService.sweepTrialReminders); once per subscription. */
  @Column({ type: Date, nullable: true })
  trialReminderSentAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
