import { Injectable, ForbiddenException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
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
    // entry they just described.
    if (dto.recordFirstNow) {
      await this.writeOccurrence(saved, occurrenceAt(saved, 0));
      await this.repo.save(saved);
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
    } else {
      // Keep the rows, just detach them so they survive the rule.
      await this.txRepo.update({ recurringRuleId: id, userId }, { recurringRuleId: null });
    }
    await this.repo.delete({ id, userId });
  }

  async stop(id: string, userId: string): Promise<RecurringRule> {
    const rule = await this.repo.findOneBy({ id });
    if (!rule) throw new NotFoundException();
    if (rule.userId !== userId) throw new ForbiddenException();
    rule.active = false;
    return this.repo.save(rule);
  }

  /**
   * Write any occurrence whose date has arrived and that has not been written yet.
   *
   * Called on every transactions fetch. Idempotent: `lastRunDate` and `runCount`
   * advance only for occurrences actually written, so a second call in the same
   * second is a no-op.
   */
  async materialiseDue(userId: string): Promise<number> {
    const rules = await this.repo.find({ where: { userId, active: true } });
    const today = iso(new Date());
    let written = 0;

    for (const rule of rules) {
      const dates = occurrenceDates(rule);
      let changed = false;

      for (const date of dates) {
        if (date > today) break;                        // not due yet
        if (rule.lastRunDate && date <= rule.lastRunDate) continue; // already written
        await this.writeOccurrence(rule, date);
        written++;
        changed = true;
      }

      // Finished: the last occurrence is written, or the end date has passed.
      const last = dates[dates.length - 1];
      if (last && rule.lastRunDate === last) { rule.active = false; changed = true; }
      if (rule.endDate && today > rule.endDate) { rule.active = false; changed = true; }
      if (changed) await this.repo.save(rule);
    }
    return written;
  }

  /** Insert one transaction for `date` and advance the rule's bookkeeping. */
  private async writeOccurrence(rule: RecurringRule, date: string): Promise<void> {
    if (rule.occurrenceCount != null && rule.runCount >= rule.occurrenceCount) return;

    const tx = this.txRepo.create({
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
    await this.txRepo.save(tx);

    rule.lastRunDate = date;
    rule.runCount += 1;
  }
}
