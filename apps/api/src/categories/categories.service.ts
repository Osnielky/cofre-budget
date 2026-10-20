import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { InjectRepository, InjectDataSource } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Category } from './category.entity';
import { Transaction } from '../transactions/transaction.entity';
import { Budget } from '../budgets/budget.entity';
import { UpsertCategoryDto, CATEGORY_FIELDS } from './dto/upsert-category.dto';
import { MergeCategoryDto } from './dto/merge-category.dto';
import { CategorizationRule, ruleIdentityKey } from '../categorization-rules/categorization-rule.entity';
import { RecurringRule } from '../transactions/recurring-rule.entity';
import { pickFields } from '../common/http/pick-fields';

const DEFAULTS: Omit<Category, 'id' | 'userId' | 'user' | 'isDefault' | 'createdAt' | 'updatedAt' | 'isFixed' | 'wantNeed'>[] = [
  { name: 'Food & Dining',  icon: '🍔', color: '#F07A3E', type: 'expense',  description: 'Restaurants, groceries, coffee & snacks' },
  { name: 'Groceries',      icon: '🛒', color: '#4FBF7F', type: 'expense',  description: 'Supermarket & grocery store purchases' },
  { name: 'Candy & Sweets', icon: '🍬', color: '#F07A3E', type: 'expense',  description: 'Candy, sweets & sugary treats' },
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
  { name: 'Investments',    icon: '📈', color: '#F5C842', type: 'savings',  description: 'Money you invest or save — brokerage, retirement & savings contributions' },
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
    /* merge() runs in one transaction and reaches RecurringRule through the
       transactional manager, so no repository is injected for it. */
    @InjectDataSource() private dataSource: DataSource,
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
    return this.repo.save(this.repo.create({ ...pickFields(dto, CATEGORY_FIELDS), userId, isDefault: false }));
  }

  async update(id: string, userId: string, dto: UpsertCategoryDto): Promise<Category> {
    const cat = await this.repo.findOneBy({ id });
    if (!cat) throw new NotFoundException();
    if (cat.userId !== userId) throw new ForbiddenException();
    Object.assign(cat, pickFields(dto, CATEGORY_FIELDS));
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
      // reassigned to. Guard against the unique(userId, matchType, matchValue,
      // matchStrategy) constraint — if the user already has a separate rule with
      // the same match pointing at reassignTo, drop the now-redundant rule(s) on
      // the deleted category before retargeting the rest.
      const [deletedRules, targetRules] = await Promise.all([
        this.rulesRepo.find({ where: { categoryId: id } }),
        this.rulesRepo.find({ where: { categoryId: reassignTo } }),
      ]);
      const targetKeys = new Set(targetRules.map(ruleIdentityKey));
      const colliding = deletedRules.filter((r) => targetKeys.has(ruleIdentityKey(r)));
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

  /**
   * Fold `oldId` into `dto.targetId`: every transaction, budget, categorization
   * rule and recurring rule that pointed at the old category now points at the
   * target, the target is optionally renamed, and the old category is deleted.
   * One DB transaction, so a failure part-way leaves both categories untouched.
   */
  async merge(oldId: string, userId: string, dto: MergeCategoryDto): Promise<Category> {
    if (!dto?.targetId) throw new BadRequestException('Pick a category to merge into.');
    if (dto.targetId === oldId) throw new BadRequestException('A category cannot be merged into itself.');

    const [old, target] = await Promise.all([this.repo.findOneBy({ id: oldId }), this.repo.findOneBy({ id: dto.targetId })]);
    if (!old || !target) throw new NotFoundException();
    if (old.userId !== userId || target.userId !== userId) throw new ForbiddenException();

    const newName = typeof dto.name === 'string' ? dto.name.trim() : '';

    return this.dataSource.transaction(async (em) => {
      await em.getRepository(Transaction).update({ categoryId: old.id }, { categoryId: target.id });
      await em.getRepository(RecurringRule).update({ categoryId: old.id }, { categoryId: target.id });

      // Budgets: unique(userId, categoryId, month). Months only the old category
      // budgeted move over as-is; months both budgeted add the amounts onto the
      // target's row (its settings win) and drop the old row.
      const budgets = em.getRepository(Budget);
      const [oldBudgets, targetBudgets] = await Promise.all([
        budgets.find({ where: { categoryId: old.id } }),
        budgets.find({ where: { categoryId: target.id } }),
      ]);
      const targetByMonth = new Map(targetBudgets.map((b) => [b.month, b]));
      for (const b of oldBudgets) {
        const existing = targetByMonth.get(b.month);
        if (existing) {
          existing.amount = Number(existing.amount) + Number(b.amount);
          await budgets.save(existing);
          await budgets.delete(b.id);
        } else {
          await budgets.update(b.id, { categoryId: target.id });
        }
      }

      // Categorization rules: unique(userId, matchType, matchValue, matchStrategy).
      // A rule on the old category whose match the target already has is redundant.
      const rules = em.getRepository(CategorizationRule);
      const [oldRules, targetRules] = await Promise.all([
        rules.find({ where: { categoryId: old.id } }),
        rules.find({ where: { categoryId: target.id } }),
      ]);
      const targetKeys = new Set(targetRules.map(ruleIdentityKey));
      const colliding = oldRules.filter((r) => targetKeys.has(ruleIdentityKey(r)));
      if (colliding.length > 0) await rules.delete(colliding.map((r) => r.id));
      await rules.update({ categoryId: old.id }, { categoryId: target.id });

      const cats = em.getRepository(Category);
      if (newName && newName !== target.name) {
        target.name = newName;
        await cats.save(target);
      }
      await cats.delete(old.id);
      return cats.findOneByOrFail({ id: target.id });
    });
  }
}
