import {
  Entity, PrimaryGeneratedColumn, Column,
  ManyToOne, JoinColumn, Index,
  CreateDateColumn, UpdateDateColumn,
} from 'typeorm';
import { BankAccount } from '../bank-accounts/bank-account.entity';
import { Category } from '../categories/category.entity';
import { ProjectCategory } from '../projects/project-category.entity';
import { CategorizationRule } from '../categorization-rules/categorization-rule.entity';

/* externalId (Plaid transaction_id, or a CSV reference/composite key) is only
   guaranteed unique per user — two different users' CSV imports can produce
   the identical composite fallback key (same date/name/amount, e.g. a Schwab
   MoneyLink transfer with no reference-number column), so uniqueness must be
   scoped to the owning user, not global. */
@Entity('transactions')
@Index(['userId', 'externalId'], { unique: true })
export class Transaction {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  userId: string;

  @ManyToOne(() => BankAccount, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'bankAccountId' })
  bankAccount: BankAccount;

  @Column({ nullable: true })
  bankAccountId: string;

  /* External dedup key — Plaid transaction_id or CSV reference number.
     Uniqueness is enforced per-user via the composite index above. */
  @Column({ nullable: true })
  externalId: string;

  /* 'plaid' | 'csv' | 'manual' */
  @Column({ default: 'plaid' })
  source: string;

  /* Positive = money in (income/refund), Negative = money out (expense) */
  @Column({ type: 'decimal', precision: 12, scale: 2 })
  amount: number;

  @Column()
  name: string;

  @Column({ nullable: true })
  merchantName: string | null;

  /* User-assigned category */
  @Column({ nullable: true })
  category: string;

  @ManyToOne(() => Category, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'categoryId' })
  categoryRef: Category;

  @Column({ nullable: true })
  categoryId: string;

  /* Set when this transaction is a repayment of a debt (excluded from income/expense). */
  @Column({ type: 'varchar', nullable: true })
  debtId: string | null;

  /* For transfer-type categories: the counterpart account */
  @ManyToOne(() => BankAccount, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'transferAccountId' })
  transferAccount: BankAccount;

  @Column({ nullable: true })
  transferAccountId: string;

  /* The transaction on the other side of this transfer */
  @Column({ nullable: true })
  counterpartTxId: string;

  /* Project this transaction is linked to */
  @Column({ nullable: true })
  projectId: string;

  /* Project-level category (e.g. "Tires", "Mechanic") */
  @Column({ nullable: true })
  projectCategoryId: string;

  @ManyToOne(() => ProjectCategory, { nullable: true, eager: false })
  @JoinColumn({ name: 'projectCategoryId' })
  projectCategoryRef: ProjectCategory;

  /* Asset this transaction is linked to (owned-asset income/expense tag) */
  @Column({ type: 'uuid', nullable: true })
  assetId: string | null;

  /* Plaid's category hierarchy, e.g. ["Food and Drink", "Restaurants"] */
  @Column({ type: 'simple-array', nullable: true })
  plaidCategory: string[];

  @Column({ type: 'date' })
  date: string;

  @Column({ default: false })
  pending: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @Column({ type: 'uuid', nullable: true, default: null })
  parentId: string | null;

  @Column({ default: false })
  isSplitParent: boolean;

  @Column({ type: 'varchar', length: 500, nullable: true, default: null })
  note: string | null;

  @Column({ type: 'uuid', nullable: true, default: null })
  receiptId: string | null;

  /* Set when this transaction's category was applied automatically by a
     CategorizationRule, rather than picked manually — powers the "ruled"
     indicator and lets it be cleared without affecting the category itself. */
  @ManyToOne(() => CategorizationRule, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'categorizedByRuleId' })
  categorizedByRule: CategorizationRule;

  @Column({ type: 'uuid', nullable: true, default: null })
  categorizedByRuleId: string | null;
}
