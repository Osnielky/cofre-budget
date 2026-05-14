import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Category } from './category.entity';
import { UpsertCategoryDto } from './dto/upsert-category.dto';

const DEFAULTS: Omit<Category, 'id' | 'userId' | 'user' | 'isDefault' | 'createdAt' | 'updatedAt'>[] = [
  { name: 'Food & Dining',   icon: '🍔', color: '#F07A3E', type: 'expense' },
  { name: 'Transport',       icon: '🚗', color: '#4BA8D8', type: 'expense' },
  { name: 'Shopping',        icon: '🛍️', color: '#9B6DFF', type: 'expense' },
  { name: 'Housing',         icon: '🏠', color: '#F5C842', type: 'expense' },
  { name: 'Health',          icon: '💊', color: '#4FBF7F', type: 'expense' },
  { name: 'Entertainment',   icon: '🎬', color: '#E879A0', type: 'expense' },
  { name: 'Utilities',       icon: '💡', color: '#F5C842', type: 'expense' },
  { name: 'Travel',          icon: '✈️', color: '#4BA8D8', type: 'expense' },
  { name: 'Subscriptions',   icon: '📱', color: '#9B6DFF', type: 'expense' },
  { name: 'Education',       icon: '🎓', color: '#4FBF7F', type: 'expense' },
  { name: 'Salary',          icon: '💼', color: '#4FBF7F', type: 'income' },
  { name: 'Freelance',       icon: '💻', color: '#9B6DFF', type: 'income' },
  { name: 'Investments',     icon: '📈', color: '#F5C842', type: 'income' },
  { name: 'Other',           icon: '📦', color: '#5C5C78', type: 'both'   },
];

@Injectable()
export class CategoriesService {
  constructor(@InjectRepository(Category) private repo: Repository<Category>) {}

  async findAllByUser(userId: string): Promise<Category[]> {
    const existing = await this.repo.find({ where: { userId }, order: { isDefault: 'DESC', createdAt: 'ASC' } });

    if (existing.length === 0) {
      await this.seedDefaults(userId);
      return this.repo.find({ where: { userId }, order: { isDefault: 'DESC', createdAt: 'ASC' } });
    }

    return existing;
  }

  create(userId: string, dto: UpsertCategoryDto): Promise<Category> {
    return this.repo.save(this.repo.create({ ...dto, userId, isDefault: false }));
  }

  async update(id: string, userId: string, dto: UpsertCategoryDto): Promise<Category> {
    const cat = await this.repo.findOneBy({ id });
    if (!cat) throw new NotFoundException();
    if (cat.userId !== userId) throw new ForbiddenException();
    Object.assign(cat, dto);
    return this.repo.save(cat);
  }

  async remove(id: string, userId: string): Promise<void> {
    const cat = await this.repo.findOneBy({ id });
    if (!cat) throw new NotFoundException();
    if (cat.userId !== userId) throw new ForbiddenException();
    await this.repo.remove(cat);
  }

  private async seedDefaults(userId: string): Promise<void> {
    const entities = DEFAULTS.map((d) => this.repo.create({ ...d, userId, isDefault: true }));
    await this.repo.save(entities);
  }
}
