import { Injectable, ForbiddenException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { RecurringRule, RecurringUnit } from './recurring-rule.entity';
import { Transaction } from './transaction.entity';

export interface CreateRuleDto {
  amount: number;
  name: string;
  categoryId?: string | null;
  bankAccountId?: string | null;
  note?: string | null;
  interval: number;
  unit: RecurringUnit;
  dayOfMonth?: number | null;
  startDate: string;
  endDate?: string | null;
  occurrenceCount?: number | null;
  /** Write the first occurrence immediately, even if it is in the future. */
  recordFirstNow?: boolean;
}

/** YYYY-MM-DD in UTC, avoiding the local-timezone shifts that bite date-only values. */
function iso(d: Date): string {
  return d.toISOString().slice(0, 10);
}
function parse(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}
function daysInMonth(year: number, monthIdx: number): number {
  return new Date(Date.UTC(year, monthIdx + 1, 0)).getUTCDate();
}

/**
 * The occurrence `n` steps after the start.
 *
 * Month and year steps land on `dayOfMonth`, clamped to the length of the target
 * month — a rule set for the 31st falls on the 30th in November rather than
 * skidding into December, and every later occurrence still uses 31 rather than
 * inheriting the clamp.
 */
export function occurrenceAt(rule: Pick<RecurringRule, 'startDate' | 'interval' | 'unit' | 'dayOfMonth'>, n: number): string {
  const start = parse(rule.startDate);
  const step = Math.max(1, rule.interval) * n;

  if (rule.unit === 'day') return iso(new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate() + step)));
  if (rule.unit === 'week') return iso(new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate() + step * 7)));

  const monthsPerStep = rule.unit === 'year' ? 12 : 1;
  const target = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + step * monthsPerStep, 1));
  const y = target.getUTCFullYear();
  const m = target.getUTCMonth();
  const wanted = rule.dayOfMonth ?? start.getUTCDate();
  return iso(new Date(Date.UTC(y, m, Math.min(wanted, daysInMonth(y, m)))));
}

/** Every occurrence date for a rule, capped so an endless rule still terminates. */
export function occurrenceDates(
  rule: Pick<RecurringRule, 'startDate' | 'interval' | 'unit' | 'dayOfMonth' | 'endDate' | 'occurrenceCount'>,
  limit = 240,
): string[] {
  const out: string[] = [];
  for (let n = 0; n < limit; n++) {
    if (rule.occurrenceCount != null && out.length >= rule.occurrenceCount) break;
    const date = occurrenceAt(rule, n);
    if (rule.endDate && date > rule.endDate) break;
    out.push(date);
  }
  return out;
}

@Injectable()
export class RecurringService {
  constructor(
    @InjectRepository(RecurringRule) private repo: Repository<RecurringRule>,
    @InjectRepository(Transaction) private txRepo: Repository<Transaction>,
    private dataSource: DataSource,
  ) {}

  list(userId: string): Promise<RecurringRule[]> {
    return this.repo.find({ where: { userId }, order: { createdAt: 'DESC' } });
  }

  async create(userId: string, dto: CreateRuleDto): Promise<RecurringRule> {
    const rule = this.repo.create({
      userId,
      amount: dto.amount,
      name: dto.name,
      categoryId: dto.categoryId ?? null,
      bankAccountId: dto.bankAccountId ?? null,
      note: dto.note ?? null,
      interval: Math.min(Math.max(Math.round(dto.interval || 1), 1), 99),
      unit: dto.unit,
      dayOfMonth: dto.dayOfMonth ?? null,
      startDate: dto.startDate,
      endDate: dto.endDate ?? null,
      occurrenceCount: dto.occurrenceCount ?? null,
      lastRunDate: null,
      runCount: 0,
      active: true,
    });
    const saved = await this.repo.save(rule);

    // The mockup's "Record the first occurrence as paid": write occurrence 0 up
    // front even when it is dated in the future, so the user sees the ledger
    // entry they just described. Goes through the locked path so it cannot race
    // a concurrent transactions fetch into writing occurrence 0 twice.
    if (dto.recordFirstNow) {
      await this.materialiseRule(saved.id, occurrenceAt(saved, 0));
    }

    await this.materialiseDue(userId);
    return (await this.repo.findOneBy({ id: saved.id }))!;
  }

  async remove(id: string, userId: string, deleteFuture = false): Promise<void> {
    const rule = await this.repo.findOneBy({ id });
    if (!rule) throw new NotFoundException();
    if (rule.userId !== userId) throw new ForbiddenException();

    if (deleteFuture) {
      // Only occurrences still to come — anything already dated today or earlier
      // is real spending the user has seen, so it stays.
      await this.txRepo
        .createQueryBuilder()
        .delete()
        .from(Transaction)
        .where('"recurringRuleId" = :id', { id })
        .andWhere('userId = :userId', { userId })
        .andWhere('date > :today', { today: iso(new Date()) })
        .execute();
    }
    // Whatever survives must stop pointing at a rule that is about to vanish —
    // recurringRuleId has no FK, so a stale id would linger silently.
    await this.txRepo.update({ recurringRuleId: id, userId }, { recurringRuleId: null });
    await this.repo.delete({ id, userId });
  }

  async stop(id: string, userId: string): Promise<RecurringRule> {
    const rule = await this.own(id, userId);
    rule.active = false;
    return this.repo.save(rule);
  }

  /** Un-pause. Any occurrences that fell due while paused are written on resume. */
  async resume(id: string, userId: string): Promise<RecurringRule> {
    const rule = await this.own(id, userId);
    rule.active = true;
    const saved = await this.repo.save(rule);
    await this.materialiseDue(userId);
    return (await this.repo.findOneBy({ id: saved.id }))!;
  }

  /** The transactions this rule has already written, newest first. */
  async history(id: string, userId: string): Promise<Transaction[]> {
    await this.own(id, userId);
    return this.txRepo.find({
      where: { recurringRuleId: id, userId },
      relations: ['bankAccount', 'categoryRef'],
      order: { date: 'DESC' },
      take: 24,
    });
  }

  private async own(id: string, userId: string): Promise<RecurringRule> {
    const rule = await this.repo.findOneBy({ id });
    if (!rule) throw new NotFoundException();
    if (rule.userId !== userId) throw new ForbiddenException();
    return rule;
  }

  /**
   * Write any occurrence whose date has arrived and that has not been written yet.
   *
   * Called on every transactions fetch. Idempotent: `lastRunDate` and `runCount`
   * advance only for occurrences actually written, so a second call in the same
   * second is a no-op.
   */
  async materialiseDue(userId: string): Promise<number> {
    // Ids only: each rule is re-read under its own lock a moment from now, so
    // anything loaded here would be stale by the time we acted on it.
    const candidates = await this.repo
      .createQueryBuilder('rule')
      .select('rule.id', 'id')
      .where('rule.userId = :userId', { userId })
      .andWhere('rule.active = true')
      .getRawMany<{ id: string }>();

    let written = 0;
    for (const { id } of candidates) written += await this.materialiseRule(id);
    return written;
  }

  /**
   * Materialise one rule's due occurrences, holding a row lock for the duration.
   *
   * The lock is what makes concurrent callers safe. Reading `lastRunDate`,
   * inserting the occurrences and writing `lastRunDate` back is a
   * read-modify-write, and the transactions page fires two overlapping
   * `GET /api/transactions` calls (current period + prior period for its
   * comparisons). Without the lock both requests read the same `lastRunDate`,
   * neither sees the other's inserts, and the user ends up with two identical
   * rows for the same occurrence. `SELECT … FOR UPDATE` serialises them: the
   * second caller waits, re-reads the committed `lastRunDate`, and finds
   * nothing left to write.
   *
   * `force` writes that one date even if it is in the future — the "record the
   * first occurrence now" box on the new-recurring form.
   */
  private async materialiseRule(ruleId: string, force?: string): Promise<number> {
    return this.dataSource.transaction(async (manager) => {
      // Query builder rather than findOne: FOR UPDATE cannot be applied to the
      // nullable side of the outer joins that this entity's eager relations
      // would add.
      const rule = await manager
        .createQueryBuilder(RecurringRule, 'rule')
        .setLock('pessimistic_write')
        .where('rule.id = :id', { id: ruleId })
        .getOne();
      if (!rule) return 0;

      const today = iso(new Date());
      const dates = occurrenceDates(rule);
      let written = 0;
      let changed = false;

      if (force && !(rule.lastRunDate && force <= rule.lastRunDate)) {
        await this.writeOccurrence(manager, rule, force);
        written++;
        changed = true;
      }

      if (rule.active) {
        for (const date of dates) {
          if (date > today) break;                        // not due yet
          if (rule.lastRunDate && date <= rule.lastRunDate) continue; // already written
          await this.writeOccurrence(manager, rule, date);
          written++;
          changed = true;
        }

        // Finished: the last occurrence is written, or the end date has passed.
        const last = dates[dates.length - 1];
        if (last && rule.lastRunDate === last) { rule.active = false; changed = true; }
        if (rule.endDate && today > rule.endDate) { rule.active = false; changed = true; }
      }

      // An explicit column update, not save(): `rule` came from a query builder
      // so its eager relations are undefined, and only bookkeeping changed.
      if (changed) {
        await manager.update(RecurringRule, rule.id, {
          lastRunDate: rule.lastRunDate,
          runCount: rule.runCount,
          active: rule.active,
        });
      }
      return written;
    });
  }

  /** Insert one transaction for `date` and advance the rule's bookkeeping. */
  private async writeOccurrence(manager: EntityManager, rule: RecurringRule, date: string): Promise<void> {
    if (rule.occurrenceCount != null && rule.runCount >= rule.occurrenceCount) return;

    const txRepo = manager.getRepository(Transaction);
    const tx = txRepo.create({
      userId: rule.userId,
      bankAccountId: rule.bankAccountId ?? undefined,
      source: 'recurring',
      name: rule.name,
      amount: rule.amount,
      date,
      categoryId: rule.categoryId ?? undefined,
      note: rule.note ?? undefined,
      pending: false,
      isSplitParent: false,
      recurringRuleId: rule.id,
    });
    await txRepo.save(tx);

    rule.lastRunDate = date;
    rule.runCount += 1;
  }
}
