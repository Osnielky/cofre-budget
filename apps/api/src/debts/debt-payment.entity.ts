import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, CreateDateColumn } from 'typeorm';
import { Debt } from './debt.entity';

@Entity('debt_payments')
export class DebtPayment {
  @PrimaryGeneratedColumn('uuid') id: string;
  @ManyToOne(() => Debt, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'debtId' }) debt: Debt;
  @Column() debtId: string;
  @Column({ type: 'decimal', precision: 12, scale: 2 }) amount: number;
  @Column({ type: 'date' }) date: string;
  @Column({ nullable: true }) note: string | null;
  @CreateDateColumn() createdAt: Date;
}
