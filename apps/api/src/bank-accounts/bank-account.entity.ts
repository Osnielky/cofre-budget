import {
  Entity, PrimaryGeneratedColumn, Column,
  ManyToOne, JoinColumn,
  CreateDateColumn, UpdateDateColumn,
} from 'typeorm';
import { User } from '../users/user.entity';

// Stored as a free-form string column; this union documents the supported values.
// See account-types.ts for liability / tracking / importable classification.
export type AccountType =
  | 'checking' | 'savings' | 'credit' | 'cash' | 'line_of_credit' | 'paypal' | 'merchant' // budget
  | 'investment' | 'mortgage' | 'other_asset' | 'other_liability'; // tracking

@Entity('bank_accounts')
export class BankAccount {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column()
  userId: string;

  @Column()
  bankName: string;

  @Column()
  accountName: string;

  @Column({ default: 'checking' })
  accountType: string;

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  balance: number;

  @Column({ default: 'USD' })
  currency: string;

  @Column({ nullable: true })
  color: string;

  /* 'manual' | 'plaid' */
  @Column({ default: 'manual' })
  provider: string;

  /* Our PlaidItem.id — null for manual accounts */
  @Column({ nullable: true })
  plaidItemId: string;

  /* Plaid's account_id within the Item */
  @Column({ nullable: true })
  plaidAccountId: string;

  /* Last 4 digits of account/card number — used to validate CSV imports */
  @Column({ nullable: true, length: 4 })
  last4: string;

  /* Set when this account is auto-managed by an Asset (value or loan account).
     Such accounts are hidden from the manual Accounts list. */
  @Column({ type: 'uuid', nullable: true })
  managedByAssetId: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
