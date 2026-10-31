# Trading Accounts — Phase A Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every account a trading project follows — Plaid-connected brokerages and prop-firm accounts the user is not connected to — a navigable unit with its own cash metrics, and let bank transactions on the project be attributed to one of those accounts.

**Architecture:** No new entity. A prop-firm account is a manual `investment` bank account the project follows through the existing `project_accounts` link, which gains trading metadata (kind, status, firm, size, dates). Transactions linked to the project gain `tradingAccountId`. The performance endpoint returns, per account, the engine summary plus `meta` and a `cash` block computed by a pure module from attributed rows, and a project-level `overview`. The web gains two levels inside a trading project (all accounts → one account) with the account in the URL.

**Tech Stack:** NestJS 11 + TypeORM (Postgres in prod, better-sqlite3 in tests), Next.js 16 / React 19 / Tailwind v4, Vitest.

**Spec:** `docs/superpowers/specs/2026-10-31-trading-accounts-design.md` (phase A sections 1, 2, 4, 5 cash + project metrics, 6, 7). Phase B (trade import, `closed_trade`, trade statistics) is a separate plan.

## Global Constraints

- Entities and migrations are imported explicitly (`apps/api/src/config/entities.ts`, `apps/api/src/migrations/index.ts`); no globs.
- `synchronize` is off; every entity change ships with a migration generated against the local DB (`npm run migration:generate -- <Name>`), listed in `migrations/index.ts`; `npm run migration:check` must exit 0 and `migrations/migrations.test.ts` must pass.
- Never spread a request body onto an entity; copy fields with `pickFields(dto, FIELDS)` or one by one.
- Every number the web shows comes from tested pure code (API `investments/*.ts`, web `lib/**`); components only render.
- Chart identity colours are green / sky / orange / amber / violet (`--color-card-*`), never `--color-primary` blue; money to the user is green, money from the user is rose, in fixed order with a legend.
- Theme variables only in components; no hard-coded theme colours (the `#4FBF7F`-style accents already used on the projects page are the documented chart accents).
- Tests: `npx vitest run --root apps/api <path>` and `npx vitest run --root apps/web <path>`; web tests only under paths listed in `apps/web/vitest.config.ts` `include` (add `src/lib/projects/**` is already there).
- Commit after every task; messages end with `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.
- Wording in the UI is English, plain, no jargon ("Money in", "Money out", "Net in pocket").

## Review Focus

1. **Replacing the project's account list from the edit form must not wipe metadata** — a user who edits the project name must keep "Topstep 50K #3 · Funded"; test in Task 2 (`replaceLinks keeps meta of links that stay`).
2. **A transaction can only be attributed to an account its own project follows** — assigning a Schwab row's account id to a transaction linked to a different project must 400; test in Task 3.
3. **Removing an account from the project must not delete the bank account and must clear attributions**, otherwise rows point at an account the project no longer follows; test in Task 2 and Task 3.
4. **Cash metrics with no payouts, no start date, or a status change back to evaluation** must not divide by zero or show negative days; tests in Task 4 (`roi null when nothing spent`, `daysToFirstPayout null without a payout`, `endedAt cleared when reopened` in Task 2).
5. **Deep link `?project=&account=` to an account that no longer exists** must fall back to level 1, not a blank page; handled in Task 7 (unknown ids ignored) and Task 8 (card list renders when `accountId` matches nothing).

---

### Task 1: Entity columns and migration

**Files:**
- Modify: `apps/api/src/projects/project-account.entity.ts`
- Modify: `apps/api/src/transactions/transaction.entity.ts` (after `projectCategoryId`, around line 89)
- Modify: `apps/api/src/projects/projects.service.ts:30` (`LinkedAccount`), `:140-148` (`toLinked`, `linkedAccounts`), `:205-209` (`linksByProject`)
- Create: `apps/api/src/migrations/<timestamp>-TradingAccounts.ts` (generated)
- Modify: `apps/api/src/migrations/index.ts`
- Test: `apps/api/src/migrations/migrations.test.ts` (existing, needs local Postgres), `apps/api/src/projects/projects.link-account.test.ts` (existing)

**Interfaces:**
- Produces: `TradingKind`, `TradingStatus`, `TRADING_KINDS`, `TRADING_STATUSES`, `TradingAccountMeta` exported from `project-account.entity.ts`; `ProjectAccount` columns `kind`, `status`, `firm`, `accountSize`, `startedAt`, `endedAt`, `notes`; `Transaction.tradingAccountId: string | null`; `LinkedAccount extends TradingAccountMeta`.

- [ ] **Step 1: Add the types and columns to `ProjectAccount`**

Append after the existing imports in `apps/api/src/projects/project-account.entity.ts`:

```ts
export type TradingKind = 'broker' | 'prop_firm';
export type TradingStatus = 'active' | 'evaluation' | 'funded' | 'failed' | 'closed';
export const TRADING_KINDS: readonly TradingKind[] = ['broker', 'prop_firm'] as const;
export const TRADING_STATUSES: readonly TradingStatus[] = ['active', 'evaluation', 'funded', 'failed', 'closed'] as const;

/** What the project knows about an account beyond the bank row: used by trading projects only. */
export interface TradingAccountMeta {
  kind: TradingKind;
  status: TradingStatus;
  firm: string | null;
  accountSize: number | null;
  startedAt: string | null;
  endedAt: string | null;
  notes: string | null;
}
```

Add the columns inside the class, before `createdAt`:

```ts
  /* ── Trading metadata (spec: trading-accounts-design §1) ── */
  /** 'broker' (a connected or manual brokerage) or 'prop_firm' (a combine / funded account). */
  @Column({ type: 'varchar', length: 16, default: 'broker' })
  kind: TradingKind;

  /** Brokers are 'active'; prop-firm accounts move evaluation → funded → closed, or → failed. */
  @Column({ type: 'varchar', length: 16, default: 'active' })
  status: TradingStatus;

  @Column({ type: 'varchar', length: 80, nullable: true })
  firm: string | null;

  @Column({ type: 'decimal', precision: 12, scale: 2, nullable: true })
  accountSize: number | null;

  @Column({ type: 'date', nullable: true })
  startedAt: string | null;

  @Column({ type: 'date', nullable: true })
  endedAt: string | null;

  @Column({ type: 'text', nullable: true })
  notes: string | null;
```

- [ ] **Step 2: Add `tradingAccountId` to `Transaction`**

In `apps/api/src/transactions/transaction.entity.ts`, after the `projectCategoryId` column (around line 89), add:

```ts
  /* Trading projects: which of the project's accounts this money belongs to — an
     evaluation paid from a card, a payout received in checking. Only set on rows
     that have a projectId; cleared when the row is unlinked or the account leaves
     the project. */
  @ManyToOne(() => BankAccount, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'tradingAccountId' })
  tradingAccount: BankAccount;

  @Column({ type: 'uuid', nullable: true })
  tradingAccountId: string | null;
```

- [ ] **Step 3: Carry the metadata on `LinkedAccount`**

In `apps/api/src/projects/projects.service.ts` replace the `LinkedAccount` interface (line 30) with:

```ts
import { ProjectAccount, TradingAccountMeta } from './project-account.entity';

export interface LinkedAccount extends TradingAccountMeta {
  id: string; bankName: string; accountName: string; accountType: string; provider: string;
}
```

(keep the existing `ProjectAccount` import; merge the two import lines). Replace `toLinked` and `linkedAccounts` (lines 140-148) with:

```ts
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
```

and in `findAllByUser` change `(linksByProject[l.projectId] ??= []).push(this.toLinked(l.bankAccount));` to `(linksByProject[l.projectId] ??= []).push(this.toLinked(l));`.

- [ ] **Step 4: Type-check and run the existing link tests**

Run: `npx tsc --noEmit -p apps/api/tsconfig.app.json && npx vitest run --root apps/api src/projects/projects.link-account.test.ts`
Expected: clean compile; 4 tests pass (the `toMatchObject` assertions ignore the new fields).

- [ ] **Step 5: Generate the migration against the local database**

Run, in order:

```bash
npm run migration:run                      # apply anything pending locally first
npm run migration:generate -- TradingAccounts
```

Expected: a new file `apps/api/src/migrations/<timestamp>-TradingAccounts.ts` whose `up()` contains `ALTER TABLE "project_accounts" ADD "kind"…` (7 columns), `ALTER TABLE "transactions" ADD "tradingAccountId" uuid` and `ADD CONSTRAINT "FK_…" FOREIGN KEY ("tradingAccountId") REFERENCES "bank_accounts"("id") ON DELETE SET NULL`. If it also tries to change unrelated columns, stop: the local DB is behind — run `npm run migration:run` again and regenerate.

- [ ] **Step 6: Register the migration**

In `apps/api/src/migrations/index.ts` add the import and append the class to `MIGRATIONS` (last position):

```ts
import { TradingAccounts<timestamp> } from './<timestamp>-TradingAccounts';
// …
export const MIGRATIONS = [/* existing */, InvestmentActivityFields1793296759537, TradingAccounts<timestamp>];
```

- [ ] **Step 7: Verify the schema check and migrations test**

Run: `npm run migration:check && npx vitest run --root apps/api src/migrations/migrations.test.ts`
Expected: check exits 0 ("No changes in database schema were found"); migrations test passes.

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/projects/project-account.entity.ts apps/api/src/transactions/transaction.entity.ts apps/api/src/projects/projects.service.ts apps/api/src/migrations
git commit -m "feat(projects): trading metadata on followed accounts and tradingAccountId on transactions

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 2: Manage a project's accounts: add manual, edit metadata, remove, keep metadata on replace

**Files:**
- Modify: `apps/api/src/projects/projects.service.ts` (`replaceLinks` at :152-167; new methods after `linkedAccounts`)
- Modify: `apps/api/src/projects/projects.controller.ts` (new routes after `update`)
- Create: `apps/api/src/projects/projects.trading-accounts.test.ts`

**Interfaces:**
- Consumes: `TradingKind`, `TradingStatus`, `TRADING_KINDS`, `TRADING_STATUSES`, `TradingAccountMeta`, `LinkedAccount` (Task 1).
- Produces:
  - `ProjectsService.addManualAccount(projectId, userId, dto: ManualAccountDto): Promise<LinkedAccount>`
  - `ProjectsService.updateAccountMeta(projectId, accountId, userId, patch: Partial<TradingAccountMeta>): Promise<LinkedAccount>`
  - `ProjectsService.removeAccount(projectId, accountId, userId): Promise<void>`
  - `export interface ManualAccountDto { name: string; firm: string; kind?: TradingKind; status?: TradingStatus; accountSize?: number | null; startedAt?: string | null; notes?: string | null }`
  - Routes: `POST /api/projects/:id/accounts`, `PATCH /api/projects/:id/accounts/:accountId`, `DELETE /api/projects/:id/accounts/:accountId`.

- [ ] **Step 1: Write the failing tests**

Create `apps/api/src/projects/projects.trading-accounts.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { DataSource } from 'typeorm';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { User } from '../users/user.entity';
import { Project } from './project.entity';
import { ProjectCategory } from './project-category.entity';
import { ProjectAccount } from './project-account.entity';
import { Transaction } from '../transactions/transaction.entity';
import { Category } from '../categories/category.entity';
import { BankAccount } from '../bank-accounts/bank-account.entity';
import { CategorizationRule } from '../categorization-rules/categorization-rule.entity';
import { ProjectsService } from './projects.service';

let ds: DataSource;
let service: ProjectsService;
let schwab: BankAccount;
let checking: BankAccount;

beforeEach(async () => {
  ds = new DataSource({
    type: 'better-sqlite3', database: ':memory:', dropSchema: true,
    entities: [User, Project, ProjectCategory, ProjectAccount, Transaction, Category, BankAccount, CategorizationRule],
    synchronize: true,
  });
  await ds.initialize();
  const users = ds.getRepository(User);
  await users.save(users.create({ id: 'u1', email: 'u1@example.com' }));
  await users.save(users.create({ id: 'u2', email: 'u2@example.com' }));
  const accounts = ds.getRepository(BankAccount);
  schwab = await accounts.save(accounts.create({ userId: 'u1', bankName: 'Charles Schwab', accountName: 'Individual', accountType: 'investment', balance: 1, provider: 'plaid' }));
  checking = await accounts.save(accounts.create({ userId: 'u1', bankName: 'Chase', accountName: 'Checking', accountType: 'checking', balance: 1 }));
  service = new ProjectsService(ds.getRepository(Project), ds.getRepository(ProjectCategory), ds.getRepository(Transaction), ds.getRepository(BankAccount), ds.getRepository(ProjectAccount));
});

describe('manual trading accounts', () => {
  it('creates a manual investment account and follows it with prop-firm defaults', async () => {
    const project = await service.create('u1', { name: 'Trading', type: 'trading' });
    const linked = await service.addManualAccount(project.id, 'u1', { name: '50K #1', firm: 'Topstep', accountSize: 50000, startedAt: '2026-10-01' });

    expect(linked).toMatchObject({ bankName: 'Topstep', accountName: '50K #1', accountType: 'investment', provider: 'manual', kind: 'prop_firm', status: 'evaluation', firm: 'Topstep', accountSize: 50000, startedAt: '2026-10-01', endedAt: null });
    const account = await ds.getRepository(BankAccount).findOneByOrFail({ id: linked.id });
    expect(account).toMatchObject({ userId: 'u1', accountType: 'investment', provider: 'manual' });
    expect((await service.findAllByUser('u1'))[0].accounts.map((a) => a.id)).toEqual([linked.id]);
  });

  it('refuses a manual account on a non-trading project, on another user\'s project, and without a name', async () => {
    const car = await service.create('u1', { name: 'Civic', type: 'vehicle' });
    await expect(service.addManualAccount(car.id, 'u1', { name: 'x', firm: 'Topstep' })).rejects.toBeInstanceOf(BadRequestException);
    const trading = await service.create('u1', { name: 'Trading', type: 'trading' });
    await expect(service.addManualAccount(trading.id, 'u2', { name: 'x', firm: 'Topstep' })).rejects.toThrow();
    await expect(service.addManualAccount(trading.id, 'u1', { name: '  ', firm: 'Topstep' })).rejects.toBeInstanceOf(BadRequestException);
    expect(await ds.getRepository(BankAccount).count()).toBe(2);
  });

  it('updates metadata; failed/closed set endedAt when empty and reopening clears it', async () => {
    const project = await service.create('u1', { name: 'Trading', type: 'trading' });
    const linked = await service.addManualAccount(project.id, 'u1', { name: '50K #1', firm: 'Topstep' });

    const funded = await service.updateAccountMeta(project.id, linked.id, 'u1', { status: 'funded', notes: 'passed on day 9' });
    expect(funded).toMatchObject({ status: 'funded', notes: 'passed on day 9', endedAt: null });

    const failed = await service.updateAccountMeta(project.id, linked.id, 'u1', { status: 'failed' });
    expect(failed.status).toBe('failed');
    expect(failed.endedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);

    const explicit = await service.updateAccountMeta(project.id, linked.id, 'u1', { status: 'closed', endedAt: '2026-10-20' });
    expect(explicit).toMatchObject({ status: 'closed', endedAt: '2026-10-20' });

    const reopened = await service.updateAccountMeta(project.id, linked.id, 'u1', { status: 'evaluation' });
    expect(reopened).toMatchObject({ status: 'evaluation', endedAt: null });
  });

  it('rejects an unknown status or kind, and an account the project does not follow', async () => {
    const project = await service.create('u1', { name: 'Trading', type: 'trading' });
    const linked = await service.addManualAccount(project.id, 'u1', { name: '50K #1', firm: 'Topstep' });
    await expect(service.updateAccountMeta(project.id, linked.id, 'u1', { status: 'rich' as never })).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.updateAccountMeta(project.id, linked.id, 'u1', { kind: 'hedge' as never })).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.updateAccountMeta(project.id, schwab.id, 'u1', { status: 'funded' })).rejects.toBeInstanceOf(NotFoundException);
  });

  it('removes an account from the project without deleting it', async () => {
    const project = await service.create('u1', { name: 'Trading', type: 'trading', bankAccountIds: [schwab.id] });
    await service.removeAccount(project.id, schwab.id, 'u1');
    expect((await service.findAllByUser('u1'))[0].accounts).toEqual([]);
    expect(await ds.getRepository(BankAccount).countBy({ id: schwab.id })).toBe(1);
    await expect(service.removeAccount(project.id, schwab.id, 'u1')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('replaceLinks keeps the metadata of links that stay and defaults new manual accounts to prop_firm', async () => {
    const project = await service.create('u1', { name: 'Trading', type: 'trading' });
    const topstep = await service.addManualAccount(project.id, 'u1', { name: '50K #1', firm: 'Topstep', status: 'funded' });
    const updated = await service.update(project.id, 'u1', { name: 'Renamed', bankAccountIds: [topstep.id, schwab.id] });
    expect(updated.accounts.map((a) => [a.id, a.kind, a.status])).toEqual([[topstep.id, 'prop_firm', 'funded'], [schwab.id, 'broker', 'active']]);

    const manual = await ds.getRepository(BankAccount).save(ds.getRepository(BankAccount).create({ userId: 'u1', bankName: 'Apex', accountName: '100K', accountType: 'investment', balance: 0, provider: 'manual' }));
    const again = await service.update(project.id, 'u1', { bankAccountIds: [topstep.id, manual.id] });
    expect(again.accounts.map((a) => [a.id, a.kind, a.status])).toEqual([[topstep.id, 'prop_firm', 'funded'], [manual.id, 'prop_firm', 'evaluation']]);
    expect(await ds.getRepository(ProjectAccount).count()).toBe(2);
  });

  it('rejects a checking account as a manual trading account', async () => {
    const project = await service.create('u1', { name: 'Trading', type: 'trading' });
    await expect(service.update(project.id, 'u1', { bankAccountIds: [checking.id] })).rejects.toBeInstanceOf(BadRequestException);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run --root apps/api src/projects/projects.trading-accounts.test.ts`
Expected: FAIL — `service.addManualAccount is not a function`.

- [ ] **Step 3: Implement the service methods**

In `apps/api/src/projects/projects.service.ts`, add to the imports: `import { ProjectAccount, TradingAccountMeta, TradingKind, TradingStatus, TRADING_KINDS, TRADING_STATUSES } from './project-account.entity';` and after `ProjectCategoryDto`:

```ts
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
```

Replace `replaceLinks` with a version that keeps existing links:

```ts
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
```

Add the new methods after `linkedAccounts`:

```ts
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
```

- [ ] **Step 4: Add the routes**

In `apps/api/src/projects/projects.controller.ts`, import `ManualAccountDto` and `TradingAccountMeta` (`import type { TradingAccountMeta } from './project-account.entity';`) and add after the `update` route:

```ts
  /* ── Followed accounts (trading projects) ── */

  @Post(':id/accounts')
  addManualAccount(@Param('id') id: string, @Request() req: any, @Body() dto: ManualAccountDto) {
    return this.service.addManualAccount(id, req.user.id, dto);
  }

  @Patch(':id/accounts/:accountId')
  updateAccountMeta(@Param('id') id: string, @Param('accountId') accountId: string, @Request() req: any, @Body() patch: Partial<TradingAccountMeta>) {
    return this.service.updateAccountMeta(id, accountId, req.user.id, patch);
  }

  @Delete(':id/accounts/:accountId')
  removeAccount(@Param('id') id: string, @Param('accountId') accountId: string, @Request() req: any) {
    return this.service.removeAccount(id, accountId, req.user.id);
  }
```

- [ ] **Step 5: Run the tests**

Run: `npx vitest run --root apps/api src/projects`
Expected: all pass, including the 7 new tests and the existing link-account suite.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/projects
git commit -m "feat(projects): add, edit and remove a trading project's accounts; replace keeps metadata

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 3: Attribute project transactions to an account

**Files:**
- Modify: `apps/api/src/projects/projects.service.ts` (`linkTransaction` :307-320, `unlinkTransaction` :330-336; new `assignTradingAccount`)
- Modify: `apps/api/src/projects/projects.controller.ts` (`linkTx` body type; new routes)
- Modify: `apps/api/src/projects/projects.trading-accounts.test.ts` (append)
- Modify: `docs/superpowers/specs/2026-10-31-trading-accounts-design.md` §2 (route names)

**Interfaces:**
- Produces: `ProjectsService.assignTradingAccount(projectId, userId, transactionIds: string[], accountId: string | null): Promise<{ updated: number }>`; `linkTransaction(projectId, txId, userId, projectCategoryId?, tradingAccountId?)`; routes `PATCH /api/projects/:id/tx/:txId/account { accountId: string | null }` and `PATCH /api/projects/:id/assign-account { transactionIds: string[]; accountId: string | null }`; `PATCH /api/projects/:id/link/:txId` body gains optional `tradingAccountId`.

- [ ] **Step 1: Append the failing tests**

Append to `apps/api/src/projects/projects.trading-accounts.test.ts`:

```ts
describe('attributing project transactions to an account', () => {
  async function setup() {
    const project = await service.create('u1', { name: 'Trading', type: 'trading' });
    const topstep = await service.addManualAccount(project.id, 'u1', { name: '50K #1', firm: 'Topstep' });
    const txs = ds.getRepository(Transaction);
    const evalFee = await txs.save(txs.create({ userId: 'u1', bankAccountId: checking.id, name: 'TOPSTEP COMBINE', amount: -149, date: '2026-10-01', projectId: project.id }));
    const payout = await txs.save(txs.create({ userId: 'u1', bankAccountId: checking.id, name: 'TOPSTEP PAYOUT', amount: 1000, date: '2026-10-20', projectId: project.id }));
    const unrelated = await txs.save(txs.create({ userId: 'u1', bankAccountId: checking.id, name: 'GROCERIES', amount: -40, date: '2026-10-02' }));
    return { project, topstep, evalFee, payout, unrelated, txs };
  }

  it('assigns one or many rows, and clears with null', async () => {
    const { project, topstep, evalFee, payout, txs } = await setup();
    expect(await service.assignTradingAccount(project.id, 'u1', [evalFee.id, payout.id], topstep.id)).toEqual({ updated: 2 });
    expect((await txs.findOneByOrFail({ id: payout.id })).tradingAccountId).toBe(topstep.id);
    expect(await service.assignTradingAccount(project.id, 'u1', [payout.id], null)).toEqual({ updated: 1 });
    expect((await txs.findOneByOrFail({ id: payout.id })).tradingAccountId).toBeNull();
    expect((await txs.findOneByOrFail({ id: evalFee.id })).tradingAccountId).toBe(topstep.id);
  });

  it('refuses an account the project does not follow, and rows that are not the project\'s', async () => {
    const { project, topstep, evalFee, unrelated } = await setup();
    await expect(service.assignTradingAccount(project.id, 'u1', [evalFee.id], schwab.id)).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.assignTradingAccount(project.id, 'u1', [unrelated.id], topstep.id)).rejects.toBeInstanceOf(BadRequestException);
    const other = await service.create('u1', { name: 'Other', type: 'trading' });
    await expect(service.assignTradingAccount(other.id, 'u1', [evalFee.id], topstep.id)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('links with an account in one call, and unlinking or removing the account clears it', async () => {
    const { project, topstep, unrelated, txs } = await setup();
    await service.linkTransaction(project.id, unrelated.id, 'u1', undefined, topstep.id);
    expect((await txs.findOneByOrFail({ id: unrelated.id }))).toMatchObject({ projectId: project.id, tradingAccountId: topstep.id });
    await service.unlinkTransaction(unrelated.id, 'u1');
    expect((await txs.findOneByOrFail({ id: unrelated.id }))).toMatchObject({ projectId: null, tradingAccountId: null });

    const again = await txs.save(txs.create({ userId: 'u1', bankAccountId: checking.id, name: 'RESET', amount: -99, date: '2026-10-05', projectId: project.id, tradingAccountId: topstep.id }));
    await service.removeAccount(project.id, topstep.id, 'u1');
    expect((await txs.findOneByOrFail({ id: again.id })).tradingAccountId).toBeNull();
  });

  it('linking with an account the project does not follow fails before anything is saved', async () => {
    const { project, unrelated, txs } = await setup();
    await expect(service.linkTransaction(project.id, unrelated.id, 'u1', undefined, schwab.id)).rejects.toBeInstanceOf(BadRequestException);
    expect((await txs.findOneByOrFail({ id: unrelated.id })).projectId).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run --root apps/api src/projects/projects.trading-accounts.test.ts`
Expected: FAIL — `service.assignTradingAccount is not a function`.

- [ ] **Step 3: Implement**

In `projects.service.ts` replace `linkTransaction` and `unlinkTransaction`, and add `assignTradingAccount`:

```ts
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

  async unlinkTransaction(txId: string, userId: string): Promise<void> {
    const tx = await this.txRepo.findOneBy({ id: txId, userId });
    if (!tx) throw new NotFoundException();
    tx.projectId = null;
    tx.projectCategoryId = null;
    tx.tradingAccountId = null;
    await this.txRepo.save(tx);
  }
```

In the controller change `linkTx`'s body type to `{ projectCategoryId?: string; tradingAccountId?: string | null }` and pass `body.tradingAccountId`; add after `assignTxCategory`:

```ts
  @Patch(':id/tx/:txId/account')
  assignTxAccount(@Param('id') id: string, @Param('txId') txId: string, @Request() req: any, @Body() body: { accountId: string | null }) {
    return this.service.assignTradingAccount(id, req.user.id, [txId], body.accountId ?? null);
  }

  @Patch(':id/assign-account')
  assignAccount(@Param('id') id: string, @Request() req: any, @Body() body: { transactionIds: string[]; accountId: string | null }) {
    return this.service.assignTradingAccount(id, req.user.id, body.transactionIds ?? [], body.accountId ?? null);
  }
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run --root apps/api src/projects && npx tsc --noEmit -p apps/api/tsconfig.app.json`
Expected: all pass; clean compile.

- [ ] **Step 5: Align the spec's route names**

In `docs/superpowers/specs/2026-10-31-trading-accounts-design.md` §2 replace the two route bullets with:

```
- `PATCH /api/projects/:id/tx/:txId/account { accountId | null }` — single row
  (mirrors the category assignment route); the account must be followed by the
  project.
- `PATCH /api/projects/:id/assign-account { transactionIds[], accountId }` —
  bulk, same validation. `PATCH /api/projects/:id/link/:txId` accepts an
  optional `tradingAccountId` so the picker can link and attribute in one call.
```

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/projects docs/superpowers/specs/2026-10-31-trading-accounts-design.md
git commit -m "feat(projects): attribute linked transactions to a followed account

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 4: Pure cash metrics for prop-firm accounts and the project overview

**Files:**
- Create: `apps/api/src/investments/trading-cash.ts`
- Create: `apps/api/src/investments/trading-cash.test.ts`

**Interfaces:**
- Consumes: `PerformanceSummary` (`performance.ts`), `TradingAccountMeta`, `TradingStatus` (Task 1), `classifyActivity`, `ActivityRow`.
- Produces:

```ts
export interface CashCategory { id: string; name: string; icon: string; color: string }
export interface CashRow { id: string; date: string; name: string; amount: number; category: CashCategory | null }
export interface MonthFlow { month: string; in: number; out: number }
export interface CashSummary {
  spent: number;
  spentByCategory: (CashCategory & { total: number; count: number })[];
  payouts: { count: number; total: number; avg: number | null; largest: number; last: string | null };
  netCash: number; roi: number | null; costPerPayout: number | null;
  daysToFirstPayout: number | null; daysActive: number | null;
  byMonth: MonthFlow[];
  rows: CashRow[];
}
export interface TradingOverview {
  tradingPnl: number; moneyIn: number; moneyOut: number; netInPocket: number;
  accountsByStatus: Record<TradingStatus, number>;
  funded: number; evaluated: number; passRate: number | null;
  costOfFailed: number; payoutsPerAccount: number | null;
  byMonth: MonthFlow[];
}
export function monthKeys(today: string, n: number): string[]
export function brokerCashByMonth(rows: Pick<ActivityRow, 'date' | 'amount' | 'type' | 'subtype' | 'quantity' | 'symbol'>[], today: string, n?: number): MonthFlow[]
export function cashSummary(rows: CashRow[], meta: Pick<TradingAccountMeta, 'startedAt' | 'endedAt'>, today: string): CashSummary
export function tradingOverview(parts: { meta: TradingAccountMeta; summary: PerformanceSummary; cashByMonth: MonthFlow[]; cash: CashSummary | null }[], today: string): TradingOverview
```

`in` = money from the user (spent, deposits), `out` = money to the user (payouts, withdrawals). `CashRow.amount` is Cofre sign (negative = spent).

- [ ] **Step 1: Write the failing tests**

Create `apps/api/src/investments/trading-cash.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { cashSummary, tradingOverview, monthKeys, brokerCashByMonth, type CashRow } from './trading-cash';
import { computePerformance } from './performance';
import type { TradingAccountMeta } from '../projects/project-account.entity';

const evals = { id: 'c1', name: 'Prop Firm Evals', icon: '🏦', color: '#4BA8D8' };
const payoutsCat = { id: 'c2', name: 'Prop Firm Payouts', icon: '💵', color: '#4FBF7F' };
const row = (id: string, date: string, amount: number, category = amount < 0 ? evals : payoutsCat): CashRow => ({ id, date, name: id, amount, category });
const today = '2026-10-31';
const meta = (over: Partial<TradingAccountMeta> = {}): TradingAccountMeta => ({ kind: 'prop_firm', status: 'funded', firm: 'Topstep', accountSize: 50000, startedAt: '2026-08-01', endedAt: null, notes: null, ...over });

describe('monthKeys', () => {
  it('gives the trailing n months ending with today\'s month, oldest first', () => {
    expect(monthKeys('2026-02-10', 3)).toEqual(['2025-12', '2026-01', '2026-02']);
  });
});

describe('cashSummary', () => {
  const rows = [row('eval', '2026-08-03', -149), row('reset', '2026-08-20', -99), row('p1', '2026-09-15', 500), row('p2', '2026-10-10', 1250)];

  it('splits spent and payouts, nets them, and derives ROI, cost per payout and timing', () => {
    const s = cashSummary(rows, meta(), today);
    expect(s.spent).toBe(248);
    expect(s.spentByCategory).toEqual([{ ...evals, total: 248, count: 2 }]);
    expect(s.payouts).toEqual({ count: 2, total: 1750, avg: 875, largest: 1250, last: '2026-10-10' });
    expect(s.netCash).toBe(1502);
    expect(s.roi).toBe(605.6);           // 1502 / 248 × 100, one decimal
    expect(s.costPerPayout).toBe(124);
    expect(s.daysToFirstPayout).toBe(45); // Aug 1 → Sep 15
    expect(s.daysActive).toBe(91);        // Aug 1 → Oct 31
    expect(s.rows.map((r) => r.id)).toEqual(['p2', 'p1', 'reset', 'eval']);
  });

  it('fills every trailing month, in and out', () => {
    const s = cashSummary(rows, meta(), today);
    expect(s.byMonth.slice(-4)).toEqual([
      { month: '2026-07', in: 0, out: 0 },
      { month: '2026-08', in: 248, out: 0 },
      { month: '2026-09', in: 0, out: 500 },
      { month: '2026-10', in: 0, out: 1250 },
    ]);
    expect(s.byMonth).toHaveLength(12);
  });

  it('roi is null when nothing was spent, timing is null without a payout or a start', () => {
    const onlyPayout = cashSummary([row('p', '2026-10-01', 300)], meta({ startedAt: null }), today);
    expect(onlyPayout).toMatchObject({ spent: 0, roi: null, costPerPayout: null, daysToFirstPayout: 0, daysActive: 30 });
    const onlyEval = cashSummary([row('e', '2026-10-01', -149)], meta({ startedAt: null }), today);
    expect(onlyEval).toMatchObject({ payouts: { count: 0, total: 0, avg: null, largest: 0, last: null }, daysToFirstPayout: null, roi: -100 });
    expect(cashSummary([], meta({ startedAt: null }), today)).toMatchObject({ daysActive: null, daysToFirstPayout: null, netCash: 0 });
  });

  it('days active stop at endedAt, and a payout before the start never goes negative', () => {
    const s = cashSummary([row('p', '2026-07-20', 100)], meta({ startedAt: '2026-08-01', endedAt: '2026-09-01' }), today);
    expect(s.daysActive).toBe(31);
    expect(s.daysToFirstPayout).toBe(0);
  });

  it('rows without a category land in an "Uncategorized" bucket', () => {
    const s = cashSummary([{ id: 'x', date: '2026-10-01', name: 'FEE', amount: -50, category: null }], meta(), today);
    expect(s.spentByCategory).toEqual([{ id: 'uncat', name: 'Uncategorized', icon: '·', color: '#6B6B8A', total: 50, count: 1 }]);
  });
});

describe('brokerCashByMonth', () => {
  it('buckets contributions as in and withdrawals as out', () => {
    const m = brokerCashByMonth([
      { date: '2026-09-01', amount: 5000, type: 'cash', subtype: 'deposit', quantity: null, symbol: null },
      { date: '2026-10-05', amount: -900, type: 'cash', subtype: 'withdrawal', quantity: null, symbol: null },
      { date: '2026-10-12', amount: -2401.2, type: 'buy', subtype: 'buy', quantity: 10, symbol: 'VTI' },
    ], today, 3);
    expect(m).toEqual([{ month: '2026-08', in: 0, out: 0 }, { month: '2026-09', in: 5000, out: 0 }, { month: '2026-10', in: 0, out: 900 }]);
  });
});

describe('tradingOverview', () => {
  const broker = computePerformance([
    { date: '2026-09-01', amount: 5000, type: 'cash', subtype: 'deposit', symbol: null, securityName: null, quantity: null, price: null, fees: null, name: 'DEP' },
    { date: '2026-10-12', amount: -1000, type: 'buy', subtype: 'buy', symbol: 'VTI', securityName: null, quantity: 10, price: 100, fees: null, name: 'BUY' },
    { date: '2026-10-20', amount: 1200, type: 'sell', subtype: 'sell', symbol: 'VTI', securityName: null, quantity: -10, price: 120, fees: null, name: 'SELL' },
    { date: '2026-10-25', amount: -300, type: 'cash', subtype: 'withdrawal', symbol: null, securityName: null, quantity: null, price: null, fees: null, name: 'WD' },
  ]);
  const empty = computePerformance([]);
  const topstepCash = cashSummary([row('e', '2026-08-03', -149), row('p', '2026-09-15', 500)], meta(), today);
  const failedCash = cashSummary([row('e2', '2026-09-03', -149)], meta({ status: 'failed', endedAt: '2026-09-20' }), today);

  const parts = [
    { meta: meta({ kind: 'broker', status: 'active', firm: null }), summary: broker, cashByMonth: brokerCashByMonth([], today), cash: null },
    { meta: meta(), summary: empty, cashByMonth: [], cash: topstepCash },
    { meta: meta({ status: 'failed' }), summary: empty, cashByMonth: [], cash: failedCash },
    { meta: meta({ status: 'evaluation' }), summary: empty, cashByMonth: [], cash: cashSummary([], meta({ status: 'evaluation' }), today) },
  ];

  it('adds brokers and prop firms into money in / out and counts accounts by status', () => {
    const o = tradingOverview(parts, today);
    expect(o.tradingPnl).toBe(200);
    expect(o.moneyIn).toBe(5298);     // 5000 deposit + 149 + 149
    expect(o.moneyOut).toBe(800);     // 300 withdrawal + 500 payout
    expect(o.netInPocket).toBe(-4498);
    expect(o.accountsByStatus).toEqual({ active: 1, evaluation: 1, funded: 1, failed: 1, closed: 0 });
  });

  it('pass rate counts prop-firm accounts that left evaluation; failed cost and payouts per account', () => {
    const o = tradingOverview(parts, today);
    expect(o.funded).toBe(1);
    expect(o.evaluated).toBe(2);       // funded + failed; the one still evaluating is not decided
    expect(o.passRate).toBe(50);
    expect(o.costOfFailed).toBe(149);
    expect(o.payoutsPerAccount).toBe(0.33); // 1 payout ÷ 3 prop-firm accounts
    expect(tradingOverview([parts[0]], today)).toMatchObject({ passRate: null, payoutsPerAccount: null, costOfFailed: 0 });
  });

  it('merges money in / out by month across kinds', () => {
    const o = tradingOverview([
      { ...parts[0], cashByMonth: brokerCashByMonth([{ date: '2026-09-01', amount: 5000, type: 'cash', subtype: 'deposit', quantity: null, symbol: null }], today) },
      parts[1],
    ], today);
    expect(o.byMonth.find((m) => m.month === '2026-09')).toEqual({ month: '2026-09', in: 5000, out: 500 });
    expect(o.byMonth.find((m) => m.month === '2026-08')).toEqual({ month: '2026-08', in: 149, out: 0 });
    expect(o.byMonth).toHaveLength(12);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run --root apps/api src/investments/trading-cash.test.ts`
Expected: FAIL — cannot find module `./trading-cash`.

- [ ] **Step 3: Implement `trading-cash.ts`**

```ts
/* Cash metrics for a trading project's accounts. Pure: no I/O, `today` is passed
   in. A prop-firm account the user is not connected to has no trade rows of its
   own; what Cofre knows is the money the user attributed to it from other
   accounts (evaluations and resets paid, payouts received). Spec:
   docs/superpowers/specs/2026-10-31-trading-accounts-design.md §5 */

import { classifyActivity, type ActivityRow, type PerformanceSummary } from './performance';
import type { TradingAccountMeta, TradingStatus } from '../projects/project-account.entity';

export interface CashCategory { id: string; name: string; icon: string; color: string }
/** A project transaction attributed to the account. Cofre sign: negative = money the user spent. */
export interface CashRow { id: string; date: string; name: string; amount: number; category: CashCategory | null }
/** `in` = money from the user (spent, deposited); `out` = money to the user (payouts, withdrawals). */
export interface MonthFlow { month: string; in: number; out: number }

export interface CashSummary {
  spent: number;
  spentByCategory: (CashCategory & { total: number; count: number })[];
  payouts: { count: number; total: number; avg: number | null; largest: number; last: string | null };
  netCash: number;
  /** netCash ÷ spent × 100, one decimal; null when nothing was spent. */
  roi: number | null;
  costPerPayout: number | null;
  daysToFirstPayout: number | null;
  daysActive: number | null;
  byMonth: MonthFlow[];
  /** Newest first, capped at 50. */
  rows: CashRow[];
}

export interface TradingOverview {
  tradingPnl: number;
  moneyIn: number;
  moneyOut: number;
  netInPocket: number;
  accountsByStatus: Record<TradingStatus, number>;
  funded: number;
  evaluated: number;
  passRate: number | null;
  costOfFailed: number;
  payoutsPerAccount: number | null;
  byMonth: MonthFlow[];
}

const UNCAT: CashCategory = { id: 'uncat', name: 'Uncategorized', icon: '·', color: '#6B6B8A' };
const cents = (n: number) => Math.round(n * 100) / 100 + 0;
const pct1 = (n: number) => Math.round(n * 10) / 10;
const dayMs = 86_400_000;
const daysBetween = (from: string, to: string) => Math.max(0, Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / dayMs));

export function monthKeys(today: string, n: number): string[] {
  const [y, m] = today.slice(0, 7).split('-').map(Number);
  const keys: string[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(y, m - 1 - i, 1));
    keys.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`);
  }
  return keys;
}

function emptyMonths(today: string, n: number): MonthFlow[] {
  return monthKeys(today, n).map((month) => ({ month, in: 0, out: 0 }));
}

function addFlow(months: MonthFlow[], date: string, inAmt: number, outAmt: number): void {
  const m = months.find((x) => x.month === date.slice(0, 7));
  if (!m) return;
  m.in = cents(m.in + inAmt);
  m.out = cents(m.out + outAmt);
}

/** A connected broker's deposits and withdrawals by month, from its raw rows. */
export function brokerCashByMonth(rows: Pick<ActivityRow, 'date' | 'amount' | 'type' | 'subtype' | 'quantity' | 'symbol'>[], today: string, n = 12): MonthFlow[] {
  const months = emptyMonths(today, n);
  for (const r of rows) {
    const kind = classifyActivity(r);
    if (kind === 'contribution') addFlow(months, r.date, Math.abs(Number(r.amount) || 0), 0);
    else if (kind === 'withdrawal') addFlow(months, r.date, 0, Math.abs(Number(r.amount) || 0));
  }
  return months;
}

export function cashSummary(rows: CashRow[], meta: Pick<TradingAccountMeta, 'startedAt' | 'endedAt'>, today: string): CashSummary {
  const sorted = [...rows].sort((a, b) => a.date.localeCompare(b.date));
  const byCat = new Map<string, CashCategory & { total: number; count: number }>();
  const payouts: CashRow[] = [];
  let spent = 0;
  const months = emptyMonths(today, 12);

  for (const r of sorted) {
    const amt = Number(r.amount) || 0;
    if (amt < 0) {
      const cat = r.category ?? UNCAT;
      const cur = byCat.get(cat.id) ?? { ...cat, total: 0, count: 0 };
      cur.total = cents(cur.total + Math.abs(amt)); cur.count += 1;
      byCat.set(cat.id, cur);
      spent += Math.abs(amt);
      addFlow(months, r.date, Math.abs(amt), 0);
    } else if (amt > 0) {
      payouts.push(r);
      addFlow(months, r.date, 0, amt);
    }
  }

  const payoutTotal = cents(payouts.reduce((s, r) => s + Number(r.amount), 0));
  const netCash = cents(payoutTotal - spent);
  const start = meta.startedAt ?? sorted[0]?.date ?? null;
  const end = meta.endedAt ?? today;
  const firstPayout = payouts[0]?.date ?? null;

  return {
    spent: cents(spent),
    spentByCategory: [...byCat.values()].sort((a, b) => b.total - a.total),
    payouts: {
      count: payouts.length,
      total: payoutTotal,
      avg: payouts.length ? cents(payoutTotal / payouts.length) : null,
      largest: cents(payouts.reduce((m, r) => Math.max(m, Number(r.amount)), 0)),
      last: payouts.length ? payouts[payouts.length - 1].date : null,
    },
    netCash,
    roi: spent > 0 ? pct1((netCash / spent) * 100) : null,
    costPerPayout: payouts.length && spent > 0 ? cents(spent / payouts.length) : null,
    daysToFirstPayout: firstPayout && start ? daysBetween(start, firstPayout) : null,
    daysActive: start ? daysBetween(start, end) : null,
    byMonth: months,
    rows: [...sorted].reverse().slice(0, 50),
  };
}

export function tradingOverview(
  parts: { meta: TradingAccountMeta; summary: PerformanceSummary; cashByMonth: MonthFlow[]; cash: CashSummary | null }[],
  today: string,
): TradingOverview {
  const accountsByStatus: Record<TradingStatus, number> = { active: 0, evaluation: 0, funded: 0, failed: 0, closed: 0 };
  const months = emptyMonths(today, 12);
  let tradingPnl = 0, moneyIn = 0, moneyOut = 0, costOfFailed = 0, payoutCount = 0, propAccounts = 0, funded = 0, failed = 0;

  for (const p of parts) {
    accountsByStatus[p.meta.status] += 1;
    tradingPnl += p.summary.netResult;
    moneyIn += p.summary.contributions;
    moneyOut += p.summary.withdrawals;
    for (const m of p.cashByMonth) addFlow(months, `${m.month}-01`, m.in, m.out);
    if (p.meta.kind === 'prop_firm') {
      propAccounts += 1;
      if (p.meta.status === 'funded' || p.meta.status === 'closed') funded += 1;
      if (p.meta.status === 'failed') failed += 1;
    }
    if (p.cash) {
      moneyIn += p.cash.spent;
      moneyOut += p.cash.payouts.total;
      payoutCount += p.cash.payouts.count;
      if (p.meta.status === 'failed') costOfFailed += p.cash.spent;
      for (const m of p.cash.byMonth) addFlow(months, `${m.month}-01`, m.in, m.out);
    }
  }

  const evaluated = funded + failed;
  return {
    tradingPnl: cents(tradingPnl),
    moneyIn: cents(moneyIn),
    moneyOut: cents(moneyOut),
    netInPocket: cents(moneyOut - moneyIn),
    accountsByStatus,
    funded, evaluated,
    passRate: evaluated ? pct1((funded / evaluated) * 100) : null,
    costOfFailed: cents(costOfFailed),
    payoutsPerAccount: propAccounts ? cents(payoutCount / propAccounts) : null,
    byMonth: months,
  };
}
```

Note on `funded`: a `closed` prop-firm account counts as having passed (it was funded and later closed); only `failed` counts as not passed. The test's `evaluated` of 2 = funded + failed.

- [ ] **Step 4: Run the tests**

Run: `npx vitest run --root apps/api src/investments/trading-cash.test.ts`
Expected: all pass. If `roi` differs by rounding, check `pct1` (one decimal) — 1502/248×100 = 605.645… → 605.6.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/investments/trading-cash.ts apps/api/src/investments/trading-cash.test.ts
git commit -m "feat(investments): pure cash metrics for prop-firm accounts and the trading project overview

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 5: Performance endpoint returns meta, cash and the overview

**Files:**
- Modify: `apps/api/src/investments/investments.service.ts`
- Modify: `apps/api/src/investments/investments.module.ts` (add `ProjectCategory` to `forFeature` if not present — check the file)
- Modify: `apps/api/src/investments/investments.service.test.ts` (append)

**Interfaces:**
- Consumes: Task 1 `LinkedAccount` fields on `ProjectAccount`; Task 4 functions.
- Produces:

```ts
export interface AccountMeta extends TradingAccountMeta { provider: string }
export type AccountPerformance = PerformanceSummary & { account: AccountRef; meta: AccountMeta; cash: CashSummary | null; cashByMonth: MonthFlow[] };
export interface ProjectPerformance {
  project: { id: string; name: string };
  accounts: AccountPerformance[];
  combined: PerformanceSummary;
  overview: TradingOverview;
  /** Project transactions with no account attributed. */
  unassigned: number;
}
```

`GET /api/investments/performance?projectId=` returns that; `?accountId=` returns `AccountPerformance` with `meta`/`cash` for the account's link if any (`cash` null when the account feeds no project).

- [ ] **Step 1: Append the failing tests**

Append to `apps/api/src/investments/investments.service.test.ts` (inside the file's existing setup — `project`, `schwab`, `futures` exist; add a `ProjectCategory` and a Topstep manual account in the test itself):

```ts
describe('performanceForProject: accounts carry meta, cash and the overview', () => {
  it('returns cash metrics for a prop-firm account from its attributed transactions and an overview across kinds', async () => {
    const accounts = ds.getRepository(BankAccount);
    const topstep = await accounts.save(accounts.create({ userId: 'u1', bankName: 'Topstep', accountName: '50K #1', accountType: 'investment', balance: 0, provider: 'manual' }));
    const links = ds.getRepository(ProjectAccount);
    await links.save(links.create({ userId: 'u1', projectId: project.id, bankAccountId: topstep.id, kind: 'prop_firm', status: 'funded', firm: 'Topstep', accountSize: 50000, startedAt: '2026-08-01' }));
    const cats = ds.getRepository(ProjectCategory);
    const evals = await cats.save(cats.create({ userId: 'u1', projectType: 'trading', name: 'Prop Firm Evals', icon: '🏦', color: '#4BA8D8', type: 'expense', order: 0 }));
    const checking = await accounts.save(accounts.create({ userId: 'u1', bankName: 'Chase', accountName: 'Checking', accountType: 'checking', balance: 0 }));
    const tx = ds.getRepository(Transaction);
    await tx.save(tx.create({ userId: 'u1', bankAccountId: checking.id, name: 'TOPSTEP COMBINE', amount: -149, date: '2026-08-03', projectId: project.id, projectCategoryId: evals.id, tradingAccountId: topstep.id }));
    await tx.save(tx.create({ userId: 'u1', bankAccountId: checking.id, name: 'TOPSTEP PAYOUT', amount: 500, date: '2026-09-15', projectId: project.id, tradingAccountId: topstep.id }));
    await tx.save(tx.create({ userId: 'u1', bankAccountId: checking.id, name: 'UNASSIGNED FEE', amount: -20, date: '2026-09-16', projectId: project.id }));

    const p = await service.performanceForProject('u1', project.id);
    const ts = p.accounts.find((a) => a.account.id === topstep.id)!;
    expect(ts.meta).toMatchObject({ kind: 'prop_firm', status: 'funded', firm: 'Topstep', accountSize: 50000, provider: 'manual' });
    expect(ts.cash).toMatchObject({ spent: 149, netCash: 351, payouts: { count: 1, total: 500 } });
    expect(ts.cash!.spentByCategory[0]).toMatchObject({ id: evals.id, name: 'Prop Firm Evals', total: 149 });
    expect(ts.cash!.rows.map((r) => r.name)).toEqual(['TOPSTEP PAYOUT', 'TOPSTEP COMBINE']);
    expect(ts.trades.total).toBe(0);

    const sw = p.accounts.find((a) => a.account.id === schwab.id)!;
    expect(sw.meta).toMatchObject({ kind: 'broker', status: 'active', provider: 'plaid' });
    expect(sw.cash).toBeNull();
    expect(sw.cashByMonth.find((m) => m.month === '2026-09')).toEqual({ month: '2026-09', in: 5000, out: 0 });

    expect(p.overview).toMatchObject({ moneyIn: 5149, moneyOut: 500, accountsByStatus: { active: 2, funded: 1, evaluation: 0, failed: 0, closed: 0 }, passRate: 100 });
    expect(p.unassigned).toBe(1);
    expect(p.combined.realizedPnl).toBe(sw.realizedPnl + p.accounts.find((a) => a.account.id === futures.id)!.realizedPnl);
  });

  it('performance(accountId) carries meta and cash when the account feeds a project, null otherwise', async () => {
    const one = await service.performance('u1', schwab.id);
    expect(one.meta).toMatchObject({ kind: 'broker', status: 'active' });
    expect(one.cash).toBeNull();
    const accounts = ds.getRepository(BankAccount);
    const loose = await accounts.save(accounts.create({ userId: 'u1', bankName: 'Webull', accountName: 'Margin', accountType: 'investment', balance: 0 }));
    const noProject = await service.performance('u1', loose.id);
    expect(noProject.meta).toMatchObject({ kind: 'broker', status: 'active', firm: null });
    expect(noProject.cash).toBeNull();
  });
});
```

Add `ProjectCategory` to the test file's imports if missing (it is already imported in the setup shown above). Note the test's existing `schwab` seed has a 2026-09-01 deposit of 5000 (`cash/deposit`), which is what `cashByMonth` and `moneyIn` read.

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run --root apps/api src/investments/investments.service.test.ts`
Expected: FAIL — `ts.meta` undefined / `p.overview` undefined.

- [ ] **Step 3: Implement**

Rewrite `apps/api/src/investments/investments.service.ts`:

```ts
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
```

Check `apps/api/src/investments/investments.module.ts`: `TypeOrmModule.forFeature` must list `Transaction, BankAccount, Project, ProjectAccount` (it does today); `projectCategoryRef` is a relation on `Transaction`, so no new repository is needed.

- [ ] **Step 4: Run the tests and type-check**

Run: `npx vitest run --root apps/api src/investments && npx tsc --noEmit -p apps/api/tsconfig.app.json`
Expected: all pass; clean compile. The existing `performanceForProject` test's `toEqual` on the whole object (if any) must be updated to `toMatchObject` for the fields it checks — the new keys `meta`, `cash`, `cashByMonth`, `overview`, `unassigned` are additive.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/investments
git commit -m "feat(investments): performance returns account metadata, prop-firm cash metrics and the project overview

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 6: Web pure helpers for trading accounts

**Files:**
- Create: `apps/web/src/lib/projects/trading.ts`
- Create: `apps/web/src/lib/projects/trading.test.ts`

**Interfaces:**
- Consumes: the API shapes from Task 5 (mirrored as local types — the web never imports from `apps/api`).
- Produces:

```ts
export type TradingKind = 'broker' | 'prop_firm';
export type TradingStatus = 'active' | 'evaluation' | 'funded' | 'failed' | 'closed';
export interface AccountMeta { kind: TradingKind; status: TradingStatus; firm: string | null; accountSize: number | null; startedAt: string | null; endedAt: string | null; notes: string | null; provider: string }
export interface MonthFlow { month: string; in: number; out: number }
export interface CashSummary { spent: number; spentByCategory: { id: string; name: string; icon: string; color: string; total: number; count: number }[]; payouts: { count: number; total: number; avg: number | null; largest: number; last: string | null }; netCash: number; roi: number | null; costPerPayout: number | null; daysToFirstPayout: number | null; daysActive: number | null; byMonth: MonthFlow[]; rows: { id: string; date: string; name: string; amount: number; category: { id: string; name: string; icon: string; color: string } | null }[] }
export interface AccountSummaryLite { account: { id: string; bankName: string; accountName: string }; meta: AccountMeta; cash: CashSummary | null; realizedPnl: number; netResult: number; trades: { closed: number; winRate: number | null }; byMonth: { month: string; realized: number }[]; to: string | null }
export const STATUS_LABEL: Record<TradingStatus, string>
export const KIND_LABEL: Record<TradingKind, string>
export function statusTone(s: TradingStatus): 'up' | 'down' | 'flat' | 'muted'
export function accountTitle(a: AccountSummaryLite): string              // "Topstep · 50K #1" / "Charles Schwab · Individual"
export function accountFigures(a: AccountSummaryLite): Figure[]           // three per card (Figure from ./overview)
export function accountSparkline(a: AccountSummaryLite, months: string[]): number[]  // cumulative, 6 months
export function sortAccounts<T extends { meta: AccountMeta }>(list: T[]): T[]
export function lastActivity(a: AccountSummaryLite): string | null
export function openPropAccount(accounts: { id: string; kind?: TradingKind; status?: TradingStatus }[]): string | null  // the one to pre-select when linking
```

- [ ] **Step 1: Write the failing tests**

Create `apps/web/src/lib/projects/trading.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { accountFigures, accountSparkline, accountTitle, lastActivity, openPropAccount, sortAccounts, statusTone, STATUS_LABEL, type AccountSummaryLite, type AccountMeta } from './trading';

const meta = (over: Partial<AccountMeta> = {}): AccountMeta => ({ kind: 'prop_firm', status: 'funded', firm: 'Topstep', accountSize: 50000, startedAt: '2026-08-01', endedAt: null, notes: null, provider: 'manual', ...over });
const cash = { spent: 248, spentByCategory: [], payouts: { count: 2, total: 1750, avg: 875, largest: 1250, last: '2026-10-10' }, netCash: 1502, roi: 605.6, costPerPayout: 124, daysToFirstPayout: 45, daysActive: 91,
  byMonth: [{ month: '2026-08', in: 248, out: 0 }, { month: '2026-09', in: 0, out: 500 }, { month: '2026-10', in: 0, out: 1250 }], rows: [{ id: 'p', date: '2026-10-10', name: 'PAYOUT', amount: 1250, category: null }] };
const prop: AccountSummaryLite = { account: { id: 't1', bankName: 'Topstep', accountName: '50K #1' }, meta: meta(), cash, realizedPnl: 0, netResult: 0, trades: { closed: 0, winRate: null }, byMonth: [], to: null };
const broker: AccountSummaryLite = { account: { id: 's1', bankName: 'Charles Schwab', accountName: 'Individual' }, meta: meta({ kind: 'broker', status: 'active', firm: null, provider: 'plaid' }), cash: null, realizedPnl: 2360, netResult: 2400, trades: { closed: 148, winRate: 61 }, byMonth: [{ month: '2026-09', realized: 1000 }, { month: '2026-10', realized: 1360 }], to: '2026-10-30' };

describe('labels and tones', () => {
  it('names statuses plainly and tones them', () => {
    expect(STATUS_LABEL.evaluation).toBe('Evaluation');
    expect(statusTone('funded')).toBe('up');
    expect(statusTone('failed')).toBe('down');
    expect(statusTone('closed')).toBe('muted');
    expect(statusTone('active')).toBe('flat');
  });
  it('titles an account by firm and name', () => {
    expect(accountTitle(prop)).toBe('Topstep · 50K #1');
    expect(accountTitle(broker)).toBe('Charles Schwab · Individual');
  });
});

describe('accountFigures', () => {
  it('a prop-firm account shows net cash, payouts and platform P&L (or a hint)', () => {
    expect(accountFigures(prop)).toEqual([
      { label: 'Net cash', value: '+$1,502', tone: 'up' },
      { label: 'Payouts', value: '2 · $1,750', tone: 'flat' },
      { label: 'Platform P&L', value: 'No trades yet', tone: 'flat' },
    ]);
    expect(accountFigures({ ...prop, trades: { closed: 12, winRate: 58 }, netResult: 3100 })[2]).toEqual({ label: 'Platform P&L', value: '+$3,100', tone: 'up' });
    expect(accountFigures({ ...prop, cash: { ...cash, spent: 149, netCash: -149, payouts: { ...cash.payouts, count: 0, total: 0 } } })).toEqual([
      { label: 'Net cash', value: '-$149', tone: 'down' },
      { label: 'Payouts', value: '—', tone: 'flat' },
      { label: 'Platform P&L', value: 'No trades yet', tone: 'flat' },
    ]);
  });
  it('a broker shows realized, win rate and closed trades', () => {
    expect(accountFigures(broker)).toEqual([
      { label: 'Realized P&L', value: '+$2,360', tone: 'up' },
      { label: 'Win rate', value: '61%', tone: 'flat' },
      { label: 'Closed', value: '148 trades', tone: 'flat' },
    ]);
  });
});

describe('accountSparkline', () => {
  const months = ['2026-05', '2026-06', '2026-07', '2026-08', '2026-09', '2026-10'];
  it('is cumulative cash net for prop firms and cumulative realized for brokers; empty when flat', () => {
    expect(accountSparkline(prop, months)).toEqual([0, 0, 0, -248, 252, 1502]);
    expect(accountSparkline(broker, months)).toEqual([0, 0, 0, 0, 1000, 2360]);
    expect(accountSparkline({ ...broker, byMonth: [] }, months)).toEqual([]);
  });
});

describe('sortAccounts / lastActivity / openPropAccount', () => {
  it('orders funded and active first, then evaluation, then failed and closed', () => {
    const list = [{ meta: meta({ status: 'closed' }), id: 'c' }, { meta: meta({ status: 'evaluation' }), id: 'e' }, { meta: meta({ status: 'failed' }), id: 'f' }, { meta: meta({ kind: 'broker', status: 'active' }), id: 'a' }, { meta: meta({ status: 'funded' }), id: 'u' }];
    expect(sortAccounts(list).map((x) => x.id)).toEqual(['u', 'a', 'e', 'f', 'c']);
  });
  it('last activity is the newest of trade rows and attributed cash rows', () => {
    expect(lastActivity(prop)).toBe('2026-10-10');
    expect(lastActivity(broker)).toBe('2026-10-30');
    expect(lastActivity({ ...prop, cash: { ...cash, rows: [] } })).toBeNull();
  });
  it('pre-selects the only open prop-firm account, else nothing', () => {
    expect(openPropAccount([{ id: 'a', kind: 'broker', status: 'active' }, { id: 'b', kind: 'prop_firm', status: 'funded' }])).toBe('b');
    expect(openPropAccount([{ id: 'b', kind: 'prop_firm', status: 'funded' }, { id: 'c', kind: 'prop_firm', status: 'evaluation' }])).toBeNull();
    expect(openPropAccount([{ id: 'b', kind: 'prop_firm', status: 'failed' }])).toBeNull();
    expect(openPropAccount([{ id: 'legacy' }])).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run --root apps/web src/lib/projects/trading.test.ts`
Expected: FAIL — cannot find module `./trading`.

- [ ] **Step 3: Implement `trading.ts`**

```ts
/* Trading-account helpers for the Projects page: labels, card figures,
   sparklines and ordering. Pure; the API computes every money figure
   (apps/api/src/investments/trading-cash.ts) and this file only shapes it for
   display. Spec: docs/superpowers/specs/2026-10-31-trading-accounts-design.md */

import { money, type Figure } from './overview';

export type TradingKind = 'broker' | 'prop_firm';
export type TradingStatus = 'active' | 'evaluation' | 'funded' | 'failed' | 'closed';

export interface AccountMeta {
  kind: TradingKind; status: TradingStatus; firm: string | null; accountSize: number | null;
  startedAt: string | null; endedAt: string | null; notes: string | null; provider: string;
}
export interface MonthFlow { month: string; in: number; out: number }
export interface CashCategoryTotal { id: string; name: string; icon: string; color: string; total: number; count: number }
export interface CashRow { id: string; date: string; name: string; amount: number; category: { id: string; name: string; icon: string; color: string } | null }
export interface CashSummary {
  spent: number; spentByCategory: CashCategoryTotal[];
  payouts: { count: number; total: number; avg: number | null; largest: number; last: string | null };
  netCash: number; roi: number | null; costPerPayout: number | null;
  daysToFirstPayout: number | null; daysActive: number | null;
  byMonth: MonthFlow[]; rows: CashRow[];
}
/** The slice of an account's performance the cards and sorting need. */
export interface AccountSummaryLite {
  account: { id: string; bankName: string; accountName: string };
  meta: AccountMeta;
  cash: CashSummary | null;
  realizedPnl: number;
  netResult: number;
  trades: { closed: number; winRate: number | null };
  byMonth: { month: string; realized: number }[];
  to: string | null;
}

export const STATUS_LABEL: Record<TradingStatus, string> = { active: 'Active', evaluation: 'Evaluation', funded: 'Funded', failed: 'Failed', closed: 'Closed' };
export const KIND_LABEL: Record<TradingKind, string> = { broker: 'Broker', prop_firm: 'Prop firm' };
const STATUS_ORDER: Record<TradingStatus, number> = { funded: 0, active: 1, evaluation: 2, failed: 3, closed: 4 };

export function statusTone(s: TradingStatus): 'up' | 'down' | 'flat' | 'muted' {
  return s === 'funded' ? 'up' : s === 'failed' ? 'down' : s === 'closed' ? 'muted' : 'flat';
}

const tone = (n: number): Figure['tone'] => (n > 0 ? 'up' : n < 0 ? 'down' : 'flat');

export function accountTitle(a: Pick<AccountSummaryLite, 'account'>): string {
  return `${a.account.bankName} · ${a.account.accountName}`;
}

export function accountFigures(a: AccountSummaryLite): Figure[] {
  if (a.meta.kind === 'prop_firm') {
    const c = a.cash;
    const net = c?.netCash ?? 0;
    const hasTrades = a.trades.closed > 0;
    return [
      { label: 'Net cash', value: money(net, true), tone: tone(net) },
      { label: 'Payouts', value: c && c.payouts.count > 0 ? `${c.payouts.count} · ${money(c.payouts.total)}` : '—', tone: 'flat' },
      { label: 'Platform P&L', value: hasTrades ? money(a.netResult, true) : 'No trades yet', tone: hasTrades ? tone(a.netResult) : 'flat' },
    ];
  }
  return [
    { label: 'Realized P&L', value: money(a.realizedPnl, true), tone: tone(a.realizedPnl) },
    { label: 'Win rate', value: a.trades.winRate == null ? '—' : `${a.trades.winRate}%`, tone: 'flat' },
    { label: 'Closed', value: `${a.trades.closed} trade${a.trades.closed === 1 ? '' : 's'}`, tone: 'flat' },
  ];
}

const cents = (n: number) => Math.round(n * 100) / 100 + 0;

/** Cumulative series over `months`; empty when nothing moved. Prop firms: cash out − in; brokers: realized. */
export function accountSparkline(a: AccountSummaryLite, months: string[]): number[] {
  const perMonth = new Map<string, number>();
  if (a.meta.kind === 'prop_firm') {
    for (const m of a.cash?.byMonth ?? []) perMonth.set(m.month, cents(m.out - m.in));
  } else {
    for (const m of a.byMonth) perMonth.set(m.month, m.realized);
  }
  if (![...perMonth.values()].some((v) => v !== 0)) return [];
  let acc = 0;
  return months.map((m) => (acc = cents(acc + (perMonth.get(m) ?? 0))));
}

export function sortAccounts<T extends { meta: AccountMeta }>(list: T[]): T[] {
  return [...list].sort((a, b) => STATUS_ORDER[a.meta.status] - STATUS_ORDER[b.meta.status]);
}

export function lastActivity(a: AccountSummaryLite): string | null {
  const cashLast = a.cash?.rows[0]?.date ?? null;
  const dates = [a.to, cashLast].filter((d): d is string => !!d).sort();
  return dates.length ? dates[dates.length - 1] : null;
}

/** When linking a transaction to a trading project: the single open prop-firm account to pre-select, else null. */
export function openPropAccount(accounts: { id: string; kind?: TradingKind; status?: TradingStatus }[]): string | null {
  const open = accounts.filter((a) => a.kind === 'prop_firm' && (a.status === 'evaluation' || a.status === 'funded' || a.status === 'active'));
  return open.length === 1 ? open[0].id : null;
}
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run --root apps/web src/lib/projects`
Expected: all pass (the new file plus the existing overview, closure, followed, category-icons suites).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/projects/trading.ts apps/web/src/lib/projects/trading.test.ts
git commit -m "feat(web): pure helpers for trading account cards, sparklines and ordering

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 7: Project and account in the Projects page URL

**Files:**
- Modify: `apps/web/src/app/projects/page.tsx` (imports; state near :107; `loadProjects` :185; a new effect; `setSelectedId` callers in the back bar :538-556 and overview `onOpen`)

**Interfaces:**
- Produces: page state `tradingAccountId: string | null` with `setTradingAccountId`; URL `?project=<id>&account=<id>`; selecting a project resets the account; unknown ids are ignored.

- [ ] **Step 1: Read the URL on load and write it on change**

In `apps/web/src/app/projects/page.tsx` add to the imports: `import { usePathname, useRouter } from 'next/navigation';`. Below `const [selectedId, setSelectedId] = useState<string | null>(null);` add:

```tsx
  /* Trading projects open one account at a time (`?account=`); both ids live
     in the URL so back works and other pages can deep-link. Read once on
     load from the location (useSearchParams would need a Suspense boundary
     around this whole page), written with replace on every change. */
  const [tradingAccountId, setTradingAccountId] = useState<string | null>(null);
  const router = useRouter();
  const pathname = usePathname();
  const urlReady = useRef(false);
  useEffect(() => {
    if (!urlReady.current) return;
    const p = new URLSearchParams();
    if (selectedId) p.set('project', selectedId);
    if (selectedId && tradingAccountId) p.set('account', tradingAccountId);
    const qs = p.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }, [selectedId, tradingAccountId, pathname, router]);
```

(`useRef` is already imported on this page; if not, add it to the React import.) In `loadProjects`, after `setProjects(list);` add:

```tsx
      if (!urlReady.current) {
        const p = new URLSearchParams(window.location.search);
        const project = p.get('project');
        if (project && list.some((x: Project) => x.id === project)) {
          setSelectedId(project);
          loadDetail(project);
          const account = p.get('account');
          const hit = list.find((x: Project) => x.id === project);
          if (account && hit?.accounts?.some((a) => a.id === account)) setTradingAccountId(account);
        }
        urlReady.current = true;
      }
```

- [ ] **Step 2: Reset the account when the project changes**

Every place that sets the selected project must clear the account. Replace the three callers:

- Back bar "All projects": `onClick={() => { setSelectedId(null); setTradingAccountId(null); }}`
- Other-projects strip: `onClick={() => { setSelectedId(p.id); setTradingAccountId(null); if (!p.transactions) loadDetail(p.id); }}`
- Overview `onOpen` prop (find `<ProjectsOverview` and its `onOpen={(id) => …}`): wrap so it also calls `setTradingAccountId(null)`.

- [ ] **Step 3: Type-check and lint**

Run: `npx tsc --noEmit -p apps/web/tsconfig.json && npx eslint apps/web/src/app/projects/page.tsx`
Expected: clean compile (ignore the pre-existing ChatMarkdown.test error); no new lint errors (pre-existing warnings may remain).

- [ ] **Step 4: Manual check**

Start `npm run dev:api` and `npm run dev:web`, open `/projects`, click a project: the URL becomes `/projects?project=<id>`; reload keeps it open; browser back returns to the overview. `/projects?project=<bad id>` shows the overview.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/projects/page.tsx
git commit -m "feat(projects): keep the open project and trading account in the URL

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 8: Level 1 — the accounts overview inside a trading project

**Files:**
- Modify: `apps/web/src/app/projects/TradingPerformance.tsx` (props: receive data instead of fetching; export `MonthlyPanel`, `money`, `pnlColor`, `panel`; extend `Performance`/`ProjectPerformance` types)
- Create: `apps/web/src/app/projects/trading/TradingAccountsSection.tsx`
- Create: `apps/web/src/app/projects/trading/AccountCards.tsx`
- Create: `apps/web/src/app/projects/trading/OverviewStrip.tsx`
- Create: `apps/web/src/app/projects/trading/MoneyInOutPanel.tsx`
- Modify: `apps/web/src/app/projects/page.tsx` (`Transaction` type :54-64; `Project.accounts` type :78; the Performance block :844-846; the body wrapper)

**Interfaces:**
- Consumes: Task 5 API shape; Task 6 helpers; Task 7 `tradingAccountId` / `setTradingAccountId`.
- Produces:
  - `TradingPerformance` props: `{ data: ProjectPerformance; view: string; onEdit?: () => void; onView?: (v: string) => void }` — renders the switcher only when `onView` is given.
  - `export { MonthlyPanel, money, pnlColor, panel }` from `TradingPerformance.tsx`; `Performance` gains `meta: AccountMeta; cash: CashSummary | null; cashByMonth: MonthFlow[]`; `ProjectPerformance` gains `overview: TradingOverview; unassigned: number`.
  - `TradingAccountsSection` props: `{ project: Project; accountId: string | null; onSelectAccount: (id: string | null) => void; onProjectChanged: () => Promise<void>; onEditProject: () => void; onAddAccount: () => void }` and renders level 1 when `accountId` is null (level 2 arrives in Task 9).

- [ ] **Step 1: Make `TradingPerformance` a controlled renderer**

In `apps/web/src/app/projects/TradingPerformance.tsx`:

1. Extend the types after `CashFlow`:

```ts
import type { AccountMeta, CashSummary, MonthFlow } from '@/lib/projects/trading';
export interface TradingOverview {
  tradingPnl: number; moneyIn: number; moneyOut: number; netInPocket: number;
  accountsByStatus: Record<'active' | 'evaluation' | 'funded' | 'failed' | 'closed', number>;
  funded: number; evaluated: number; passRate: number | null; costOfFailed: number; payoutsPerAccount: number | null;
  byMonth: MonthFlow[];
}
```

   and change `ProjectPerformance.accounts` to `(Performance & { account: AccountRef; meta: AccountMeta; cash: CashSummary | null; cashByMonth: MonthFlow[] })[]`, adding `overview: TradingOverview; unassigned: number;` to `ProjectPerformance`.

2. Export the helpers: `export const money = …`, `export const pnlColor = …`, `export const dateLabel = …`, `export const panel …`, and `export function MonthlyPanel(…)`.

3. Replace the component signature and the fetching:

```tsx
export default function TradingPerformance({ data, view, onEdit, onView }: {
  data: ProjectPerformance; view: string; onEdit?: () => void; onView?: (v: string) => void;
}) {
  const multi = data.accounts.length > 1;
  const current = view === 'all' ? data.combined : (data.accounts.find((a) => a.account.id === view) ?? data.combined);
```

   Delete the `useState`/`useEffect` for `data`, `error`, `view` and the two early returns. Wrap the switcher `<div className="flex items-center gap-2 flex-wrap">…</div>` in `{onView && ( … )}` and change `onClick={() => setView(tab.id)}` to `onClick={() => onView(tab.id)}`. Remove the now-unused `useEffect`/`useState` imports if nothing else uses them (`MonthlyPanel` still uses `useLayoutEffect`, `useRef`, `useState`).

- [ ] **Step 2: Create `OverviewStrip.tsx`**

```tsx
'use client';

import { money, pnlColor, panel, type TradingOverview } from '../TradingPerformance';
import { STATUS_LABEL } from '@/lib/projects/trading';

/* The headline strip of a trading project: what trading made, what the user put
   in and took out across every account, and how many accounts are in each state. */
export default function OverviewStrip({ o, winRate, closed, profitFactor }: { o: TradingOverview; winRate: number | null; closed: number; profitFactor: number | null }) {
  const statuses = (['funded', 'active', 'evaluation', 'failed', 'closed'] as const).filter((s) => o.accountsByStatus[s] > 0);
  const tiles = [
    { label: 'Trading P&L', value: money(o.tradingPnl, true), clr: pnlColor(o.tradingPnl), sub: 'realized + income − fees, every account' },
    { label: 'Money in', value: money(o.moneyIn), clr: 'var(--color-rose)', sub: 'deposits, evaluations, resets' },
    { label: 'Money out', value: money(o.moneyOut), clr: 'var(--color-green)', sub: 'withdrawals and payouts' },
    { label: 'Net in pocket', value: money(o.netInPocket, true), clr: pnlColor(o.netInPocket), sub: 'money out − money in' },
    { label: 'Win rate', value: winRate == null ? '—' : `${winRate}%`, clr: 'var(--color-text-primary)', sub: closed ? `${closed} closed${profitFactor != null ? ` · PF ${profitFactor}` : ''}` : 'no closed trades' },
    { label: 'Accounts', value: statuses.map((s) => `${o.accountsByStatus[s]} ${STATUS_LABEL[s].toLowerCase()}`).join(' · ') || 'none yet', clr: 'var(--color-text-primary)', sub: o.passRate != null ? `${o.passRate}% of evaluations passed` : 'add one below' },
  ];
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-3" data-testid="trading-overview-strip">
      {tiles.map((k) => (
        <div key={k.label} className="p-3 min-w-0" style={panel}>
          <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--color-text-muted)' }}>{k.label}</p>
          <p className="font-bold text-base mt-1 truncate" style={{ color: k.clr }}>{k.value}</p>
          <p className="text-[10px] mt-0.5 truncate" style={{ color: 'var(--color-text-muted)' }}>{k.sub}</p>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 3: Create `MoneyInOutPanel.tsx`**

Two series in fixed order (money out to the user = green, money in from the user = rose), a legend, labelled totals; same documented convention as the dashboard's cash-flow chart.

```tsx
'use client';

import { money, panel } from '../TradingPerformance';
import type { MonthFlow } from '@/lib/projects/trading';
import { useNarrowScreen } from '@/hooks/useNarrowScreen';

const short = (key: string) => ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][Number(key.slice(5, 7)) - 1];

export default function MoneyInOutPanel({ months }: { months: MonthFlow[] }) {
  const narrow = useNarrowScreen();
  const shown = months.slice(narrow ? -6 : -12);
  const max = Math.max(1, ...shown.flatMap((m) => [m.in, m.out]));
  const totalIn = shown.reduce((s, m) => s + m.in, 0), totalOut = shown.reduce((s, m) => s + m.out, 0);
  if (totalIn === 0 && totalOut === 0) return null;
  const H = 120;
  return (
    <div className="p-3 sm:p-4" style={panel} data-testid="money-in-out">
      <div className="flex items-baseline justify-between gap-3 flex-wrap mb-2">
        <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--color-text-muted)' }}>Money in & out by month</p>
        <div className="flex items-center gap-3 text-[10px]" style={{ color: 'var(--color-text-muted)' }}>
          <span className="flex items-center gap-1"><span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ background: 'var(--color-green)' }} />to you {money(totalOut)}</span>
          <span className="flex items-center gap-1"><span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ background: 'var(--color-rose)' }} />from you {money(totalIn)}</span>
        </div>
      </div>
      <div className="grid gap-1" style={{ gridTemplateColumns: `repeat(${shown.length}, minmax(0, 1fr))` }}>
        {shown.map((m) => (
          <div key={m.month} className="flex flex-col items-center gap-1 min-w-0">
            <div className="w-full flex items-end justify-center gap-0.5" style={{ height: H }} title={`${short(m.month)}: to you ${money(m.out)} · from you ${money(m.in)}`}>
              <div className="w-[38%] rounded-t" style={{ height: `${(m.out / max) * 100}%`, background: 'var(--color-green)', opacity: 0.85 }} />
              <div className="w-[38%] rounded-t" style={{ height: `${(m.in / max) * 100}%`, background: 'var(--color-rose)', opacity: 0.85 }} />
            </div>
            <span className="text-[9px]" style={{ color: m.in || m.out ? 'var(--color-text-secondary)' : 'var(--color-text-muted)' }}>{short(m.month)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Create `AccountCards.tsx`**

```tsx
'use client';

import { accountFigures, accountSparkline, accountTitle, lastActivity, sortAccounts, statusTone, KIND_LABEL, STATUS_LABEL } from '@/lib/projects/trading';
import { relativeDay } from '@/lib/projects/overview';
import type { ProjectPerformance } from '../TradingPerformance';

type AccountPerf = ProjectPerformance['accounts'][number];
const TONE = { up: 'var(--color-green)', down: 'var(--color-rose)', flat: 'var(--color-text-primary)', muted: 'var(--color-text-muted)' } as const;

function trailingMonths(n = 6): string[] {
  const now = new Date();
  return Array.from({ length: n }, (_, i) => { const d = new Date(now.getFullYear(), now.getMonth() - (n - 1 - i), 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; });
}

/** One card per followed account; clicking opens that account (level 2). */
export default function AccountCards({ accounts, unassigned, onOpen, onAdd }: { accounts: AccountPerf[]; unassigned: number; onOpen: (id: string) => void; onAdd: () => void }) {
  const months = trailingMonths();
  const list = sortAccounts(accounts);
  return (
    <div className="flex flex-col gap-3" data-testid="account-cards">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-bold" style={{ color: 'var(--color-text-primary)' }}>Accounts</p>
        <button type="button" onClick={onAdd} className="text-[11px] font-semibold px-2.5 py-1.5 rounded-lg hover:brightness-110"
          style={{ color: 'var(--color-primary)', border: '1px solid color-mix(in srgb, var(--color-primary) 30%, transparent)' }}>+ Add account</button>
      </div>
      {list.length === 0 && (
        <p className="text-xs px-4 py-6 text-center rounded-xl" style={{ color: 'var(--color-text-muted)', border: '1px dashed var(--color-border)' }}>
          No accounts yet. Add a connected brokerage or an account you are not connected to (a prop-firm combine), then attribute its payments and payouts to it.
        </p>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
        {list.map((a) => {
          const figures = accountFigures(a);
          const points = accountSparkline(a, months);
          const dim = a.meta.status === 'failed' || a.meta.status === 'closed';
          const hint = a.meta.kind === 'prop_firm' && !a.cash?.rows.length ? 'Nothing attributed yet' : a.meta.kind === 'prop_firm' && a.trades.closed === 0 ? 'No trades imported' : null;
          return (
            <button key={a.account.id} type="button" onClick={() => onOpen(a.account.id)} data-testid="account-card"
              className="text-left flex flex-col gap-3 p-4 rounded-2xl transition-all card-lift"
              style={{ background: 'var(--color-surface)', border: 'var(--glass-border)', boxShadow: 'var(--glass-shadow)', opacity: dim ? 0.6 : 1, cursor: 'pointer' }}>
              <div className="flex items-start gap-3 min-w-0">
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm truncate" style={{ color: 'var(--color-text-primary)' }}>{accountTitle(a)}</p>
                  <div className="flex items-center gap-1.5 mt-1 flex-wrap text-[10px] font-bold">
                    <span className="px-1.5 py-0.5 rounded-md" style={{ background: 'color-mix(in srgb, var(--color-card-sky) 16%, transparent)', color: 'var(--color-card-sky)' }}>
                      {KIND_LABEL[a.meta.kind]}{a.meta.provider === 'plaid' ? ' · Connected' : ''}
                    </span>
                    <span className="px-1.5 py-0.5 rounded-md" style={{ background: `color-mix(in srgb, ${TONE[statusTone(a.meta.status)]} 14%, transparent)`, color: TONE[statusTone(a.meta.status)] }}>
                      {STATUS_LABEL[a.meta.status]}
                    </span>
                    {a.meta.accountSize != null && <span style={{ color: 'var(--color-text-muted)' }}>${Math.round(a.meta.accountSize / 1000)}K</span>}
                  </div>
                </div>
                <Spark points={points} />
              </div>
              <div className="grid grid-cols-3 gap-2">
                {figures.map((f) => (
                  <div key={f.label} className="min-w-0">
                    <p className="text-[10px] truncate" style={{ color: 'var(--color-text-muted)' }}>{f.label}</p>
                    <p className="text-sm font-bold truncate tabular-nums" style={{ color: TONE[f.tone] }}>{f.value}</p>
                  </div>
                ))}
              </div>
              <div className="flex items-center justify-between text-[10px]" style={{ color: 'var(--color-text-muted)' }}>
                <span className="truncate" style={hint ? { color: 'var(--color-amber)' } : undefined}>{hint ?? `${a.trades.closed} closed · ${a.cash ? `${a.cash.rows.length} cash rows` : 'connected'}`}</span>
                <span className="shrink-0 ml-2">{relativeDay(lastActivity(a))}</span>
              </div>
            </button>
          );
        })}
      </div>
      {unassigned > 0 && (
        <p className="text-xs px-3 py-2 rounded-xl" style={{ color: 'var(--color-amber)', background: 'color-mix(in srgb, var(--color-amber) 8%, transparent)', border: '1px solid color-mix(in srgb, var(--color-amber) 25%, transparent)' }}>
          {unassigned} project transaction{unassigned === 1 ? '' : 's'} {unassigned === 1 ? 'has' : 'have'} no account yet — assign them in the list below so each account's numbers are complete.
        </p>
      )}
    </div>
  );
}

function Spark({ points }: { points: number[] }) {
  const w = 64, h = 26, pad = 2;
  if (points.length < 2) return <div style={{ width: w, height: h }} aria-hidden="true" />;
  const lo = Math.min(0, ...points), hi = Math.max(0, ...points), span = hi - lo || 1;
  const x = (i: number) => pad + (i / (points.length - 1)) * (w - pad * 2);
  const y = (v: number) => h - pad - ((v - lo) / span) * (h - pad * 2);
  const d = points.map((v, i) => `${i ? 'L' : 'M'} ${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(' ');
  const end = points[points.length - 1];
  const stroke = end > 0 ? 'var(--color-green)' : end < 0 ? 'var(--color-rose)' : 'var(--color-text-muted)';
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="shrink-0" aria-hidden="true">
      <line x1={pad} x2={w - pad} y1={y(0)} y2={y(0)} stroke="var(--color-border)" strokeWidth="1" />
      <path d={d} fill="none" stroke={stroke} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
```

- [ ] **Step 5: Create `TradingAccountsSection.tsx` (level 1 only for now)**

```tsx
'use client';

import { useCallback, useEffect, useState } from 'react';
import { MonthlyPanel, type ProjectPerformance } from '../TradingPerformance';
import OverviewStrip from './OverviewStrip';
import MoneyInOutPanel from './MoneyInOutPanel';
import AccountCards from './AccountCards';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3333/api';

export interface TradingSectionProject { id: string; name: string }

/* The trading project's account navigation. Level 1 (no accountId): the overview
   strip, combined monthly P&L, money in & out, and one card per account. Level 2
   (accountId): that account alone — see AccountView (Task 9). Fetches
   /investments/performance once per project and after any change. */
export default function TradingAccountsSection({ project, accountId, onSelectAccount, onProjectChanged, onEditProject, onAddAccount, refreshKey = 0 }: {
  project: TradingSectionProject; accountId: string | null; onSelectAccount: (id: string | null) => void;
  onProjectChanged: () => Promise<void>; onEditProject: () => void; onAddAccount: () => void; refreshKey?: number;
}) {
  const [data, setData] = useState<ProjectPerformance | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const r = await fetch(`${API}/investments/performance?projectId=${encodeURIComponent(project.id)}`, { credentials: 'include' });
      if (!r.ok) throw new Error(`${r.status}`);
      setData(await r.json());
    } catch { setError('Could not load performance'); }
  }, [project.id]);

  useEffect(() => { setData(null); load(); }, [load, refreshKey]);

  // Unknown account id (removed, or a stale link): fall back to the overview.
  // In an effect, never during render — a parent state update mid-render is a React error.
  const current = data && accountId ? data.accounts.find((a) => a.account.id === accountId) ?? null : null;
  useEffect(() => {
    if (data && accountId && !current) onSelectAccount(null);
  }, [data, accountId, current, onSelectAccount]);

  if (error) return <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>{error}.</p>;
  if (!data) return <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>Loading accounts…</p>;

  if (!current) {
    return (
      <section className="flex flex-col gap-4" data-testid="trading-accounts">
        <OverviewStrip o={data.overview} winRate={data.combined.trades.winRate} closed={data.combined.trades.closed} profitFactor={data.combined.trades.profitFactor} />
        {data.combined.byMonth.length > 0 && <MonthlyPanel months={data.combined.byMonth} />}
        <MoneyInOutPanel months={data.overview.byMonth} />
        <AccountCards accounts={data.accounts} unassigned={data.unassigned} onOpen={onSelectAccount} onAdd={onAddAccount} />
      </section>
    );
  }
  return null; // Task 9 renders the account view here
}
```

- [ ] **Step 6: Wire the page**

In `apps/web/src/app/projects/page.tsx`:

1. `Transaction` type: add `tradingAccountId?: string | null;`. `Project.accounts` type: add `kind?: 'broker' | 'prop_firm'; status?: 'active' | 'evaluation' | 'funded' | 'failed' | 'closed'; firm?: string | null;`.
2. Replace the import `import TradingPerformance from './TradingPerformance';` with `import TradingAccountsSection from './trading/TradingAccountsSection';`.
3. Add state `const [perfRefresh, setPerfRefresh] = useState(0);` and `const [showAddAccount, setShowAddAccount] = useState<string | null>(null);` (project id; the modal arrives in Task 10 — until then the button opens the edit form: `onAddAccount={() => openEdit(sel)}`).
4. Replace the block at :844-846

```tsx
                    {sel.type === 'trading' && (sel.accounts?.length ?? 0) > 0 && (
                      <TradingPerformance projectId={sel.id} onEdit={() => openEdit(sel)} />
                    )}
```

   with

```tsx
                    {sel.type === 'trading' && (
                      <TradingAccountsSection
                        project={sel}
                        accountId={tradingAccountId}
                        onSelectAccount={setTradingAccountId}
                        onProjectChanged={async () => { await loadDetail(sel.id); setPerfRefresh((n) => n + 1); }}
                        onEditProject={() => openEdit(sel)}
                        onAddAccount={() => openEdit(sel)}
                        refreshKey={perfRefresh}
                      />
                    )}
```

   and move it to the **top** of the body `<div className="flex flex-col gap-5 px-4 sm:px-5 py-4">`, before `{/* P&L breakdown */}`.
5. Hide the generic sections while an account is open: wrap everything in that body from `{/* P&L breakdown */}` through the end of the `{/* ── Linked transactions ── */}` block in `{!(sel.type === 'trading' && tradingAccountId) && (<> … </>)}`.
6. After `loadDetail` resolves in `handleSave` (the edit form saves `bankAccountIds`), add `setPerfRefresh((n) => n + 1);` so the cards re-fetch.

- [ ] **Step 7: Type-check, lint, look**

Run: `npx tsc --noEmit -p apps/web/tsconfig.json && npx eslint apps/web/src/app/projects`
Expected: clean. In the browser, a trading project shows the strip, the monthly panel (when there are trades), the money in/out panel (when there is cash), and one card per account; a project without accounts shows the empty-state card text and the "+ Add account" button opens the edit form.

- [ ] **Step 8: Commit**

```bash
git add apps/web/src/app/projects
git commit -m "feat(projects): trading project opens on an overview of its accounts

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 9: Level 2 — one account

**Files:**
- Create: `apps/web/src/app/projects/trading/AccountView.tsx`
- Create: `apps/web/src/app/projects/trading/AccountHeader.tsx`
- Create: `apps/web/src/app/projects/trading/CashPanels.tsx`
- Modify: `apps/web/src/app/projects/trading/TradingAccountsSection.tsx` (render `AccountView`)

**Interfaces:**
- Consumes: Task 2 routes `PATCH /projects/:id/accounts/:accountId`, `DELETE /projects/:id/accounts/:accountId`; Task 3 `PATCH /projects/:id/tx/:txId/account`; Task 8 components and exports.
- Produces: `AccountView` props `{ projectId: string; data: ProjectPerformance; account: ProjectPerformance['accounts'][number]; onBack: () => void; onSwitch: (id: string) => void; onChanged: () => Promise<void> }`.

- [ ] **Step 1: Create `AccountHeader.tsx`** — name, chips, inline status select, editable firm / size / dates / notes, Remove

```tsx
'use client';

import { useState } from 'react';
import { KIND_LABEL, STATUS_LABEL, accountTitle, statusTone, type AccountMeta, type TradingStatus } from '@/lib/projects/trading';
import { panel } from '../TradingPerformance';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3333/api';
const TONE = { up: 'var(--color-green)', down: 'var(--color-rose)', flat: 'var(--color-text-primary)', muted: 'var(--color-text-muted)' } as const;
const STATUSES: TradingStatus[] = ['evaluation', 'funded', 'failed', 'closed', 'active'];
const input = 'px-2.5 py-1.5 text-xs rounded-lg outline-none min-w-0';
const inputStyle = { background: 'var(--color-elevated)', border: '1px solid var(--color-border)', color: 'var(--color-text-primary)' };

export default function AccountHeader({ projectId, account, meta, onChanged, onRemoved }: {
  projectId: string; account: { id: string; bankName: string; accountName: string }; meta: AccountMeta;
  onChanged: () => Promise<void>; onRemoved: () => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ firm: meta.firm ?? '', accountSize: meta.accountSize == null ? '' : String(meta.accountSize), startedAt: meta.startedAt ?? '', endedAt: meta.endedAt ?? '', notes: meta.notes ?? '' });
  const [busy, setBusy] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function patch(body: Partial<AccountMeta>) {
    setBusy(true); setError(null);
    try {
      const r = await fetch(`${API}/projects/${projectId}/accounts/${account.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify(body) });
      if (!r.ok) throw new Error((await r.json().catch(() => ({})))?.message ?? 'Could not save');
      await onChanged();
    } catch (e: unknown) { setError(e instanceof Error ? e.message : 'Could not save'); }
    finally { setBusy(false); }
  }

  async function save() {
    await patch({ firm: form.firm.trim() || null, accountSize: form.accountSize === '' ? null : Number(form.accountSize), startedAt: form.startedAt || null, endedAt: form.endedAt || null, notes: form.notes.trim() || null });
    setEditing(false);
  }

  async function remove() {
    setBusy(true);
    const r = await fetch(`${API}/projects/${projectId}/accounts/${account.id}`, { method: 'DELETE', credentials: 'include' });
    setBusy(false);
    if (r.ok) await onRemoved(); else setError('Could not remove the account');
  }

  const connected = meta.provider === 'plaid';
  return (
    <div className="p-4 flex flex-col gap-3" style={panel} data-testid="account-header">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <h3 className="text-base font-bold truncate" style={{ color: 'var(--color-text-primary)' }}>{accountTitle({ account })}</h3>
          <div className="flex items-center gap-1.5 mt-1 flex-wrap text-[10px] font-bold">
            <span className="px-1.5 py-0.5 rounded-md" style={{ background: 'color-mix(in srgb, var(--color-card-sky) 16%, transparent)', color: 'var(--color-card-sky)' }}>{KIND_LABEL[meta.kind]}{connected ? ' · Connected' : ' · Not connected'}</span>
            <label className="flex items-center gap-1">
              <span className="px-1.5 py-0.5 rounded-md" style={{ background: `color-mix(in srgb, ${TONE[statusTone(meta.status)]} 14%, transparent)`, color: TONE[statusTone(meta.status)] }}>{STATUS_LABEL[meta.status]}</span>
              <select value={meta.status} disabled={busy} aria-label="Account status" onChange={(e) => patch({ status: e.target.value as TradingStatus })}
                className="text-[10px] font-semibold rounded-md px-1 py-0.5 cursor-pointer" style={inputStyle}>
                {STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
              </select>
            </label>
            {meta.accountSize != null && <span style={{ color: 'var(--color-text-muted)' }}>${meta.accountSize.toLocaleString('en-US')} account</span>}
            {meta.startedAt && <span style={{ color: 'var(--color-text-muted)' }}>since {meta.startedAt}{meta.endedAt ? ` · until ${meta.endedAt}` : ''}</span>}
          </div>
          {meta.notes && !editing && <p className="text-xs mt-1.5" style={{ color: 'var(--color-text-secondary)' }}>{meta.notes}</p>}
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {connected && <a href="/settings?tab=banks" className="text-[11px] font-semibold px-2.5 py-1.5 rounded-lg" style={{ color: 'var(--color-text-secondary)', border: '1px solid var(--color-border)' }}>Sync in Settings</a>}
          <button type="button" onClick={() => setEditing((v) => !v)} className="text-[11px] font-semibold px-2.5 py-1.5 rounded-lg" style={{ color: 'var(--color-primary)', border: '1px solid color-mix(in srgb, var(--color-primary) 30%, transparent)' }}>{editing ? 'Cancel' : 'Edit'}</button>
          {!confirmRemove
            ? <button type="button" onClick={() => setConfirmRemove(true)} className="text-[11px] font-semibold px-2.5 py-1.5 rounded-lg" style={{ color: 'var(--color-text-muted)', border: '1px solid var(--color-border)' }}>Remove from project</button>
            : <button type="button" disabled={busy} onClick={remove} className="text-[11px] font-semibold px-2.5 py-1.5 rounded-lg" style={{ color: 'var(--color-rose)', border: '1px solid color-mix(in srgb, var(--color-rose) 35%, transparent)' }}>Confirm remove (the account stays in Settings)</button>}
        </div>
      </div>
      {editing && (
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
          <input className={input} style={inputStyle} placeholder="Firm" value={form.firm} onChange={(e) => setForm((f) => ({ ...f, firm: e.target.value }))} aria-label="Firm" />
          <input className={input} style={inputStyle} placeholder="Account size" type="number" min="0" value={form.accountSize} onChange={(e) => setForm((f) => ({ ...f, accountSize: e.target.value }))} aria-label="Account size" />
          <input className={input} style={inputStyle} type="date" value={form.startedAt} onChange={(e) => setForm((f) => ({ ...f, startedAt: e.target.value }))} aria-label="Started" />
          <input className={input} style={inputStyle} type="date" value={form.endedAt} onChange={(e) => setForm((f) => ({ ...f, endedAt: e.target.value }))} aria-label="Ended" />
          <button type="button" disabled={busy} onClick={save} className="text-xs font-semibold px-3 py-1.5 rounded-lg text-white btn-gold">Save</button>
          <textarea className={`${input} sm:col-span-2 lg:col-span-5`} style={inputStyle} rows={2} placeholder="Notes" value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} aria-label="Notes" />
        </div>
      )}
      {error && <p className="text-xs" style={{ color: 'var(--color-rose)' }}>{error}</p>}
    </div>
  );
}
```

- [ ] **Step 2: Create `CashPanels.tsx`** — tiles and the money list for a prop-firm account

```tsx
'use client';

import { money, panel, dateLabel } from '../TradingPerformance';
import type { CashSummary } from '@/lib/projects/trading';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3333/api';

export function CashTiles({ cash, platformPnl, hasTrades }: { cash: CashSummary; platformPnl: number; hasTrades: boolean }) {
  const up = (n: number) => (n > 0 ? 'var(--color-green)' : n < 0 ? 'var(--color-rose)' : 'var(--color-text-secondary)');
  const tiles = [
    { label: 'Spent', value: money(cash.spent), clr: cash.spent ? 'var(--color-rose)' : 'var(--color-text-secondary)', sub: cash.spentByCategory.map((c) => `${c.name} ${money(c.total)}`).join(' · ') || 'evaluations, resets, fees' },
    { label: 'Payouts', value: money(cash.payouts.total), clr: cash.payouts.total ? 'var(--color-green)' : 'var(--color-text-secondary)', sub: cash.payouts.count ? `${cash.payouts.count} · avg ${money(cash.payouts.avg ?? 0)} · last ${dateLabel(cash.payouts.last!)}` : 'none yet' },
    { label: 'Net cash', value: money(cash.netCash, true), clr: up(cash.netCash), sub: cash.roi == null ? 'payouts − spent' : `${cash.roi >= 0 ? '+' : ''}${cash.roi}% on what you spent` },
    { label: 'Cost per payout', value: cash.costPerPayout == null ? '—' : money(cash.costPerPayout), clr: 'var(--color-text-primary)', sub: cash.payouts.count ? 'spent ÷ payouts' : 'no payouts yet' },
    { label: 'Days to first payout', value: cash.daysToFirstPayout == null ? '—' : `${cash.daysToFirstPayout}`, clr: 'var(--color-text-primary)', sub: cash.daysActive == null ? 'set a start date' : `${cash.daysActive} days active` },
    { label: 'Platform P&L', value: hasTrades ? money(platformPnl, true) : '—', clr: hasTrades ? up(platformPnl) : 'var(--color-text-secondary)', sub: hasTrades ? 'not yours until paid out' : 'import trades to see it' },
  ];
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3" data-testid="cash-tiles">
      {tiles.map((k) => (
        <div key={k.label} className="p-3 min-w-0" style={panel}>
          <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--color-text-muted)' }}>{k.label}</p>
          <p className="font-bold text-base mt-1 truncate" style={{ color: k.clr }}>{k.value}</p>
          <p className="text-[10px] mt-0.5 truncate" style={{ color: 'var(--color-text-muted)' }}>{k.sub}</p>
        </div>
      ))}
    </div>
  );
}

/** The attributed transactions, newest first; "Unassign" sends the row back to the project's unassigned pool. */
export function CashRows({ projectId, cash, onChanged }: { projectId: string; cash: CashSummary; onChanged: () => Promise<void> }) {
  async function unassign(txId: string) {
    const r = await fetch(`${API}/projects/${projectId}/tx/${txId}/account`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ accountId: null }) });
    if (r.ok) await onChanged();
  }
  return (
    <div className="p-3 sm:p-4 min-w-0" style={panel} data-testid="cash-rows">
      <div className="flex items-baseline justify-between gap-3 mb-2">
        <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--color-text-muted)' }}>Money in & out</p>
        <p className="text-[10px] hidden sm:block" style={{ color: 'var(--color-text-muted)' }}>What you paid and what you received for this account</p>
      </div>
      {cash.rows.length === 0 ? (
        <p className="text-xs py-3" style={{ color: 'var(--color-text-muted)' }}>Nothing attributed yet. Link the evaluation payment or a payout to the project, then pick this account on the row.</p>
      ) : (
        <ul className="flex flex-col divide-y" style={{ borderColor: 'var(--color-border)' }}>
          {cash.rows.map((r) => {
            const out = r.amount > 0;
            return (
              <li key={r.id} className="flex items-center gap-3 py-2 text-xs group">
                <span className="w-6 h-6 rounded-lg flex items-center justify-center text-[11px] font-bold shrink-0"
                  style={{ background: `color-mix(in srgb, ${out ? 'var(--color-green)' : 'var(--color-rose)'} 16%, transparent)`, color: out ? 'var(--color-green)' : 'var(--color-rose)' }}>{out ? '↓' : '↑'}</span>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold truncate" style={{ color: 'var(--color-text-primary)' }}>{r.name}</p>
                  <p className="text-[10px] truncate" style={{ color: 'var(--color-text-muted)' }}>{dateLabel(r.date)}{r.category ? ` · ${r.category.icon} ${r.category.name}` : ''}</p>
                </div>
                <span className="font-bold tabular-nums shrink-0" style={{ color: out ? 'var(--color-green)' : 'var(--color-rose)' }}>{out ? '+' : '-'}{money(Math.abs(r.amount))}</span>
                <button type="button" onClick={() => unassign(r.id)} className="text-[10px] font-semibold opacity-0 group-hover:opacity-100 focus:opacity-100" style={{ color: 'var(--color-text-muted)' }}>Unassign</button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Create `AccountView.tsx`**

```tsx
'use client';

import TradingPerformance, { type ProjectPerformance } from '../TradingPerformance';
import AccountHeader from './AccountHeader';
import { CashTiles, CashRows } from './CashPanels';
import { accountTitle, sortAccounts } from '@/lib/projects/trading';

type AccountPerf = ProjectPerformance['accounts'][number];

/* Level 2: one account. Back bar with the other accounts, the header with its
   status, cash tiles and money list for prop firms, and the engine panels. */
export default function AccountView({ projectId, data, account, onBack, onSwitch, onChanged }: {
  projectId: string; data: ProjectPerformance; account: AccountPerf;
  onBack: () => void; onSwitch: (id: string) => void; onChanged: () => Promise<void>;
}) {
  const others = sortAccounts(data.accounts.filter((a) => a.account.id !== account.account.id));
  const prop = account.meta.kind === 'prop_firm';
  const hasTrades = account.trades.total > 0 || account.rows > 0;
  return (
    <section className="flex flex-col gap-4" data-testid="account-view">
      <div className="flex items-center gap-2 min-w-0">
        <button type="button" onClick={onBack} className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold shrink-0 hover:bg-[var(--color-elevated)]"
          style={{ color: 'var(--color-text-secondary)', border: '1px solid var(--color-border)' }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M15 18l-6-6 6-6" /></svg>
          All accounts
        </button>
        {others.length > 0 && (
          <div className="flex items-center gap-1.5 overflow-x-auto min-w-0" style={{ scrollbarWidth: 'none' }} aria-label="Other accounts">
            {others.map((a) => (
              <button key={a.account.id} type="button" onClick={() => onSwitch(a.account.id)}
                className="px-2.5 py-1.5 rounded-lg text-xs font-semibold shrink-0 whitespace-nowrap hover:bg-[var(--color-elevated)]"
                style={{ color: 'var(--color-text-secondary)', border: '1px solid transparent', opacity: a.meta.status === 'failed' || a.meta.status === 'closed' ? 0.6 : 1 }}>
                {accountTitle(a)}
              </button>
            ))}
          </div>
        )}
      </div>

      <AccountHeader projectId={projectId} account={account.account} meta={account.meta} onChanged={onChanged} onRemoved={async () => { await onChanged(); onBack(); }} />

      {prop && account.cash && <CashTiles cash={account.cash} platformPnl={account.netResult} hasTrades={hasTrades} />}

      {hasTrades
        ? <TradingPerformance data={data} view={account.account.id} />
        : !prop && <p className="text-xs px-4 py-6 text-center rounded-xl" style={{ color: 'var(--color-text-muted)', border: '1px dashed var(--color-border)' }}>No activity on this account yet. Sync the bank, or press "Re-download full history" in Settings → Bank Accounts.</p>}

      {prop && account.cash && <CashRows projectId={projectId} cash={account.cash} onChanged={onChanged} />}
    </section>
  );
}
```

- [ ] **Step 4: Render it from the section**

In `TradingAccountsSection.tsx` replace `return null; // Task 9 renders the account view here` with:

```tsx
  return (
    <AccountView projectId={project.id} data={data} account={current}
      onBack={() => onSelectAccount(null)} onSwitch={onSelectAccount}
      onChanged={async () => { await onProjectChanged(); await load(); }} />
  );
```

and add `import AccountView from './AccountView';`.

- [ ] **Step 5: Type-check, lint, look**

Run: `npx tsc --noEmit -p apps/web/tsconfig.json && npx eslint apps/web/src/app/projects`
Expected: clean. In the browser: click a card → the account view with the back bar; the generic project sections are hidden; changing the status select updates the chip; Remove from project returns to level 1 and the card is gone while the account is still in Settings → Bank Accounts; reload keeps `?account=`.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/app/projects
git commit -m "feat(projects): one-account view with status, cash metrics and the engine panels

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 10: Add an account you are not connected to; assign transactions

**Files:**
- Create: `apps/web/src/app/projects/trading/AddAccountModal.tsx`
- Create: `apps/web/src/app/projects/trading/AccountPicker.tsx`
- Modify: `apps/web/src/app/projects/page.tsx` (modal state; linked-transaction rows; bulk assign strip)

**Interfaces:**
- Consumes: Task 2 `POST /projects/:id/accounts`; Task 3 `PATCH /projects/:id/tx/:txId/account` and `PATCH /projects/:id/assign-account`; `Project.accounts[]` with `kind`/`status`.
- Produces: `AddAccountModal` props `{ projectId: string; onClose: () => void; onCreated: () => Promise<void>; onConnectInstead: () => void }`; `AccountPicker` props `{ accounts: { id: string; bankName: string; accountName: string }[]; value: string | null; onChange: (id: string | null) => void; compact?: boolean }`.

- [ ] **Step 1: Create `AddAccountModal.tsx`**

```tsx
'use client';

import { useState } from 'react';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3333/api';
const input = 'w-full px-3 py-2 text-sm rounded-xl outline-none';
const inputStyle = { background: 'var(--color-elevated)', border: '1px solid var(--color-border)', color: 'var(--color-text-primary)' };

/** Creates a manual investment account (a prop-firm combine, a broker without a connection) and follows it. */
export default function AddAccountModal({ projectId, onClose, onCreated, onConnectInstead }: {
  projectId: string; onClose: () => void; onCreated: () => Promise<void>; onConnectInstead: () => void;
}) {
  const [form, setForm] = useState({ firm: 'Topstep', name: '', kind: 'prop_firm' as 'prop_firm' | 'broker', status: 'evaluation' as 'evaluation' | 'funded' | 'active', accountSize: '', startedAt: new Date().toISOString().slice(0, 10) });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setError(null);
    try {
      const r = await fetch(`${API}/projects/${projectId}/accounts`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify({ firm: form.firm.trim(), name: form.name.trim(), kind: form.kind, status: form.kind === 'broker' ? 'active' : form.status, accountSize: form.accountSize ? Number(form.accountSize) : null, startedAt: form.startedAt || null }),
      });
      if (!r.ok) throw new Error((await r.json().catch(() => ({})))?.message ?? 'Could not create the account');
      await onCreated();
      onClose();
    } catch (err: unknown) { setError(err instanceof Error ? err.message : 'Could not create the account'); }
    finally { setBusy(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(6px)' }} onClick={(e) => { if (e.target === e.currentTarget && !busy) onClose(); }}>
      <form onSubmit={submit} className="w-full max-w-md flex flex-col gap-4 p-5 rounded-2xl" style={{ background: 'var(--color-elevated)', border: 'var(--glass-border)', boxShadow: 'var(--glass-shadow)' }}>
        <div>
          <p className="font-bold text-sm" style={{ color: 'var(--color-text-primary)' }}>Add an account you are not connected to</p>
          <p className="text-xs mt-1" style={{ color: 'var(--color-text-muted)' }}>A prop-firm combine or funded account, or a broker without a bank connection. You will attribute its payments and payouts to it from the project's transactions.</p>
          <button type="button" onClick={onConnectInstead} className="text-xs font-semibold mt-1.5" style={{ color: 'var(--color-primary)' }}>Connected brokerage instead → pick it in the project form</button>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1 text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--color-text-muted)' }}>Firm
            <input className={input} style={inputStyle} value={form.firm} onChange={(e) => setForm((f) => ({ ...f, firm: e.target.value }))} placeholder="Topstep" required /></label>
          <label className="flex flex-col gap-1 text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--color-text-muted)' }}>Account name
            <input className={input} style={inputStyle} value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="50K #1" required /></label>
          <label className="flex flex-col gap-1 text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--color-text-muted)' }}>Kind
            <select className={input} style={inputStyle} value={form.kind} onChange={(e) => setForm((f) => ({ ...f, kind: e.target.value as 'prop_firm' | 'broker' }))}>
              <option value="prop_firm">Prop firm</option><option value="broker">Broker</option></select></label>
          {form.kind === 'prop_firm' && (
            <label className="flex flex-col gap-1 text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--color-text-muted)' }}>Status
              <select className={input} style={inputStyle} value={form.status} onChange={(e) => setForm((f) => ({ ...f, status: e.target.value as 'evaluation' | 'funded' }))}>
                <option value="evaluation">Evaluation</option><option value="funded">Funded</option></select></label>
          )}
          <label className="flex flex-col gap-1 text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--color-text-muted)' }}>Account size
            <input className={input} style={inputStyle} type="number" min="0" value={form.accountSize} onChange={(e) => setForm((f) => ({ ...f, accountSize: e.target.value }))} placeholder="50000" /></label>
          <label className="flex flex-col gap-1 text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--color-text-muted)' }}>Started
            <input className={input} style={inputStyle} type="date" value={form.startedAt} onChange={(e) => setForm((f) => ({ ...f, startedAt: e.target.value }))} /></label>
        </div>
        {error && <p className="text-xs" style={{ color: 'var(--color-rose)' }}>{error}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} disabled={busy} className="px-4 py-2 text-sm font-medium rounded-xl" style={{ color: 'var(--color-text-secondary)' }}>Cancel</button>
          <button type="submit" disabled={busy || !form.firm.trim() || !form.name.trim()} className="px-5 py-2 text-sm font-semibold rounded-xl text-white btn-gold disabled:opacity-50">{busy ? 'Adding…' : 'Add account'}</button>
        </div>
      </form>
    </div>
  );
}
```

- [ ] **Step 2: Create `AccountPicker.tsx`**

```tsx
'use client';

/** "Which account does this money belong to?" — a small select used on linked rows and in bulk assign. */
export default function AccountPicker({ accounts, value, onChange, compact = false }: {
  accounts: { id: string; bankName: string; accountName: string }[]; value: string | null; onChange: (id: string | null) => void; compact?: boolean;
}) {
  return (
    <select value={value ?? ''} onChange={(e) => onChange(e.target.value || null)} aria-label="Trading account"
      className={`${compact ? 'text-[10px] px-1.5 py-0.5' : 'text-xs px-2.5 py-1.5'} rounded-md font-semibold cursor-pointer outline-none`}
      style={{ background: value ? 'color-mix(in srgb, var(--color-card-sky) 14%, transparent)' : 'var(--color-elevated)', border: `1px solid ${value ? 'color-mix(in srgb, var(--color-card-sky) 35%, transparent)' : 'var(--color-border)'}`, color: value ? 'var(--color-card-sky)' : 'var(--color-text-muted)' }}>
      <option value="">No account</option>
      {accounts.map((a) => <option key={a.id} value={a.id}>{a.bankName} · {a.accountName}</option>)}
    </select>
  );
}
```

- [ ] **Step 3: Wire the modal, the row picker and bulk assign in `page.tsx`**

1. Imports: `import AddAccountModal from './trading/AddAccountModal'; import AccountPicker from './trading/AccountPicker';`
2. Change `onAddAccount={() => openEdit(sel)}` to `onAddAccount={() => setShowAddAccount(sel.id)}` and render, next to the other modals at the end of the page:

```tsx
      {showAddAccount && (
        <AddAccountModal projectId={showAddAccount} onClose={() => setShowAddAccount(null)}
          onCreated={async () => { await loadProjects(); await loadDetail(showAddAccount); setPerfRefresh((n) => n + 1); }}
          onConnectInstead={() => { const p = projects.find((x) => x.id === showAddAccount); setShowAddAccount(null); if (p) openEdit(p); }} />
      )}
```

3. Add the assign helper next to `reassignTxCategory`:

```tsx
  async function assignTxAccount(projectId: string, txIds: string[], accountId: string | null) {
    await fetch(`${API}/projects/${projectId}/assign-account`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
      body: JSON.stringify({ transactionIds: txIds, accountId }),
    });
    await loadDetail(projectId);
    setPerfRefresh((n) => n + 1);
  }
```

4. In the linked-transaction row, after `<ProjectCategoryPicker … />` add (trading projects only):

```tsx
                                  {sel.type === 'trading' && (sel.accounts?.length ?? 0) > 0 && (
                                    <AccountPicker compact accounts={sel.accounts!} value={tx.tradingAccountId ?? null} onChange={(id) => assignTxAccount(sel.id, [tx.id], id)} />
                                  )}
```

5. Bulk assign: above the linked-transactions list header, for trading projects with accounts and at least one row where `!tx.tradingAccountId`, render:

```tsx
                      {sel.type === 'trading' && (sel.accounts?.length ?? 0) > 0 && (sel.transactions ?? []).some((t) => !t.tradingAccountId) && (
                        <div className="flex items-center gap-2 flex-wrap px-3 py-2 rounded-xl text-xs" style={{ background: 'color-mix(in srgb, var(--color-amber) 8%, transparent)', border: '1px solid color-mix(in srgb, var(--color-amber) 25%, transparent)', color: 'var(--color-amber)' }}>
                          <span className="font-semibold">{(sel.transactions ?? []).filter((t) => !t.tradingAccountId).length} without an account.</span>
                          <span>Put all of them on</span>
                          <AccountPicker accounts={sel.accounts!} value={null}
                            onChange={(id) => { if (id) assignTxAccount(sel.id, (sel.transactions ?? []).filter((t) => !t.tradingAccountId).map((t) => t.id), id); }} />
                        </div>
                      )}
```

- [ ] **Step 4: Type-check, lint, look**

Run: `npx tsc --noEmit -p apps/web/tsconfig.json && npx eslint apps/web/src/app/projects`
Expected: clean. In the browser: "+ Add account" opens the modal; creating "Topstep · 50K #1" adds a card in Evaluation; each linked row shows the account select; the amber strip assigns every unassigned row at once; the account's cash tiles update.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/projects
git commit -m "feat(projects): add an unconnected trading account and attribute linked transactions to accounts

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 11: Pre-select the account when linking from Transactions; docs

**Files:**
- Modify: `apps/web/src/app/transactions/page.tsx:88` (`Project` type), `:775-800` (`linkToProject`)
- Modify: `CLAUDE.md` (Web table, Projects row — add one sentence), `docs/BACKLOG.md` (Monarch gap list / trading follow-ups)

**Interfaces:**
- Consumes: Task 6 `openPropAccount`; Task 3 `tradingAccountId` on the link body.

- [ ] **Step 1: Pre-select on link**

In `apps/web/src/app/transactions/page.tsx`:

1. Extend the `Project` type's `accounts` to `{ id: string; bankName: string; accountName: string; kind?: 'broker' | 'prop_firm'; status?: 'active' | 'evaluation' | 'funded' | 'failed' | 'closed' }[]`.
2. `import { openPropAccount } from '@/lib/projects/trading';`
3. In `linkToProject`, build the body with the pre-selected account:

```tsx
      const proj = projects.find((p) => p.id === projectId);
      const tradingAccountId = proj?.type === 'trading' ? openPropAccount(proj.accounts ?? []) : null;
      await fetch(`${API}/projects/${projectId}/link/${txId}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify({ projectCategoryId, ...(tradingAccountId ? { tradingAccountId } : {}) }),
      });
```

   and include `tradingAccountId` in the optimistic `setTransactions` updates where `projectId` is set (`{ ...t, projectId, projectCategoryId, tradingAccountId }`) — add `tradingAccountId?: string | null` to this page's `Transaction` type if it is not there.

- [ ] **Step 2: Docs**

In `CLAUDE.md`, Web table, add a row:

```
| `app/projects/trading/` | A trading project's accounts: level 1 (`TradingAccountsSection`: overview strip, money in/out, one card per account), level 2 (`AccountView`: status, cash tiles, engine panels, attributed money). Accounts are followed through `project_accounts` (with kind/status/firm metadata); a prop-firm account the user is not connected to is a manual `investment` account created from the project; linked transactions carry `tradingAccountId`. Pure helpers in `lib/projects/trading.ts`; API cash metrics in `apps/api/src/investments/trading-cash.ts`. Spec: `docs/superpowers/specs/2026-10-31-trading-accounts-design.md`. |
```

In `docs/BACKLOG.md`, under the trading / investments follow-ups, add:

```
- **Trading accounts phase B** — trade import for unconnected accounts (TopstepX,
  Tradovate CSV → `closed_trade` rows), trade statistics (expectancy, drawdown,
  streaks, by weekday), full trade list. Spec §3 and §5.
```

- [ ] **Step 3: Full verification**

Run:

```bash
npx tsc --noEmit -p apps/api/tsconfig.app.json
npx tsc --noEmit -p apps/web/tsconfig.json
npm run test:api
npm run test:dashboard
npm run migration:check
```

Expected: both compile (web: only the pre-existing ChatMarkdown.test error); every API and web test passes; migration check exits 0.

- [ ] **Step 4: Manual walk-through**

With both dev servers up: create a trading project, add "Topstep · 50K #1" from the project, link a card payment (evaluation) and a checking deposit (payout) to the project from Transactions (the account is pre-selected), open the project: strip shows money in/out, the card shows net cash and payouts, click the card: cash tiles and the money list; set status to Funded; connect nothing else. Reload with the URL: the same account view opens.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/transactions/page.tsx CLAUDE.md docs/BACKLOG.md
git commit -m "feat(transactions): pre-select the open prop-firm account when linking; docs for trading accounts

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```
