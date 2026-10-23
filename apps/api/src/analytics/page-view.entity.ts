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

  /* First page of a visit (the beacon's first load in that tab). */
  @Column({ default: false })
  entry: boolean;

  /* Derived at ingest and non-identifying; the IP, user agent and headers are discarded. */
  @Column({ type: 'varchar', length: 2, nullable: true })
  country: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  region: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  city: string | null;

  @Column({ type: 'varchar', length: 10, nullable: true })
  device: string | null;

  @Column({ type: 'varchar', length: 40, nullable: true })
  browser: string | null;

  @Column({ type: 'varchar', length: 40, nullable: true })
  os: string | null;

  @Column({ type: 'varchar', length: 10, nullable: true })
  language: string | null;

  @Column({ type: 'int', nullable: true })
  viewportWidth: number | null;

  /* Campaign tags from the landing URL, entry views only. */
  @Column({ type: 'varchar', length: 100, nullable: true })
  utmSource: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  utmMedium: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  utmCampaign: string | null;

  @CreateDateColumn()
  createdAt: Date;
}
