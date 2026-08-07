import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Category } from './category.entity';
import { Transaction } from '../transactions/transaction.entity';
import { Budget } from '../budgets/budget.entity';
import { UpsertCategoryDto } from './dto/upsert-category.dto';
import { CategorizationRule } from '../categorization-rules/categorization-rule.entity';

const DEFAULTS: Omit<Category, 'id' | 'userId' | 'user' | 'isDefault' | 'createdAt' | 'updatedAt' | 'isFixed'>[] = [
  { name: 'Food & Dining',  icon: '🍔', color: '#F07A3E', type: 'expense',  description: 'Restaurants, groceries, coffee & snacks' },
  { name: 'Groceries',      icon: '🛒', color: '#4FBF7F', type: 'expense',  description: 'Supermarket & grocery store purchases' },
  { name: 'Transport',      icon: '🚗', color: '#4BA8D8', type: 'expense',  description: 'Gas, rideshare, parking & transit' },
  { name: 'Shopping',       icon: '🛍️', color: '#9B6DFF', type: 'expense',  description: 'Clothing, electronics & retail purchases' },
  { name: 'Clothes',        icon: '👗', color: '#E879A0', type: 'expense',  description: 'Clothing, shoes & accessories' },
  { name: 'Housing',        icon: '🏠', color: '#F5C842', type: 'expense',  description: 'Rent, mortgage & home expenses' },
  { name: 'Health',         icon: '💊', color: '#4FBF7F', type: 'expense',  description: 'Doctor visits, pharmacy & fitness' },
  { name: 'Gym',            icon: '🏋️', color: '#4FBF7F', type: 'expense',  description: 'Gym membership & fitness classes' },
  { name: 'Entertainment',  icon: '🎬', color: '#E879A0', type: 'expense',  description: 'Movies, games, events & hobbies' },
  { name: 'Utilities',      icon: '💡', color: '#F5C842', type: 'expense',  description: 'Electric, water, gas & internet bills' },
  { name: 'Travel',         icon: '✈️', color: '#4BA8D8', type: 'expense',  description: 'Hotels, flights & vacation expenses' },
  { name: 'Subscriptions',  icon: '📱', color: '#9B6DFF', type: 'expense',  description: 'Streaming, apps & recurring services' },
  { name: 'Memberships',    icon: '🪪', color: '#4BA8D8', type: 'expense',  description: 'Gym, clubs & membership dues' },
  { name: 'Phone',          icon: '📞', color: '#4BA8D8', type: 'expense',  description: 'Mobile & home phone bills' },
  { name: 'Education',      icon: '🎓', color: '#4FBF7F', type: 'expense',  description: 'Tuition, books & online courses' },
  { name: 'Car Insurance',  icon: '🛡️', color: '#4BA8D8', type: 'expense',  description: 'Auto insurance premiums & claims' },
  { name: 'House Rent',     icon: '🏡', color: '#F5C842', type: 'expense',  description: 'Monthly rent payments' },
  { name: 'Child Support',  icon: '👨‍👧', color: '#E879A0', type: 'expense',  description: 'Court-ordered child support payments' },
  { name: 'Child Expenses', icon: '🧒', color: '#9B6DFF', type: 'expense',  description: 'School, activities & child care costs' },
  { name: 'Reimbursement',  icon: '🤝', color: '#4FBF7F', type: 'income',   description: 'Money received back from shared expenses or refunds' },
  { name: 'Cash-reward',    icon: '🎁', color: '#F5C842', type: 'income',   description: 'Credit card cash back, bank rewards & bonuses' },
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
    @InjectRepository(Budget) private budgetRepo: Repository<Budget>,
    @InjectRepository(CategorizationRule) private rulesRepo: Repository<CategorizationRule>,
  ) {}

  async findAllByUser(userId: string): Promise<Category[]> {
    const existing = await this.repo.find({ where: { userId }, order: { isDefault: 'DESC', createdAt: 'ASC' } });

    if (existing.length === 0) {
      // First visit — seed all defaults
      const entities = DEFAULTS.map((d) => this.repo.create({ ...d, userId, isDefault: true }));
      await this.repo.save(entities);
      return this.repo.find({ where: { userId }, order: { isDefault: 'DESC', createdAt: 'ASC' } });
    }

    // Add any new defaults that don't exist yet (never re-add ones the user deleted)
    const existingNames = new Set(existing.map((c) => c.name));
    const existingDefaults = new Set(existing.filter((c) => c.isDefault).map((c) => c.name));
    const newDefaults = DEFAULTS.filter(
      (d) => !existingNames.has(d.name) && !existingDefaults.has(d.name),
    );
    if (newDefaults.length > 0) {
      const entities = newDefaults.map((d) => this.repo.create({ ...d, userId, isDefault: true }));
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
    // Budgets reference this category. Don't rely on a DB-level cascade (it
    // isn't guaranteed across environments) — clean it up explicitly so the
    // delete never leaves an orphaned budget behind.
    await this.budgetRepo.delete({ categoryId: id });

    if (reassignTo) {
      // Retarget rather than delete: a rule that used to fire for this category
      // should keep firing, just pointed at the category transactions were
      // reassigned to. Guard against the unique(userId, matchType, matchValue)
      // constraint — if the user already has a separate rule with the same
      // match pointing at reassignTo, drop the now-redundant rule(s) on the
      // deleted category before retargeting the rest.
      const [deletedRules, targetRules] = await Promise.all([
        this.rulesRepo.find({ where: { categoryId: id } }),
        this.rulesRepo.find({ where: { categoryId: reassignTo } }),
      ]);
      const targetKeys = new Set(targetRules.map((r) => `${r.matchType}::${r.matchValue.toLowerCase()}`));
      const colliding = deletedRules.filter((r) => targetKeys.has(`${r.matchType}::${r.matchValue.toLowerCase()}`));
      if (colliding.length > 0) {
        await this.rulesRepo.delete(colliding.map((r) => r.id));
      }
      try {
        await this.rulesRepo.update({ categoryId: id }, { categoryId: reassignTo });
      } catch (err) {
        // Fallback for any collision the pre-check above didn't catch (e.g. a
        // race, or case-variant match values) — don't let the whole category
        // delete fail because of a rule conflict.
        if ((err as { code?: string })?.code === '23505') {
          await this.rulesRepo.delete({ categoryId: id });
        } else {
          throw err;
        }
      }
    } else {
      // No sensible category left for the rule to point at — remove it, as before.
      await this.rulesRepo.delete({ categoryId: id });
    }

    await this.repo.remove(cat);
  }

}
