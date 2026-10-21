import { Entity, PrimaryColumn, Column } from 'typeorm';

/**
 * The image attached to a problem report, keyed by ticket id. Kept apart from
 * `support_tickets` so the bytes are only read by the screenshot endpoint
 * (SupportService uses raw SQL on this table; sqlite tests create it by hand
 * because the sqlite driver has no `bytea`).
 */
@Entity('support_screenshots')
export class SupportScreenshot {
  @PrimaryColumn('uuid')
  ticketId: string;

  @Column({ type: 'bytea' })
  data: Buffer;

  @Column({ length: 20 })
  mimeType: string;
}
