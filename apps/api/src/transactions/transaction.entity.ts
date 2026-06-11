import {
  Entity, PrimaryGeneratedColumn, Column,
  ManyToOne, JoinColumn,
  CreateDateColumn, UpdateDateColumn,
} from 'typeorm';
import { BankAccount } from '../bank-accounts/bank-account.entity';
import { Category } from '../categories/category.entity';
import { ProjectCategory } from '../projects/project-category.entity';

@Entity('transactions')
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

  /* External dedup key — Plaid transaction_id or CSV reference number */
  @Column({ nullable: true, unique: true })
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
  merchantName: string;

  /* User-assigned category */
  @Column({ nullable: true })
  category: string;

  @ManyToOne(() => Category, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'categoryId' })
  categoryRef: Category;

  @Column({ nullable: true })
  categoryId: string;

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
}
