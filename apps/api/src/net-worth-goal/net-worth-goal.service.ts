import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../users/user.entity';
import { BankAccountsService } from '../bank-accounts/bank-accounts.service';
import { isLiabilityType } from '../bank-accounts/account-types';
import { DebtsService } from '../debts/debts.service';
import { NET_WORTH_TARGET, computeGoalProgress } from './net-worth-goal.math';

@Injectable()
export class NetWorthGoalService {
  constructor(
    @InjectRepository(User) private users: Repository<User>,
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
    const receivables = debts.filter((d) => d.status === 'open').reduce((s, d) => s + Number(d.remaining), 0);
    const assets = assetAccts.reduce((s, a) => s + Number(a.balance), 0) + receivables;
    const liabilities = liabAccts.reduce((s, a) => s + Math.abs(Number(a.balance)), 0);
    return +(assets - liabilities).toFixed(2);
  }

  async get(userId: string) {
    const user = await this.users.findOneByOrFail({ id: userId });
    const current = await this.currentNetWorth(userId);
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

  async setTargetDate(userId: string, targetDate: string | null) {
    const user = await this.users.findOneByOrFail({ id: userId });
    if (targetDate === null) {
      user.netWorthGoalTargetDate = null;
      user.netWorthGoalBaselineValue = null;
      user.netWorthGoalBaselineDate = null;
    } else {
      if (user.netWorthGoalTargetDate == null) {
        const current = await this.currentNetWorth(userId);
        user.netWorthGoalBaselineValue = current.toFixed(2);
        user.netWorthGoalBaselineDate = new Date().toISOString().slice(0, 10);
      }
      user.netWorthGoalTargetDate = targetDate;
    }
    await this.users.save(user);
    return this.get(userId);
  }
}
