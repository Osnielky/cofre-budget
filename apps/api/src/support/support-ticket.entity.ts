import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';
import type { TicketStatus } from './support.parse';

/**
 * One problem report. The screenshot bytes live in `support_screenshots`
 * (SupportScreenshot) so no list or detail query ever drags an image along;
 * `screenshotType` / `screenshotBytes` here say whether one exists.
 */
@Entity('support_tickets')
@Index(['userId'])
@Index(['status', 'createdAt'])
export class SupportTicket {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  userId: string;

  @Column({ type: 'varchar', length: 16, default: 'open' })
  status: TicketStatus;

  @Column({ type: 'text' })
  description: string;

  @Column({ length: 200 })
  page: string;

  @Column({ length: 20, default: 'unknown' })
  viewport: string;

  @Column({ length: 300, default: '' })
  userAgent: string;

  @Column({ type: 'varchar', length: 20, nullable: true })
  screenshotType: string | null;

  @Column({ type: 'int', default: 0 })
  screenshotBytes: number;

  /* The admin's answer, shown to the reporter. */
  @Column({ type: 'text', nullable: true })
  reply: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  replySentAt: Date | null;

  /* Internal, never returned to the reporter. */
  @Column({ type: 'text', nullable: true })
  adminNote: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  resolvedAt: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
