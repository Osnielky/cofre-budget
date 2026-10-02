import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../users/user.entity';
import { Transaction } from '../transactions/transaction.entity';
import { BankAccountsService } from '../bank-accounts/bank-accounts.service';
import { isLiabilityType } from '../bank-accounts/account-types';
import { DebtsService } from '../debts/debts.service';
import { NET_WORTH_TARGET, computeGoalProgress, toDateOnly } from './net-worth-goal.math';
import { NetWorthSnapshot } from './net-worth-snapshot.entity';
import { buildHistory, isCashFlowTx } from './net-worth-history.math';

const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/;

/** True when `value` is a real calendar date in YYYY-MM-DD form (rejects e.g. "2026-13-45"). */
function isValidDateOnly(value: string): boolean {
  if (!DATE_ONLY_RE.test(value)) return false;
  const [y, m, d] = value.split('-').map(Number);
  const parsed = new Date(y, m - 1, d);
  return parsed.getFullYear() === y && parsed.getMonth() === m - 1 && parsed.getDate() === d;
}

@Injectable()
export class NetWorthGoalService {
  private readonly logger = new Logger(NetWorthGoalService.name);

  constructor(
    @InjectRepository(User) private users: Repository<User>,
    @InjectRepository(NetWorthSnapshot) private snapshots: Repository<NetWorthSnapshot>,
    @InjectRepository(Transaction) private transactions: Repository<Transaction>,
    private bankAccounts: BankAccountsService,
    private debts: DebtsService,
  ) {}

  private async currentNetWorth(userId: string): Promise<number> {
    const [accounts, debts] = await Promise.all([
      this.bankAccounts.findAllByUser(userId),
      this.debts.findAll(userId),
    ]);
    const assetAccts = accounts.filter((a) => !isLiabilityType(a.accountType));
    const liabAccts = accounts.filter((a) => isLiabilityType(a.accountType));
    const openDebts = debts.filter((d) => d.status === 'open');
    const receivables = openDebts.filter((d) => d.direction === 'lent').reduce((s, d) => s + Number(d.remaining), 0);
    const payables = openDebts.filter((d) => d.direction === 'owed').reduce((s, d) => s + Number(d.remaining), 0);
    const assets = assetAccts.reduce((s, a) => s + Number(a.balance), 0) + receivables;
    const liabilities = liabAccts.reduce((s, a) => s + Math.abs(Number(a.balance)), 0) + payables;
    return +(assets - liabilities).toFixed(2);
  }

  /** Upserts today's snapshot. Never throws: the goal must load even if this write fails. */
  private async recordSnapshot(userId: string, value: number): Promise<void> {
    try {
      await this.snapshots.upsert(
        { userId, date: toDateOnly(new Date()), value: value.toFixed(2) },
        ['userId', 'date'],
      );
    } catch (err) {
      this.logger.warn(`Could not record net worth snapshot: ${(err as Error).message}`);
    }
  }

  async history(userId: string) {
    const current = await this.currentNetWorth(userId);
    await this.recordSnapshot(userId, current);
    const [snaps, txs] = await Promise.all([
      this.snapshots.find({ where: { userId }, order: { date: 'ASC' } }),
      this.transactions.find({
        where: { userId },
        relations: { categoryRef: true, bankAccount: true },
        select: {
          id: true, date: true, amount: true, debtId: true,
          categoryRef: { id: true, type: true },
          bankAccount: { id: true, accountType: true },
        },
      }),
    ]);
    return buildHistory({
      snapshots: snaps.map((s) => ({ date: s.date, value: Number(s.value) })),
      today: toDateOnly(new Date()),
      todayValue: current,
      txs: txs
        .filter((t) => isCashFlowTx({
          date: t.date, amount: t.amount, debtId: t.debtId,
          categoryType: t.categoryRef?.type ?? null, accountType: t.bankAccount?.accountType ?? null,
        }))
        .map((t) => ({ date: t.date, amount: Number(t.amount) })),
    });
  }

  async get(userId: string) {
    const user = await this.users.findOneByOrFail({ id: userId });
    const current = await this.currentNetWorth(userId);
    await this.recordSnapshot(userId, current);
    const baselineValue = user.netWorthGoalBaselineValue != null ? Number(user.netWorthGoalBaselineValue) : null;
    const progress = computeGoalProgress({
      current,
      targetDate: user.netWorthGoalTargetDate,
      baselineValue,
      baselineDate: user.netWorthGoalBaselineDate,
      now: new Date(),
    });
    return {
      target: NET_WORTH_TARGET,
      current,
      targetDate: user.netWorthGoalTargetDate,
      baselineValue,
      baselineDate: user.netWorthGoalBaselineDate,
      onTrackPct: progress.onTrackPct,
      projectedDate: progress.projectedDate,
    };
  }

  async setTargetDate(userId: string, targetDate: string | null | undefined) {
    if (targetDate === undefined) {
      throw new BadRequestException('targetDate is required.');
    }
    if (targetDate !== null && !isValidDateOnly(targetDate)) {
      throw new BadRequestException('targetDate must be a valid date in YYYY-MM-DD format.');
    }

    const user = await this.users.findOneByOrFail({ id: userId });
    if (targetDate === null) {
      user.netWorthGoalTargetDate = null;
      user.netWorthGoalBaselineValue = null;
      user.netWorthGoalBaselineDate = null;
    } else {
      if (user.netWorthGoalTargetDate == null) {
        const current = await this.currentNetWorth(userId);
        user.netWorthGoalBaselineValue = current.toFixed(2);
        user.netWorthGoalBaselineDate = toDateOnly(new Date());
      }
      user.netWorthGoalTargetDate = targetDate;
    }
    await this.users.save(user);
    return this.get(userId);
  }
}
