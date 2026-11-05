import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Transaction } from '../transactions/transaction.entity';
import { TransactionsService } from '../transactions/transactions.service';
import { CategoriesService } from '../categories/categories.service';
import { BudgetsService } from '../budgets/budgets.service';
import { NetWorthGoalService } from '../net-worth-goal/net-worth-goal.service';
import { BankAccountsService } from '../bank-accounts/bank-accounts.service';
import { DebtsService } from '../debts/debts.service';
import { TRACKING_TYPES } from '../bank-accounts/account-types';
import { computeSavingsTrend } from './ai-savings-trend.math';
import { computeSafeToSpend } from './ai-safe-to-spend.math';
import type { SavingsTrendWidgetData, SafeToSpendWidgetData } from './ai-message.entity';
import { ProjectsService } from '../projects/projects.service';
import { CreditCardsService } from '../cards/credit-cards.service';
import { summarizeCreditCards, type AiCreditCardsSummary } from './ai-credit-cards.summary';
import { monthKeyOf, type SnapshotInput } from './ai-snapshot';

export interface GetTransactionsArgs {
  startDate?: string;
  endDate?: string;
  categoryId?: string;
  uncategorizedOnly?: boolean;
  merchant?: string;
  accountId?: string;
  /** Also return brokerage buys / sells. Off by default: a trade moves money between the
      cash and the holdings of one investment account, so it is neither income nor spending. */
  includeTrades?: boolean;
  limit?: number;
}

/** Plaid Investments rows carry `plaidCategory = [type, subtype]`; `buy` / `sell` is a trade
    (same rule as the web's lib/transactions/trades.ts). The column is a simple-array, i.e. a
    comma-joined string, so the type is the text before the first comma. */
export const NOT_A_TRADE_SQL = "(tx.plaidCategory IS NULL OR NOT (tx.plaidCategory LIKE 'buy,%' OR tx.plaidCategory LIKE 'sell,%' OR tx.plaidCategory IN ('buy', 'sell')))";

function currentMonthKey(): string {
  return monthKeyOf(new Date());
}

function lastDayOf(month: string): string {
  const [y, m] = month.split('-').map(Number);
  return `${month}-${String(new Date(y, m, 0).getDate()).padStart(2, '0')}`;
}

export interface SpendingSummaryArgs {
  startDate: string;
  endDate: string;
  groupBy: 'category' | 'merchant' | 'month';
}

export interface SpendingGroup { name: string; total: number; count: number }

/** Groups past this many are folded into one "Other (N more)" row. */
const MAX_GROUPS = 25;

const round2 = (n: number) => +n.toFixed(2);

@Injectable()
export class AiReadToolsService {
  constructor(
    @InjectRepository(Transaction) private txRepo: Repository<Transaction>,
    private transactions: TransactionsService,
    private categories: CategoriesService,
    private budgets: BudgetsService,
    private netWorthGoal: NetWorthGoalService,
    private bankAccounts: BankAccountsService,
    private debts: DebtsService,
    private creditCards: CreditCardsService,
    private projects: ProjectsService,
  ) {}

  async getTransactions(userId: string, args: GetTransactionsArgs) {
    const qb = this.txRepo.createQueryBuilder('tx')
      .leftJoinAndSelect('tx.categoryRef', 'categoryRef')
      .leftJoinAndSelect('tx.bankAccount', 'bankAccount')
      .leftJoinAndSelect('tx.projectCategoryRef', 'projectCategoryRef')
      .where('tx.userId = :userId', { userId })
      .andWhere('tx.isSplitParent = false')
      .orderBy('tx.date', 'DESC')
      .limit(Math.min(args.limit ?? 100, 500));

    if (args.startDate) qb.andWhere('tx.date >= :start', { start: args.startDate });
    if (args.endDate) qb.andWhere('tx.date <= :end', { end: args.endDate });
    if (args.categoryId) qb.andWhere('tx.categoryId = :categoryId', { categoryId: args.categoryId });
    // Tracking accounts (investment, mortgage, other assets/liabilities) are net-worth only;
    // their internal movements never need a category, so don't offer them for review.
    // A row linked to a project or a debt is categorized by that link (the app's own
    // convention: such rows carry categoryId = null), so it is not "uncategorized".
    if (args.uncategorizedOnly) qb.andWhere('tx.categoryId IS NULL AND tx.projectId IS NULL AND tx.debtId IS NULL AND (bankAccount.accountType IS NULL OR bankAccount.accountType NOT IN (:...tracking))', { tracking: ['investment', 'mortgage', 'other_asset', 'other_liability'] });
    if (args.accountId) qb.andWhere('tx.bankAccountId = :accountId', { accountId: args.accountId });
    if (!args.includeTrades) qb.andWhere(NOT_A_TRADE_SQL);
    if (args.merchant) qb.andWhere('(tx.merchantName ILIKE :m OR tx.name ILIKE :m)', { m: `%${args.merchant}%` });

    const rows = await qb.getMany();
    return rows.map((t) => ({
      id: t.id, date: t.date, name: t.name, merchantName: t.merchantName ?? null,
      amount: Number(t.amount), categoryId: t.categoryId ?? null, category: t.categoryRef?.name ?? null,
      accountId: t.bankAccountId ?? null, account: t.bankAccount?.accountName ?? null,
      projectId: t.projectId ?? null, projectCategory: t.projectCategoryRef?.name ?? null,
      debtId: t.debtId ?? null,
      ...(t.plaidCategory?.length && ['buy', 'sell'].includes(t.plaidCategory[0]) ? { trade: `${t.plaidCategory[0]}${t.plaidCategory[1] && t.plaidCategory[1] !== t.plaidCategory[0] ? ` (${t.plaidCategory[1]})` : ''}` } : {}),
    }));
  }

  /** Cash-flow rows in a date range: the dashboard's `inCashFlow` rule (no transfer / savings
   *  categories, no debt payments, no tracking accounts) plus no split parents and no trades. */
  private cashFlowRows(userId: string, startDate: string, endDate: string) {
    return this.txRepo.createQueryBuilder('tx')
      .leftJoin('tx.categoryRef', 'cat')
      .leftJoin('tx.bankAccount', 'ba')
      .select(['tx.amount', 'tx.date', 'tx.name', 'tx.merchantName'])
      .addSelect('cat.name', 'categoryName')
      .where('tx.userId = :userId', { userId })
      .andWhere('tx.isSplitParent = false')
      .andWhere('tx.date >= :start AND tx.date <= :end', { start: startDate, end: endDate })
      .andWhere("(cat.type IS NULL OR cat.type NOT IN ('transfer', 'savings'))")
      .andWhere('tx.debtId IS NULL')
      .andWhere('(ba.accountType IS NULL OR ba.accountType NOT IN (:...tracking))', { tracking: [...TRACKING_TYPES] })
      .andWhere(NOT_A_TRADE_SQL)
      .getRawMany<{ tx_amount: string; tx_date: string; tx_name: string; tx_merchantName: string | null; categoryName: string | null }>();
  }

  /** Spending in a period, grouped — one small answer to "where does my money go" instead
   *  of a hundred raw rows. Only money out; income and refunds are left out. */
  async getSpendingSummary(userId: string, args: SpendingSummaryArgs) {
    const rows = await this.cashFlowRows(userId, args.startDate, args.endDate);
    const groups = new Map<string, SpendingGroup>();
    let total = 0;
    for (const r of rows) {
      const amount = Number(r.tx_amount);
      if (!(amount < 0)) continue;
      const name = args.groupBy === 'category' ? (r.categoryName ?? 'Uncategorized')
        : args.groupBy === 'merchant' ? (r.tx_merchantName || r.tx_name)
          : String(r.tx_date).slice(0, 7);
      const g = groups.get(name) ?? { name, total: 0, count: 0 };
      g.total += -amount;
      g.count += 1;
      groups.set(name, g);
      total += -amount;
    }
    let list = [...groups.values()].map((g) => ({ ...g, total: round2(g.total) }));
    list.sort(args.groupBy === 'month' ? (a, b) => a.name.localeCompare(b.name) : (a, b) => b.total - a.total);
    if (list.length > MAX_GROUPS + 1) {
      const rest = list.slice(MAX_GROUPS);
      list = [...list.slice(0, MAX_GROUPS), {
        name: `Other (${rest.length} more)`,
        total: round2(rest.reduce((s, g) => s + g.total, 0)),
        count: rest.reduce((s, g) => s + g.count, 0),
      }];
    }
    return { period: { startDate: args.startDate, endDate: args.endDate }, groupBy: args.groupBy, total: round2(total), groups: list };
  }

  /** Everything the per-turn snapshot (ai-snapshot.ts) words for the model. Each part is
   *  gathered on its own so one failing lookup never blocks the chat. */
  async getSnapshot(userId: string, focusMonth: string | null): Promise<SnapshotInput> {
    const today = new Date();
    const month = focusMonth ?? monthKeyOf(today);
    const settle = async <T,>(p: Promise<T>, fallback: T): Promise<T> => p.catch(() => fallback);

    const [accounts, categories, goal, budgets, rows] = await Promise.all([
      settle(this.bankAccounts.findAllByUser(userId), []),
      settle(this.categories.findAllByUser(userId), []),
      settle(this.netWorthGoal.get(userId).then((g) => ({ current: Number(g.current), target: Number(g.target), projectedDate: g.projectedDate ?? null })), null),
      settle(this.budgets.findWithSpent(userId, month), []),
      settle(this.cashFlowRows(userId, `${month}-01`, lastDayOf(month)), null),
    ]);

    let income = 0;
    let spending = 0;
    for (const r of rows ?? []) {
      const amount = Number(r.tx_amount);
      if (amount > 0) income += amount; else spending -= amount;
    }
    const spendingBudgets = budgets.filter((b) => b.category?.type !== 'income' && !b.projectCategoryId);

    return {
      today,
      focusMonth,
      accounts: accounts.map((a) => ({ name: a.accountName, type: a.accountType, balance: Number(a.balance) })),
      netWorth: goal,
      month: rows ? {
        key: month, income: round2(income), spending: round2(spending),
        budgeted: round2(spendingBudgets.reduce((s, b) => s + Number(b.amount), 0)),
        budgetSpent: round2(spendingBudgets.reduce((s, b) => s + Number(b.spent ?? 0), 0)),
      } : null,
      categories: categories.map((c) => ({ name: c.name, type: c.type })),
    };
  }

  /** Projects (side ventures, flips, businesses) with the categories each one accepts. */
  async getProjects(userId: string) {
    const rows = await this.projects.findAllByUser(userId);
    return rows.map((p) => ({
      id: p.id, name: p.name, type: p.type, icon: p.icon, status: p.status,
      closed: p.status !== 'active',
      expenses: p.expenses, income: p.income, transactionCount: p.txCount,
      categories: p.categories.map((c) => ({ id: c.id, name: c.name, type: c.type, description: c.description ?? null })),
    }));
  }

  async getCategories(userId: string) {
    const rows = await this.categories.findAllByUser(userId);
    return rows.map((c) => ({ id: c.id, name: c.name, type: c.type, wantNeed: c.wantNeed }));
  }

  async getBudgets(userId: string, args: { month?: string }) {
    const rows = await this.budgets.findWithSpent(userId, args.month ?? currentMonthKey());
    return rows.map((b) => ({
      id: b.id, categoryId: b.categoryId, category: b.category?.name ?? null,
      amount: Number(b.amount), spent: b.spent, remaining: b.remaining, percentage: b.percentage,
    }));
  }

  getNetWorthSummary(userId: string) {
    return this.netWorthGoal.get(userId);
  }

  async getAccounts(userId: string) {
    const rows = await this.bankAccounts.findAllByUser(userId);
    return rows.map((a) => ({ id: a.id, name: a.accountName, type: a.accountType, balance: Number(a.balance) }));
  }

  async getCreditCards(userId: string): Promise<AiCreditCardsSummary> {
    const [cards, profile] = await Promise.all([this.creditCards.listForUser(userId), this.creditCards.getProfile(userId)]);
    return summarizeCreditCards(cards, profile);
  }

  async getDebts(userId: string) {
    const rows = await this.debts.findAll(userId);
    return rows.map((d) => ({
      id: d.id, borrowerName: d.borrowerName, direction: d.direction,
      status: d.status, remaining: d.remaining, principal: Number(d.principal),
    }));
  }

  async getSavingsTrend(userId: string): Promise<SavingsTrendWidgetData> {
    const months = 6;
    const now = new Date();
    const keys = Array.from({ length: months }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() - (months - 1 - i), 1);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    });

    const rows = await this.txRepo.createQueryBuilder('tx')
      .leftJoin('tx.categoryRef', 'cat')
      .leftJoin('tx.bankAccount', 'ba')
      .select('SUBSTRING(tx.date::text, 1, 7)', 'month')
      .addSelect('COALESCE(SUM(tx.amount), 0)', 'net')
      .where('tx.userId = :userId', { userId })
      .andWhere("(cat.type IS NULL OR cat.type NOT IN ('transfer', 'savings'))")
      .andWhere('tx.debtId IS NULL')
      .andWhere('(ba."accountType" IS NULL OR ba."accountType" NOT IN (:...tracking))', { tracking: [...TRACKING_TYPES] })
      .andWhere('SUBSTRING(tx.date::text, 1, 7) IN (:...keys)', { keys })
      .groupBy("SUBSTRING(tx.date::text, 1, 7)")
      .getRawMany<{ month: string; net: string }>();

    const byMonth = new Map(rows.map((r) => [r.month, parseFloat(r.net)]));
    const monthlyNets = keys.map((k) => ({ month: k, net: byMonth.get(k) ?? 0 }));
    const { projected, sixMonthAvg } = computeSavingsTrend(monthlyNets, now);

    const [transactionCount, accounts] = await Promise.all([
      this.txRepo.count({ where: { userId } }),
      this.bankAccounts.findAllByUser(userId),
    ]);

    return { months: monthlyNets, projected, sixMonthAvg, transactionCount, accountCount: accounts.length };
  }

  async getSafeToSpend(userId: string, args: { month?: string } = {}): Promise<SafeToSpendWidgetData> {
    const month = args.month ?? currentMonthKey();
    const now = new Date();
    const [y, m] = month.split('-').map(Number);
    const startDate = `${month}-01`;
    const endDate = new Date(y, m, 0).toISOString().slice(0, 10);

    const incomeRow = await this.txRepo.createQueryBuilder('tx')
      .leftJoin('tx.categoryRef', 'cat')
      .select('COALESCE(SUM(tx.amount), 0)', 'total')
      .where('tx.userId = :userId', { userId })
      .andWhere("cat.type = 'income'")
      .andWhere('tx.date >= :start AND tx.date <= :end', { start: startDate, end: endDate })
      .getRawOne<{ total: string }>();
    const incomeSoFar = parseFloat(incomeRow?.total ?? '0');

    const budgetRows = await this.budgets.findWithSpent(userId, month);
    const plannedSpending = budgetRows
      .filter((b) => b.category?.type !== 'income' && !b.projectCategoryId)
      .reduce((s, b) => s + Number(b.amount), 0);

    const result = computeSafeToSpend({ incomeSoFar, plannedSpending, now });
    return { month, ...result };
  }
}
