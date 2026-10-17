import { describe, it, expect, beforeEach } from 'vitest';
import { DataSource } from 'typeorm';
import { User } from '../../users/user.entity';
import { BankAccount } from '../../bank-accounts/bank-account.entity';
import { Transaction } from '../../transactions/transaction.entity';
import { PlaidItem } from '../../plaid/plaid-item.entity';
import { Category } from '../../categories/category.entity';
import { Budget } from '../../budgets/budget.entity';
import { CategorizationRule } from '../../categorization-rules/categorization-rule.entity';
import { Project } from '../../projects/project.entity';
import { ProjectCategory } from '../../projects/project-category.entity';
import { BankAccountsService } from '../../bank-accounts/bank-accounts.service';
import { CategoriesService } from '../../categories/categories.service';
import { ProjectsService } from '../../projects/projects.service';
import { BudgetsService } from '../../budgets/budgets.service';
import { PlaidService } from '../../plaid/plaid.service';

/**
 * Request bodies are plain objects straight from the client. A service that
 * spreads or Object.assign()s one onto an entity lets the caller set any
 * column — including `id`, which makes save() UPDATE someone else's row and
 * hand it to the caller. Each case below is that attack.
 */
const ATTACKER = '11111111-1111-4111-8111-111111111111';
const VICTIM = '22222222-2222-4222-8222-222222222222';

let ds: DataSource;
let accounts: BankAccountsService;
let categories: CategoriesService;
let projects: ProjectsService;
let budgets: BudgetsService;

beforeEach(async () => {
  ds = new DataSource({
    type: 'better-sqlite3', database: ':memory:', dropSchema: true, synchronize: true,
    entities: [User, BankAccount, Transaction, PlaidItem, Category, Budget, CategorizationRule, Project, ProjectCategory],
  });
  await ds.initialize();
  await ds.getRepository(User).save([
    { id: ATTACKER, email: 'attacker@x.dev', name: 'A' },
    { id: VICTIM, email: 'victim@x.dev', name: 'V' },
  ]);
  const r = <T extends object>(e: new () => T) => ds.getRepository(e);
  accounts = new BankAccountsService(r(BankAccount), r(Transaction), r(PlaidItem), null as unknown as PlaidService);
  categories = new CategoriesService(r(Category), r(Transaction), r(Budget), r(CategorizationRule));
  projects = new ProjectsService(r(Project), r(ProjectCategory), r(Transaction));
  budgets = new BudgetsService(r(Budget), r(Transaction), r(Project), r(Category), r(ProjectCategory));
});

const body = (o: Record<string, unknown>) => o as any;

describe('bank accounts', () => {
  async function victimAccount() {
    return ds.getRepository(BankAccount).save({ userId: VICTIM, bankName: 'Victim Bank', accountName: 'Checking', balance: 5000 });
  }

  it('update ignores id, userId and Plaid-managed fields', async () => {
    const victim = await victimAccount();
    const mine = await accounts.create(ATTACKER, { bankName: 'Mine', accountName: 'Mine' });
    await accounts.update(mine.id, ATTACKER, body({ id: victim.id, userId: ATTACKER, bankName: 'Renamed', provider: 'plaid', plaidAccountId: 'acc_x' }));

    const v = await ds.getRepository(BankAccount).findOneByOrFail({ id: victim.id });
    expect(v).toMatchObject({ userId: VICTIM, bankName: 'Victim Bank' });
    const m = await ds.getRepository(BankAccount).findOneByOrFail({ id: mine.id });
    expect(m).toMatchObject({ userId: ATTACKER, bankName: 'Renamed', provider: 'manual', plaidAccountId: null });
  });

  it('create ignores a client-supplied id and userId', async () => {
    const victim = await victimAccount();
    const created = await accounts.create(ATTACKER, body({ id: victim.id, userId: VICTIM, bankName: 'X', accountName: 'Y' }));
    expect(created.id).not.toBe(victim.id);
    expect(created.userId).toBe(ATTACKER);
    expect(await ds.getRepository(BankAccount).findOneByOrFail({ id: victim.id })).toMatchObject({ userId: VICTIM, bankName: 'Victim Bank' });
  });
});

describe('categories', () => {
  async function victimCategory() {
    return ds.getRepository(Category).save({ userId: VICTIM, name: 'Victim Cat', icon: 'x', color: '#000' });
  }

  it('update ignores id, userId and isDefault', async () => {
    const victim = await victimCategory();
    const mine = await categories.create(ATTACKER, { name: 'Mine', icon: 'i', color: '#111' });
    await categories.update(mine.id, ATTACKER, body({ id: victim.id, userId: ATTACKER, name: 'Renamed', icon: 'i', color: '#111', isDefault: true }));

    expect(await ds.getRepository(Category).findOneByOrFail({ id: victim.id })).toMatchObject({ userId: VICTIM, name: 'Victim Cat' });
    expect(await ds.getRepository(Category).findOneByOrFail({ id: mine.id })).toMatchObject({ name: 'Renamed', isDefault: false });
  });

  it('create ignores a client-supplied id', async () => {
    const victim = await victimCategory();
    const created = await categories.create(ATTACKER, body({ id: victim.id, name: 'X', icon: 'i', color: '#111' }));
    expect(created.id).not.toBe(victim.id);
    expect(await ds.getRepository(Category).findOneByOrFail({ id: victim.id })).toMatchObject({ userId: VICTIM, name: 'Victim Cat' });
  });
});

describe('projects', () => {
  async function victimProject() {
    return ds.getRepository(Project).save({ userId: VICTIM, name: 'Victim Project', type: 'other', icon: '📦', purchasePrice: 0, status: 'active' });
  }

  it('update ignores id and userId', async () => {
    const victim = await victimProject();
    const mine = await projects.create(ATTACKER, { name: 'Mine' });
    await projects.update(mine.id, ATTACKER, body({ id: victim.id, userId: ATTACKER, name: 'Renamed' }));

    expect(await ds.getRepository(Project).findOneByOrFail({ id: victim.id })).toMatchObject({ userId: VICTIM, name: 'Victim Project' });
    expect(await ds.getRepository(Project).findOneByOrFail({ id: mine.id })).toMatchObject({ name: 'Renamed' });
  });

  it('create ignores a client-supplied id', async () => {
    const victim = await victimProject();
    const created = await projects.create(ATTACKER, body({ id: victim.id, name: 'X' }));
    expect(created.id).not.toBe(victim.id);
    expect(await ds.getRepository(Project).findOneByOrFail({ id: victim.id })).toMatchObject({ userId: VICTIM });
  });
});

describe('project categories', () => {
  async function victimProjectCategory() {
    return ds.getRepository(ProjectCategory).save({ userId: VICTIM, projectType: 'other', name: 'Victim PC' });
  }

  it('updateCategoryById ignores id, userId and projectType', async () => {
    const victim = await victimProjectCategory();
    const mine = await projects.createCategoryForType('other', ATTACKER, { name: 'Mine' });
    await projects.updateCategoryById(mine.id, ATTACKER, body({ id: victim.id, userId: ATTACKER, projectType: 'car', name: 'Renamed' }));

    expect(await ds.getRepository(ProjectCategory).findOneByOrFail({ id: victim.id })).toMatchObject({ userId: VICTIM, name: 'Victim PC' });
    expect(await ds.getRepository(ProjectCategory).findOneByOrFail({ id: mine.id })).toMatchObject({ name: 'Renamed', projectType: 'other' });
  });

  it('updateCategory ignores id and userId', async () => {
    const victim = await victimProjectCategory();
    const project = await projects.create(ATTACKER, { name: 'P' });
    const mine = await projects.createCategory(project.id, ATTACKER, { name: 'Mine' });
    await projects.updateCategory(project.id, mine.id, ATTACKER, body({ id: victim.id, userId: ATTACKER, name: 'Renamed' }));

    expect(await ds.getRepository(ProjectCategory).findOneByOrFail({ id: victim.id })).toMatchObject({ userId: VICTIM, name: 'Victim PC' });
  });

  it('createCategory and createCategoryForType ignore a client-supplied id', async () => {
    const victim = await victimProjectCategory();
    const project = await projects.create(ATTACKER, { name: 'P' });
    const a = await projects.createCategory(project.id, ATTACKER, body({ id: victim.id, name: 'A' }));
    const b = await projects.createCategoryForType('other', ATTACKER, body({ id: victim.id, name: 'B' }));
    expect([a.id, b.id]).not.toContain(victim.id);
    expect(await ds.getRepository(ProjectCategory).findOneByOrFail({ id: victim.id })).toMatchObject({ userId: VICTIM, name: 'Victim PC' });
  });
});

describe('budgets', () => {
  it('create ignores a client-supplied id', async () => {
    const victimCat = await ds.getRepository(Category).save({ userId: VICTIM, name: 'V', icon: 'x', color: '#000' });
    const victimBudget = await ds.getRepository(Budget).save({ userId: VICTIM, categoryId: victimCat.id, amount: 900, month: '2026-09', sourceMonth: '2026-09' });
    const myCat = await categories.create(ATTACKER, { name: 'Mine', icon: 'i', color: '#111' });

    await budgets.create(ATTACKER, body({ id: victimBudget.id, userId: VICTIM, categoryId: myCat.id, amount: 1, month: '2026-09' }));

    expect(await ds.getRepository(Budget).findOneByOrFail({ id: victimBudget.id })).toMatchObject({ userId: VICTIM, categoryId: victimCat.id });
    expect(Number((await ds.getRepository(Budget).findOneByOrFail({ id: victimBudget.id })).amount)).toBe(900);
    const mine = await ds.getRepository(Budget).findOneByOrFail({ userId: ATTACKER, categoryId: myCat.id });
    expect(mine.id).not.toBe(victimBudget.id);
  });
});
