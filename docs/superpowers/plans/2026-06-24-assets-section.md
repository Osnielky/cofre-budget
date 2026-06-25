# Assets Section Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an Assets section for things the user owns and keeps (house, car), tracking current value, loan owed, equity, linked income/expenses, and feeding net worth automatically.

**Architecture:** Approach B — an `Asset` entity wraps auto-created, hidden "tracking" bank accounts (an `other_asset` value account + an optional `mortgage`/`other_liability` loan account). The existing dashboard already nets tracking accounts into net worth, so no net-worth code changes. Value changes are logged as dated `AssetValueSnapshot` rows for an appreciation chart. Transactions gain a nullable `assetId` tag (mirroring `projectId`) for linked income/expenses.

**Tech Stack:** NestJS 11 + TypeORM (Postgres, `synchronize: true`), Next.js 16 (React 19, Tailwind v4), Recharts (already used on projects/dashboard pages).

## Global Constraints

- **No test runner is configured.** The per-task verification cycle is: `npx tsc --noEmit` (or the app build) + a concrete manual check (curl against the running API, or a UI check). Do **not** invent a Jest/Vitest harness.
- **Entities must be registered explicitly** in `apps/api/src/config/database.config.ts` — glob paths don't work in the webpack bundle (per CLAUDE.md).
- **`synchronize: true`** is on (`database.config.ts`), so new entities/columns auto-create on API boot. No migration files.
- TypeORM password column quirks, `cookie-parser` interop, and `.swcrc` settings are unchanged by this work.
- **Tracking account types already exist** in `apps/api/src/bank-accounts/account-types.ts` and `apps/web/src/lib/accountTypes.ts`: `other_asset`, `mortgage`, `other_liability`. Do not add new account types.
- Money convention: transaction `amount` is positive = money in (income), negative = money out (expense).
- Run the API with `node dist/apps/api/main.js` after `npm run build:api`, or `npm run dev:api` for watch mode. Web: `npm run dev:web`.
- All API routes are guarded by `JwtAuthGuard` and scoped to `req.user.id`. Verify ownership before any mutation (pattern: `findOneBy({ id })` → throw `NotFoundException` if missing, `ForbiddenException` if `userId` mismatch).

---

## File Structure

**Backend (`apps/api/src/assets/`):**
- `asset.entity.ts` — the Asset entity (NEW)
- `asset-value-snapshot.entity.ts` — dated value history (NEW)
- `assets.service.ts` — CRUD, managed-account orchestration, aggregation (NEW)
- `assets.controller.ts` — REST endpoints (NEW)
- `assets.module.ts` — module wiring (NEW)

**Backend (modified):**
- `transaction.entity.ts` — add `assetId` column
- `bank-account.entity.ts` — add `managedByAssetId` column
- `bank-accounts.service.ts` — exclude managed accounts from `findAllByUser`
- `config/database.config.ts` — register new entities
- `app/app.module.ts` — register `AssetsModule`

**Frontend (`apps/web/src/`):**
- `app/assets/page.tsx` — the Assets page (NEW)
- `components/Sidebar.tsx` — add Assets nav entry
- `app/transactions/page.tsx` — add "Link to asset" path + extend suggestion-chip guard

---

## Task 1: Schema foundation — entities & columns

**Files:**
- Create: `apps/api/src/assets/asset.entity.ts`
- Create: `apps/api/src/assets/asset-value-snapshot.entity.ts`
- Modify: `apps/api/src/transactions/transaction.entity.ts` (after line 76, the `projectCategoryId` column)
- Modify: `apps/api/src/bank-accounts/bank-account.entity.ts` (after `last4` column)
- Modify: `apps/api/src/config/database.config.ts`

**Interfaces:**
- Produces: `Asset` entity (`id, userId, name, type, icon, color, imageUrl, description, purchasePrice, purchaseDate, valueAccountId, loanAccountId, createdAt, updatedAt`); `AssetValueSnapshot` entity (`id, assetId, value, date, createdAt`); `Transaction.assetId: string | null`; `BankAccount.managedByAssetId: string | null`.

- [ ] **Step 1: Create the Asset entity**

Create `apps/api/src/assets/asset.entity.ts`:

```typescript
import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('assets')
export class Asset {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  userId: string;

  @Column()
  name: string;

  /* property | vehicle | other */
  @Column({ default: 'property' })
  type: string;

  @Column({ default: '🏠' })
  icon: string;

  @Column({ nullable: true })
  color: string;

  @Column({ type: 'text', nullable: true })
  imageUrl: string;

  @Column({ nullable: true })
  description: string;

  /* What the user paid — reference point for appreciation */
  @Column({ type: 'decimal', precision: 12, scale: 2, nullable: true })
  purchasePrice: number;

  @Column({ type: 'date', nullable: true })
  purchaseDate: string;

  /* Auto-created other_asset account whose balance = current value */
  @Column({ type: 'uuid', nullable: true })
  valueAccountId: string | null;

  /* Auto-created mortgage/other_liability account whose balance = amount owed */
  @Column({ type: 'uuid', nullable: true })
  loanAccountId: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
```

- [ ] **Step 2: Create the AssetValueSnapshot entity**

Create `apps/api/src/assets/asset-value-snapshot.entity.ts`:

```typescript
import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

@Entity('asset_value_snapshots')
export class AssetValueSnapshot {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  assetId: string;

  @Column({ type: 'decimal', precision: 12, scale: 2 })
  value: number;

  @Column({ type: 'date' })
  date: string;

  @CreateDateColumn()
  createdAt: Date;
}
```

- [ ] **Step 3: Add `assetId` to the Transaction entity**

In `apps/api/src/transactions/transaction.entity.ts`, add after the `projectCategoryRef` block (after line 80):

```typescript
  /* Asset this transaction is linked to (owned-asset income/expense tag) */
  @Column({ type: 'uuid', nullable: true })
  assetId: string | null;
```

- [ ] **Step 4: Add `managedByAssetId` to the BankAccount entity**

In `apps/api/src/bank-accounts/bank-account.entity.ts`, add after the `last4` column:

```typescript
  /* Set when this account is auto-managed by an Asset (value or loan account).
     Such accounts are hidden from the manual Accounts list. */
  @Column({ type: 'uuid', nullable: true })
  managedByAssetId: string | null;
```

- [ ] **Step 5: Register the new entities**

In `apps/api/src/config/database.config.ts`, add the imports after the `Debt`/`DebtPayment` imports:

```typescript
import { Asset } from '../assets/asset.entity';
import { AssetValueSnapshot } from '../assets/asset-value-snapshot.entity';
```

And add them to the `entities` array:

```typescript
  entities: [User, BankAccount, PlaidItem, Transaction, Category, Budget, Project, ProjectCategory, Debt, DebtPayment, Asset, AssetValueSnapshot],
```

- [ ] **Step 6: Typecheck**

Run: `npx tsc --noEmit -p apps/api/tsconfig.app.json`
Expected: No errors referencing the new entity files. (If `tsconfig.app.json` doesn't exist, use `npx nx build api` in Step 7 as the check.)

- [ ] **Step 7: Build the API to confirm schema compiles**

Run: `npm run build:api`
Expected: Build succeeds (`webpack ... compiled`). The `assets` and `asset_value_snapshots` tables will be created on next API boot via `synchronize`.

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/assets/asset.entity.ts apps/api/src/assets/asset-value-snapshot.entity.ts apps/api/src/transactions/transaction.entity.ts apps/api/src/bank-accounts/bank-account.entity.ts apps/api/src/config/database.config.ts
git commit -m "feat(assets): add Asset + AssetValueSnapshot entities and link columns"
```

---

## Task 2: Assets service & module — CRUD with managed accounts

**Files:**
- Create: `apps/api/src/assets/assets.service.ts`
- Create: `apps/api/src/assets/assets.module.ts`
- Modify: `apps/api/src/app/app.module.ts`

**Interfaces:**
- Consumes: `Asset`, `AssetValueSnapshot` (Task 1); `BankAccount`, `Transaction` entities.
- Produces: `AssetsService` with `findAllByUser(userId)`, `findOne(id, userId)`, `create(userId, dto)`, `update(id, userId, dto)`, `remove(id, userId)`, `linkTransaction(id, txId, userId)`, `unlinkTransaction(txId, userId)`. `AssetDto` shape: `{ name; type?; icon?; color?; description?; imageUrl?; purchasePrice?; purchaseDate?; currentValue?; loanOwed? }`. List items include computed `currentValue, loanOwed, equity, income, expenses, txCount`.

- [ ] **Step 1: Write the service**

Create `apps/api/src/assets/assets.service.ts`:

```typescript
import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { Asset } from './asset.entity';
import { AssetValueSnapshot } from './asset-value-snapshot.entity';
import { BankAccount } from '../bank-accounts/bank-account.entity';
import { Transaction } from '../transactions/transaction.entity';

export interface AssetDto {
  name: string;
  type?: string;
  icon?: string;
  color?: string;
  description?: string;
  imageUrl?: string;
  purchasePrice?: number;
  purchaseDate?: string;
  currentValue?: number;
  loanOwed?: number;
}

export interface AssetWithStats extends Asset {
  currentValue: number;
  loanOwed: number;
  equity: number;
  income: number;
  expenses: number;
  txCount: number;
}

@Injectable()
export class AssetsService {
  constructor(
    @InjectRepository(Asset)              private repo: Repository<Asset>,
    @InjectRepository(AssetValueSnapshot) private snapRepo: Repository<AssetValueSnapshot>,
    @InjectRepository(BankAccount)        private acctRepo: Repository<BankAccount>,
    @InjectRepository(Transaction)        private txRepo: Repository<Transaction>,
  ) {}

  private today(): string {
    return new Date().toISOString().slice(0, 10);
  }

  /** Loan account type: mortgage for property, generic liability otherwise. */
  private loanType(assetType: string): string {
    return assetType === 'property' ? 'mortgage' : 'other_liability';
  }

  private async balanceOf(accountId: string | null): Promise<number> {
    if (!accountId) return 0;
    const acct = await this.acctRepo.findOneBy({ id: accountId });
    return acct ? Number(acct.balance) : 0;
  }

  async findAllByUser(userId: string): Promise<AssetWithStats[]> {
    const assets = await this.repo.find({ where: { userId }, order: { createdAt: 'DESC' } });
    if (assets.length === 0) return [];

    const acctIds = assets.flatMap(a => [a.valueAccountId, a.loanAccountId]).filter((x): x is string => !!x);
    const accounts = acctIds.length ? await this.acctRepo.find({ where: { id: In(acctIds) } }) : [];
    const balById = new Map(accounts.map(a => [a.id, Number(a.balance)]));

    const txs = await this.txRepo
      .createQueryBuilder('tx')
      .where('tx.userId = :userId', { userId })
      .andWhere('tx.assetId IN (:...ids)', { ids: assets.map(a => a.id) })
      .getMany();

    const incomeByAsset = new Map<string, number>();
    const expenseByAsset = new Map<string, number>();
    const countByAsset = new Map<string, number>();
    for (const tx of txs) {
      const amt = Number(tx.amount);
      const id = tx.assetId as string;
      if (amt >= 0) incomeByAsset.set(id, (incomeByAsset.get(id) ?? 0) + amt);
      else expenseByAsset.set(id, (expenseByAsset.get(id) ?? 0) + Math.abs(amt));
      countByAsset.set(id, (countByAsset.get(id) ?? 0) + 1);
    }

    return assets.map(a => {
      const currentValue = a.valueAccountId ? (balById.get(a.valueAccountId) ?? 0) : 0;
      const loanOwed = a.loanAccountId ? (balById.get(a.loanAccountId) ?? 0) : 0;
      return {
        ...a,
        currentValue,
        loanOwed,
        equity: currentValue - loanOwed,
        income: incomeByAsset.get(a.id) ?? 0,
        expenses: expenseByAsset.get(a.id) ?? 0,
        txCount: countByAsset.get(a.id) ?? 0,
      };
    });
  }

  private async loadOwned(id: string, userId: string): Promise<Asset> {
    const asset = await this.repo.findOneBy({ id });
    if (!asset) throw new NotFoundException();
    if (asset.userId !== userId) throw new ForbiddenException();
    return asset;
  }

  async findOne(id: string, userId: string) {
    const asset = await this.loadOwned(id, userId);
    const currentValue = await this.balanceOf(asset.valueAccountId);
    const loanOwed = await this.balanceOf(asset.loanAccountId);
    const snapshots = await this.snapRepo.find({ where: { assetId: id }, order: { date: 'ASC', createdAt: 'ASC' } });
    const transactions = await this.txRepo.find({ where: { userId, assetId: id }, order: { date: 'DESC' } });
    const income = transactions.filter(t => Number(t.amount) >= 0).reduce((s, t) => s + Number(t.amount), 0);
    const expenses = transactions.filter(t => Number(t.amount) < 0).reduce((s, t) => s + Math.abs(Number(t.amount)), 0);
    return { ...asset, currentValue, loanOwed, equity: currentValue - loanOwed, income, expenses, snapshots, transactions };
  }

  async create(userId: string, dto: AssetDto): Promise<Asset> {
    const type = dto.type ?? 'property';
    const asset = this.repo.create({
      userId,
      name: dto.name,
      type,
      icon: dto.icon ?? '🏠',
      color: dto.color ?? null,
      description: dto.description ?? null,
      imageUrl: dto.imageUrl ?? null,
      purchasePrice: dto.purchasePrice ?? null,
      purchaseDate: dto.purchaseDate ?? null,
    });
    const saved = await this.repo.save(asset);

    // Value account (always)
    const valueAcct = await this.acctRepo.save(this.acctRepo.create({
      userId,
      bankName: 'Asset',
      accountName: `${dto.icon ?? '🏠'} ${dto.name} — Value`,
      accountType: 'other_asset',
      balance: dto.currentValue ?? 0,
      provider: 'manual',
      managedByAssetId: saved.id,
    }));
    saved.valueAccountId = valueAcct.id;

    // Loan account (only if a balance was supplied)
    if (dto.loanOwed != null && dto.loanOwed > 0) {
      const loanAcct = await this.acctRepo.save(this.acctRepo.create({
        userId,
        bankName: 'Asset',
        accountName: `${dto.name} — Loan`,
        accountType: this.loanType(type),
        balance: dto.loanOwed,
        provider: 'manual',
        managedByAssetId: saved.id,
      }));
      saved.loanAccountId = loanAcct.id;
    }
    await this.repo.save(saved);

    // Initial value snapshot
    await this.snapRepo.save(this.snapRepo.create({
      assetId: saved.id,
      value: dto.currentValue ?? 0,
      date: dto.purchaseDate ?? this.today(),
    }));

    return saved;
  }

  async update(id: string, userId: string, dto: Partial<AssetDto>): Promise<Asset> {
    const asset = await this.loadOwned(id, userId);

    if (dto.name !== undefined) asset.name = dto.name;
    if (dto.type !== undefined) asset.type = dto.type;
    if (dto.icon !== undefined) asset.icon = dto.icon;
    if (dto.color !== undefined) asset.color = dto.color;
    if (dto.description !== undefined) asset.description = dto.description;
    if (dto.imageUrl !== undefined) asset.imageUrl = dto.imageUrl;
    if (dto.purchasePrice !== undefined) asset.purchasePrice = dto.purchasePrice;
    if (dto.purchaseDate !== undefined) asset.purchaseDate = dto.purchaseDate;

    // Current value → update value account balance + log a snapshot
    if (dto.currentValue !== undefined && asset.valueAccountId) {
      const acct = await this.acctRepo.findOneBy({ id: asset.valueAccountId });
      if (acct) { acct.balance = dto.currentValue; await this.acctRepo.save(acct); }
      await this.snapRepo.save(this.snapRepo.create({ assetId: id, value: dto.currentValue, date: this.today() }));
    }

    // Loan owed → update / create / remove the loan account
    if (dto.loanOwed !== undefined) {
      if (dto.loanOwed > 0) {
        if (asset.loanAccountId) {
          const acct = await this.acctRepo.findOneBy({ id: asset.loanAccountId });
          if (acct) { acct.balance = dto.loanOwed; await this.acctRepo.save(acct); }
        } else {
          const loanAcct = await this.acctRepo.save(this.acctRepo.create({
            userId,
            bankName: 'Asset',
            accountName: `${asset.name} — Loan`,
            accountType: this.loanType(asset.type),
            balance: dto.loanOwed,
            provider: 'manual',
            managedByAssetId: asset.id,
          }));
          asset.loanAccountId = loanAcct.id;
        }
      } else if (asset.loanAccountId) {
        // Loan paid off / cleared → remove managed loan account
        await this.acctRepo.delete({ id: asset.loanAccountId });
        asset.loanAccountId = null;
      }
    }

    return this.repo.save(asset);
  }

  async remove(id: string, userId: string): Promise<void> {
    const asset = await this.loadOwned(id, userId);
    // Unlink transactions, drop snapshots, delete managed accounts, then the asset.
    await this.txRepo.update({ assetId: id }, { assetId: null });
    await this.snapRepo.delete({ assetId: id });
    const acctIds = [asset.valueAccountId, asset.loanAccountId].filter((x): x is string => !!x);
    if (acctIds.length) await this.acctRepo.delete({ id: In(acctIds) });
    await this.repo.remove(asset);
  }

  async linkTransaction(id: string, txId: string, userId: string): Promise<Transaction> {
    await this.loadOwned(id, userId);
    const tx = await this.txRepo.findOneBy({ id: txId });
    if (!tx) throw new NotFoundException();
    if (tx.userId !== userId) throw new ForbiddenException();
    tx.assetId = id;
    return this.txRepo.save(tx);
  }

  async unlinkTransaction(txId: string, userId: string): Promise<Transaction> {
    const tx = await this.txRepo.findOneBy({ id: txId });
    if (!tx) throw new NotFoundException();
    if (tx.userId !== userId) throw new ForbiddenException();
    tx.assetId = null;
    return this.txRepo.save(tx);
  }
}
```

- [ ] **Step 2: Write the module**

Create `apps/api/src/assets/assets.module.ts` (controller is added in Task 3; include it now so the import is ready — create a stub controller in Task 3 before booting):

```typescript
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Asset } from './asset.entity';
import { AssetValueSnapshot } from './asset-value-snapshot.entity';
import { BankAccount } from '../bank-accounts/bank-account.entity';
import { Transaction } from '../transactions/transaction.entity';
import { AssetsService } from './assets.service';
import { AssetsController } from './assets.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Asset, AssetValueSnapshot, BankAccount, Transaction])],
  controllers: [AssetsController],
  providers: [AssetsService],
})
export class AssetsModule {}
```

> Note: this module imports `AssetsController`, created in Task 3. To keep the build green between tasks, create the controller file (Task 3 Step 1) before building. If implementing strictly task-by-task, temporarily omit `controllers`/the import and add them in Task 3.

- [ ] **Step 3: Register the module**

In `apps/api/src/app/app.module.ts`, add the import:

```typescript
import { AssetsModule } from '../assets/assets.module';
```

And add `AssetsModule` to the `imports` array, after `DebtsModule`.

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit -p apps/api/tsconfig.app.json`
Expected: Only error (if any) is the missing `AssetsController` until Task 3. If proceeding sequentially, complete Task 3 Step 1 first, then re-run — expect no errors.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/assets/assets.service.ts apps/api/src/assets/assets.module.ts apps/api/src/app/app.module.ts
git commit -m "feat(assets): AssetsService with managed-account orchestration + module wiring"
```

---

## Task 3: Assets controller & hide managed accounts

**Files:**
- Create: `apps/api/src/assets/assets.controller.ts`
- Modify: `apps/api/src/bank-accounts/bank-accounts.service.ts` (`findAllByUser`)

**Interfaces:**
- Consumes: `AssetsService` (Task 2).
- Produces: REST endpoints under `/api/assets`: `GET /`, `GET /:id`, `POST /`, `PATCH /:id`, `DELETE /:id`, `PATCH /:id/link/:txId`, `PATCH /unlink/:txId`. `findAllByUser` on accounts now excludes `managedByAssetId IS NOT NULL`.

- [ ] **Step 1: Write the controller**

Create `apps/api/src/assets/assets.controller.ts`:

```typescript
import { Controller, Get, Post, Patch, Delete, Param, Body, UseGuards, Request } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AssetsService, AssetDto } from './assets.service';

@UseGuards(JwtAuthGuard)
@Controller('assets')
export class AssetsController {
  constructor(private service: AssetsService) {}

  @Get()
  list(@Request() req: any) {
    return this.service.findAllByUser(req.user.id);
  }

  @Patch('unlink/:txId')
  unlinkTx(@Param('txId') txId: string, @Request() req: any) {
    return this.service.unlinkTransaction(txId, req.user.id);
  }

  @Get(':id')
  detail(@Param('id') id: string, @Request() req: any) {
    return this.service.findOne(id, req.user.id);
  }

  @Post()
  create(@Request() req: any, @Body() dto: AssetDto) {
    return this.service.create(req.user.id, dto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Request() req: any, @Body() dto: Partial<AssetDto>) {
    return this.service.update(id, req.user.id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @Request() req: any) {
    return this.service.remove(id, req.user.id);
  }

  @Patch(':id/link/:txId')
  linkTx(@Param('id') id: string, @Param('txId') txId: string, @Request() req: any) {
    return this.service.linkTransaction(id, txId, req.user.id);
  }
}
```

> Route order matters: `unlink/:txId` is declared before `:id` so "unlink" isn't captured as an asset id.

- [ ] **Step 2: Exclude managed accounts from the accounts list**

In `apps/api/src/bank-accounts/bank-accounts.service.ts`, change the first line of `findAllByUser` from:

```typescript
    const accounts = await this.repo.find({ where: { userId }, order: { createdAt: 'ASC' } });
```

to:

```typescript
    const accounts = await this.repo.find({
      where: { userId, managedByAssetId: IsNull() },
      order: { createdAt: 'ASC' },
    });
```

And add `IsNull` to the typeorm import at the top of the file:

```typescript
import { Repository, IsNull } from 'typeorm';
```

- [ ] **Step 3: Build the API**

Run: `npm run build:api`
Expected: `webpack ... compiled successfully`.

- [ ] **Step 4: Boot and smoke-test the endpoints**

Start the API: `node dist/apps/api/main.js` (ensure Postgres is up and `.env` is present). In another shell, log in to get the cookie, then exercise the asset lifecycle. Example using a saved cookie jar:

```bash
# Log in (saves access_token cookie)
curl -s -c cookies.txt -X POST http://localhost:3333/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"info@osmioservices.com","password":"<your-password>"}' > /dev/null

# Create an asset with value + loan
curl -s -b cookies.txt -X POST http://localhost:3333/api/assets \
  -H 'Content-Type: application/json' \
  -d '{"name":"Miami House","type":"property","currentValue":420000,"loanOwed":300000}'

# List — expect currentValue 420000, loanOwed 300000, equity 120000
curl -s -b cookies.txt http://localhost:3333/api/assets
```

Expected: The POST returns the asset with `valueAccountId` and `loanAccountId` set; the list returns `currentValue: 420000, loanOwed: 300000, equity: 120000`. Confirm the managed accounts do **not** appear in `curl -s -b cookies.txt http://localhost:3333/api/bank-accounts`.

- [ ] **Step 5: Verify update + delete**

```bash
# Replace <id> with the created asset id
curl -s -b cookies.txt -X PATCH http://localhost:3333/api/assets/<id> \
  -H 'Content-Type: application/json' -d '{"currentValue":430000}'
# detail — expect a 2nd snapshot and currentValue 430000
curl -s -b cookies.txt http://localhost:3333/api/assets/<id>
# delete — expect managed accounts gone afterward
curl -s -b cookies.txt -X DELETE http://localhost:3333/api/assets/<id>
curl -s -b cookies.txt http://localhost:3333/api/bank-accounts
```

Expected: detail shows two snapshots; after delete, the value/loan accounts no longer exist.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/assets/assets.controller.ts apps/api/src/bank-accounts/bank-accounts.service.ts
git commit -m "feat(assets): REST controller + hide asset-managed accounts from accounts list"
```

---

## Task 4: Assets page — list, create/edit, sidebar

**Files:**
- Create: `apps/web/src/app/assets/page.tsx`
- Modify: `apps/web/src/components/Sidebar.tsx`

**Interfaces:**
- Consumes: `GET/POST/PATCH/DELETE /api/assets` (Tasks 2-3).
- Produces: `/assets` route rendering an asset list with a create/edit modal. Detail panel + chart are added in Task 5 (this task ships the list + create/edit working end-to-end).

- [ ] **Step 1: Add the sidebar entry**

In `apps/web/src/components/Sidebar.tsx`, the nav array contains `{ label: 'Projects', href: '/projects', icon: ProjectsIcon }` (around line 16). Add an Assets entry right after it:

```typescript
  { label: 'Assets',       href: '/assets',       icon: AssetsIcon },
```

Then define `AssetsIcon` near the other icon components (e.g. next to `ProjectsIcon` around line 250). Use a house/building glyph consistent with the existing inline-SVG icon style:

```tsx
function AssetsIcon({ className = '' }: { className?: string }) {
  return (
    <svg className={className} width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 21h18" />
      <path d="M5 21V7l8-4v18" />
      <path d="M19 21V11l-6-4" />
      <path d="M9 9v.01M9 12v.01M9 15v.01M9 18v.01" />
    </svg>
  );
}
```

(Match the exact prop signature the other icon components use in this file — if they take no props, drop the `className` param and apply classes at the call site as the others do.)

- [ ] **Step 2: Create the Assets page**

Create `apps/web/src/app/assets/page.tsx`. This ships the list + create/edit modal. The detail panel (Task 5) renders when an asset is selected; for now selecting an asset is wired but the panel is minimal.

```tsx
'use client';

import { useEffect, useState } from 'react';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3333/api';

interface Asset {
  id: string; name: string; type: string; icon: string; color: string | null;
  imageUrl: string | null; description: string | null;
  purchasePrice: number | null; purchaseDate: string | null;
  currentValue: number; loanOwed: number; equity: number;
  income: number; expenses: number; txCount: number;
}

const ASSET_TYPES = [
  { value: 'property', label: 'Property', icon: '🏠' },
  { value: 'vehicle',  label: 'Vehicle',  icon: '🚗' },
  { value: 'other',    label: 'Other',    icon: '📦' },
];

const PRESET_COLORS = ['#9B6DFF', '#4FBF7F', '#F07A3E', '#F5C842', '#4BA8D8', '#E879A0'];

const glass = { background: 'rgba(35,35,47,0.55)', backdropFilter: 'blur(12px)', border: '1px solid var(--color-border)' };

const emptyForm = {
  name: '', type: 'property', icon: '🏠', color: PRESET_COLORS[0],
  description: '', purchasePrice: '', purchaseDate: '', currentValue: '', loanOwed: '',
};

export default function AssetsPage() {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Asset | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    const res = await fetch(`${API}/assets`, { credentials: 'include' });
    setAssets(res.ok ? await res.json() : []);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const openCreate = () => { setEditing(null); setForm(emptyForm); setShowForm(true); };
  const openEdit = (a: Asset) => {
    setEditing(a);
    setForm({
      name: a.name, type: a.type, icon: a.icon, color: a.color ?? PRESET_COLORS[0],
      description: a.description ?? '', purchasePrice: a.purchasePrice != null ? String(a.purchasePrice) : '',
      purchaseDate: a.purchaseDate ?? '', currentValue: String(a.currentValue), loanOwed: String(a.loanOwed),
    });
    setShowForm(true);
  };

  const save = async () => {
    if (!form.name.trim()) return;
    setSaving(true);
    const body = {
      name: form.name, type: form.type, icon: form.icon, color: form.color,
      description: form.description || null,
      purchasePrice: form.purchasePrice ? parseFloat(form.purchasePrice) : null,
      purchaseDate: form.purchaseDate || null,
      currentValue: form.currentValue ? parseFloat(form.currentValue) : 0,
      loanOwed: form.loanOwed ? parseFloat(form.loanOwed) : 0,
    };
    const url = editing ? `${API}/assets/${editing.id}` : `${API}/assets`;
    const method = editing ? 'PATCH' : 'POST';
    const res = await fetch(url, {
      method, credentials: 'include',
      headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
    setSaving(false);
    if (res.ok) { setShowForm(false); await load(); }
  };

  const remove = async (a: Asset) => {
    if (!confirm(`Delete "${a.name}"? Its value/loan tracking and links will be removed.`)) return;
    const res = await fetch(`${API}/assets/${a.id}`, { method: 'DELETE', credentials: 'include' });
    if (res.ok) { if (selectedId === a.id) setSelectedId(null); await load(); }
  };

  const fmt = (n: number) => `$${Math.round(n).toLocaleString()}`;

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Assets</h1>
          <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
            Things you own — value, equity & running costs.
          </p>
        </div>
        <button onClick={openCreate}
          className="px-4 py-2 rounded-xl text-sm font-semibold"
          style={{ background: 'var(--color-primary)', color: '#fff' }}>
          + Add Asset
        </button>
      </div>

      {loading ? (
        <p style={{ color: 'var(--color-text-muted)' }}>Loading…</p>
      ) : assets.length === 0 ? (
        <div className="rounded-2xl p-10 text-center" style={glass}>
          <p className="text-lg font-semibold mb-1">No assets yet</p>
          <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
            Add a house, a car, or anything you own to track its value and equity.
          </p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {assets.map((a) => {
            const equityPositive = a.equity >= 0;
            return (
              <div key={a.id} className="rounded-2xl p-4 cursor-pointer transition-all hover:brightness-110"
                style={{ ...glass, borderLeft: `3px solid ${a.color ?? '#9B6DFF'}` }}
                onClick={() => setSelectedId(a.id)}>
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-xl">{a.icon}</span>
                    <div>
                      <p className="font-semibold leading-tight">{a.name}</p>
                      <p className="text-[11px] uppercase tracking-wide" style={{ color: 'var(--color-text-muted)' }}>
                        {ASSET_TYPES.find(t => t.value === a.type)?.label ?? a.type}
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
                    <button onClick={() => openEdit(a)} className="text-xs px-2 py-1 rounded-lg" style={{ background: 'var(--color-elevated)' }}>Edit</button>
                    <button onClick={() => remove(a)} className="text-xs px-2 py-1 rounded-lg" style={{ color: 'var(--color-rose)' }}>Delete</button>
                  </div>
                </div>
                <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                  <div>
                    <p className="text-[10px] uppercase tracking-wide" style={{ color: 'var(--color-text-muted)' }}>Value</p>
                    <p className="font-bold text-sm">{fmt(a.currentValue)}</p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase tracking-wide" style={{ color: 'var(--color-text-muted)' }}>Owed</p>
                    <p className="font-bold text-sm" style={{ color: a.loanOwed > 0 ? '#F07A3E' : 'var(--color-text-secondary)' }}>{fmt(a.loanOwed)}</p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase tracking-wide" style={{ color: 'var(--color-text-muted)' }}>Equity</p>
                    <p className="font-bold text-sm" style={{ color: equityPositive ? '#4FBF7F' : '#F07A3E' }}>{fmt(a.equity)}</p>
                  </div>
                </div>
                {(a.income > 0 || a.expenses > 0) && (
                  <p className="mt-3 text-[11px]" style={{ color: 'var(--color-text-muted)' }}>
                    <span style={{ color: '#4FBF7F' }}>+{fmt(a.income)}</span>{' · '}
                    <span style={{ color: '#F07A3E' }}>-{fmt(a.expenses)}</span>{' · '}{a.txCount} txns
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.5)' }} onClick={() => setShowForm(false)}>
          <div className="rounded-2xl p-6 w-full max-w-md" style={glass} onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-bold mb-4">{editing ? 'Edit Asset' : 'New Asset'}</h2>
            <div className="space-y-3">
              <input autoFocus placeholder="Name (e.g. Miami House)" value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                style={{ background: 'var(--color-elevated)', border: '1px solid var(--color-border)' }} />
              <div className="flex gap-2">
                {ASSET_TYPES.map(t => (
                  <button key={t.value} onClick={() => setForm({ ...form, type: t.value, icon: t.icon })}
                    className="flex-1 px-2 py-2 rounded-lg text-xs font-semibold"
                    style={form.type === t.value
                      ? { background: 'var(--color-primary)', color: '#fff' }
                      : { background: 'var(--color-elevated)', color: 'var(--color-text-secondary)' }}>
                    {t.icon} {t.label}
                  </button>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <label className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                  Current value
                  <input type="number" value={form.currentValue} onChange={(e) => setForm({ ...form, currentValue: e.target.value })}
                    className="w-full mt-1 px-3 py-2 rounded-lg text-sm outline-none"
                    style={{ background: 'var(--color-elevated)', border: '1px solid var(--color-border)' }} />
                </label>
                <label className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                  Loan owed (optional)
                  <input type="number" value={form.loanOwed} onChange={(e) => setForm({ ...form, loanOwed: e.target.value })}
                    className="w-full mt-1 px-3 py-2 rounded-lg text-sm outline-none"
                    style={{ background: 'var(--color-elevated)', border: '1px solid var(--color-border)' }} />
                </label>
                <label className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                  Purchase price (optional)
                  <input type="number" value={form.purchasePrice} onChange={(e) => setForm({ ...form, purchasePrice: e.target.value })}
                    className="w-full mt-1 px-3 py-2 rounded-lg text-sm outline-none"
                    style={{ background: 'var(--color-elevated)', border: '1px solid var(--color-border)' }} />
                </label>
                <label className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                  Purchase date (optional)
                  <input type="date" value={form.purchaseDate} onChange={(e) => setForm({ ...form, purchaseDate: e.target.value })}
                    className="w-full mt-1 px-3 py-2 rounded-lg text-sm outline-none"
                    style={{ background: 'var(--color-elevated)', border: '1px solid var(--color-border)' }} />
                </label>
              </div>
              <div className="flex gap-2">
                {PRESET_COLORS.map(c => (
                  <button key={c} onClick={() => setForm({ ...form, color: c })}
                    className="w-7 h-7 rounded-full" style={{ background: c, outline: form.color === c ? '2px solid #fff' : 'none' }} />
                ))}
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-5">
              <button onClick={() => setShowForm(false)} className="px-4 py-2 rounded-lg text-sm" style={{ background: 'var(--color-elevated)' }}>Cancel</button>
              <button onClick={save} disabled={saving || !form.name.trim()}
                className="px-4 py-2 rounded-lg text-sm font-semibold disabled:opacity-40"
                style={{ background: 'var(--color-primary)', color: '#fff' }}>
                {saving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
```

> Match exact CSS-token names by cross-checking `apps/web/src/app/projects/page.tsx` (e.g. `--color-primary`, `--color-elevated`, `--color-border`, `--color-rose`, `--color-text-muted`). If the projects page uses a shared `glass` helper or different token names, reuse those rather than the literals above.

- [ ] **Step 3: Typecheck the web app**

Run: `npx tsc --noEmit -p apps/web/tsconfig.json`
Expected: No errors in `app/assets/page.tsx` or `components/Sidebar.tsx`. (A pre-existing stale `.next/types/validator.ts` error unrelated to these files may appear — ignore it.)

- [ ] **Step 4: Manual UI check**

Run `npm run dev:web` (and the API). Visit http://localhost:3000/assets. Verify: the **Assets** sidebar entry appears and is distinct from **Projects**; "Add Asset" opens the modal; creating "Miami House" with value 420000 / loan 300000 shows a card with Value $420,000, Owed $300,000, Equity $120,000; Edit pre-fills; Delete removes it. Confirm http://localhost:3000/dashboard Net Worth increased by the equity (value − loan) of the new asset.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/assets/page.tsx apps/web/src/components/Sidebar.tsx
git commit -m "feat(web): Assets page with list + create/edit modal and sidebar entry"
```

---

## Task 5: Asset detail panel with appreciation chart

**Files:**
- Modify: `apps/web/src/app/assets/page.tsx`

**Interfaces:**
- Consumes: `GET /api/assets/:id` → `{ ...asset, currentValue, loanOwed, equity, income, expenses, snapshots: { date; value }[], transactions: {...}[] }`; `PATCH /api/assets/:id` with `{ currentValue }` or `{ loanOwed }`.
- Produces: a detail panel rendered when `selectedId` is set, with an appreciation line chart and "Update value"/"Update loan" quick actions.

- [ ] **Step 1: Add detail state and fetch**

In `apps/web/src/app/assets/page.tsx`, add an interface for the detail payload near the `Asset` interface:

```tsx
interface AssetTx { id: string; name: string; amount: number; date: string }
interface AssetSnapshot { date: string; value: number }
interface AssetDetail extends Asset { snapshots: AssetSnapshot[]; transactions: AssetTx[] }
```

Add state and a loader inside the component (after the existing `selectedId` state):

```tsx
  const [detail, setDetail] = useState<AssetDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  useEffect(() => {
    if (!selectedId) { setDetail(null); return; }
    setDetailLoading(true);
    fetch(`${API}/assets/${selectedId}`, { credentials: 'include' })
      .then(r => r.ok ? r.json() : null)
      .then(d => setDetail(d))
      .finally(() => setDetailLoading(false));
  }, [selectedId]);

  const updateField = async (field: 'currentValue' | 'loanOwed', value: number) => {
    if (!selectedId) return;
    const res = await fetch(`${API}/assets/${selectedId}`, {
      method: 'PATCH', credentials: 'include',
      headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ [field]: value }),
    });
    if (res.ok) {
      const d = await fetch(`${API}/assets/${selectedId}`, { credentials: 'include' }).then(r => r.json());
      setDetail(d);
      await load();
    }
  };
```

- [ ] **Step 2: Import Recharts**

At the top of the file, add (Recharts is already a dependency — used by `projects/page.tsx`):

```tsx
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
```

- [ ] **Step 3: Render the detail panel as a modal overlay**

Add this block just before the closing `</div>` of the page's root container (after the create/edit modal `)}`):

```tsx
      {selectedId && (
        <div className="fixed inset-0 z-40 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.5)' }} onClick={() => setSelectedId(null)}>
          <div className="rounded-2xl p-6 w-full max-w-2xl max-h-[85vh] overflow-y-auto" style={glass} onClick={(e) => e.stopPropagation()}>
            {detailLoading || !detail ? (
              <p style={{ color: 'var(--color-text-muted)' }}>Loading…</p>
            ) : (
              <>
                <div className="flex items-center gap-3 mb-4">
                  <span className="text-2xl">{detail.icon}</span>
                  <div>
                    <h2 className="text-xl font-bold">{detail.name}</h2>
                    <p className="text-xs uppercase tracking-wide" style={{ color: 'var(--color-text-muted)' }}>
                      {ASSET_TYPES.find(t => t.value === detail.type)?.label ?? detail.type}
                    </p>
                  </div>
                  <button onClick={() => setSelectedId(null)} className="ml-auto text-sm" style={{ color: 'var(--color-text-muted)' }}>✕</button>
                </div>

                <div className="grid grid-cols-3 gap-3 mb-5">
                  {[
                    { label: 'Current Value', value: fmt(detail.currentValue), clr: '#4BA8D8' },
                    { label: 'Loan Owed', value: fmt(detail.loanOwed), clr: '#F07A3E' },
                    { label: 'Equity', value: fmt(detail.equity), clr: detail.equity >= 0 ? '#4FBF7F' : '#F07A3E' },
                  ].map(s => (
                    <div key={s.label} className="rounded-xl p-3 text-center" style={{ background: 'var(--color-elevated)' }}>
                      <p className="text-[10px] uppercase tracking-wide" style={{ color: 'var(--color-text-muted)' }}>{s.label}</p>
                      <p className="font-bold text-base mt-1" style={{ color: s.clr }}>{s.value}</p>
                    </div>
                  ))}
                </div>

                <div className="flex gap-2 mb-5">
                  <button onClick={() => { const v = prompt('New current value', String(detail.currentValue)); if (v != null && !isNaN(parseFloat(v))) updateField('currentValue', parseFloat(v)); }}
                    className="px-3 py-1.5 rounded-lg text-xs font-semibold" style={{ background: 'var(--color-elevated)' }}>Update value</button>
                  <button onClick={() => { const v = prompt('New loan balance (0 to clear)', String(detail.loanOwed)); if (v != null && !isNaN(parseFloat(v))) updateField('loanOwed', parseFloat(v)); }}
                    className="px-3 py-1.5 rounded-lg text-xs font-semibold" style={{ background: 'var(--color-elevated)' }}>Update loan</button>
                </div>

                {detail.snapshots.length > 1 && (
                  <div className="mb-5">
                    <p className="text-xs font-semibold mb-2" style={{ color: 'var(--color-text-muted)' }}>Value over time</p>
                    <ResponsiveContainer width="100%" height={180}>
                      <LineChart data={detail.snapshots.map(s => ({ date: s.date, value: Number(s.value) }))}>
                        <XAxis dataKey="date" tick={{ fontSize: 10, fill: 'var(--color-text-muted)' }} />
                        <YAxis tick={{ fontSize: 10, fill: 'var(--color-text-muted)' }} width={50} />
                        <Tooltip formatter={(v: unknown) => fmt(Number(v))} />
                        <Line type="monotone" dataKey="value" stroke="#4BA8D8" strokeWidth={2} dot={{ r: 3 }} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                )}

                <div>
                  <p className="text-xs font-semibold mb-2" style={{ color: 'var(--color-text-muted)' }}>
                    Linked transactions ({detail.transactions.length})
                    {' · '}<span style={{ color: '#4FBF7F' }}>+{fmt(detail.income)}</span>
                    {' · '}<span style={{ color: '#F07A3E' }}>-{fmt(detail.expenses)}</span>
                  </p>
                  {detail.transactions.length === 0 ? (
                    <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                      No transactions linked yet. Link them from the Transactions page.
                    </p>
                  ) : (
                    <div className="space-y-1">
                      {detail.transactions.map(t => (
                        <div key={t.id} className="flex items-center justify-between text-xs px-3 py-2 rounded-lg" style={{ background: 'var(--color-elevated)' }}>
                          <span className="truncate">{t.name}</span>
                          <span style={{ color: Number(t.amount) >= 0 ? '#4FBF7F' : '#F07A3E' }}>
                            {Number(t.amount) >= 0 ? '+' : '-'}{fmt(Math.abs(Number(t.amount)))}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      )}
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit -p apps/web/tsconfig.json`
Expected: No new errors in `app/assets/page.tsx`.

- [ ] **Step 5: Manual UI check**

With dev servers running, open `/assets`, click a card. Verify the detail modal opens with Value/Loan/Equity, "Update value" updates the number and (after a second update) renders the appreciation chart with ≥2 points, and "Update loan" with `0` clears the loan (equity rises to full value). Confirm net worth on the dashboard reflects the new value.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/app/assets/page.tsx
git commit -m "feat(web): asset detail panel with appreciation chart and value/loan updates"
```

---

## Task 6: Link transactions to assets from the Transactions page

**Files:**
- Modify: `apps/web/src/app/transactions/page.tsx`

**Interfaces:**
- Consumes: `GET /api/assets` (list, for the picker); `PATCH /api/assets/:id/link/:txId`; `PATCH /api/assets/unlink/:txId`.
- Produces: a "Link to asset" path in the transaction category-picker; the assigned asset shown on the row; suggestion chips suppressed once `assetId` is set.

- [ ] **Step 1: Load assets into the page**

In `apps/web/src/app/transactions/page.tsx`, near where `projects` are fetched (the page already fetches `${API}/projects`), add an assets state and fetch:

```tsx
  const [assets, setAssets] = useState<{ id: string; name: string; icon: string; color: string | null }[]>([]);
```

And in the same `Promise.all`/effect that loads projects, add:

```tsx
        fetch(`${API}/assets`, { credentials: 'include' }).then(r => r.ok ? r.json() : []),
```

assigning the result to `setAssets`. (Match the existing fetch/destructure style in that effect exactly.)

- [ ] **Step 2: Add link/unlink helpers**

Add alongside the existing `linkToProject` helper:

```tsx
  const linkToAsset = async (txId: string, assetId: string) => {
    setUpdatingId(txId);
    const res = await fetch(`${API}/assets/${assetId}/link/${txId}`, { method: 'PATCH', credentials: 'include' });
    setUpdatingId(null);
    if (res.ok) { setOpenPickerId(null); await loadTransactions(); }
  };
```

(Use the page's existing reload function — confirm whether it's `loadTransactions()` or another name — and its existing `updatingId`/`setOpenPickerId` state.)

- [ ] **Step 3: Extend the suggestion-chip guard for assetId**

The category-suggestion and project-suggestion guards were updated in commit `427595f`. Extend both to also treat `assetId` as assigned. In the category suggestion block change:

```tsx
                            if (tx.categoryId || tx.projectId || tx.debtId || txIsTransfer) return null;
```

to:

```tsx
                            if (tx.categoryId || tx.projectId || tx.assetId || tx.debtId || txIsTransfer) return null;
```

And in the project suggestion block change:

```tsx
                            if (tx.projectId || tx.categoryId || tx.debtId || txIsTransfer) return null;
```

to:

```tsx
                            if (tx.projectId || tx.categoryId || tx.assetId || tx.debtId || txIsTransfer) return null;
```

Add `assetId?: string | null` to the page's `Transaction` interface so these compile.

- [ ] **Step 4: Add an "Assets" branch to the category picker**

The picker dropdown (the `createPortal` block around line 1318) has a project-drill path (`pickerProjectDrill`). Add a parallel asset path. Introduce state near `pickerProjectDrill`:

```tsx
  const [pickerAssetStep, setPickerAssetStep] = useState(false);
```

In the picker's top-level list (where "Link to project" is offered), add an entry:

```tsx
                                {assets.length > 0 && !pickerAssetStep && !pickerProjectDrill && !pickerTransferStep && (
                                  <button onClick={() => setPickerAssetStep(true)}
                                    className="w-full flex items-center gap-2.5 px-3 py-2 text-xs transition-colors hover:bg-[var(--color-elevated)]">
                                    <span>🏠</span><span>Link to asset…</span>
                                  </button>
                                )}
```

And render the asset list when `pickerAssetStep` is active:

```tsx
                                {pickerAssetStep && openPickerId === tx.id && (
                                  <>
                                    <div className="flex items-center gap-2 px-3 py-2" style={{ borderBottom: '1px solid var(--color-border)' }}>
                                      <button onClick={() => setPickerAssetStep(false)} className="text-sm shrink-0" style={{ color: 'var(--color-text-muted)' }}>←</button>
                                      <span className="text-xs font-bold flex-1" style={{ color: '#6B6B8A' }}>Link to which asset?</span>
                                    </div>
                                    {assets.map(a => (
                                      <button key={a.id} onClick={() => linkToAsset(tx.id, a.id)}
                                        className="w-full flex items-center gap-2.5 px-3 py-2 text-xs transition-colors hover:bg-[var(--color-elevated)]">
                                        <span>{a.icon}</span><span>{a.name}</span>
                                        {tx.assetId === a.id && <span className="ml-auto" style={{ color: a.color ?? '#9B6DFF' }}>✓</span>}
                                      </button>
                                    ))}
                                  </>
                                )}
```

Reset `pickerAssetStep` to `false` wherever the picker is opened/closed (mirror how `pickerProjectDrill`/`pickerTransferStep` are reset in the open handler around line 1272 and the close handler around line 1261).

- [ ] **Step 5: Show the linked asset on the row badge**

In the category-badge button content (the `tx.projectId ? (...)` chain around line 1293), add an `assetId` branch before the `cat ?` fallback so a linked asset displays. After the `tx.projectId` branch add:

```tsx
                              ) : tx.assetId ? (() => {
                                const _a = assets.find(x => x.id === tx.assetId);
                                return <><span>{_a?.icon ?? '🏠'}</span><span>{_a?.name ?? 'Asset'}</span><ChevronIcon /></>;
                              })() : cat ? (
```

(Adjust the surrounding ternary punctuation to keep it well-formed — the existing chain is `tx.debtId ? … : tx.projectId ? … : cat ? … : (…)`.) Also add a "Remove from asset" action: in the picker, when `tx.assetId` is set, offer an unlink button mirroring the existing project unlink, calling:

```tsx
  const unlinkAsset = async (txId: string) => {
    setUpdatingId(txId);
    const res = await fetch(`${API}/assets/unlink/${txId}`, { method: 'PATCH', credentials: 'include' });
    setUpdatingId(null);
    if (res.ok) { setOpenPickerId(null); await loadTransactions(); }
  };
```

- [ ] **Step 6: Typecheck**

Run: `npx tsc --noEmit -p apps/web/tsconfig.json`
Expected: No new errors in `app/transactions/page.tsx`.

- [ ] **Step 7: Manual UI check**

With dev servers running and at least one asset present: on `/transactions`, open a transaction's category picker, choose "Link to asset…", pick the asset. Verify the row badge shows the asset, any suggestion chips on that row disappear, and the transaction now appears under that asset's detail panel on `/assets` with income/expense totals updated. Unlink and confirm it reverts.

- [ ] **Step 8: Commit**

```bash
git add apps/web/src/app/transactions/page.tsx
git commit -m "feat(web): link transactions to assets from the category picker"
```

---

## Self-Review Notes

- **Spec coverage:** current value (Task 1 snapshot + Task 2 value account; UI Task 4/5), loan owed → equity (Task 2; UI Task 4/5), linked income/expenses (Task 1 `assetId`, Task 2/3 link endpoints, Task 6 UI), value history chart (Task 1 snapshot entity, Task 2 snapshot writes, Task 5 chart), hidden managed accounts (Task 1 column, Task 2 create, Task 3 list filter), net worth (no code — verified in Task 4/5 manual checks). Recurring costs intentionally deferred (Phase 2).
- **Net-worth double-count:** assets only *display* equity; the underlying tracking accounts are the sole net-worth contributors — confirmed no separate addition.
- **Type consistency:** `AssetDto` (Task 2) is the body shape used by the web form (Task 4) and detail updates (Task 5). `currentValue`/`loanOwed`/`equity`/`income`/`expenses`/`txCount` computed names are consistent across service, list, and UI. Link endpoints: `PATCH /assets/:id/link/:txId` and `PATCH /assets/unlink/:txId` are consistent between Task 3 controller and Task 6 client.
- **Decimal handling:** TypeORM returns `decimal` as strings; the service wraps balances/amounts in `Number(...)` and the client coerces with `Number(...)`/`parseFloat` before formatting.
