import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

@Entity('project_categories')
export class ProjectCategory {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ nullable: true })
  userId: string;

  /* 'vehicle' | 'property' | 'business' | 'other' */
  @Column({ nullable: true })
  projectType: string;

  @Column()
  name: string;

  @Column({ default: '📦' })
  icon: string;

  @Column({ default: '#9B6DFF' })
  color: string;

  @Column({ default: 0 })
  order: number;

  @CreateDateColumn()
  createdAt: Date;
}
