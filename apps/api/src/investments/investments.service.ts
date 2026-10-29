import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Transaction } from '../transactions/transaction.entity';
import { BankAccount } from '../bank-accounts/bank-account.entity';
import { Project } from '../projects/project.entity';
import { ProjectAccount } from '../projects/project-account.entity';
import { ActivityRow, computePerformance, mergePerformance, PerformanceSummary } from './performance';

/** One transaction row as the engine reads it. */
export function toActivityRow(t: Transaction): ActivityRow {
  return {
    date: t.date,
    amount: Number(t.amount),
    type: t.plaidCategory?.[0] ?? null,
    subtype: t.plaidCategory?.[1] ?? null,
    symbol: t.symbol ?? null,
    securityName: t.securityName ?? null,
    quantity: t.quantity == null ? null : Number(t.quantity),
    price: t.price == null ? null : Number(t.price),
    fees: t.fees == null ? null : Number(t.fees),
    name: t.name,
  };
}

export interface AccountRef { id: string; bankName: string; accountName: string; accountType: string }
export type AccountPerformance = PerformanceSummary & { account: AccountRef };
export interface ProjectPerformance {
  project: { id: string; name: string };
  /** One summary per linked account, in link order. */
  accounts: AccountPerformance[];
  /** All linked accounts added together (lots never cross accounts). */
  combined: PerformanceSummary;
}

const ref = (a: BankAccount): AccountRef => ({ id: a.id, bankName: a.bankName, accountName: a.accountName, accountType: a.accountType });

@Injectable()
export class InvestmentsService {
  constructor(
    @InjectRepository(Transaction) private txRepo: Repository<Transaction>,
    @InjectRepository(BankAccount) private accountRepo: Repository<BankAccount>,
    @InjectRepository(Project) private projectRepo: Repository<Project>,
    @InjectRepository(ProjectAccount) private linkRepo: Repository<ProjectAccount>,
  ) {}

  private async summarize(userId: string, account: BankAccount): Promise<AccountPerformance> {
    const rows = await this.txRepo.find({
      where: { userId, bankAccountId: account.id, isSplitParent: false },
      order: { date: 'ASC', createdAt: 'ASC' },
    });
    return { ...computePerformance(rows.map(toActivityRow)), account: ref(account) };
  }

  /** Performance of one of the caller's accounts over its whole history. */
  async performance(userId: string, accountId: string): Promise<AccountPerformance> {
    const account = await this.accountRepo.findOne({ where: { id: accountId, userId } });
    if (!account) throw new NotFoundException('Account not found');
    return this.summarize(userId, account);
  }

  /** Every account a trading project follows, each on its own, plus the combined result. */
  async performanceForProject(userId: string, projectId: string): Promise<ProjectPerformance> {
    const project = await this.projectRepo.findOne({ where: { id: projectId, userId } });
    if (!project) throw new NotFoundException('Project not found');
    const links = await this.linkRepo.find({ where: { projectId: project.id, userId }, order: { createdAt: 'ASC' } });
    const accounts = links.length
      ? await this.accountRepo.find({ where: { id: In(links.map((l) => l.bankAccountId)), userId } })
      : [];
    const ordered = links.map((l) => accounts.find((a) => a.id === l.bankAccountId)).filter((a): a is BankAccount => !!a);
    const parts: AccountPerformance[] = [];
    for (const account of ordered) parts.push(await this.summarize(userId, account));
    const label = (a: AccountRef) => ordered.filter((o) => o.bankName === a.bankName).length > 1 ? `${a.bankName} · ${a.accountName}` : a.bankName;
    return {
      project: { id: project.id, name: project.name },
      accounts: parts,
      combined: mergePerformance(parts.map((p) => ({ label: label(p.account), summary: p }))),
    };
  }
}
