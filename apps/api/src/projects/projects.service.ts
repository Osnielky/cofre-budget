import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Project } from './project.entity';
import { ProjectCategory } from './project-category.entity';
import { Transaction } from '../transactions/transaction.entity';

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
}

export interface ProjectCategoryDto {
  name: string;
  icon?: string;
  color?: string;
  order?: number;
}

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
  ) {}

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
      const stats    = { ...p, expenses, income, costBasis, netGain, roi, txCount: txs.length };
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
    const project = await this.repo.save(this.repo.create({ ...dto, userId }));
    const type    = dto.type ?? 'other';

    /* Only seed defaults if this type has no categories yet for this user */
    const existing = await this.catRepo.countBy({ userId, projectType: type });
    if (existing === 0) {
      const seeds = DEFAULT_CATEGORIES[type] ?? DEFAULT_CATEGORIES.other;
      await this.catRepo.save(
        seeds.map((s, i) => this.catRepo.create({ userId, projectType: type, name: s.name, icon: s.icon, color: s.color, type: s.type, order: i })),
      );
    }

    return this.withStats(project);
  }

  async update(id: string, userId: string, dto: Partial<ProjectDto>): Promise<ProjectWithStats> {
    const project = await this.repo.findOneBy({ id });
    if (!project) throw new NotFoundException();
    if (project.userId !== userId) throw new ForbiddenException();
    Object.assign(project, dto);
    await this.repo.save(project);
    return this.withStats(project);
  }

  async remove(id: string, userId: string): Promise<void> {
    const project = await this.repo.findOneBy({ id });
    if (!project) throw new NotFoundException();
    if (project.userId !== userId) throw new ForbiddenException();
    await this.txRepo.update({ projectId: id }, { projectId: null, projectCategoryId: null });
    await this.repo.remove(project);
  }

  async linkTransaction(projectId: string, txId: string, userId: string, projectCategoryId?: string): Promise<void> {
    const project = await this.repo.findOneBy({ id: projectId });
    if (!project || project.userId !== userId) throw new ForbiddenException();
    const tx = await this.txRepo.findOneBy({ id: txId, userId });
    if (!tx) throw new NotFoundException();
    tx.projectId = projectId;
    if (projectCategoryId !== undefined) tx.projectCategoryId = projectCategoryId || null;
    await this.txRepo.save(tx);
  }

  async unlinkTransaction(txId: string, userId: string): Promise<void> {
    const tx = await this.txRepo.findOneBy({ id: txId, userId });
    if (!tx) throw new NotFoundException();
    tx.projectId = null;
    tx.projectCategoryId = null;
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
      this.catRepo.create({ ...dto, userId, projectType: project.type ?? 'other', order: dto.order ?? count }),
    );
  }

  async updateCategory(projectId: string, catId: string, userId: string, dto: Partial<ProjectCategoryDto>): Promise<ProjectCategory> {
    const project = await this.repo.findOneBy({ id: projectId });
    if (!project) throw new NotFoundException();
    if (project.userId !== userId) throw new ForbiddenException();
    const cat = await this.catRepo.findOneBy({ id: catId, userId });
    if (!cat) throw new NotFoundException();
    Object.assign(cat, dto);
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
      this.catRepo.create({ ...dto, userId, projectType: type, order: dto.order ?? count }),
    );
  }

  async updateCategoryById(catId: string, userId: string, dto: Partial<ProjectCategoryDto>): Promise<ProjectCategory> {
    const cat = await this.catRepo.findOneBy({ id: catId, userId });
    if (!cat) throw new NotFoundException();
    Object.assign(cat, dto);
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
    return { ...p, expenses, income, costBasis, netGain, roi, txCount: txs.length };
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
