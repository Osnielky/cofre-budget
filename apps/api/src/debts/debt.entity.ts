import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('debts')
export class Debt {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column() userId: string;
  @Column() borrowerName: string;
  @Column({ type: 'varchar', nullable: true }) borrowerEmail: string | null;
  @Column({ type: 'decimal', precision: 12, scale: 2 }) principal: number;
  @Column({ type: 'varchar', nullable: true }) description: string | null;
  @Column({ type: 'date', nullable: true }) startDate: string | null;
  @Column({ type: 'date', nullable: true }) dueDate: string | null;
  @Column({ type: 'varchar', default: 'open' }) status: 'open' | 'paid';
  @Column({ type: 'varchar', length: 10, default: 'lent' }) direction: 'lent' | 'owed';
  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}
