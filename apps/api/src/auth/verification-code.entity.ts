import {
  Entity, PrimaryGeneratedColumn, Column,
  CreateDateColumn, Index,
} from 'typeorm';

export type CodeType = 'verify' | 'reset';

/**
 * Short-lived 6-digit codes for email verification and password reset.
 * Single-use, expiring, attempt-limited. Old codes for the same
 * (email, type) are invalidated when a new one is issued.
 */
@Entity('verification_codes')
@Index(['email', 'type'])
export class VerificationCode {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  email: string;

  @Column()
  code: string;

  @Column({ type: 'varchar', default: 'verify' })
  type: CodeType;

  @Column({ type: 'int', default: 0 })
  attempts: number;

  @Column({ type: 'timestamptz' })
  expiresAt: Date;

  @Column({ default: false })
  consumed: boolean;

  @CreateDateColumn()
  createdAt: Date;
}
