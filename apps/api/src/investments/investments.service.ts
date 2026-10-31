import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, Repository } from 'typeorm';
import { Transaction } from '../transactions/transaction.entity';
import { BankAccount } from '../bank-accounts/bank-account.entity';
import { Project } from '../projects/project.entity';
import { ProjectAccount, type TradingAccountMeta } from '../projects/project-account.entity';
import { ActivityRow, computePerformance, mergePerformance, PerformanceSummary } from './performance';
import { brokerCashByMonth, cashSummary, tradingOverview, type CashRow, type CashSummary, type MonthFlow, type TradingOverview } from './trading-cash';

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
export interface AccountMeta extends TradingAccountMeta { provider: string }
export type AccountPerformance = PerformanceSummary & {
  account: AccountRef;
  meta: AccountMeta;
  /** Attributed project transactions, prop-firm accounts only; null for brokers. */
  cash: CashSummary | null;
  /** Deposits / withdrawals by month from the account's own rows (brokers). */
  cashByMonth: MonthFlow[];
};
export interface ProjectPerformance {
  project: { id: string; name: string };
  /** One summary per linked account, in link order. */
  accounts: AccountPerformance[];
  /** All linked accounts added together (lots never cross accounts). */
  combined: PerformanceSummary;
  overview: TradingOverview;
  /** Project transactions with no account attributed. */
  unassigned: number;
}

const ref = (a: BankAccount): AccountRef => ({ id: a.id, bankName: a.bankName, accountName: a.accountName, accountType: a.accountType });
const DEFAULT_META: TradingAccountMeta = { kind: 'broker', status: 'active', firm: null, accountSize: null, startedAt: null, endedAt: null, notes: null };

function metaOf(link: ProjectAccount | null, account: BankAccount): AccountMeta {
  const m = link ?? DEFAULT_META;
  return {
    kind: m.kind, status: m.status, firm: m.firm ?? null,
    accountSize: m.accountSize == null ? null : Number(m.accountSize),
    startedAt: m.startedAt ?? null, endedAt: m.endedAt ?? null, notes: m.notes ?? null,
    provider: account.provider,
  };
}

@Injectable()
export class InvestmentsService {
  constructor(
    @InjectRepository(Transaction) private txRepo: Repository<Transaction>,
    @InjectRepository(BankAccount) private accountRepo: Repository<BankAccount>,
    @InjectRepository(Project) private projectRepo: Repository<Project>,
    @InjectRepository(ProjectAccount) private linkRepo: Repository<ProjectAccount>,
  ) {}

  private today(): string { return new Date().toISOString().slice(0, 10); }

  private async summarize(userId: string, account: BankAccount, link: ProjectAccount | null): Promise<AccountPerformance> {
    const rows = await this.txRepo.find({
      where: { userId, bankAccountId: account.id, isSplitParent: false },
      order: { date: 'ASC', createdAt: 'ASC' },
    });
    const activity = rows.map(toActivityRow);
    const meta = metaOf(link, account);
    const today = this.today();
    let cash: CashSummary | null = null;
    if (link && meta.kind === 'prop_firm') {
      const attributed = await this.txRepo.find({
        where: { userId, projectId: link.projectId, tradingAccountId: account.id, isSplitParent: false },
        relations: ['projectCategoryRef'],
        order: { date: 'ASC' },
      });
      const cashRows: CashRow[] = attributed.map((t) => ({
        id: t.id, date: t.date, name: t.name, amount: Number(t.amount),
        category: t.projectCategoryRef ? { id: t.projectCategoryRef.id, name: t.projectCategoryRef.name, icon: t.projectCategoryRef.icon, color: t.projectCategoryRef.color } : null,
      }));
      cash = cashSummary(cashRows, meta, today);
    }
    return { ...computePerformance(activity), account: ref(account), meta, cash, cashByMonth: brokerCashByMonth(activity, today) };
  }

  /** Performance of one of the caller's accounts over its whole history. */
  async performance(userId: string, accountId: string): Promise<AccountPerformance> {
    const account = await this.accountRepo.findOne({ where: { id: accountId, userId } });
    if (!account) throw new NotFoundException('Account not found');
    const link = await this.linkRepo.findOneBy({ bankAccountId: account.id, userId });
    return this.summarize(userId, account, link);
  }

  /** Every account a trading project follows, each on its own, plus the combined result and the project overview. */
  async performanceForProject(userId: string, projectId: string): Promise<ProjectPerformance> {
    const project = await this.projectRepo.findOne({ where: { id: projectId, userId } });
    if (!project) throw new NotFoundException('Project not found');
    const links = await this.linkRepo.find({ where: { projectId: project.id, userId }, order: { createdAt: 'ASC' } });
    const accounts = links.length
      ? await this.accountRepo.find({ where: { id: In(links.map((l) => l.bankAccountId)), userId } })
      : [];
    const ordered = links
      .map((l) => ({ link: l, account: accounts.find((a) => a.id === l.bankAccountId) }))
      .filter((x): x is { link: ProjectAccount; account: BankAccount } => !!x.account);
    const parts: AccountPerformance[] = [];
    for (const { link, account } of ordered) parts.push(await this.summarize(userId, account, link));
    const label = (a: AccountRef) => ordered.filter((o) => o.account.bankName === a.bankName).length > 1 ? `${a.bankName} · ${a.accountName}` : a.bankName;
    const unassigned = await this.txRepo.count({ where: { userId, projectId: project.id, tradingAccountId: IsNull(), isSplitParent: false } });
    return {
      project: { id: project.id, name: project.name },
      accounts: parts,
      combined: mergePerformance(parts.map((p) => ({ label: label(p.account), summary: p }))),
      overview: tradingOverview(parts.map((p) => ({ meta: p.meta, summary: p, cashByMonth: p.cashByMonth, cash: p.cash })), this.today()),
      unassigned,
    };
  }
}
