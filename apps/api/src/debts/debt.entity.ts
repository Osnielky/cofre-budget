import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('debts')
export class Debt {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column() userId: string;
  @Column() borrowerName: string;
  @Column({ nullable: true }) borrowerEmail: string | null;
  @Column({ type: 'decimal', precision: 12, scale: 2 }) principal: number;
  @Column({ nullable: true }) description: string | null;
  @Column({ type: 'date', nullable: true }) dueDate: string | null;
  @Column({ default: 'open' }) status: 'open' | 'paid';
  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}
