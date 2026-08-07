import { Injectable, NotFoundException, ForbiddenException, ConflictException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CategorizationRule } from './categorization-rule.entity';
import { Transaction } from '../transactions/transaction.entity';
import { Category } from '../categories/category.entity';

export interface RuleWithApplyCount {
  rule: CategorizationRule;
  appliedCount: number;
}

@Injectable()
export class CategorizationRulesService {
  constructor(
    @InjectRepository(CategorizationRule) private repo: Repository<CategorizationRule>,
    @InjectRepository(Transaction) private txRepo: Repository<Transaction>,
    @InjectRepository(Category) private catRepo: Repository<Category>,
  ) {}

  findAllByUser(userId: string): Promise<CategorizationRule[]> {
    return this.repo.find({ where: { userId }, relations: ['category'], order: { createdAt: 'DESC' } });
  }

  getActiveRules(userId: string): Promise<CategorizationRule[]> {
    return this.repo.find({ where: { userId } });
  }

  /* Picks the categoryId a new, uncategorized transaction should get, or null.
     A merchant-type match takes precedence over a name-type match. */
  matchRule(rules: CategorizationRule[], candidate: { merchantName?: string | null; name: string }): string | null {
    const norm = (s: string) => s.trim().toLowerCase();
    if (candidate.merchantName) {
      const m = rules.find((r) => r.matchType === 'merchant' && norm(r.matchValue) === norm(candidate.merchantName!));
      if (m) return m.categoryId;
    }
    const n = rules.find((r) => r.matchType === 'name' && norm(r.matchValue) === norm(candidate.name));
    return n ? n.categoryId : null;
  }

  async create(userId: string, transactionId: string, categoryId: string): Promise<RuleWithApplyCount> {
    const tx = await this.txRepo.findOneBy({ id: transactionId, userId });
    if (!tx) throw new NotFoundException('Transaction not found');

    const category = await this.catRepo.findOneBy({ id: categoryId });
    if (!category || category.userId !== userId) throw new ForbiddenException('Category not found');

    const matchType: 'merchant' | 'name' = tx.merchantName ? 'merchant' : 'name';
    const matchValue = (tx.merchantName || tx.name || '').trim();
    if (!matchValue) throw new BadRequestException('This transaction has no merchant or name to match on');

    const existing = await this.repo
      .createQueryBuilder('rule')
      .where('rule.userId = :userId', { userId })
      .andWhere('rule.matchType = :matchType', { matchType })
      .andWhere('LOWER(rule.matchValue) = LOWER(:matchValue)', { matchValue })
      .getOne();
    if (existing) {
      throw new ConflictException({ message: 'A rule for this merchant already exists', existingRuleId: existing.id });
    }

    const rule = await this.repo.save(this.repo.create({ userId, matchType, matchValue, categoryId }));
    const appliedCount = await this.applyToUncategorized(userId, matchType, matchValue, categoryId);
    return { rule: await this.repo.findOne({ where: { id: rule.id }, relations: ['category'] }), appliedCount };
  }

  async update(id: string, userId: string, dto: { matchValue?: string; categoryId?: string }): Promise<RuleWithApplyCount> {
    const rule = await this.repo.findOneBy({ id });
    if (!rule) throw new NotFoundException();
    if (rule.userId !== userId) throw new ForbiddenException();

    if (dto.categoryId) {
      const category = await this.catRepo.findOneBy({ id: dto.categoryId });
      if (!category || category.userId !== userId) throw new ForbiddenException('Category not found');
      rule.categoryId = dto.categoryId;
    }

    if (dto.matchValue !== undefined) {
      const matchValue = dto.matchValue.trim();
      if (!matchValue) throw new BadRequestException('Match text cannot be empty');
      const existing = await this.repo
        .createQueryBuilder('rule')
        .where('rule.userId = :userId', { userId })
        .andWhere('rule.matchType = :matchType', { matchType: rule.matchType })
        .andWhere('LOWER(rule.matchValue) = LOWER(:matchValue)', { matchValue })
        .getOne();
      if (existing && existing.id !== rule.id) {
        throw new ConflictException({ message: 'A rule for this merchant already exists', existingRuleId: existing.id });
      }
      rule.matchValue = matchValue;
    }

    await this.repo.save(rule);
    const appliedCount = await this.applyToUncategorized(userId, rule.matchType, rule.matchValue, rule.categoryId);
    return { rule: await this.repo.findOne({ where: { id: rule.id }, relations: ['category'] }), appliedCount };
  }

  async remove(id: string, userId: string): Promise<void> {
    const rule = await this.repo.findOneBy({ id });
    if (!rule) throw new NotFoundException();
    if (rule.userId !== userId) throw new ForbiddenException();
    await this.repo.remove(rule);
  }

  private async applyToUncategorized(userId: string, matchType: 'merchant' | 'name', matchValue: string, categoryId: string): Promise<number> {
    const column = matchType === 'merchant' ? 'merchantName' : 'name';
    const result = await this.txRepo
      .createQueryBuilder()
      .update(Transaction)
      .set({ categoryId })
      .where('userId = :userId', { userId })
      .andWhere('categoryId IS NULL')
      .andWhere(`LOWER(${column}) = LOWER(:matchValue)`, { matchValue })
      .execute();
    return result.affected ?? 0;
  }
}
