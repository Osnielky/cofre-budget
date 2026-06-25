import {
  Entity, PrimaryGeneratedColumn, Column,
  ManyToOne, JoinColumn, Unique,
  CreateDateColumn, UpdateDateColumn,
} from 'typeorm';
import { Category } from '../categories/category.entity';
import { Project } from '../projects/project.entity';

@Entity('budgets')
@Unique(['userId', 'categoryId', 'month'])
export class Budget {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  userId: string;

  @ManyToOne(() => Category, { nullable: true, eager: true, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'categoryId' })
  category: Category | null;

  @Column({ nullable: true })
  categoryId: string | null;

  @Column({ nullable: true })
  projectCategoryId: string | null;

  @Column({ default: '2026-06' })
  month: string;

  /* Month this value was last explicitly set. Carried-forward copies preserve
     the origin; an explicit edit stamps the edit's month. Null = legacy/own month. */
  @Column({ nullable: true })
  sourceMonth: string;

  @Column({ type: 'decimal', precision: 12, scale: 2 })
  amount: number;

  @Column({ nullable: true })
  projectId: string | null;

  @ManyToOne(() => Project, { nullable: true, eager: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'projectId' })
  project: Project | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
