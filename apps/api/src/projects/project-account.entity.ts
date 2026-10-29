import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn, Unique, Index } from 'typeorm';
import { Project } from './project.entity';
import { BankAccount } from '../bank-accounts/bank-account.entity';

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

  @CreateDateColumn()
  createdAt: Date;
}
