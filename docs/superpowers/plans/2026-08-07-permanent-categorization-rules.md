# Permanent Categorization Rules Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a user mark a transaction's category as "permanent" from the transaction view, persisting a `CategorizationRule` that immediately categorizes the user's other matching uncategorized transactions, keeps applying to new ones as they arrive (Plaid sync / CSV import / manual entry), and is visible/editable/deletable from a new Settings tab.

**Architecture:** New backend module `apps/api/src/categorization-rules/` (entity + service + controller), wired into the three existing transaction-creation paths (`PlaidService.syncTransactions`, `TransactionsService.importCsv`, `TransactionsService.createManual`) and into `CategoriesService.remove()` for cleanup. Frontend: a checkbox added to the existing inline category picker in `apps/web/src/app/transactions/page.tsx`, plus a new `RulesManager.tsx` component wired into a new "Rules" tab in `apps/web/src/app/settings/page.tsx`.

**Tech Stack:** NestJS 11 + TypeORM (api, `synchronize: true` — no migrations needed), Next.js 16 / React 19 / Tailwind v4 (web).

## Global Constraints

- No test runner is configured for `apps/api` — verify backend changes manually via `npm run build:api` (type-safety) plus `curl` against a running API, per this repo's established convention (see `docs/superpowers/plans/2026-08-06-receipt-detail-panel-redesign.md` Task 2).
- `apps/web` only has vitest coverage for pure-logic files under `src/lib/{dashboard,receipts,budgets}/**` — this feature adds no new pure-logic module (all matching logic lives server-side), so no new vitest file is needed; verify the UI manually via `npm run dev:web` plus `npm run build:web`.
- Colors/surfaces must only ever come from the CSS variables already defined in `apps/web/src/app/globals.css` (`--color-*`) — never hardcode hex/theme colors in components.
- Every page/panel must remain responsive across screen sizes.
- Discovered during planning (corrects the design spec): this codebase does **not** rely on TypeORM's declarative `onDelete: 'CASCADE'` to actually clean up dependent rows in practice — `CategoriesService.remove()` already explicitly deletes dependent `Budget` rows first, with a comment explaining DB-level cascade "isn't guaranteed across environments." `CategorizationRule` cleanup on category deletion must follow the same explicit-delete pattern (Task 2), not rely on the entity's `onDelete` decorator alone.

---

## Task 1: Backend — CategorizationRule entity + CRUD API

**Files:**
- Create: `apps/api/src/categorization-rules/categorization-rule.entity.ts`
- Create: `apps/api/src/categorization-rules/categorization-rules.service.ts`
- Create: `apps/api/src/categorization-rules/categorization-rules.controller.ts`
- Create: `apps/api/src/categorization-rules/categorization-rules.module.ts`
- Modify: `apps/api/src/config/database.config.ts`
- Modify: `apps/api/src/app/app.module.ts`

**Interfaces:**
- Consumes: `Transaction` entity (`apps/api/src/transactions/transaction.entity.ts`), `Category` entity (`apps/api/src/categories/category.entity.ts`), `User` entity (`apps/api/src/users/user.entity.ts`).
- Produces: `CategorizationRule` entity (`id`, `userId`, `matchType: 'merchant' | 'name'`, `matchValue: string`, `categoryId`, `createdAt`). `CategorizationRulesService` with `findAllByUser(userId)`, `getActiveRules(userId): Promise<CategorizationRule[]>`, `matchRule(rules, candidate: { merchantName?: string | null; name: string }): string | null`, `create(userId, transactionId, categoryId): Promise<{ rule, appliedCount }>`, `update(id, userId, dto): Promise<{ rule, appliedCount }>`, `remove(id, userId): Promise<void>`. Exposed as `GET/POST /categorization-rules`, `PATCH/DELETE /categorization-rules/:id`. `getActiveRules` and `matchRule` are consumed by Task 2 (creation-path wiring).

- [ ] **Step 1: Create the entity**

Create `apps/api/src/categorization-rules/categorization-rule.entity.ts`:

```ts
import {
  Entity, PrimaryGeneratedColumn, Column,
  ManyToOne, JoinColumn, Unique,
  CreateDateColumn,
} from 'typeorm';
import { User } from '../users/user.entity';
import { Category } from '../categories/category.entity';

/* Match text/category is fixed once created except via update(); duplicates for the
   same user+matchType+matchValue are rejected at create/update time (service-level
   check backed by this DB constraint). */
@Entity('categorization_rules')
@Unique(['userId', 'matchType', 'matchValue'])
export class CategorizationRule {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column()
  userId: string;

  /* 'merchant' matches Transaction.merchantName, 'name' matches Transaction.name */
  @Column()
  matchType: 'merchant' | 'name';

  @Column()
  matchValue: string;

  @ManyToOne(() => Category, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'categoryId' })
  category: Category;

  @Column()
  categoryId: string;

  @CreateDateColumn()
  createdAt: Date;
}
```

- [ ] **Step 2: Create the service**

Create `apps/api/src/categorization-rules/categorization-rules.service.ts`:

```ts
import { Injectable, NotFoundException, ForbiddenException, ConflictException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CategorizationRule } from './categorization-rule.entity';
import { Transaction } from '../transactions/transaction.entity';
import { Category } from '../categories/category.entity';

export interface RuleWithApplyCount {
  rule: CategorizationRule;
  appliedCount: number;
}

@Injectable()
export class CategorizationRulesService {
  constructor(
    @InjectRepository(CategorizationRule) private repo: Repository<CategorizationRule>,
    @InjectRepository(Transaction) private txRepo: Repository<Transaction>,
    @InjectRepository(Category) private catRepo: Repository<Category>,
  ) {}

  findAllByUser(userId: string): Promise<CategorizationRule[]> {
    return this.repo.find({ where: { userId }, relations: ['category'], order: { createdAt: 'DESC' } });
  }

  getActiveRules(userId: string): Promise<CategorizationRule[]> {
    return this.repo.find({ where: { userId } });
  }

  /* Picks the categoryId a new, uncategorized transaction should get, or null.
     A merchant-type match takes precedence over a name-type match. */
  matchRule(rules: CategorizationRule[], candidate: { merchantName?: string | null; name: string }): string | null {
    const norm = (s: string) => s.trim().toLowerCase();
    if (candidate.merchantName) {
      const m = rules.find((r) => r.matchType === 'merchant' && norm(r.matchValue) === norm(candidate.merchantName!));
      if (m) return m.categoryId;
    }
    const n = rules.find((r) => r.matchType === 'name' && norm(r.matchValue) === norm(candidate.name));
    return n ? n.categoryId : null;
  }

  async create(userId: string, transactionId: string, categoryId: string): Promise<RuleWithApplyCount> {
    const tx = await this.txRepo.findOneBy({ id: transactionId, userId });
    if (!tx) throw new NotFoundException('Transaction not found');

    const category = await this.catRepo.findOneBy({ id: categoryId });
    if (!category || category.userId !== userId) throw new ForbiddenException('Category not found');

    const matchType: 'merchant' | 'name' = tx.merchantName ? 'merchant' : 'name';
    const matchValue = (tx.merchantName || tx.name || '').trim();
    if (!matchValue) throw new BadRequestException('This transaction has no merchant or name to match on');

    const existing = await this.repo.findOne({ where: { userId, matchType, matchValue } });
    if (existing) {
      throw new ConflictException({ message: 'A rule for this merchant already exists', existingRuleId: existing.id });
    }

    const rule = await this.repo.save(this.repo.create({ userId, matchType, matchValue, categoryId }));
    const appliedCount = await this.applyToUncategorized(userId, matchType, matchValue, categoryId);
    return { rule: await this.repo.findOne({ where: { id: rule.id }, relations: ['category'] }), appliedCount };
  }

  async update(id: string, userId: string, dto: { matchValue?: string; categoryId?: string }): Promise<RuleWithApplyCount> {
    const rule = await this.repo.findOneBy({ id });
    if (!rule) throw new NotFoundException();
    if (rule.userId !== userId) throw new ForbiddenException();

    if (dto.categoryId) {
      const category = await this.catRepo.findOneBy({ id: dto.categoryId });
      if (!category || category.userId !== userId) throw new ForbiddenException('Category not found');
      rule.categoryId = dto.categoryId;
    }

    if (dto.matchValue !== undefined) {
      const matchValue = dto.matchValue.trim();
      if (!matchValue) throw new BadRequestException('Match text cannot be empty');
      const existing = await this.repo.findOne({ where: { userId, matchType: rule.matchType, matchValue } });
      if (existing && existing.id !== rule.id) {
        throw new ConflictException({ message: 'A rule for this merchant already exists', existingRuleId: existing.id });
      }
      rule.matchValue = matchValue;
    }

    await this.repo.save(rule);
    const appliedCount = await this.applyToUncategorized(userId, rule.matchType, rule.matchValue, rule.categoryId);
    return { rule: await this.repo.findOne({ where: { id: rule.id }, relations: ['category'] }), appliedCount };
  }

  async remove(id: string, userId: string): Promise<void> {
    const rule = await this.repo.findOneBy({ id });
    if (!rule) throw new NotFoundException();
    if (rule.userId !== userId) throw new ForbiddenException();
    await this.repo.remove(rule);
  }

  private async applyToUncategorized(userId: string, matchType: 'merchant' | 'name', matchValue: string, categoryId: string): Promise<number> {
    const column = matchType === 'merchant' ? 'merchantName' : 'name';
    const result = await this.txRepo
      .createQueryBuilder()
      .update(Transaction)
      .set({ categoryId })
      .where('userId = :userId', { userId })
      .andWhere('categoryId IS NULL')
      .andWhere(`LOWER(${column}) = LOWER(:matchValue)`, { matchValue })
      .execute();
    return result.affected ?? 0;
  }
}
```

- [ ] **Step 3: Create the controller**

Create `apps/api/src/categorization-rules/categorization-rules.controller.ts`:

```ts
import { Controller, Get, Post, Patch, Delete, Param, Body, UseGuards, Request } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CategorizationRulesService } from './categorization-rules.service';

@UseGuards(JwtAuthGuard)
@Controller('categorization-rules')
export class CategorizationRulesController {
  constructor(private service: CategorizationRulesService) {}

  @Get()
  list(@Request() req: any) {
    return this.service.findAllByUser(req.user.id);
  }

  @Post()
  create(@Request() req: any, @Body() body: { transactionId: string; categoryId: string }) {
    return this.service.create(req.user.id, body.transactionId, body.categoryId);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Request() req: any, @Body() body: { matchValue?: string; categoryId?: string }) {
    return this.service.update(id, req.user.id, body);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @Request() req: any) {
    return this.service.remove(id, req.user.id);
  }
}
```

- [ ] **Step 4: Create the module**

Create `apps/api/src/categorization-rules/categorization-rules.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CategorizationRule } from './categorization-rule.entity';
import { Transaction } from '../transactions/transaction.entity';
import { Category } from '../categories/category.entity';
import { CategorizationRulesService } from './categorization-rules.service';
import { CategorizationRulesController } from './categorization-rules.controller';

@Module({
  imports: [TypeOrmModule.forFeature([CategorizationRule, Transaction, Category])],
  providers: [CategorizationRulesService],
  controllers: [CategorizationRulesController],
  exports: [CategorizationRulesService],
})
export class CategorizationRulesModule {}
```

- [ ] **Step 5: Register the entity and module**

In `apps/api/src/config/database.config.ts`, add the import after line 16 (`import { Receipt } from '../receipts/receipt.entity';`):

```ts
import { CategorizationRule } from '../categorization-rules/categorization-rule.entity';
```

Change line 25's `entities` array from:

```ts
  entities: [User, BankAccount, PlaidItem, Transaction, Category, Budget, Project, ProjectCategory, Debt, DebtPayment, ConnectedApp, Receipt],
```

to:

```ts
  entities: [User, BankAccount, PlaidItem, Transaction, Category, Budget, Project, ProjectCategory, Debt, DebtPayment, ConnectedApp, Receipt, CategorizationRule],
```

In `apps/api/src/app/app.module.ts`, add the import after `import { ReceiptsModule } from '../receipts/receipts.module';`:

```ts
import { CategorizationRulesModule } from '../categorization-rules/categorization-rules.module';
```

Add `CategorizationRulesModule,` to the `imports` array, right after `ReceiptsModule,`.

- [ ] **Step 6: Build and verify**

Run: `npm run build:api`
Expected: build succeeds with no type errors.

Run `npm run dev:api` (or `node dist/apps/api/main.js` after building), then with a logged-in session cookie:

```bash
# List (should be an empty array on a fresh account)
curl -s -b "access_token=<your cookie>" http://localhost:3333/api/categorization-rules

# Find a transaction id and a category id to test with
curl -s -b "access_token=<your cookie>" http://localhost:3333/api/transactions | head -c 500
curl -s -b "access_token=<your cookie>" http://localhost:3333/api/categories | head -c 500

# Create a rule
curl -s -b "access_token=<your cookie>" -X POST http://localhost:3333/api/categorization-rules \
  -H "Content-Type: application/json" \
  -d '{"transactionId":"<a transaction id>","categoryId":"<a category id>"}'
```

Expected: the POST returns `{ "rule": { "id": "...", "matchType": "merchant"|"name", "matchValue": "...", "categoryId": "...", "category": {...}, ... }, "appliedCount": <number> }`. A second identical POST (same merchant/name, different transaction) returns HTTP 409 with `{ "message": "...", "existingRuleId": "<the first rule's id>" }`. `GET /categorization-rules` now lists it. `PATCH /categorization-rules/<id>` with `{"categoryId":"<a different category id>"}` updates it. `DELETE /categorization-rules/<id>` removes it and a follow-up `GET` no longer lists it.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/categorization-rules apps/api/src/config/database.config.ts apps/api/src/app/app.module.ts
git commit -m "feat(api): add categorization rules CRUD module"
```

---

## Task 2: Backend — auto-apply rules to new transactions + category-delete cleanup

**Files:**
- Modify: `apps/api/src/transactions/transactions.service.ts`
- Modify: `apps/api/src/transactions/transactions.module.ts`
- Modify: `apps/api/src/plaid/plaid.service.ts`
- Modify: `apps/api/src/plaid/plaid.module.ts`
- Modify: `apps/api/src/categories/categories.service.ts`
- Modify: `apps/api/src/categories/categories.module.ts`

**Interfaces:**
- Consumes: `CategorizationRulesService.getActiveRules(userId)` and `.matchRule(rules, candidate)` (Task 1).
- Produces: no new exports — this task is entirely about calling Task 1's service from the three transaction-creation paths, plus category-deletion cleanup.

- [ ] **Step 1: Wire `CategorizationRulesModule` into `TransactionsModule` and `PlaidModule`**

In `apps/api/src/transactions/transactions.module.ts`, add the import:

```ts
import { CategorizationRulesModule } from '../categorization-rules/categorization-rules.module';
```

Change the `imports` array from:

```ts
  imports: [TypeOrmModule.forFeature([Transaction, BankAccount, ProjectCategory, Receipt]), DebtsModule, GmailModule],
```

to:

```ts
  imports: [TypeOrmModule.forFeature([Transaction, BankAccount, ProjectCategory, Receipt]), DebtsModule, GmailModule, CategorizationRulesModule],
```

In `apps/api/src/plaid/plaid.module.ts`, add the import:

```ts
import { CategorizationRulesModule } from '../categorization-rules/categorization-rules.module';
```

Change the `imports` array from:

```ts
  imports: [TypeOrmModule.forFeature([PlaidItem, BankAccount, Transaction])],
```

to:

```ts
  imports: [TypeOrmModule.forFeature([PlaidItem, BankAccount, Transaction]), CategorizationRulesModule],
```

- [ ] **Step 2: Apply rules in `TransactionsService.createManual` and `.importCsv`**

In `apps/api/src/transactions/transactions.service.ts`, add the import after the existing `isLiabilityType` import:

```ts
import { CategorizationRulesService } from '../categorization-rules/categorization-rules.service';
```

Change the constructor from:

```ts
  constructor(
    @InjectRepository(Transaction) private repo: Repository<Transaction>,
    @InjectRepository(BankAccount) private accountRepo: Repository<BankAccount>,
    @InjectRepository(ProjectCategory) private projCatRepo: Repository<ProjectCategory>,
    private debtsService: DebtsService,
  ) {}
```

to:

```ts
  constructor(
    @InjectRepository(Transaction) private repo: Repository<Transaction>,
    @InjectRepository(BankAccount) private accountRepo: Repository<BankAccount>,
    @InjectRepository(ProjectCategory) private projCatRepo: Repository<ProjectCategory>,
    private debtsService: DebtsService,
    private rulesService: CategorizationRulesService,
  ) {}
```

In `importCsv`, change:

```ts
    let imported = 0;
    let skipped = 0;

    for (const row of rows) {
```

to:

```ts
    let imported = 0;
    let skipped = 0;
    const rules = await this.rulesService.getActiveRules(userId);

    for (const row of rows) {
```

and change the transaction-creation call inside that loop from:

```ts
      await this.repo.save(
        this.repo.create({
          userId,
          bankAccountId,
          externalId: externalId ?? undefined,
          source: 'csv',
          amount: row.amount,
          name: row.name,
          date: normalizeDate(row.date),
          pending: false,
        }),
      );
      imported++;
```

to:

```ts
      await this.repo.save(
        this.repo.create({
          userId,
          bankAccountId,
          externalId: externalId ?? undefined,
          source: 'csv',
          amount: row.amount,
          name: row.name,
          date: normalizeDate(row.date),
          pending: false,
          categoryId: this.rulesService.matchRule(rules, { name: row.name }) ?? undefined,
        }),
      );
      imported++;
```

In `createManual`, change:

```ts
    if (dto.debtId && !(Math.abs(dto.amount) > 0)) throw new BadRequestException('A debt repayment amount must be non-zero.');
    const saved = await this.repo.save(
      this.repo.create({
        userId,
        bankAccountId: dto.bankAccountId ?? undefined,
        source: 'manual',
        amount: dto.amount,
        name: dto.name,
        date: dto.date,
        pending: false,
        note: dto.note ?? null,
        categoryId: dto.debtId ? undefined : (dto.categoryId ?? undefined),
        debtId: dto.debtId ?? undefined,
      }),
    );
```

to:

```ts
    if (dto.debtId && !(Math.abs(dto.amount) > 0)) throw new BadRequestException('A debt repayment amount must be non-zero.');

    const matchedCategoryId = dto.debtId || dto.categoryId
      ? null
      : this.rulesService.matchRule(await this.rulesService.getActiveRules(userId), { name: dto.name });

    const saved = await this.repo.save(
      this.repo.create({
        userId,
        bankAccountId: dto.bankAccountId ?? undefined,
        source: 'manual',
        amount: dto.amount,
        name: dto.name,
        date: dto.date,
        pending: false,
        note: dto.note ?? null,
        categoryId: dto.debtId ? undefined : (dto.categoryId ?? matchedCategoryId ?? undefined),
        debtId: dto.debtId ?? undefined,
      }),
    );
```

- [ ] **Step 3: Apply rules in `PlaidService.syncTransactions`**

In `apps/api/src/plaid/plaid.service.ts`, add the import after the existing `token-crypto.util` import:

```ts
import { CategorizationRulesService } from '../categorization-rules/categorization-rules.service';
```

Change the constructor from:

```ts
  constructor(
    private config: ConfigService,
    @InjectRepository(PlaidItem) private itemRepo: Repository<PlaidItem>,
    @InjectRepository(BankAccount) private accountRepo: Repository<BankAccount>,
    @InjectRepository(Transaction) private txRepo: Repository<Transaction>,
  ) {
```

to:

```ts
  constructor(
    private config: ConfigService,
    @InjectRepository(PlaidItem) private itemRepo: Repository<PlaidItem>,
    @InjectRepository(BankAccount) private accountRepo: Repository<BankAccount>,
    @InjectRepository(Transaction) private txRepo: Repository<Transaction>,
    private rulesService: CategorizationRulesService,
  ) {
```

In `syncTransactions`, change:

```ts
      const res = await this.client.transactionsGet({
        access_token: accessToken,
        start_date: startDate,
        end_date: endDate,
        options: { count: 500, offset: 0 },
      });

      for (const pt of res.data.transactions) {
```

to:

```ts
      const res = await this.client.transactionsGet({
        access_token: accessToken,
        start_date: startDate,
        end_date: endDate,
        options: { count: 500, offset: 0 },
      });

      const rules = await this.rulesService.getActiveRules(item.userId);

      for (const pt of res.data.transactions) {
```

and change the transaction-creation call inside that loop from:

```ts
        await this.txRepo.save(
          this.txRepo.create({
            userId: item.userId,
            bankAccountId: account.id,
            externalId: pt.transaction_id,
            /* Plaid: positive = debit; we flip so positive = money in */
            amount: -(pt.amount),
            name: pt.name,
            merchantName: pt.merchant_name ?? undefined,
            plaidCategory: pt.category ?? [],
            date: pt.date,
            pending: pt.pending,
          }),
        );
```

to:

```ts
        await this.txRepo.save(
          this.txRepo.create({
            userId: item.userId,
            bankAccountId: account.id,
            externalId: pt.transaction_id,
            /* Plaid: positive = debit; we flip so positive = money in */
            amount: -(pt.amount),
            name: pt.name,
            merchantName: pt.merchant_name ?? undefined,
            plaidCategory: pt.category ?? [],
            date: pt.date,
            pending: pt.pending,
            categoryId: this.rulesService.matchRule(rules, { merchantName: pt.merchant_name, name: pt.name }) ?? undefined,
          }),
        );
```

- [ ] **Step 4: Clean up rules when their category is deleted**

In `apps/api/src/categories/categories.module.ts`, add the import:

```ts
import { CategorizationRule } from '../categorization-rules/categorization-rule.entity';
```

Change the `imports` array from:

```ts
  imports: [TypeOrmModule.forFeature([Category, Transaction, Budget])],
```

to:

```ts
  imports: [TypeOrmModule.forFeature([Category, Transaction, Budget, CategorizationRule])],
```

In `apps/api/src/categories/categories.service.ts`, add the import:

```ts
import { CategorizationRule } from '../categorization-rules/categorization-rule.entity';
```

Change the constructor from:

```ts
  constructor(
    @InjectRepository(Category) private repo: Repository<Category>,
    @InjectRepository(Transaction) private txRepo: Repository<Transaction>,
    @InjectRepository(Budget) private budgetRepo: Repository<Budget>,
  ) {}
```

to:

```ts
  constructor(
    @InjectRepository(Category) private repo: Repository<Category>,
    @InjectRepository(Transaction) private txRepo: Repository<Transaction>,
    @InjectRepository(Budget) private budgetRepo: Repository<Budget>,
    @InjectRepository(CategorizationRule) private rulesRepo: Repository<CategorizationRule>,
  ) {}
```

Change `remove()` from:

```ts
  async remove(id: string, userId: string, reassignTo?: string): Promise<void> {
    const cat = await this.repo.findOneBy({ id });
    if (!cat) throw new NotFoundException();
    if (cat.userId !== userId) throw new ForbiddenException();
    if (reassignTo) {
      await this.txRepo.update({ categoryId: id }, { categoryId: reassignTo });
    }
    // Budgets reference this category. Don't rely on a DB-level cascade (it isn't
    // guaranteed across environments) — clean them up explicitly so the delete
    // never leaves an orphaned budget that renders as a phantom "Unknown" row.
    await this.budgetRepo.delete({ categoryId: id });
    await this.repo.remove(cat);
  }
```

to:

```ts
  async remove(id: string, userId: string, reassignTo?: string): Promise<void> {
    const cat = await this.repo.findOneBy({ id });
    if (!cat) throw new NotFoundException();
    if (cat.userId !== userId) throw new ForbiddenException();
    if (reassignTo) {
      await this.txRepo.update({ categoryId: id }, { categoryId: reassignTo });
    }
    // Budgets and categorization rules reference this category. Don't rely on a
    // DB-level cascade (it isn't guaranteed across environments) — clean them up
    // explicitly so the delete never leaves an orphaned budget/rule behind.
    await this.budgetRepo.delete({ categoryId: id });
    await this.rulesRepo.delete({ categoryId: id });
    await this.repo.remove(cat);
  }
```

- [ ] **Step 5: Build and verify**

Run: `npm run build:api`
Expected: build succeeds with no type errors.

Run `npm run dev:api`, then with a logged-in session cookie:

1. Create a rule (as in Task 1 Step 6) for a merchant that also has other **uncategorized** transactions with the same `merchantName` (check via `GET /transactions`) — confirm the response's `appliedCount` matches how many you expected, and `GET /transactions` now shows those rows carrying the rule's `categoryId`.
2. Manually create a transaction with no `categoryId` in the body, whose `name` matches an active `name`-type rule (`POST /transactions` with `{"name":"<matching name>","amount":-10,"date":"2026-08-07"}`) — confirm the created transaction comes back with that rule's `categoryId` set.
3. `DELETE /categories/<id>?` a category that has an active rule pointing at it — confirm the response succeeds (204) and a follow-up `GET /categorization-rules` no longer lists that rule.
4. If you have Plaid sandbox credentials configured, trigger a sync (`POST /plaid/sync/:itemId` or equivalent) after creating a rule for a merchant you expect to appear, and confirm newly-synced transactions for that merchant land pre-categorized. (Skip this sub-step if no Plaid sandbox item is connected locally — Tasks 1-2's curl checks already cover the matching logic end-to-end via the manual-create and CSV-import paths.)

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/transactions/transactions.service.ts apps/api/src/transactions/transactions.module.ts apps/api/src/plaid/plaid.service.ts apps/api/src/plaid/plaid.module.ts apps/api/src/categories/categories.service.ts apps/api/src/categories/categories.module.ts
git commit -m "feat(api): auto-apply categorization rules to new transactions and clean up on category delete"
```

---

## Task 3: Frontend — "make permanent" trigger in the transaction category picker

**Files:**
- Modify: `apps/web/src/app/transactions/page.tsx`

**Interfaces:**
- Consumes: `POST /categorization-rules` (Task 1).
- Produces: no new exports — this task only changes `page.tsx`'s internal state and JSX.

- [ ] **Step 1: Add `merchantName` to the `Transaction` interface**

Change the `Transaction` interface (lines 27-41) from:

```ts
interface Transaction {
  id: string; name: string; amount: number; date: string; source: string; pending: boolean;
  categoryId: string | null; categoryRef: Category | null;
```

to:

```ts
interface Transaction {
  id: string; name: string; merchantName: string | null; amount: number; date: string; source: string; pending: boolean;
  categoryId: string | null; categoryRef: Category | null;
```

(The API already returns `merchantName` on every transaction — `TransactionsService.findByUser` selects the full entity — only the frontend type was missing it.)

- [ ] **Step 2: Add picker/toast state**

Add a `RuleToast` type near the top of the file, right after the `type Filter` / `type RangeMode` declarations (after line 45):

```ts
type RuleToast =
  | { kind: 'created'; matchLabel: string; appliedCount: number }
  | { kind: 'duplicate'; matchLabel: string };
```

Add a new picker state var right after `const [pickerSearch, setPickerSearch] = useState('');` (line 121):

```ts
  const [pickerMakePermanent, setPickerMakePermanent] = useState(false);
```

Add toast state right after `const [importToast, setImportToast] = useState<{...}>(null);` and its `importToastTimer` ref (lines 152-153):

```ts
  const [ruleToast, setRuleToast] = useState<RuleToast | null>(null);
  const ruleToastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
```

- [ ] **Step 3: Reset the checkbox whenever the picker opens/closes**

Add a new `useEffect`, right after the outside-click-close effect that ends at line 293 (`}, [openPickerId, showImportPicker]);`):

```ts
  useEffect(() => {
    setPickerMakePermanent(false);
  }, [openPickerId]);
```

- [ ] **Step 4: Add `chooseCategory` and `createRule` functions**

Add these two functions right after `assignCategory` ends (after line 342, before `async function assignDebt(...)`):

```ts
  async function chooseCategory(tx: Transaction, categoryId: string) {
    const makePermanent = pickerMakePermanent;
    await assignCategory(tx.id, categoryId);
    if (makePermanent) {
      await createRule(tx, categoryId);
    }
  }

  async function createRule(tx: Transaction, categoryId: string) {
    const matchLabel = tx.merchantName || tx.name;
    const res = await fetch(`${API}/categorization-rules`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      credentials: 'include', body: JSON.stringify({ transactionId: tx.id, categoryId }),
    });
    if (ruleToastTimer.current) clearTimeout(ruleToastTimer.current);
    if (res.status === 409) {
      setRuleToast({ kind: 'duplicate', matchLabel });
      ruleToastTimer.current = setTimeout(() => setRuleToast(null), 6000);
      return;
    }
    if (!res.ok) return;
    const { appliedCount } = await res.json();
    setRuleToast({ kind: 'created', matchLabel, appliedCount });
    ruleToastTimer.current = setTimeout(() => setRuleToast(null), 6000);
    if (appliedCount > 0) loadTransactions();
  }
```

- [ ] **Step 5: Add the checkbox and route category clicks through `chooseCategory`**

Find the "Normal categories" block:

```tsx
                                ) : !pickerProjectDrill ? (
                                  /* ── Normal categories ── */
                                  <>
                                    {pickerCats.map((c) => (
```

Insert a checkbox right after the `<>` and before `{pickerCats.map(...)}`:

```tsx
                                ) : !pickerProjectDrill ? (
                                  /* ── Normal categories ── */
                                  <>
                                    <label className="flex items-center gap-2 px-3 py-2 text-[11px] cursor-pointer"
                                      style={{ borderBottom: '1px solid var(--color-border)' }}>
                                      <input type="checkbox" checked={pickerMakePermanent}
                                        onChange={(e) => setPickerMakePermanent(e.target.checked)}
                                        disabled={!tx.merchantName && !tx.name.trim()}
                                        className="rounded" />
                                      <span style={{ color: 'var(--color-text-secondary)' }}>
                                        Always categorize <strong>{tx.merchantName || tx.name}</strong> as this
                                      </span>
                                    </label>

                                    {pickerCats.map((c) => (
```

Inside that same `pickerCats.map` block, change the non-transfer branch's category-assign call from:

```ts
                                        } else {
                                          assignCategory(tx.id, c.id);
                                        }
```

to:

```ts
                                        } else {
                                          chooseCategory(tx, c.id);
                                        }
```

In the secondary-type list right below (`pickerCatsAlt.map`), change:

```tsx
                                          <button key={c.id} onClick={() => assignCategory(tx.id, c.id)}
```

to:

```tsx
                                          <button key={c.id} onClick={() => chooseCategory(tx, c.id)}
```

- [ ] **Step 6: Render the rule toast**

Right after the closing of the existing import-toast portal block (after the `)}` that follows `document.body` at the end of the `{importToast && createPortal(...)}` block, before the `{/* CSV Import modal */}` comment), add:

```tsx
        {/* ── Categorization rule toast ── */}
        {ruleToast && createPortal(
          <div
            className="fixed bottom-6 right-6 z-50 flex items-start gap-3 px-4 py-3.5 rounded-2xl"
            style={{
              background: 'var(--color-surface)',
              border: 'var(--glass-border)',
              boxShadow: 'var(--glass-shadow)',
              backdropFilter: 'var(--glass-blur)',
              minWidth: '260px',
              maxWidth: '360px',
              animation: 'slideUp 0.25s ease-out',
            }}>
            <div className="w-9 h-9 rounded-xl flex items-center justify-center text-lg shrink-0"
              style={{ background: 'color-mix(in srgb, var(--color-card-violet) 20%, transparent)' }}>
              📌
            </div>
            <div className="flex-1 min-w-0">
              {ruleToast.kind === 'created' ? (
                <>
                  <p className="text-sm font-semibold">Rule created</p>
                  <p className="text-xs mt-0.5" style={{ color: 'var(--color-text-muted)' }}>
                    {ruleToast.appliedCount > 0
                      ? `Applied to ${ruleToast.appliedCount} other transaction${ruleToast.appliedCount !== 1 ? 's' : ''}.`
                      : `"${ruleToast.matchLabel}" will auto-categorize from now on.`}
                  </p>
                </>
              ) : (
                <>
                  <p className="text-sm font-semibold">Rule already exists</p>
                  <p className="text-xs mt-0.5" style={{ color: 'var(--color-text-muted)' }}>
                    A rule for "{ruleToast.matchLabel}" already exists.{' '}
                    <a href="/settings?tab=rules" className="underline" style={{ color: 'var(--color-sky)' }}>Edit it in Settings</a>
                  </p>
                </>
              )}
            </div>
            <button onClick={() => { setRuleToast(null); if (ruleToastTimer.current) clearTimeout(ruleToastTimer.current); }}
              className="w-6 h-6 rounded-lg flex items-center justify-center hover:bg-[var(--color-elevated)] shrink-0 mt-0.5"
              style={{ color: 'var(--color-text-muted)' }}>
              <CloseIcon />
            </button>
          </div>,
          document.body
        )}

```

- [ ] **Step 7: Verify it compiles and behaves correctly**

Run: `npm run build:web`
Expected: build succeeds, no type errors.

Manually: `npm run dev:web`, open `/transactions`:
- Open the category picker on an uncategorized transaction that has other uncategorized transactions sharing its merchant/name. Check "Always categorize as this", pick a category. Confirm the picker closes, the row shows the new category, and the rule toast appears reading "Applied to N other transactions."
- Repeat on a transaction whose merchant already has a rule (from the step above) — confirm a 409 toast appears with a working "Edit it in Settings" link (the link can 404/blank for now — Task 4 builds that destination).
- Open the picker on a transaction and leave the checkbox unchecked — confirm picking a category behaves exactly as before (no rule created, no toast).
- Confirm the checkbox is disabled (and unchecked) for a transaction that somehow has neither `merchantName` nor a non-blank `name` (edge case — fine if none exist locally to test; verify the `disabled` condition compiles correctly at minimum via the build).

- [ ] **Step 8: Commit**

```bash
git add apps/web/src/app/transactions/page.tsx
git commit -m "feat(web): add permanent-categorization checkbox to the transaction category picker"
```

---

## Task 4: Frontend — Settings "Rules" tab

**Files:**
- Create: `apps/web/src/components/RulesManager.tsx`
- Modify: `apps/web/src/app/settings/page.tsx`

**Interfaces:**
- Consumes: `GET /categorization-rules`, `PATCH /categorization-rules/:id`, `DELETE /categorization-rules/:id`, `GET /categories` (Task 1, existing).
- Produces: `RulesManager` component (default export, no props), consumed by `settings/page.tsx`.

- [ ] **Step 1: Create `RulesManager.tsx`**

Create `apps/web/src/components/RulesManager.tsx`:

```tsx
'use client';

import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3333/api';

interface CategoryLite { id: string; name: string; icon: string; color: string }
interface Rule {
  id: string;
  matchType: 'merchant' | 'name';
  matchValue: string;
  categoryId: string;
  category: CategoryLite | null;
  createdAt: string;
}

const glass: React.CSSProperties = {
  background: 'var(--color-surface)',
  backdropFilter: 'var(--glass-blur)',
  WebkitBackdropFilter: 'var(--glass-blur)',
  border: 'var(--glass-border)',
  boxShadow: 'var(--glass-shadow)',
};

export default function RulesManager() {
  const [rules, setRules] = useState<Rule[]>([]);
  const [categories, setCategories] = useState<CategoryLite[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [editCategoryId, setEditCategoryId] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [confirmRule, setConfirmRule] = useState<Rule | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      fetch(`${API}/categorization-rules`, { credentials: 'include' }).then((r) => r.json()),
      fetch(`${API}/categories`, { credentials: 'include' }).then((r) => r.json()),
    ])
      .then(([rulesData, categoriesData]) => { setRules(rulesData); setCategories(categoriesData); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  function startEdit(rule: Rule) {
    setEditingId(rule.id);
    setEditValue(rule.matchValue);
    setEditCategoryId(rule.categoryId);
    setSaveError('');
  }

  function cancelEdit() {
    setEditingId(null);
    setSaveError('');
  }

  async function saveEdit(rule: Rule) {
    setSaving(true);
    setSaveError('');
    const res = await fetch(`${API}/categorization-rules/${rule.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ matchValue: editValue, categoryId: editCategoryId }),
    });
    setSaving(false);
    if (res.status === 409) { setSaveError('Another rule already matches this text.'); return; }
    if (!res.ok) { setSaveError('Could not save this rule.'); return; }
    const { rule: updated } = await res.json();
    setRules((prev) => prev.map((r) => (r.id === rule.id ? updated : r)));
    setEditingId(null);
  }

  async function confirmDelete() {
    if (!confirmRule) return;
    setDeletingId(confirmRule.id);
    await fetch(`${API}/categorization-rules/${confirmRule.id}`, { method: 'DELETE', credentials: 'include' });
    setRules((prev) => prev.filter((r) => r.id !== confirmRule.id));
    setDeletingId(null);
    setConfirmRule(null);
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
        Rules created from the transactions view — matching uncategorized transactions are categorized automatically.
      </p>

      {loading ? (
        <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>Loading rules…</p>
      ) : rules.length === 0 ? (
        <div className="py-10 flex flex-col items-center gap-2 text-center" style={{ ...glass, borderRadius: 'var(--radius-card)' }}>
          <span className="text-3xl">📌</span>
          <p className="text-sm font-medium">No rules yet</p>
          <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
            Open a transaction's category picker and check "Always categorize as this" to create one.
          </p>
        </div>
      ) : (
        <div className="flex flex-col overflow-hidden" style={{ ...glass, borderRadius: 'var(--radius-card)' }}>
          {rules.map((rule, i) => {
            const cat = rule.category;
            const isEditing = editingId === rule.id;
            return (
              <div key={rule.id} className="flex flex-col gap-2 px-3 py-2.5"
                style={i > 0 ? { borderTop: '1px solid var(--color-border)' } : {}}>
                {isEditing ? (
                  <div className="flex flex-col gap-2 py-1">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-bold uppercase tracking-wider shrink-0"
                        style={{ color: 'var(--color-text-muted)' }}>
                        {rule.matchType === 'merchant' ? 'Merchant' : 'Description'}
                      </span>
                      <input value={editValue} onChange={(e) => setEditValue(e.target.value)}
                        className="flex-1 px-2.5 py-1.5 text-sm rounded-lg outline-none"
                        style={{ background: 'var(--color-elevated)', border: '1px solid var(--color-border)', color: 'var(--color-text-primary)' }} />
                    </div>
                    <select value={editCategoryId} onChange={(e) => setEditCategoryId(e.target.value)}
                      className="px-2.5 py-1.5 text-sm rounded-lg outline-none appearance-none"
                      style={{ background: 'var(--color-elevated)', border: '1px solid var(--color-border)', color: 'var(--color-text-primary)' }}>
                      {categories.map((c) => (
                        <option key={c.id} value={c.id}>{c.icon} {c.name}</option>
                      ))}
                    </select>
                    {saveError && <p className="text-xs" style={{ color: 'var(--color-rose)' }}>{saveError}</p>}
                    <div className="flex gap-2 justify-end">
                      <button onClick={cancelEdit}
                        className="px-3 py-1.5 text-xs font-medium rounded-lg transition-colors hover:bg-[var(--color-elevated)]"
                        style={{ color: 'var(--color-text-secondary)', border: '1px solid var(--color-border)' }}>
                        Cancel
                      </button>
                      <button onClick={() => saveEdit(rule)} disabled={saving || !editValue.trim()}
                        className="px-3 py-1.5 text-xs font-semibold rounded-lg transition-all hover:brightness-110 disabled:opacity-40"
                        style={{ background: 'var(--color-card-violet)', color: '#fff' }}>
                        {saving ? 'Saving…' : 'Save'}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-3 group">
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center text-base shrink-0"
                      style={{ background: cat ? `${cat.color}18` : 'var(--color-elevated)', border: `1px solid ${cat ? `${cat.color}28` : 'var(--color-border)'}` }}>
                      {cat?.icon ?? '❔'}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 min-w-0">
                        <p className="text-sm font-semibold truncate">{rule.matchValue}</p>
                        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded shrink-0 uppercase tracking-wide"
                          style={{ background: 'var(--color-elevated)', color: 'var(--color-text-muted)' }}>
                          {rule.matchType === 'merchant' ? 'Merchant' : 'Description'}
                        </span>
                      </div>
                      <p className="text-[11px] truncate mt-0.5" style={{ color: cat?.color ?? 'var(--color-text-muted)' }}>
                        → {cat?.name ?? 'Unknown category'}
                      </p>
                    </div>
                    <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                      <button onClick={() => startEdit(rule)}
                        className="w-7 h-7 rounded-lg flex items-center justify-center transition-colors hover:bg-[var(--color-elevated)]"
                        title="Edit" style={{ color: 'var(--color-text-secondary)' }}>
                        <PencilIcon />
                      </button>
                      <button onClick={() => setConfirmRule(rule)} disabled={deletingId === rule.id}
                        className="w-7 h-7 rounded-lg flex items-center justify-center transition-colors hover:bg-red-500/20 disabled:opacity-40"
                        title="Delete">
                        {deletingId === rule.id
                          ? <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>…</span>
                          : <TrashIcon />}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {confirmRule && createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}>
          <div className="w-full max-w-md rounded-2xl flex flex-col gap-5 p-6"
            style={{ background: 'var(--color-elevated)', border: 'var(--glass-border)', boxShadow: 'var(--glass-shadow)' }}>
            <div>
              <p className="font-bold text-base">Delete this rule?</p>
              <p className="text-xs mt-1" style={{ color: 'var(--color-text-muted)' }}>
                Transactions already categorized by "{confirmRule.matchValue}" keep their category — this only stops future auto-categorization.
              </p>
            </div>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setConfirmRule(null)}
                className="px-4 py-2 text-sm font-medium rounded-xl transition-colors hover:bg-[var(--color-elevated)]"
                style={{ color: 'var(--color-text-secondary)', border: '1px solid var(--color-border)' }}>
                Cancel
              </button>
              <button onClick={confirmDelete} disabled={deletingId === confirmRule.id}
                className="px-4 py-2 text-sm font-semibold rounded-xl transition-all hover:brightness-110 disabled:opacity-40"
                style={{ background: 'color-mix(in srgb, var(--color-rose) 18%, transparent)', border: '1px solid color-mix(in srgb, var(--color-rose) 35%, transparent)', color: 'var(--color-rose)' }}>
                {deletingId === confirmRule.id ? 'Deleting…' : 'Delete Rule'}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

function PencilIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
      style={{ color: 'var(--color-rose)' }}>
      <polyline points="3 6 5 6 21 6"/>
      <path d="M19 6l-1 14H6L5 6"/>
      <path d="M10 11v6M14 11v6"/>
      <path d="M9 6V4h6v2"/>
    </svg>
  );
}
```

- [ ] **Step 2: Wire the new tab into `settings/page.tsx`**

Add the import right after `import CategoryManager from '@/components/CategoryManager';` (line 8):

```ts
import RulesManager from '@/components/RulesManager';
```

Change the `Tab` type (line 22) from:

```ts
type Tab = 'account' | 'banks' | 'categories' | 'projects' | 'appearance' | 'integrations' | 'data';
```

to:

```ts
type Tab = 'account' | 'banks' | 'categories' | 'rules' | 'projects' | 'appearance' | 'integrations' | 'data';
```

In the `TABS` array, insert a new entry right after the `'categories'` entry (after its closing `},` at line 147) and before the `'projects'` entry:

```ts
  {
    id: 'rules',
    label: 'Categorization Rules',
    icon: (
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 17v5"/><path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a3 3 0 0 0-6 0Z"/>
      </svg>
    ),
  },
```

Change the `?tab=` query-param whitelist (line 222) from:

```ts
    if (tab && ['account', 'banks', 'categories', 'projects', 'appearance', 'integrations'].includes(tab)) {
```

to:

```ts
    if (tab && ['account', 'banks', 'categories', 'rules', 'projects', 'appearance', 'integrations'].includes(tab)) {
```

Add the render block right after `{activeTab === 'categories' && <CategoryManager />}` (line 837):

```tsx
          {activeTab === 'rules' && <RulesManager />}
```

- [ ] **Step 3: Verify it compiles and behaves correctly**

Run: `npm run build:web`
Expected: build succeeds.

Manually: `npm run dev:web`, open `/settings`:
- Confirm a new "Categorization Rules" tab appears (between Categories and Project Categories) with a pin icon.
- Click it: if you created rules in Task 3's manual verification, confirm they list with the right match text, "Merchant"/"Description" badge, and target category icon/name.
- Click Edit on a rule, change its match text and/or category, Save — confirm the row updates and a `PATCH` request fired (check Network tab).
- Try editing a rule's match text to something that collides with another existing rule's match text (same type) — confirm the inline error "Another rule already matches this text." appears and nothing is saved.
- Click Delete, confirm the modal's copy, confirm — confirm the row disappears.
- Navigate directly to `/settings?tab=rules` — confirm it opens straight to this tab (this is the link the Task 3 duplicate-toast points to).

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/RulesManager.tsx apps/web/src/app/settings/page.tsx
git commit -m "feat(web): add Settings tab to view, edit, and delete categorization rules"
```

---

## Task 5: Full manual verification pass

**Files:** none (verification only).

- [ ] **Step 1: Run the full build suite**

```bash
npm run build:api
npm run build:web
```

Expected: both succeed with no errors.

- [ ] **Step 2: Walk the full spec checklist**

With `npm run dev:api` and `npm run dev:web` running:

1. On `/transactions`, find (or create via manual entry / CSV import) at least 3 uncategorized transactions sharing the same merchant. Open one, check "Always categorize as this," pick a category. Confirm the toast reports the correct `appliedCount` and the other 2 rows update to the same category without a page reload.
2. Go to `/settings` → Categorization Rules, confirm the new rule is listed.
3. Edit the rule's category to something else. Return to `/transactions` and add a new manual transaction with the same merchant/name and no explicit category — confirm it comes in pre-categorized with the rule's *new* category, not the original one.
4. Attempt to create a duplicate rule from `/transactions` (check the box + pick a category for a transaction whose merchant/name already has a rule) — confirm the 409 toast with the "Edit it in Settings" link, and that no second rule was created (check the Settings list still shows only one).
5. Delete the category that a rule points to, from `/settings` → Categories. Confirm the category-delete flow completes normally, and the rule disappears from the Rules tab.
6. Delete a rule from the Rules tab, confirm the confirmation copy is accurate, and confirm previously-categorized transactions are unaffected (still show their category) after the rule is gone.
7. Resize the browser to a mobile width — confirm both the transaction picker checkbox and the Settings Rules tab remain usable and readable, per this repo's responsive-design requirement.

- [ ] **Step 3: Fix anything that doesn't match, then commit if any fixes were needed**

If Step 2 surfaces issues, fix them, re-run Step 1, and commit:

```bash
git add -A
git commit -m "fix: polish permanent categorization rules after manual verification"
```

(Skip this step entirely if Step 2 found nothing to fix.)
