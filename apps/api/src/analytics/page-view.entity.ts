import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm';

/**
 * One row per page view, kept 90 days (AnalyticsService.sweep). No user id, no
 * IP, no user agent: `visitorHash` is a daily-salted hash that cannot be
 * reversed or joined across days, so the table holds nothing personal.
 */
@Entity('page_views')
@Index(['date'])
@Index(['date', 'visitorHash'])
export class PageView {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /* UTC calendar day, the unit every aggregate works in. */
  @Column({ type: 'date' })
  date: string;

  /* Route-shaped path: ids replaced by :id, query dropped. */
  @Column({ length: 200 })
  path: string;

  /* Host the visit came from, null for direct / same-site. */
  @Column({ type: 'varchar', length: 100, nullable: true })
  referrerHost: string | null;

  @Column({ length: 64 })
  visitorHash: string;

  @Column({ default: false })
  signedIn: boolean;

  @Column({ default: false })
  isDemo: boolean;

  @CreateDateColumn()
  createdAt: Date;
}
