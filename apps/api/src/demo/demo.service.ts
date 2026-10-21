import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager, LessThan } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import { User } from '../users/user.entity';
import { BankAccount } from '../bank-accounts/bank-account.entity';
import { PlaidItem } from '../plaid/plaid-item.entity';
import { Transaction } from '../transactions/transaction.entity';
import { RecurringRule } from '../transactions/recurring-rule.entity';
import { Category } from '../categories/category.entity';
import { Budget } from '../budgets/budget.entity';
import { Project } from '../projects/project.entity';
import { ProjectCategory } from '../projects/project-category.entity';
import { Debt } from '../debts/debt.entity';
import { DebtPayment } from '../debts/debt-payment.entity';
import { ConnectedApp } from '../connected-apps/connected-app.entity';
import { Receipt } from '../receipts/receipt.entity';
import { CategorizationRule } from '../categorization-rules/categorization-rule.entity';
import { AiConversation } from '../ai-agent/ai-conversation.entity';
import { AiMessage } from '../ai-agent/ai-message.entity';
import { AiPendingAction } from '../ai-agent/ai-pending-action.entity';
import { Subscription } from '../billing/subscription.entity';
import { NetWorthSnapshot } from '../net-worth-goal/net-worth-snapshot.entity';
import { CreditCardDetail } from '../cards/credit-card-detail.entity';
import { CardProfile } from '../cards/card-profile.entity';
import { generateDemoData, type DemoData } from './demo-seed';

/** The permanent demo account the owner uses for videos. Login "Rockefeller" / "demo". */
export const DEMO_OWNER_EMAIL = 'rockefeller@demo.cofre';
export const DEMO_OWNER_NAME = 'Rockefeller';
export const DEMO_OWNER_PASSWORD = 'demo';
/** Login identifiers without an "@" are looked up under this domain (so "Rockefeller" works). */
export const DEMO_LOGIN_DOMAIN = 'demo.cofre';
export const VISITOR_DOMAIN = 'visitor.cofre.demo';
export const VISITOR_MAX_AGE_MS = 24 * 60 * 60 * 1000;

const todayIso = (d: Date) => d.toISOString().slice(0, 10);

@Injectable()
export class DemoService implements OnApplicationBootstrap {
  private readonly logger = new Logger(DemoService.name);

  constructor(@InjectDataSource() private readonly ds: DataSource) {}

  /** Rockefeller must exist for the owner; stale sandboxes are cheap to sweep here. Never fails boot. */
  async onApplicationBootstrap(): Promise<void> {
    try {
      await this.ensureOwner(new Date());
      const swept = await this.sweepStaleVisitors(new Date());
      if (swept) this.logger.log(`Swept ${swept} stale demo sandbox(es)`);
    } catch (err) {
      this.logger.error(`Demo bootstrap failed: ${(err as Error).message}`);
    }
  }

  /* ── Visitors ── */

  async startVisitor(now: Date = new Date()): Promise<User> {
    const users = this.ds.getRepository(User);
    const user = await users.save(users.create({
      email: `demo-${crypto.randomUUID()}@${VISITOR_DOMAIN}`,
      name: 'Demo',
      plan: 'pro',
      emailVerified: true,
      isDemo: true,
    }));
    await this.populate(user.id, generateDemoData({ year: now.getUTCFullYear(), today: todayIso(now) }));
    return users.findOneByOrFail({ id: user.id });
  }

  /** Deletes visitor sandboxes older than `maxAgeMs`, at most `limit` per call. Returns how many. */
  async sweepStaleVisitors(now: Date = new Date(), maxAgeMs = VISITOR_MAX_AGE_MS, limit = 50): Promise<number> {
    const stale = await this.ds.getRepository(User).find({
      where: { isDemo: true, createdAt: LessThan(new Date(now.getTime() - maxAgeMs)) },
      take: limit,
    });
    for (const u of stale) await this.wipe(u.id);
    return stale.length;
  }

  /* ── Owner ── */

  async ensureOwner(now: Date = new Date()): Promise<User> {
    const users = this.ds.getRepository(User);
    const existing = await users.findOneBy({ email: DEMO_OWNER_EMAIL });
    if (existing) return existing;
    const user = await users.save(users.create({
      email: DEMO_OWNER_EMAIL,
      name: DEMO_OWNER_NAME,
      password: await bcrypt.hash(DEMO_OWNER_PASSWORD, 10),
      plan: 'pro',
      emailVerified: true,
      isDemo: false,
    }));
    await this.populate(user.id, generateDemoData({ year: now.getUTCFullYear(), today: todayIso(now) }));
    this.logger.log('Created the Rockefeller demo account');
    return users.findOneByOrFail({ id: user.id });
  }

  /** Wipes Rockefeller's data, re-seeds it and restores the published password. Creates the account if missing. */
  async resetOwner(now: Date = new Date()): Promise<User> {
    const owner = await this.ensureOwner(now);
    await this.wipe(owner.id);
    await this.populate(owner.id, generateDemoData({ year: now.getUTCFullYear(), today: todayIso(now) }));
    // change-password is blocked for this account, but the hash is restored anyway so a
    // reset always leaves the login exactly as announced.
    await this.ds.getRepository(User).update(owner.id, { password: await bcrypt.hash(DEMO_OWNER_PASSWORD, 10), name: DEMO_OWNER_NAME, plan: 'pro' });
    return this.ds.getRepository(User).findOneByOrFail({ id: owner.id });
  }

  /* ── Wipe ── */

  /**
   * Deletes everything a user owns. The user row itself goes only for visitor
   * sandboxes. Explicit, FK-safe order rather than DB cascades — several
   * entities have none.
   */
  async wipe(userId: string): Promise<void> {
    await this.ds.transaction(async (em) => {
      const has = (e: any) => em.connection.hasMetadata(e);
      const del = async (e: any, where: Record<string, unknown>) => { if (has(e)) await em.getRepository(e).delete(where); };

      await del(Transaction, { userId });
      await del(Receipt, { userId });
      if (has(Debt)) {
        const debtIds = (await em.getRepository(Debt).findBy({ userId })).map((d) => d.id);
        if (debtIds.length && has(DebtPayment)) {
          await em.getRepository(DebtPayment).createQueryBuilder().delete().where('debtId IN (:...ids)', { ids: debtIds }).execute();
        }
        await em.getRepository(Debt).delete({ userId });
      }
      await del(Budget, { userId });
      await del(CategorizationRule, { userId });
      await del(RecurringRule, { userId });
      await del(ProjectCategory, { userId });
      await del(Project, { userId });
      await del(CreditCardDetail, { userId });
      await del(CardProfile, { userId });
      await del(PlaidItem, { userId });
      await del(BankAccount, { userId });
      await del(Category, { userId });
      await del(NetWorthSnapshot, { userId });
      if (has(AiConversation)) {
        const convIds = (await em.getRepository(AiConversation).findBy({ userId })).map((c) => c.id);
        if (convIds.length) {
          if (has(AiPendingAction)) await em.getRepository(AiPendingAction).createQueryBuilder().delete().where('conversationId IN (:...ids)', { ids: convIds }).execute();
          if (has(AiMessage)) await em.getRepository(AiMessage).createQueryBuilder().delete().where('conversationId IN (:...ids)', { ids: convIds }).execute();
        }
        await em.getRepository(AiConversation).delete({ userId });
      }
      await del(ConnectedApp, { userId });
      await del(Subscription, { userId });

      const user = await em.getRepository(User).findOneBy({ id: userId });
      if (user?.isDemo) await em.getRepository(User).delete({ id: userId });
    });
  }

  /* ── Populate ── */

  async populate(userId: string, data: DemoData): Promise<void> {
    await this.ds.transaction(async (em) => {
      const catId = await this.writeCategories(em, userId, data);
      const accId = await this.writeAccounts(em, userId, data);
      const { projectId, projectCatId } = await this.writeProjects(em, userId, data);
      const debtId = await this.writeDebts(em, userId, data);
      const ruleId = await this.writeRecurringRules(em, userId, data, catId, accId);
      await this.writeTransactions(em, userId, data, { catId, accId, projectId, projectCatId, debtId, ruleId });
      await this.writeBudgets(em, userId, data, catId);
      await this.writeCategorizationRules(em, userId, data, catId);
      await this.writeCards(em, userId, data, accId);
      await this.writeNetWorth(em, userId, data);
      await this.writeConversation(em, userId, data);
    });
  }

  private async writeCategories(em: EntityManager, userId: string, data: DemoData): Promise<Map<string, string>> {
    const repo = em.getRepository(Category);
    const rows = await repo.save(data.categories.map((c) => repo.create({
      userId, name: c.name, icon: c.icon, color: c.color, type: c.type, description: c.description ?? null,
      isDefault: true, isFixed: !!c.isFixed, wantNeed: c.wantNeed ?? null,
    })));
    return new Map(rows.map((r) => [r.name, r.id]));
  }

  private async writeAccounts(em: EntityManager, userId: string, data: DemoData): Promise<Map<string, string>> {
    const repo = em.getRepository(BankAccount);
    const ids = new Map<string, string>();
    for (const a of data.accounts) {
      const row = await repo.save(repo.create({
        userId, bankName: a.bankName, accountName: a.accountName, accountType: a.accountType,
        balance: a.balance, currency: 'USD', color: a.color, last4: a.last4 || undefined, provider: 'manual',
      }));
      ids.set(a.key, row.id);
    }
    return ids;
  }

  private async writeProjects(em: EntityManager, userId: string, data: DemoData) {
    const projects = em.getRepository(Project);
    const cats = em.getRepository(ProjectCategory);
    const projectId = new Map<string, string>();
    const projectCatId = new Map<string, string>();
    for (const p of data.projects) {
      const row = await projects.save(projects.create({
        userId, name: p.name, type: p.type, icon: p.icon, color: p.color, description: p.description,
        purchasePrice: p.purchasePrice, purchaseDate: p.purchaseDate, status: p.status, salePrice: p.salePrice, saleDate: p.saleDate,
      }));
      projectId.set(p.key, row.id);
      // Type categories are shared per (user, projectType); create them once per type.
      const existing = await cats.countBy({ userId, projectType: p.type });
      if (existing === 0) {
        const saved = await cats.save(p.categories.map((c, i) => cats.create({ userId, projectType: p.type, name: c.name, icon: c.icon, color: c.color, type: c.type, order: i })));
        for (const c of saved) projectCatId.set(`${p.key}:${c.name}`, c.id);
      } else {
        for (const c of await cats.findBy({ userId, projectType: p.type })) projectCatId.set(`${p.key}:${c.name}`, c.id);
      }
    }
    return { projectId, projectCatId };
  }

  private async writeDebts(em: EntityManager, userId: string, data: DemoData): Promise<Map<string, string>> {
    const debts = em.getRepository(Debt);
    const payments = em.getRepository(DebtPayment);
    const ids = new Map<string, string>();
    for (const d of data.debts) {
      const paid = d.payments.reduce((s, p) => s + p.amount, 0);
      const row = await debts.save(debts.create({
        userId, borrowerName: d.borrowerName, borrowerEmail: null, principal: d.principal, description: d.description,
        startDate: d.startDate, dueDate: d.dueDate, status: paid >= d.principal ? 'paid' : 'open', direction: d.direction,
      }));
      ids.set(d.key, row.id);
      if (d.payments.length) await payments.save(d.payments.map((p) => payments.create({ debtId: row.id, amount: p.amount, date: p.date, note: p.note ?? null })));
    }
    return ids;
  }

  private async writeRecurringRules(em: EntityManager, userId: string, data: DemoData, catId: Map<string, string>, accId: Map<string, string>): Promise<Map<string, string>> {
    const repo = em.getRepository(RecurringRule);
    const ids = new Map<string, string>();
    for (const r of data.recurringRules) {
      const row = await repo.save(repo.create({
        userId, name: r.name, amount: r.amount, categoryId: catId.get(r.category) ?? null, bankAccountId: accId.get(r.accountKey) ?? null,
        note: null, interval: 1, unit: 'month', dayOfMonth: r.dayOfMonth, startDate: r.startDate, endDate: null, occurrenceCount: null,
        lastRunDate: r.lastRunDate, runCount: r.runCount, active: true,
      }));
      ids.set(r.name, row.id);
    }
    return ids;
  }

  private async writeTransactions(
    em: EntityManager, userId: string, data: DemoData,
    maps: { catId: Map<string, string>; accId: Map<string, string>; projectId: Map<string, string>; projectCatId: Map<string, string>; debtId: Map<string, string>; ruleId: Map<string, string> },
  ): Promise<void> {
    const repo = em.getRepository(Transaction);
    const pairs = new Map<string, Transaction[]>();
    const purchases: { projectKey: string; tx: Transaction }[] = [];

    const CHUNK = 200;
    for (let i = 0; i < data.transactions.length; i += CHUNK) {
      const slice = data.transactions.slice(i, i + CHUNK);
      const rows = slice.map((t) => repo.create({
        userId,
        bankAccountId: maps.accId.get(t.accountKey),
        source: t.recurringRuleName ? 'recurring' : 'manual',
        amount: t.amount,
        name: t.name,
        merchantName: t.merchantName,
        category: t.category ?? undefined,
        categoryId: t.category ? maps.catId.get(t.category) : undefined,
        recurringRuleId: t.recurringRuleName ? maps.ruleId.get(t.recurringRuleName) ?? null : null,
        debtId: t.debtKey ? maps.debtId.get(t.debtKey) ?? null : null,
        projectId: t.projectKey ? maps.projectId.get(t.projectKey) : undefined,
        projectCategoryId: t.projectKey && t.projectCategoryName ? maps.projectCatId.get(`${t.projectKey}:${t.projectCategoryName}`) : undefined,
        date: t.date,
        pending: false,
        isSplitParent: false,
        note: t.note ?? null,
      }));
      const saved = await repo.save(rows);
      saved.forEach((row, j) => {
        const t = slice[j];
        if (t.transferPairKey) pairs.set(t.transferPairKey, [...(pairs.get(t.transferPairKey) ?? []), row]);
        if (t.projectKey && t.note === 'Purchase') purchases.push({ projectKey: t.projectKey, tx: row });
      });
    }

    // Transfer pairs: each side points at the other's account and row.
    for (const [, [a, b]] of pairs) {
      if (!a || !b) continue;
      await repo.update(a.id, { transferAccountId: b.bankAccountId, counterpartTxId: b.id });
      await repo.update(b.id, { transferAccountId: a.bankAccountId, counterpartTxId: a.id });
    }
    for (const { projectKey, tx } of purchases) {
      const id = maps.projectId.get(projectKey);
      if (id) await em.getRepository(Project).update(id, { purchaseTxId: tx.id });
    }
  }

  private async writeBudgets(em: EntityManager, userId: string, data: DemoData, catId: Map<string, string>): Promise<void> {
    const repo = em.getRepository(Budget);
    const rows = data.budgets.map((b) => repo.create({
      userId, categoryId: catId.get(b.category) ?? null, projectCategoryId: null, month: b.month, sourceMonth: b.month.endsWith('-01') ? b.month : `${b.month.slice(0, 4)}-01`,
      amount: b.amount, projectId: null, notifyEnabled: !!b.notifyEnabled, notifyThreshold: 80, rollover: !!b.rollover, isRecurring: !!b.isRecurring,
    }));
    await repo.save(rows);
  }

  private async writeCategorizationRules(em: EntityManager, userId: string, data: DemoData, catId: Map<string, string>): Promise<void> {
    const repo = em.getRepository(CategorizationRule);
    await repo.save(data.categorizationRules
      .filter((r) => catId.has(r.category))
      .map((r) => repo.create({ userId, matchType: r.matchType, matchValue: r.matchValue, matchStrategy: r.matchStrategy, categoryId: catId.get(r.category)! })));
  }

  private async writeCards(em: EntityManager, userId: string, data: DemoData, accId: Map<string, string>): Promise<void> {
    if (!em.connection.hasMetadata(CreditCardDetail)) return;
    const details = em.getRepository(CreditCardDetail);
    for (const c of data.cardDetails) {
      const bankAccountId = accId.get(c.accountKey);
      if (!bankAccountId) continue;
      await details.save(details.create({
        userId, bankAccountId, creditLimit: c.creditLimit, officialName: c.officialName,
        aprs: [{ type: 'purchase', percentage: c.purchaseApr, balanceSubjectTo: null, interestCharged: null }],
        lastStatementBalance: c.lastStatementBalance, lastStatementDate: c.lastStatementDate, minimumPayment: c.minimumPayment,
        nextPaymentDueDate: c.nextPaymentDueDate, lastPaymentAmount: c.lastPaymentAmount, lastPaymentDate: c.lastPaymentDate,
        isOverdue: false, promoAprEndsOn: null, rewardsBalance: null, liabilitiesStatus: 'manual',
        manualFields: ['creditLimit', 'officialName', 'aprs', 'lastStatementBalance', 'lastStatementDate', 'minimumPayment', 'nextPaymentDueDate', 'lastPaymentAmount', 'lastPaymentDate'],
        manualEditedAt: new Date(), plaidData: null, liabilitiesSyncedAt: null,
      }));
    }
    if (em.connection.hasMetadata(CardProfile)) {
      const profiles = em.getRepository(CardProfile);
      await profiles.save(profiles.create({
        userId, goal: data.cardProfile.goal, annualFeeOk: data.cardProfile.annualFeeOk, creditScoreBand: data.cardProfile.creditScoreBand,
        monthlyDebtBudget: data.cardProfile.monthlyDebtBudget, plannedPurchaseAmount: null, plannedPurchaseNote: null,
      }));
    }
  }

  private async writeNetWorth(em: EntityManager, userId: string, data: DemoData): Promise<void> {
    const snaps = em.getRepository(NetWorthSnapshot);
    await snaps.save(data.netWorthSnapshots.map((s) => snaps.create({ userId, date: s.date, value: s.value.toFixed(2) })));
    const first = data.netWorthSnapshots[0];
    await em.getRepository(User).update(userId, {
      netWorthGoalTargetDate: data.goalTargetDate,
      netWorthGoalBaselineValue: first ? first.value.toFixed(2) : null,
      netWorthGoalBaselineDate: first ? first.date : null,
    });
  }

  private async writeConversation(em: EntityManager, userId: string, data: DemoData): Promise<void> {
    if (!em.connection.hasMetadata(AiConversation) || !em.connection.hasMetadata(AiMessage)) return;
    const convs = em.getRepository(AiConversation);
    // Dated a few days back so the seeded exchange does not count against today's message limit.
    const when = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
    const conv = await convs.save(convs.create({ userId, title: data.conversation.title, createdAt: when, updatedAt: when }));
    const msgs = em.getRepository(AiMessage);
    for (const [i, m] of data.conversation.messages.entries()) {
      await msgs.save(msgs.create({ conversationId: conv.id, role: m.role, text: m.text, widget: null, createdAt: new Date(when.getTime() + i * 60_000) }));
    }
  }
}
