import {
  Entity, PrimaryGeneratedColumn, Column,
  ManyToOne, JoinColumn,
  CreateDateColumn, UpdateDateColumn,
} from 'typeorm';
import { User } from '../users/user.entity';

export type AccountType = 'checking' | 'savings' | 'credit' | 'investment';

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

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
