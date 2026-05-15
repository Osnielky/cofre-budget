import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Category } from './category.entity';
import { Transaction } from '../transactions/transaction.entity';
import { UpsertCategoryDto } from './dto/upsert-category.dto';

const DEFAULTS: Omit<Category, 'id' | 'userId' | 'user' | 'isDefault' | 'createdAt' | 'updatedAt'>[] = [
  { name: 'Food & Dining',  icon: '🍔', color: '#F07A3E', type: 'expense',  description: 'Restaurants, groceries, coffee & snacks' },
  { name: 'Transport',      icon: '🚗', color: '#4BA8D8', type: 'expense',  description: 'Gas, rideshare, parking & transit' },
  { name: 'Shopping',       icon: '🛍️', color: '#9B6DFF', type: 'expense',  description: 'Clothing, electronics & retail purchases' },
  { name: 'Housing',        icon: '🏠', color: '#F5C842', type: 'expense',  description: 'Rent, mortgage & home expenses' },
  { name: 'Health',         icon: '💊', color: '#4FBF7F', type: 'expense',  description: 'Doctor visits, pharmacy & fitness' },
  { name: 'Entertainment',  icon: '🎬', color: '#E879A0', type: 'expense',  description: 'Movies, games, events & hobbies' },
  { name: 'Utilities',      icon: '💡', color: '#F5C842', type: 'expense',  description: 'Electric, water, gas & internet bills' },
  { name: 'Travel',         icon: '✈️', color: '#4BA8D8', type: 'expense',  description: 'Hotels, flights & vacation expenses' },
  { name: 'Subscriptions',  icon: '📱', color: '#9B6DFF', type: 'expense',  description: 'Streaming, apps & recurring services' },
  { name: 'Education',      icon: '🎓', color: '#4FBF7F', type: 'expense',  description: 'Tuition, books & online courses' },
  { name: 'Salary',         icon: '💼', color: '#4FBF7F', type: 'income',   description: 'Regular employment income' },
  { name: 'Freelance',      icon: '💻', color: '#9B6DFF', type: 'income',   description: 'Contract & self-employment earnings' },
  { name: 'Investments',    icon: '📈', color: '#F5C842', type: 'income',   description: 'Dividends, returns & capital gains' },
  { name: 'Other',               icon: '📦', color: '#5C5C78', type: 'both',     description: 'Anything that doesn\'t fit another category' },
  { name: 'Credit Card Payment', icon: '💳', color: '#6B6B8A', type: 'transfer', description: 'Paying off your credit card balance' },
  { name: 'Internal Transfer',   icon: '🔄', color: '#6B6B8A', type: 'transfer', description: 'Moving money between your own accounts' },
];

@Injectable()
export class CategoriesService {
  constructor(
    @InjectRepository(Category) private repo: Repository<Category>,
    @InjectRepository(Transaction) private txRepo: Repository<Transaction>,
  ) {}

  async findAllByUser(userId: string): Promise<Category[]> {
    const existing = await this.repo.find({ where: { userId }, order: { isDefault: 'DESC', createdAt: 'ASC' } });

    const existingNames = new Set(existing.map((c) => c.name));
    const missing = DEFAULTS.filter((d) => !existingNames.has(d.name));

    if (missing.length > 0) {
      const entities = missing.map((d) => this.repo.create({ ...d, userId, isDefault: true }));
      await this.repo.save(entities);
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

  async getUsageCount(id: string, userId: string): Promise<{ count: number }> {
    const cat = await this.repo.findOneBy({ id });
    if (!cat) throw new NotFoundException();
    if (cat.userId !== userId) throw new ForbiddenException();
    const count = await this.txRepo.count({ where: { categoryId: id } });
    return { count };
  }

  async remove(id: string, userId: string, reassignTo?: string): Promise<void> {
    const cat = await this.repo.findOneBy({ id });
    if (!cat) throw new NotFoundException();
    if (cat.userId !== userId) throw new ForbiddenException();
    if (reassignTo) {
      await this.txRepo.update({ categoryId: id }, { categoryId: reassignTo });
    }
    await this.repo.remove(cat);
  }

}
