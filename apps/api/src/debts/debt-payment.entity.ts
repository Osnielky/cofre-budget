import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, CreateDateColumn, Index } from 'typeorm';
import { Debt } from './debt.entity';

@Entity('debt_payments')
@Index(['debtId'])
export class DebtPayment {
  @PrimaryGeneratedColumn('uuid') id: string;
  @ManyToOne(() => Debt, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'debtId' }) debt: Debt;
  @Column() debtId: string;
  @Column({ type: 'decimal', precision: 12, scale: 2 }) amount: number;
  @Column({ type: 'date' }) date: string;
  @Column({ type: 'varchar', nullable: true }) note: string | null;
  /* Set when this payment was created from a manual transaction (managed by it). */
  @Column({ type: 'varchar', nullable: true }) transactionId: string | null;
  @CreateDateColumn() createdAt: Date;
}
