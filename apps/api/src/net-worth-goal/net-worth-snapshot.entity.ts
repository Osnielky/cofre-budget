import { Entity, PrimaryGeneratedColumn, Column, UpdateDateColumn, Index } from 'typeorm';

/** Net worth on one day for one user. Written when the user's goal is loaded;
 *  the last write of the day wins. */
@Entity('net_worth_snapshots')
@Index(['userId', 'date'], { unique: true })
export class NetWorthSnapshot {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column()
  userId: string;

  @Column({ type: 'date' })
  date: string;

  @Column({ type: 'decimal', precision: 14, scale: 2 })
  value: string;

  @UpdateDateColumn()
  updatedAt: Date;
}
