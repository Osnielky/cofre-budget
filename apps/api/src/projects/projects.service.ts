import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Project } from './project.entity';
import { ProjectCategory } from './project-category.entity';
import { Transaction } from '../transactions/transaction.entity';
import { BankAccount } from '../bank-accounts/bank-account.entity';
import { ProjectAccount, TradingAccountMeta, TradingKind, TradingStatus, TRADING_KINDS, TRADING_STATUSES } from './project-account.entity';
import { isValidClosure, closedStatusFor } from './closure';
import { activitySummary, ActivitySummary } from './activity';
import { pickFields } from '../common/http/pick-fields';

export interface ProjectDto {
  name: string;
  type?: string;
  icon?: string;
  color?: string;
  description?: string;
  imageUrl?: string;
  purchasePrice?: number;
  purchaseDate?: string;
  status?: string;
  salePrice?: number;
  saleDate?: string;
  /** Trading projects: the investment accounts whose trades feed the Performance
      section. Sending the list replaces the project's links; [] unlinks all. */
  bankAccountIds?: string[];
}

export interface LinkedAccount extends TradingAccountMeta {
  id: string; bankName: string; accountName: string; accountType: string; provider: string;
}

export interface ProjectCategoryDto {
  name: string;
  icon?: string;
  color?: string;
  order?: number;
  /* 'expense' | 'income' — the client already sends this on edit; declaring it
     keeps updateCategoryById's Object.assign honest. */
  type?: string;
  description?: string | null;
}

export interface ManualAccountDto {
  name: string;
  firm: string;
  kind?: TradingKind;
  status?: TradingStatus;
  accountSize?: number | null;
  startedAt?: string | null;
  notes?: string | null;
}

const META_FIELDS = ['kind', 'status', 'firm', 'accountSize', 'startedAt', 'endedAt', 'notes'] as const satisfies readonly (keyof TradingAccountMeta)[];
const ENDED_STATUSES = new Set<TradingStatus>(['failed', 'closed']);
const today = () => new Date().toISOString().slice(0, 10);

/** Fields a client may set on a project / project category; id, userId, projectType are server-owned. */
const PROJECT_FIELDS = ['name', 'type', 'icon', 'color', 'description', 'imageUrl', 'purchasePrice', 'purchaseDate', 'status', 'salePrice', 'saleDate'] as const satisfies readonly (keyof ProjectDto)[];
const PROJECT_CATEGORY_FIELDS = ['name', 'icon', 'color', 'order', 'type', 'description'] as const satisfies readonly (keyof ProjectCategoryDto)[];

export interface CategoryBreakdown {
  id: string;
  name: string;
  icon: string;
  color: string;
  order: number;
  total: number;
  txCount: number;
}

export interface ProjectWithStats extends Project {
  expenses: number;
  income: number;
  costBasis: number;
  netGain: number | null;
  roi: number | null;
  txCount: number;
  /** Investment accounts a trading project follows (link order). */
  accounts: LinkedAccount[];
  /** Latest linked transaction date, or null. */
  lastActivity: string | null;
  /** Net by month for the trailing six months (overview sparklines). */
  monthly: ActivitySummary['monthly'];
}

/* Default category seeds per project type */
const DEFAULT_CATEGORIES: Record<string, { name: string; icon: string; color: string; type: string }[]> = {
  vehicle: [
    { name: 'Mechanic',     icon: '🔧', color: '#F07A3E', type: 'expense' },
    { name: 'Tires',        icon: '🛞', color: '#F5C842', type: 'expense' },
    { name: 'Maintenance',  icon: '🔩', color: '#9B6DFF', type: 'expense' },
    { name: 'Transport',    icon: '🚛', color: '#4BA8D8', type: 'expense' },
    { name: 'Registration', icon: '📄', color: '#E879A0', type: 'expense' },
    { name: 'Fuel',         icon: '⛽', color: '#9B6DFF', type: 'expense' },
    { name: 'Sale Income',  icon: '💵', color: '#4FBF7F', type: 'income'  },
  ],
  property: [
    { name: 'Renovation',    icon: '🏗️', color: '#F07A3E', type: 'expense' },
    { name: 'Repairs',       icon: '🔨', color: '#F5C842', type: 'expense' },
    { name: 'Agent Fees',    icon: '🏡', color: '#9B6DFF', type: 'expense' },
    { name: 'Taxes',         icon: '🏛️', color: '#E879A0', type: 'expense' },
    { name: 'Insurance',     icon: '🛡️', color: '#4BA8D8', type: 'expense' },
    { name: 'Utilities',     icon: '💡', color: '#4FBF7F', type: 'expense' },
    { name: 'Rental Income', icon: '🏠', color: '#4FBF7F', type: 'income'  },
    { name: 'Sale Income',   icon: '💵', color: '#4FBF7F', type: 'income'  },
  ],
  business: [
    { name: 'Equipment',  icon: '💻', color: '#9B6DFF', type: 'expense' },
    { name: 'Marketing',  icon: '📢', color: '#F07A3E', type: 'expense' },
    { name: 'Legal',      icon: '⚖️', color: '#E879A0', type: 'expense' },
    { name: 'Supplies',   icon: '📦', color: '#4BA8D8', type: 'expense' },
    { name: 'Labor',      icon: '👷', color: '#F5C842', type: 'expense' },
    { name: 'Revenue',    icon: '💰', color: '#4FBF7F', type: 'income'  },
    { name: 'Sale Income',icon: '💵', color: '#4FBF7F', type: 'income'  },
  ],
  service: [
    { name: 'Revenue',         icon: '💼', color: '#4FBF7F', type: 'income'  },
    { name: 'Tips',            icon: '💵', color: '#4FBF7F', type: 'income'  },
    { name: 'Bonuses',         icon: '🎯', color: '#4FBF7F', type: 'income'  },
    { name: 'Fuel',            icon: '⛽', color: '#F07A3E', type: 'expense' },
    { name: 'Contractors',     icon: '👷', color: '#F5C842', type: 'expense' },
    { name: 'Software & Tools',icon: '💻', color: '#9B6DFF', type: 'expense' },
    { name: 'Marketing',       icon: '📢', color: '#E879A0', type: 'expense' },
    { name: 'Supplies',        icon: '📦', color: '#4BA8D8', type: 'expense' },
    { name: 'Legal & Fees',    icon: '⚖️', color: '#5C5C78', type: 'expense' },
  ],
  trading: [
    { name: 'Trade Profits',      icon: '📈', color: '#4FBF7F', type: 'income'  },
    { name: 'Prop Firm Payouts',  icon: '💵', color: '#4FBF7F', type: 'income'  },
    { name: 'Trade Losses',       icon: '📉', color: '#F07A3E', type: 'expense' },
    { name: 'Commissions & Fees', icon: '🧾', color: '#F5C842', type: 'expense' },
    { name: 'Platform & Data',    icon: '💻', color: '#9B6DFF', type: 'expense' },
    { name: 'Prop Firm Evals',    icon: '🏦', color: '#4BA8D8', type: 'expense' },
    { name: 'Education & Tools',  icon: '📚', color: '#E879A0', type: 'expense' },
  ],
  other: [
    { name: 'Materials',  icon: '📦', color: '#F07A3E', type: 'expense' },
    { name: 'Labor',      icon: '👷', color: '#F5C842', type: 'expense' },
    { name: 'Fees',       icon: '📄', color: '#9B6DFF', type: 'expense' },
    { name: 'Sale Income',icon: '💵', color: '#4FBF7F', type: 'income'  },
  ],
};

@Injectable()
export class ProjectsService {
  constructor(
    @InjectRepository(Project)         private repo: Repository<Project>,
    @InjectRepository(ProjectCategory) private catRepo: Repository<ProjectCategory>,
    @InjectRepository(Transaction)     private txRepo: Repository<Transaction>,
    @InjectRepository(BankAccount)     private accountRepo: Repository<BankAccount>,
    @InjectRepository(ProjectAccount)  private linkRepo: Repository<ProjectAccount>,
  ) {}

  private toLinked(l: ProjectAccount): LinkedAccount {
    const a = l.bankAccount;
    return {
      id: a.id, bankName: a.bankName, accountName: a.accountName, accountType: a.accountType, provider: a.provider,
      kind: l.kind, status: l.status, firm: l.firm ?? null,
      accountSize: l.accountSize == null ? null : Number(l.accountSize),
      startedAt: l.startedAt ?? null, endedAt: l.endedAt ?? null, notes: l.notes ?? null,
    };
  }

  /** Accounts a project follows, in link order, with their trading metadata. */
  async linkedAccounts(projectId: string): Promise<LinkedAccount[]> {
    const links = await this.linkRepo.find({ where: { projectId }, relations: ['bankAccount'], order: { createdAt: 'ASC' } });
    return links.filter((l) => l.bankAccount).map((l) => this.toLinked(l));
  }

  private async tradingProject(projectId: string, userId: string): Promise<Project> {
    const project = await this.repo.findOneBy({ id: projectId });
    if (!project) throw new NotFoundException();
    if (project.userId !== userId) throw new ForbiddenException();
    if (project.type !== 'trading') throw new BadRequestException('Only a trading project follows accounts');
    return project;
  }

  private validateMeta(patch: Partial<TradingAccountMeta>): void {
    if (patch.kind !== undefined && !TRADING_KINDS.includes(patch.kind)) throw new BadRequestException(`Unknown account kind "${patch.kind}"`);
    if (patch.status !== undefined && !TRADING_STATUSES.includes(patch.status)) throw new BadRequestException(`Unknown account status "${patch.status}"`);
    if (patch.firm !== undefined && patch.firm !== null && patch.firm.length > 80) throw new BadRequestException('Firm must be 80 characters or fewer');
    if (patch.notes !== undefined && patch.notes !== null && patch.notes.length > 2000) throw new BadRequestException('Notes must be 2000 characters or fewer');
    for (const key of ['startedAt', 'endedAt'] as const) {
      const v = patch[key];
      if (v != null && !/^\d{4}-\d{2}-\d{2}$/.test(v)) throw new BadRequestException(`${key} must be YYYY-MM-DD`);
    }
    if (patch.accountSize != null && !(Number(patch.accountSize) >= 0)) throw new BadRequestException('Account size must be a positive number');
  }

  /** Create an investment account the user is not connected to (a prop-firm combine) and follow it. */
  async addManualAccount(projectId: string, userId: string, dto: ManualAccountDto): Promise<LinkedAccount> {
    const project = await this.tradingProject(projectId, userId);
    const name = (dto.name ?? '').trim(), firm = (dto.firm ?? '').trim();
    if (!name || !firm) throw new BadRequestException('Firm and account name are required');
    const meta: TradingAccountMeta = {
      kind: dto.kind ?? 'prop_firm', status: dto.status ?? 'evaluation', firm,
      accountSize: dto.accountSize == null ? null : Number(dto.accountSize),
      startedAt: dto.startedAt ?? null, endedAt: null, notes: dto.notes ?? null,
    };
    this.validateMeta(meta);
    const account = await this.accountRepo.save(this.accountRepo.create({
      userId, bankName: firm, accountName: name, accountType: 'investment', provider: 'manual', balance: 0, currency: 'USD', color: '#4BA8D8',
    }));
    const link = await this.linkRepo.save(this.linkRepo.create({ userId, projectId: project.id, bankAccountId: account.id, ...meta }));
    link.bankAccount = account;
    return this.toLinked(link);
  }

  async updateAccountMeta(projectId: string, accountId: string, userId: string, patch: Partial<TradingAccountMeta>): Promise<LinkedAccount> {
    await this.tradingProject(projectId, userId);
    const link = await this.linkRepo.findOne({ where: { projectId, bankAccountId: accountId, userId }, relations: ['bankAccount'] });
    if (!link) throw new NotFoundException('That account is not part of this project');
    this.validateMeta(patch);
    Object.assign(link, pickFields(patch, META_FIELDS));
    if (patch.status !== undefined) {
      if (ENDED_STATUSES.has(patch.status)) link.endedAt = patch.endedAt ?? link.endedAt ?? today();
      else if (patch.endedAt === undefined) link.endedAt = null;
    }
    await this.linkRepo.save(link);
    return this.toLinked(link);
  }

  /** Stop following an account. The bank account itself is never deleted; attributions to it are cleared. */
  async removeAccount(projectId: string, accountId: string, userId: string): Promise<void> {
    await this.tradingProject(projectId, userId);
    const link = await this.linkRepo.findOneBy({ projectId, bankAccountId: accountId, userId });
    if (!link) throw new NotFoundException('That account is not part of this project');
    await this.txRepo.update({ projectId, tradingAccountId: accountId }, { tradingAccountId: null });
    await this.linkRepo.remove(link);
  }

  /* Sync the project's followed accounts to `ids`. Links that stay keep their
     trading metadata (status, firm, dates); new manual accounts start as a
     prop-firm evaluation, new connected ones as an active broker. */
  private async replaceLinks(project: Project, userId: string, ids: string[]): Promise<void> {
    const unique = [...new Set(ids)];
    const accounts = unique.length ? await this.accountRepo.find({ where: { id: In(unique), userId } }) : [];
    if (accounts.length !== unique.length) throw new BadRequestException('Linked account not found');
    const wrongType = accounts.find((a) => a.accountType !== 'investment');
    if (wrongType) throw new BadRequestException(`"${wrongType.accountName}" is not an investment account — only brokerage, IRA and futures accounts can feed a trading project`);
    const taken = unique.length ? await this.linkRepo.find({ where: { bankAccountId: In(unique) } }) : [];
    const other = taken.find((t) => t.projectId !== project.id);
    if (other) throw new BadRequestException('That account already feeds another project — unlink it there first');

    const current = await this.linkRepo.find({ where: { projectId: project.id } });
    const keep = new Set(unique);
    const gone = current.filter((l) => !keep.has(l.bankAccountId));
    if (gone.length) {
      await this.txRepo.update({ projectId: project.id, tradingAccountId: In(gone.map((l) => l.bankAccountId)) }, { tradingAccountId: null });
      await this.linkRepo.remove(gone);
    }
    const have = new Set(current.map((l) => l.bankAccountId));
    const fresh = unique.filter((id) => !have.has(id)).map((bankAccountId) => {
      const a = accounts.find((x) => x.id === bankAccountId)!;
      return this.linkRepo.create({ userId, projectId: project.id, bankAccountId, ...this.defaultMeta(a) });
    });
    if (fresh.length) await this.linkRepo.save(fresh);
  }

  private defaultMeta(a: BankAccount): TradingAccountMeta {
    const manual = a.provider === 'manual';
    return { kind: manual ? 'prop_firm' : 'broker', status: manual ? 'evaluation' : 'active', firm: manual ? a.bankName : null, accountSize: null, startedAt: null, endedAt: null, notes: null };
  }

  /* Load categories for a project type, scoped to the user — lazy-seeds defaults on first access */
  async loadTypeCategories(userId: string, projectType: string): Promise<ProjectCategory[]> {
    const existing = await this.catRepo.find({
      where: { userId, projectType },
      order: { order: 'ASC', createdAt: 'ASC' },
    });
    if (existing.length > 0) return existing;

    const seeds = DEFAULT_CATEGORIES[projectType] ?? DEFAULT_CATEGORIES.other;
    await this.catRepo.save(
      seeds.map((s, i) => this.catRepo.create({ userId, projectType, name: s.name, icon: s.icon, color: s.color, type: s.type, order: i })),
    );
    return this.catRepo.find({ where: { userId, projectType }, order: { order: 'ASC', createdAt: 'ASC' } });
  }

  async findAllByUser(userId: string): Promise<(ProjectWithStats & { categories: ProjectCategory[] })[]> {
    const projects = await this.repo.find({ where: { userId }, order: { createdAt: 'DESC' } });
    if (projects.length === 0) return [];

    // Single query for ALL project transactions instead of one per project
    const projectIds = projects.map(p => p.id);
    const allTxs = await this.txRepo
      .createQueryBuilder('tx')
      .where('tx.userId = :userId', { userId })
      .andWhere('tx.projectId IN (:...ids)', { ids: projectIds })
      .getMany();

    // Group in memory
    const txByProject: Record<string, typeof allTxs> = {};
    for (const tx of allTxs) {
      if (!txByProject[tx.projectId]) txByProject[tx.projectId] = [];
      txByProject[tx.projectId].push(tx);
    }

    // Linked investment accounts, one query for every project
    const allLinks = await this.linkRepo.find({ where: { projectId: In(projectIds) }, relations: ['bankAccount'], order: { createdAt: 'ASC' } });
    const linksByProject: Record<string, LinkedAccount[]> = {};
    for (const l of allLinks) {
      if (!l.bankAccount) continue;
      (linksByProject[l.projectId] ??= []).push(this.toLinked(l));
    }

    // Cache type→categories (at most 4-5 distinct types)
    const typeCache: Record<string, ProjectCategory[]> = {};
    const getTypeCats = async (type: string) => {
      if (!typeCache[type]) typeCache[type] = await this.loadTypeCategories(userId, type);
      return typeCache[type];
    };

    return Promise.all(projects.map(async (p) => {
      const txs      = txByProject[p.id] ?? [];
      const expenses = txs.filter(t => Number(t.amount) < 0).reduce((s, t) => s + Math.abs(Number(t.amount)), 0);
      const income   = txs.filter(t => Number(t.amount) > 0).reduce((s, t) => s + Number(t.amount), 0);
      const costBasis = (p.purchaseTxId ? 0 : Number(p.purchasePrice)) + expenses;
      const netGain  = p.status === 'sold' && p.salePrice != null ? Number(p.salePrice) - costBasis : null;
      const roi      = netGain != null && costBasis > 0 ? (netGain / costBasis) * 100 : null;
      const stats    = { ...p, expenses, income, costBasis, netGain, roi, txCount: txs.length, accounts: linksByProject[p.id] ?? [], ...activitySummary(txs) };
      const categories = await getTypeCats(p.type ?? 'other');
      return { ...stats, categories };
    }));
  }

  async findOne(id: string, userId: string) {
    const project = await this.repo.findOneBy({ id });
    if (!project) throw new NotFoundException();
    if (project.userId !== userId) throw new ForbiddenException();

    const [transactions, categories] = await Promise.all([
      this.txRepo.find({
        where: { projectId: id },
        relations: ['categoryRef', 'bankAccount'],
        order: { date: 'DESC' },
      }),
      this.loadTypeCategories(userId, project.type ?? 'other'),
    ]);

    const stats = await this.withStats(project);

    const categoryBreakdown: CategoryBreakdown[] = categories.map((cat) => {
      const catTxs = transactions.filter((t) => t.projectCategoryId === cat.id);
      const total  = catTxs.reduce((s, t) => s + Math.abs(Number(t.amount)), 0);
      return { id: cat.id, name: cat.name, icon: cat.icon, color: cat.color, order: cat.order, total, txCount: catTxs.length };
    });

    const txsWithCat = transactions.map((tx) => ({
      ...tx,
      projectCategory: categories.find((c) => c.id === tx.projectCategoryId) ?? null,
    }));

    return { ...stats, transactions: txsWithCat, categories, categoryBreakdown };
  }

  async create(userId: string, dto: ProjectDto): Promise<ProjectWithStats> {
    const project = await this.repo.save(this.repo.create({ ...pickFields(dto, PROJECT_FIELDS), userId }));
    if (dto.bankAccountIds) {
      try { await this.replaceLinks(project, userId, dto.bankAccountIds); }
      catch (err) { await this.repo.remove(project); throw err; }
    }
    return this.withStats(project);
  }

  async update(id: string, userId: string, dto: Partial<ProjectDto>): Promise<ProjectWithStats> {
    const project = await this.repo.findOneBy({ id });
    if (!project) throw new NotFoundException();
    if (project.userId !== userId) throw new ForbiddenException();

    if (dto.status !== undefined) {
      // A service isn't "sold" and a car isn't "terminated". The UI already
      // offers only the right verb, but the rule has to hold here too or it
      // only exists in one client.
      const type = dto.type ?? project.type;
      if (!isValidClosure(type, dto.status)) {
        throw new BadRequestException(
          `A ${type} project cannot be marked "${dto.status}" — use "${closedStatusFor(type)}" instead.`,
        );
      }
      // Reactivating clears the closure, so a revived project never carries a
      // stale sale price into its P&L.
      if (dto.status === 'active') {
        project.salePrice = null;
        project.saleDate = null;
      }
    }

    if (dto.bankAccountIds) await this.replaceLinks(project, userId, dto.bankAccountIds);
    Object.assign(project, pickFields(dto, PROJECT_FIELDS));
    await this.repo.save(project);
    return this.withStats(project);
  }

  async remove(id: string, userId: string): Promise<void> {
    const project = await this.repo.findOneBy({ id });
    if (!project) throw new NotFoundException();
    if (project.userId !== userId) throw new ForbiddenException();
    await this.txRepo.update({ projectId: id }, { projectId: null, projectCategoryId: null, tradingAccountId: null });
    await this.repo.remove(project);
  }

  async linkTransaction(projectId: string, txId: string, userId: string, projectCategoryId?: string, tradingAccountId?: string | null): Promise<void> {
    const project = await this.repo.findOneBy({ id: projectId });
    if (!project || project.userId !== userId) throw new ForbiddenException();
    const tx = await this.txRepo.findOneBy({ id: txId, userId });
    if (!tx) throw new NotFoundException();
    /* A row on an account the project follows, or a transfer to / from one, is already
       in the project's Performance (deposits, cash-outs, trades). Filing it under a
       project category would count the same money twice. */
    const followed = await this.followedAccountFor(projectId, tx);
    if (followed) throw new BadRequestException(`${project.name} already follows ${followed.bankName} · ${followed.accountName} — this money is counted in its Performance`);
    if (tradingAccountId) await this.assertFollows(projectId, tradingAccountId);
    tx.projectId = projectId;
    if (projectCategoryId !== undefined) tx.projectCategoryId = projectCategoryId || null;
    if (tradingAccountId !== undefined) tx.tradingAccountId = tradingAccountId || null;
    await this.txRepo.save(tx);
  }

  /** The account must be one the project follows, else 400. */
  private async assertFollows(projectId: string, accountId: string): Promise<void> {
    const link = await this.linkRepo.findOneBy({ projectId, bankAccountId: accountId });
    if (!link) throw new BadRequestException('That account is not part of this project');
  }

  /** Say which of the project's accounts some of its transactions belong to (null = none). */
  async assignTradingAccount(projectId: string, userId: string, transactionIds: string[], accountId: string | null): Promise<{ updated: number }> {
    const project = await this.repo.findOneBy({ id: projectId });
    if (!project || project.userId !== userId) throw new ForbiddenException();
    const ids = [...new Set(transactionIds)].filter(Boolean);
    if (ids.length === 0) return { updated: 0 };
    if (accountId) await this.assertFollows(projectId, accountId);
    const rows = await this.txRepo.find({ where: { id: In(ids), userId, projectId }, select: ['id'] });
    if (rows.length !== ids.length) throw new BadRequestException('Every transaction must be linked to this project');
    await this.txRepo.update({ id: In(ids) }, { tradingAccountId: accountId });
    return { updated: ids.length };
  }

  /** The followed account a transaction sits on or moves money to / from, if any. */
  private async followedAccountFor(projectId: string, tx: Pick<Transaction, 'bankAccountId' | 'transferAccountId'>): Promise<BankAccount | null> {
    const ids = [tx.bankAccountId, tx.transferAccountId].filter((id): id is string => !!id);
    if (ids.length === 0) return null;
    const link = await this.linkRepo.findOne({ where: { projectId, bankAccountId: In(ids) }, relations: ['bankAccount'] });
    return link?.bankAccount ?? null;
  }

  async unlinkTransaction(txId: string, userId: string): Promise<void> {
    const tx = await this.txRepo.findOneBy({ id: txId, userId });
    if (!tx) throw new NotFoundException();
    tx.projectId = null;
    tx.projectCategoryId = null;
    tx.tradingAccountId = null;
    await this.txRepo.save(tx);
  }

  /* ── Category CRUD (type-scoped) ── */

  async getCategories(projectId: string, userId: string): Promise<ProjectCategory[]> {
    const project = await this.repo.findOneBy({ id: projectId });
    if (!project) throw new NotFoundException();
    if (project.userId !== userId) throw new ForbiddenException();
    return this.loadTypeCategories(userId, project.type ?? 'other');
  }

  async createCategory(projectId: string, userId: string, dto: ProjectCategoryDto): Promise<ProjectCategory> {
    const project = await this.repo.findOneBy({ id: projectId });
    if (!project) throw new NotFoundException();
    if (project.userId !== userId) throw new ForbiddenException();
    const count = await this.catRepo.countBy({ userId, projectType: project.type });
    return this.catRepo.save(
      this.catRepo.create({ ...pickFields(dto, PROJECT_CATEGORY_FIELDS), userId, projectType: project.type ?? 'other', order: dto.order ?? count }),
    );
  }

  async updateCategory(projectId: string, catId: string, userId: string, dto: Partial<ProjectCategoryDto>): Promise<ProjectCategory> {
    const project = await this.repo.findOneBy({ id: projectId });
    if (!project) throw new NotFoundException();
    if (project.userId !== userId) throw new ForbiddenException();
    const cat = await this.catRepo.findOneBy({ id: catId, userId });
    if (!cat) throw new NotFoundException();
    Object.assign(cat, pickFields(dto, PROJECT_CATEGORY_FIELDS));
    return this.catRepo.save(cat);
  }

  async seedDefaultCategories(projectId: string, userId: string): Promise<ProjectCategory[]> {
    const project = await this.repo.findOneBy({ id: projectId });
    if (!project) throw new NotFoundException();
    if (project.userId !== userId) throw new ForbiddenException();
    const type = project.type ?? 'other';
    await this.catRepo.delete({ userId, projectType: type });
    const seeds = DEFAULT_CATEGORIES[type] ?? DEFAULT_CATEGORIES.other;
    return this.catRepo.save(
      seeds.map((s, i) => this.catRepo.create({ userId, projectType: type, name: s.name, icon: s.icon, color: s.color, type: s.type, order: i })),
    );
  }

  async deleteCategory(projectId: string, catId: string, userId: string): Promise<void> {
    const project = await this.repo.findOneBy({ id: projectId });
    if (!project) throw new NotFoundException();
    if (project.userId !== userId) throw new ForbiddenException();
    const cat = await this.catRepo.findOneBy({ id: catId, userId });
    if (!cat) throw new NotFoundException();
    await this.txRepo.update({ projectCategoryId: catId }, { projectCategoryId: null });
    await this.catRepo.remove(cat);
  }

  /* ── Direct type-category management (used by settings page) ── */

  async createCategoryForType(type: string, userId: string, dto: ProjectCategoryDto): Promise<ProjectCategory> {
    const count = await this.catRepo.countBy({ userId, projectType: type });
    return this.catRepo.save(
      this.catRepo.create({ ...pickFields(dto, PROJECT_CATEGORY_FIELDS), userId, projectType: type, order: dto.order ?? count }),
    );
  }

  async updateCategoryById(catId: string, userId: string, dto: Partial<ProjectCategoryDto>): Promise<ProjectCategory> {
    const cat = await this.catRepo.findOneBy({ id: catId, userId });
    if (!cat) throw new NotFoundException();
    Object.assign(cat, pickFields(dto, PROJECT_CATEGORY_FIELDS));
    return this.catRepo.save(cat);
  }

  async deleteCategoryById(catId: string, userId: string): Promise<void> {
    const cat = await this.catRepo.findOneBy({ id: catId, userId });
    if (!cat) throw new NotFoundException();
    await this.txRepo.update({ projectCategoryId: catId }, { projectCategoryId: null });
    await this.catRepo.remove(cat);
  }

  async seedForType(type: string, userId: string): Promise<ProjectCategory[]> {
    await this.catRepo.delete({ userId, projectType: type });
    const seeds = DEFAULT_CATEGORIES[type] ?? DEFAULT_CATEGORIES.other;
    return this.catRepo.save(
      seeds.map((s, i) => this.catRepo.create({ userId, projectType: type, name: s.name, icon: s.icon, color: s.color, type: s.type, order: i })),
    );
  }

  async assignCategory(txId: string, projectCategoryId: string | null, userId: string): Promise<void> {
    const tx = await this.txRepo.findOneBy({ id: txId, userId });
    if (!tx) throw new NotFoundException();
    tx.projectCategoryId = projectCategoryId;
    await this.txRepo.save(tx);
  }

  private async withStats(p: Project): Promise<ProjectWithStats> {
    const txs      = await this.txRepo.findBy({ projectId: p.id });
    const expenses = txs.filter((t) => Number(t.amount) < 0).reduce((s, t) => s + Math.abs(Number(t.amount)), 0);
    const income   = txs.filter((t) => Number(t.amount) > 0).reduce((s, t) => s + Number(t.amount), 0);
    const costBasis = (p.purchaseTxId ? 0 : Number(p.purchasePrice)) + expenses;
    const netGain  = p.status === 'sold' && p.salePrice != null
      ? Number(p.salePrice) - costBasis
      : null;
    const roi = netGain != null && costBasis > 0 ? (netGain / costBasis) * 100 : null;
    return { ...p, expenses, income, costBasis, netGain, roi, txCount: txs.length, accounts: await this.linkedAccounts(p.id), ...activitySummary(txs) };
  }

  async setPurchaseTx(projectId: string, userId: string, transactionId: string | null): Promise<ProjectWithStats> {
    const project = await this.repo.findOneByOrFail({ id: projectId, userId });

    if (transactionId) {
      const tx = await this.txRepo.findOneBy({ id: transactionId, userId, projectId });
      if (!tx) throw new NotFoundException('Transaction not found or not linked to this project');
    }

    project.purchaseTxId = transactionId ?? null;
    await this.repo.save(project);
    return this.withStats(project);
  }
}
