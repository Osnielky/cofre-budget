import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm';

@Entity('receipts')
@Index('UQ_receipts_user_gmail_message', ['userId', 'gmailMessageId'], { unique: true })
export class Receipt {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  userId: string;

  @Column()
  gmailMessageId: string;

  @Column()
  merchant: string;

  @Column({ nullable: true })
  orderNumber: string;

  @Column({ type: 'date', nullable: true })
  orderDate: string;

  @Column({ type: 'decimal', precision: 12, scale: 2 })
  total: number;

  @Column({ default: 'USD' })
  currency: string;

  @Column({ type: 'jsonb' })
  items: { name: string; quantity: number; unitPrice: number; total: number }[];

  @Column({ nullable: true })
  rawSubject: string;

  @Column({ default: false })
  imported: boolean;

  @Column({ default: 'gmail' })
  source: string;

  @Column({ type: 'bytea', nullable: true, select: false })
  imageData: Buffer | null;

  @Column({ type: 'varchar', nullable: true })
  imageMimeType: string | null;

  @CreateDateColumn()
  parsedAt: Date;
}
