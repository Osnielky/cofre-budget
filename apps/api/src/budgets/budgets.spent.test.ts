import { describe, it, expect, beforeEach } from 'vitest';
import { DataSource } from 'typeorm';
import { User } from '../users/user.entity';
import { Budget } from './budget.entity';
import { Transaction } from '../transactions/transaction.entity';
import { Category } from '../categories/category.entity';
import { BankAccount } from '../bank-accounts/bank-account.entity';
import { Project } from '../projects/project.entity';
import { ProjectCategory } from '../projects/project-category.entity';
import { CategorizationRule } from '../categorization-rules/categorization-rule.entity';
import { BudgetsService } from './budgets.service';

/* findWithSpent and history on the one-grouped-query implementation: an expense
   budget, an income budget, a project-category budget, a tracking-account row
   that must not count, and a second month for the history. */

let ds: DataSource;
let service: BudgetsService;
let userId: string;
let groceries: Category, salary: Category, project: Project, materials: ProjectCategory;

beforeEach(async () => {
  ds = new DataSource({
    type: 'better-sqlite3', database: ':memory:', dropSchema: true,
    entities: [User, Budget, Transaction, Category, BankAccount, Project, ProjectCategory, CategorizationRule],
    synchronize: true,
  });
  await ds.initialize();
  service = new BudgetsService(ds.getRepository(Budget), ds.getRepository(Transaction), ds.getRepository(Project), ds.getRepository(Category), ds.getRepository(ProjectCategory));

  const r = <T>(e: new () => T) => ds.getRepository(e);
  userId = (await r(User).save(r(User).create({ email: 'spent@test.cofre', name: 'S', plan: 'pro' } as Partial<User>))).id;
  groceries = await r(Category).save(r(Category).create({ userId, name: 'Groceries', icon: '🛒', color: '#0f0', type: 'expense' } as Partial<Category>));
  salary = await r(Category).save(r(Category).create({ userId, name: 'Salary', icon: '💼', color: '#00f', type: 'income' } as Partial<Category>));
  project = await r(Project).save(r(Project).create({ userId, name: 'Flip', type: 'other', status: 'active' } as Partial<Project>));
  materials = await r(ProjectCategory).save(r(ProjectCategory).create({ userId, projectType: 'other', type: 'expense', name: 'Materials' } as Partial<ProjectCategory>));
  const checking = await r(BankAccount).save(r(BankAccount).create({ userId, bankName: 'Chase', accountName: 'Checking', accountType: 'checking' } as Partial<BankAccount>));
  const brokerage = await r(BankAccount).save(r(BankAccount).create({ userId, bankName: 'Vanguard', accountName: 'IRA', accountType: 'investment' } as Partial<BankAccount>));

  const tx = (p: Partial<Transaction>) => r(Transaction).save(r(Transaction).create({ userId, source: 'manual', pending: false, isSplitParent: false, name: 'row', ...p } as Partial<Transaction>));
  await tx({ bankAccountId: checking.id, categoryId: groceries.id, amount: -100, date: '2026-11-02' });
  await tx({ bankAccountId: checking.id, categoryId: groceries.id, amount: -50.25, date: '2026-11-20' });
  await tx({ bankAccountId: brokerage.id, categoryId: groceries.id, amount: -30, date: '2026-11-21' }); // tracking account: excluded
  await tx({ bankAccountId: checking.id, categoryId: groceries.id, amount: 20, date: '2026-11-22' });  // a refund: not spending
  await tx({ bankAccountId: checking.id, categoryId: salary.id, amount: 1000, date: '2026-11-05' });
  await tx({ bankAccountId: checking.id, categoryId: salary.id, amount: 200, date: '2026-11-19' });
  await tx({ bankAccountId: checking.id, categoryId: salary.id, amount: -40, date: '2026-11-19' });    // a clawback: not earnings
  await tx({ bankAccountId: checking.id, categoryId: null as any, projectId: project.id, projectCategoryId: materials.id, amount: -75, date: '2026-11-10' });
  await tx({ bankAccountId: checking.id, categoryId: groceries.id, amount: -80, date: '2026-10-15' });

  const b = (p: Partial<Budget>) => r(Budget).save(r(Budget).create({ userId, ...p } as Partial<Budget>));
  await b({ categoryId: groceries.id, month: '2026-11', amount: 500 });
  await b({ categoryId: salary.id, month: '2026-11', amount: 3000 });
  await b({ categoryId: null, projectId: project.id, projectCategoryId: materials.id, month: '2026-11', amount: 300 });
  await b({ categoryId: groceries.id, month: '2026-10', amount: 400 });
});

describe('BudgetsService.findWithSpent', () => {
  it('each budget reads its own month total from one grouped query', async () => {
    const rows = await service.findWithSpent(userId, '2026-11');
    const byKey = Object.fromEntries(rows.map((r) => [r.projectCategoryId ? 'project' : r.category!.name, r]));
    expect(byKey.Groceries.spent).toBeCloseTo(150.25, 2);
    expect(byKey.Groceries.remaining).toBeCloseTo(349.75, 2);
    expect(byKey.Groceries.percentage).toBe(30);
    expect(byKey.Salary.spent).toBeCloseTo(1200, 2);
    expect(byKey.project.spent).toBe(0); // a project category tracks earnings; nothing came in
  });

  it('a project category budget tracks the project rows, not the budget category', async () => {
    const r = ds.getRepository(Transaction);
    await r.save(r.create({ userId, source: 'manual', pending: false, isSplitParent: false, name: 'sale', projectId: project.id, projectCategoryId: materials.id, amount: 120, date: '2026-11-25' } as Partial<Transaction>));
    const rows = await service.findWithSpent(userId, '2026-11');
    expect(rows.find((b) => b.projectCategoryId)!.spent).toBeCloseTo(120, 2);
  });
});

describe('BudgetsService.history', () => {
  it('spending budgets and spend per month over the window, income and project budgets left out', async () => {
    const h = await service.history(userId, 2, new Date('2026-11-15T12:00:00Z'));
    expect(h).toEqual([
      { month: '2026-10', budget: 400, spent: 80 },
      { month: '2026-11', budget: 500, spent: 150.25 },
    ]);
  });
});
