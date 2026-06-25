import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('assets')
export class Asset {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  userId: string;

  @Column()
  name: string;

  /* property | vehicle | other */
  @Column({ default: 'property' })
  type: string;

  @Column({ default: '🏠' })
  icon: string;

  @Column({ nullable: true })
  color: string;

  @Column({ type: 'text', nullable: true })
  imageUrl: string;

  @Column({ nullable: true })
  description: string;

  /* What the user paid — reference point for appreciation */
  @Column({ type: 'decimal', precision: 12, scale: 2, nullable: true })
  purchasePrice: number;

  @Column({ type: 'date', nullable: true })
  purchaseDate: string;

  /* Auto-created other_asset account whose balance = current value */
  @Column({ type: 'uuid', nullable: true })
  valueAccountId: string | null;

  /* Auto-created mortgage/other_liability account whose balance = amount owed */
  @Column({ type: 'uuid', nullable: true })
  loanAccountId: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
