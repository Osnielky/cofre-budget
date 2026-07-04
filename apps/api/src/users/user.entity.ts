import {
  Entity, PrimaryGeneratedColumn, Column,
  CreateDateColumn, UpdateDateColumn,
} from 'typeorm';

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  email: string;

  @Column({ nullable: true })
  name: string;

  @Column({ nullable: true, select: false })
  password: string;

  @Column({ nullable: true, unique: true })
  googleId: string;

  @Column({ nullable: true })
  avatarUrl: string;

  @Column({ default: 'free' })
  plan: 'free' | 'pro';

  /* Yearly savings goal in dollars; null = not set */
  @Column({ type: 'decimal', precision: 12, scale: 2, nullable: true, default: null })
  savingsGoal: string | null;

  @Column({ default: false })
  emailVerified: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
