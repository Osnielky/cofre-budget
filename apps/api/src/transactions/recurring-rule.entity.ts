import {
  Entity, PrimaryGeneratedColumn, Column,
  ManyToOne, JoinColumn, Index,
  CreateDateColumn, UpdateDateColumn,
} from 'typeorm';
import { BankAccount } from '../bank-accounts/bank-account.entity';
import { Category } from '../categories/category.entity';

export type RecurringUnit = 'day' | 'week' | 'month' | 'year';

/**
 * A repeating transaction the user set up ("$850 rent, every month on the 1st,
 * until Aug 2027").
 *
 * The rule is the source of truth; individual transactions are materialised
 * from it as their dates arrive (see TransactionsService.materialiseDue). There
 * is no cron in this deployment — Cloud Run scales to zero — so catch-up runs
 * when the user next loads their transactions. `lastRunDate` is what makes that
 * idempotent: it records the most recent occurrence already written.
 */
@Entity('recurring_rules')
@Index(['userId', 'active'])
export class RecurringRule {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  userId: string;

  /* ── The template each occurrence is stamped from ── */

  /* Signed, same convention as Transaction.amount: negative = money out. */
  @Column({ type: 'decimal', precision: 12, scale: 2 })
  amount: number;

  @Column()
  name: string;

  @ManyToOne(() => Category, { nullable: true, eager: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'categoryId' })
  category: Category | null;

  @Column({ type: 'varchar', nullable: true })
  categoryId: string | null;

  @ManyToOne(() => BankAccount, { nullable: true, eager: true, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'bankAccountId' })
  bankAccount: BankAccount | null;

  @Column({ type: 'varchar', nullable: true })
  bankAccountId: string | null;

  @Column({ type: 'varchar', nullable: true })
  note: string | null;

  /* ── The pattern ── */

  /* Repeat every `interval` `unit`s — e.g. 1 month, 2 weeks. */
  @Column({ type: 'smallint', default: 1 })
  interval: number;

  @Column({ type: 'varchar', default: 'month' })
  unit: RecurringUnit;

  /* For monthly/yearly rules: which day of the month to land on. Clamped to the
     length of each month, so 31 becomes the 30th in November. */
  @Column({ type: 'smallint', nullable: true })
  dayOfMonth: number | null;

  /* YYYY-MM-DD */
  @Column({ type: 'date' })
  startDate: string;

  /* Exactly one of endDate / occurrenceCount may be set; both null = forever. */
  @Column({ type: 'date', nullable: true })
  endDate: string | null;

  @Column({ type: 'smallint', nullable: true })
  occurrenceCount: number | null;

  /* ── Bookkeeping ── */

  /* The most recent occurrence date already written as a transaction. Null
     means nothing has been materialised yet. */
  @Column({ type: 'date', nullable: true })
  lastRunDate: string | null;

  /* How many occurrences have been written so far — the stop condition for
     count-limited rules. */
  @Column({ type: 'smallint', default: 0 })
  runCount: number;

  /* Cleared when the series finishes or the user stops it. */
  @Column({ type: 'boolean', default: true })
  active: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
