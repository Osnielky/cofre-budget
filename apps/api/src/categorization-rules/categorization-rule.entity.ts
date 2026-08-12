import {
  Entity, PrimaryGeneratedColumn, Column,
  ManyToOne, JoinColumn, Unique,
  CreateDateColumn,
} from 'typeorm';
import { User } from '../users/user.entity';
import { Category } from '../categories/category.entity';

/* Match text/category is fixed once created except via update(); duplicates for the
   same user+matchType+matchValue+matchStrategy are rejected at create/update time
   (service-level check backed by this DB constraint). */
@Entity('categorization_rules')
@Unique(['userId', 'matchType', 'matchValue', 'matchStrategy'])
export class CategorizationRule {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column()
  userId: string;

  /* 'merchant' matches Transaction.merchantName, 'name' matches Transaction.name */
  @Column()
  matchType: 'merchant' | 'name';

  @Column()
  matchValue: string;

  /* 'exact' requires the full text to match; 'prefix' matches anything starting
     with matchValue — needed for ACH/payroll-style transactions that embed a
     unique id after a stable prefix. */
  @Column({ default: 'exact' })
  matchStrategy: 'exact' | 'prefix';

  @ManyToOne(() => Category, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'categoryId' })
  category: Category;

  @Column()
  categoryId: string;

  @CreateDateColumn()
  createdAt: Date;
}
