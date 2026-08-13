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

  /* Picks the rule a new, uncategorized transaction should be categorized by, or
     null. Precedence: merchant-type before name-type; within each type, an exact
     match before a prefix match (exact is the more specific claim). */
  matchRule(rules: CategorizationRule[], candidate: { merchantName?: string | null; name: string }): CategorizationRule | null {
    const norm = (s: string) => s.trim().toLowerCase();
    const isMatch = (r: CategorizationRule, value: string) => {
      const v = norm(value);
      const rv = norm(r.matchValue);
      return r.matchStrategy === 'prefix' ? v.startsWith(rv) : v === rv;
    };
    const bestOfType = (matchType: 'merchant' | 'name', value: string): CategorizationRule | null => {
      const candidates = rules.filter((r) => r.matchType === matchType && isMatch(r, value));
      return candidates.find((r) => r.matchStrategy === 'exact') ?? candidates[0] ?? null;
    };
    if (candidate.merchantName) {
      const m = bestOfType('merchant', candidate.merchantName);
      if (m) return m;
    }
    return bestOfType('name', candidate.name);
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
      .andWhere('rule.matchStrategy = :matchStrategy', { matchStrategy: 'exact' })
      .andWhere('LOWER(rule.matchValue) = LOWER(:matchValue)', { matchValue })
      .getOne();
    if (existing) {
      throw new ConflictException({ message: 'A rule for this merchant already exists', existingRuleId: existing.id });
    }

    let rule: CategorizationRule;
    try {
      rule = await this.repo.save(this.repo.create({ userId, matchType, matchValue, categoryId }));
    } catch (err) {
      throw await this.toConflictOrRethrow(err, userId, matchType, matchValue, 'exact');
    }
    const appliedCount = await this.applyToUncategorized(userId, matchType, matchValue, 'exact', categoryId, rule.id);
    return { rule: await this.repo.findOne({ where: { id: rule.id }, relations: ['category'] }), appliedCount };
  }

  async update(id: string, userId: string, dto: { matchValue?: string; categoryId?: string; matchStrategy?: 'exact' | 'prefix' }): Promise<RuleWithApplyCount> {
    const rule = await this.repo.findOneBy({ id });
    if (!rule) throw new NotFoundException();
    if (rule.userId !== userId) throw new ForbiddenException();

    if (dto.categoryId) {
      const category = await this.catRepo.findOneBy({ id: dto.categoryId });
      if (!category || category.userId !== userId) throw new ForbiddenException('Category not found');
      rule.categoryId = dto.categoryId;
    }

    const nextMatchValue = dto.matchValue !== undefined ? dto.matchValue.trim() : rule.matchValue;
    const nextMatchStrategy = dto.matchStrategy ?? rule.matchStrategy;

    if (dto.matchValue !== undefined && !nextMatchValue) {
      throw new BadRequestException('Match text cannot be empty');
    }

    if (dto.matchStrategy !== undefined && dto.matchStrategy !== 'exact' && dto.matchStrategy !== 'prefix') {
      throw new BadRequestException('matchStrategy must be "exact" or "prefix"');
    }

    if (dto.matchValue !== undefined || dto.matchStrategy !== undefined) {
      const existing = await this.repo
        .createQueryBuilder('rule')
        .where('rule.userId = :userId', { userId })
        .andWhere('rule.matchType = :matchType', { matchType: rule.matchType })
        .andWhere('rule.matchStrategy = :matchStrategy', { matchStrategy: nextMatchStrategy })
        .andWhere('LOWER(rule.matchValue) = LOWER(:matchValue)', { matchValue: nextMatchValue })
        .getOne();
      if (existing && existing.id !== rule.id) {
        throw new ConflictException({ message: 'A rule for this merchant already exists', existingRuleId: existing.id });
      }
      rule.matchValue = nextMatchValue;
      rule.matchStrategy = nextMatchStrategy;
    }

    try {
      await this.repo.save(rule);
    } catch (err) {
      throw await this.toConflictOrRethrow(err, userId, rule.matchType, rule.matchValue, rule.matchStrategy, rule.id);
    }
    const appliedCount = await this.applyToUncategorized(userId, rule.matchType, rule.matchValue, rule.matchStrategy, rule.categoryId, rule.id);
    return { rule: await this.repo.findOne({ where: { id: rule.id }, relations: ['category'] }), appliedCount };
  }

  async remove(id: string, userId: string): Promise<void> {
    const rule = await this.repo.findOneBy({ id });
    if (!rule) throw new NotFoundException();
    if (rule.userId !== userId) throw new ForbiddenException();
    await this.repo.remove(rule);
  }

  /* A concurrent duplicate create/update can race past the case-insensitive
     pre-check above (two case-variant merchant strings both pass it) and both
     hit the DB's case-sensitive unique constraint. Map that driver error
     ('23505') to the same 409 shape the pre-check throws; anything else rethrows. */
  private async toConflictOrRethrow(
    err: unknown,
    userId: string,
    matchType: 'merchant' | 'name',
    matchValue: string,
    matchStrategy: 'exact' | 'prefix',
    excludeId?: string,
  ): Promise<Error> {
    const code = (err as { code?: string })?.code;
    if (code !== '23505') return err as Error;

    let qb = this.repo
      .createQueryBuilder('rule')
      .where('rule.userId = :userId', { userId })
      .andWhere('rule.matchType = :matchType', { matchType })
      .andWhere('rule.matchStrategy = :matchStrategy', { matchStrategy })
      .andWhere('LOWER(rule.matchValue) = LOWER(:matchValue)', { matchValue });
    if (excludeId) qb = qb.andWhere('rule.id != :excludeId', { excludeId });
    const existing = await qb.getOne();

    if (existing) {
      return new ConflictException({ message: 'A rule for this merchant already exists', existingRuleId: existing.id });
    }
    // Unique violation but no matching row found (shouldn't normally happen) — surface the original error.
    return err as Error;
  }

  private async applyToUncategorized(userId: string, matchType: 'merchant' | 'name', matchValue: string, matchStrategy: 'exact' | 'prefix', categoryId: string, ruleId: string): Promise<number> {
    const column = matchType === 'merchant' ? 'merchantName' : 'name';
    const qb = this.txRepo
      .createQueryBuilder()
      .update(Transaction)
      .set({ categoryId, categorizedByRuleId: ruleId })
      .where('userId = :userId', { userId })
      .andWhere('categoryId IS NULL');
    if (matchStrategy === 'prefix') {
      // POSITION(...) = 1 avoids LIKE's %/_ wildcard-escaping concerns entirely — a
      // plain "does this substring start at position 1" check.
      qb.andWhere(`POSITION(LOWER(:matchValue) IN LOWER(TRIM("${column}"))) = 1`, { matchValue });
    } else {
      qb.andWhere(`LOWER(TRIM("${column}")) = LOWER(:matchValue)`, { matchValue });
    }
    const result = await qb.execute();
    return result.affected ?? 0;
  }
}
