import {
  Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, Index,
  CreateDateColumn, UpdateDateColumn,
} from 'typeorm';
import { User } from '../users/user.entity';
import { BankAccount } from '../bank-accounts/bank-account.entity';
import type { CardApr, LiabilitiesStatus, PlaidCardData } from './card-types';

/* One row per credit-type BankAccount: the card data Plaid Liabilities reports, or
   the user typed in. Created lazily by CreditCardsService.ensureDetail. */
@Entity('credit_card_details')
export class CreditCardDetail {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column()
  userId: string;

  @ManyToOne(() => BankAccount, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'bankAccountId' })
  bankAccount: BankAccount;

  @Index({ unique: true })
  @Column()
  bankAccountId: string;

  @Column({ type: 'decimal', precision: 12, scale: 2, nullable: true })
  creditLimit: number | null;

  @Column({ type: 'varchar', nullable: true })
  officialName: string | null;

  @Column({ type: 'simple-json', nullable: true })
  aprs: CardApr[] | null;

  @Column({ type: 'decimal', precision: 12, scale: 2, nullable: true })
  lastStatementBalance: number | null;

  @Column({ type: 'date', nullable: true })
  lastStatementDate: string | null;

  @Column({ type: 'decimal', precision: 12, scale: 2, nullable: true })
  minimumPayment: number | null;

  @Column({ type: 'date', nullable: true })
  nextPaymentDueDate: string | null;

  @Column({ type: 'decimal', precision: 12, scale: 2, nullable: true })
  lastPaymentAmount: number | null;

  @Column({ type: 'date', nullable: true })
  lastPaymentDate: string | null;

  @Column({ type: 'boolean', nullable: true })
  isOverdue: boolean | null;

  /* Manual only — Plaid doesn't report when a promo APR ends. */
  @Column({ type: 'date', nullable: true })
  promoAprEndsOn: string | null;

  /* Manual only. */
  @Column({ type: 'decimal', precision: 12, scale: 2, nullable: true })
  rewardsBalance: number | null;

  @Column({ type: 'varchar', default: 'pending' })
  liabilitiesStatus: LiabilitiesStatus;

  /* Fields the user typed in; Plaid sync leaves them alone (see detail-merge.ts). */
  @Column({ type: 'simple-array', nullable: true })
  manualFields: string[] | null;

  @Column({ type: Date, nullable: true, default: null })
  manualEditedAt: Date | null;

  /* Last Plaid report, non-null fields accumulated — lets "Use bank data" restore
     bank values immediately instead of waiting for the next sync. */
  @Column({ type: 'simple-json', nullable: true })
  plaidData: PlaidCardData | null;

  @Column({ type: Date, nullable: true, default: null })
  liabilitiesSyncedAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
