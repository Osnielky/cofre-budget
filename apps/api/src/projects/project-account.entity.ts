import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn, Unique, Index } from 'typeorm';
import { Project } from './project.entity';
import { BankAccount } from '../bank-accounts/bank-account.entity';

export type TradingKind = 'broker' | 'prop_firm';
export type TradingStatus = 'active' | 'evaluation' | 'funded' | 'failed' | 'closed';
export const TRADING_KINDS: readonly TradingKind[] = ['broker', 'prop_firm'] as const;
export const TRADING_STATUSES: readonly TradingStatus[] = ['active', 'evaluation', 'funded', 'failed', 'closed'] as const;

/** What the project knows about an account beyond the bank row: used by trading projects only. */
export interface TradingAccountMeta {
  kind: TradingKind;
  status: TradingStatus;
  firm: string | null;
  accountSize: number | null;
  startedAt: string | null;
  endedAt: string | null;
  notes: string | null;
}

/* A trading project follows one or more of the user's investment accounts (a
   brokerage, a futures prop-firm account, Webull…). Each account's trades are
   analysed on their own (FIFO lots never cross accounts) and the project shows
   the combined result. An account belongs to at most one project. Rows go when
   the project or the account goes. */
@Entity('project_accounts')
@Unique(['bankAccountId'])
export class ProjectAccount {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column()
  userId: string;

  @ManyToOne(() => Project, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'projectId' })
  project: Project;

  @Index()
  @Column({ type: 'uuid' })
  projectId: string;

  @ManyToOne(() => BankAccount, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'bankAccountId' })
  bankAccount: BankAccount;

  @Column({ type: 'uuid' })
  bankAccountId: string;

  /* ── Trading metadata (spec: trading-accounts-design §1) ── */
  /** 'broker' (a connected or manual brokerage) or 'prop_firm' (a combine / funded account). */
  @Column({ type: 'varchar', length: 16, default: 'broker' })
  kind: TradingKind;

  /** Brokers are 'active'; prop-firm accounts move evaluation → funded → closed, or → failed. */
  @Column({ type: 'varchar', length: 16, default: 'active' })
  status: TradingStatus;

  @Column({ type: 'varchar', length: 80, nullable: true })
  firm: string | null;

  @Column({ type: 'decimal', precision: 12, scale: 2, nullable: true })
  accountSize: number | null;

  @Column({ type: 'date', nullable: true })
  startedAt: string | null;

  @Column({ type: 'date', nullable: true })
  endedAt: string | null;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @CreateDateColumn()
  createdAt: Date;
}
