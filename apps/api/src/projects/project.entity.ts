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

  /* active | sold | terminated.

     Held assets (vehicle/property/other) close as 'sold' and realise a gain
     against cost basis. Ongoing operations (business/service/trading) close as
     'terminated' and have no sale price, only a lifetime P&L. See closure.ts —
     the transition is validated on update.

     A terminated project reuses `saleDate` below as the date it closed and
     leaves `salePrice` null. That is safe because every net-gain calculation
     guards on `status === 'sold' && salePrice != null`, so a termination date
     can never be read as a sale. */
  @Column({ default: 'active' })
  status: string;

  /* Null until closed. Nullable in TS too, so reactivating can clear them. */
  @Column({ type: 'decimal', precision: 12, scale: 2, nullable: true })
  salePrice: number | null;

  @Column({ type: 'date', nullable: true })
  saleDate: string | null;

  @Column({ type: 'uuid', nullable: true })
  purchaseTxId: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
