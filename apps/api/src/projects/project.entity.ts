import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('projects')
export class Project {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  userId: string;

  @Column()
  name: string;

  /* vehicle | property | business | service | trading | other */
  @Column({ default: 'other' })
  type: string;

  @Column({ default: '📦' })
  icon: string;

  @Column({ nullable: true })
  color: string;

  @Column({ nullable: true })
  description: string;

  @Column({ type: 'text', nullable: true })
  imageUrl: string;

  /* Initial purchase / investment amount */
  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  purchasePrice: number;

  @Column({ type: 'date', nullable: true })
  purchaseDate: string;

  /* active | sold */
  @Column({ default: 'active' })
  status: string;

  @Column({ type: 'decimal', precision: 12, scale: 2, nullable: true })
  salePrice: number;

  @Column({ type: 'date', nullable: true })
  saleDate: string;

  @Column({ type: 'uuid', nullable: true })
  purchaseTxId: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
