# Receipts: Match-to-Transaction + Manual Upload Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a receipt be linked to an existing transaction (instead of only creating a new one), and let the user add a receipt Cofre didn't get from Gmail via manual upload with an optional photo/PDF attachment — then surface both in the Receipts page UI.

**Architecture:** Backend: three new/changed `Receipt` columns, one new service method (`ReceiptFinderService.findTransactionCandidates`, symmetric to the existing `findCandidates`), two new endpoints (`GET /receipts/:id/transaction-candidates`, `POST /receipts/manual`), one new endpoint for serving the stored image bytes (`GET /receipts/:id/image`), and an update to `GET /receipts` to compute match status server-side. Frontend: extend the pure `derive.ts` logic (tested with vitest), then wire the new fields into the existing `StatStrip`/`FilterBar`/`ReceiptRow`/`ReceiptDetailPanel` components, plus one new `UploadReceiptModal` component.

**Tech Stack:** NestJS 11 (webpack+SWC), TypeORM (`synchronize: true` — no migration files, schema changes apply on next API restart), Next.js 16/React 19, Tailwind v4, Vitest.

## Global Constraints

- No AI parsing for manual uploads — the user types in merchant/total/date/items directly; the uploaded file is stored for reference only. (Spec decision: re-adding Anthropic would reverse a deliberate 2026-07-25 removal and its privacy-policy claim.)
- Uploaded images/PDFs are stored in Postgres (`bytea` columns), not GCS — no new GCP provisioning.
- Components must only consume theme CSS variables (`--color-surface`, `--glass-border`, `--color-text-primary`, etc.) — never hardcode colors (per `CLAUDE.md`).
- Every UI change must be responsive: verify at ~360px, ~768px, and desktop widths.
- `--color-primary`/`--color-indigo` are UI-accent-only, never used for chart/status-identity colors; use `--color-green`/`--color-amber`/`--color-sky`/`--color-violet`/`--color-orange` for status pills.
- No test runner covers NestJS services/controllers in this repo (only pure logic gets vitest tests, matching the existing `receipt-parser.test.ts` / `derive.test.ts` pattern) — new DI-wired service/controller code is verified manually via `curl`, matching how `receipts.service.ts` and `receipt-finder.service.ts` are verified today.

---

## File Structure

| File | Change |
|---|---|
| `apps/api/src/receipts/receipt.entity.ts` | Modify — add `source`, `imageData`, `imageMimeType` columns |
| `apps/api/src/transactions/receipt-finder.service.ts` | Modify — add `TransactionCandidate` interface + `findTransactionCandidates()` |
| `apps/api/src/transactions/transactions.module.ts` | Modify — export `ReceiptFinderService` |
| `apps/api/src/receipts/receipts.module.ts` | Modify — import `TransactionsModule` |
| `apps/api/src/receipts/receipts.service.ts` | Modify — match-status computation in `syncAndFind`, add `createManual()`, add `getImage()` |
| `apps/api/src/receipts/receipts.controller.ts` | Modify — add `GET :id/transaction-candidates`, `POST manual`, `GET :id/image` |
| `apps/web/src/lib/receipts/derive.ts` | Modify — new types, `statusLabel()`, updated `statTotals()`, `source` filter |
| `apps/web/src/lib/receipts/derive.test.ts` | Modify — replace `thisMonthTotal` tests with `matchedCount`/`matchRate`/`statusLabel` tests |
| `apps/web/src/app/receipts/StatStrip.tsx` | Modify — "This Month" tile → "Matched to Transactions" |
| `apps/web/src/app/receipts/FilterBar.tsx` | Modify — add Source filter, extend Status filter |
| `apps/web/src/app/receipts/ReceiptRow.tsx` | Modify — source icon, category text, three-state status pill |
| `apps/web/src/app/receipts/ReceiptDetailPanel.tsx` | Modify — image preview, embed `MatchTransactionSection` |
| `apps/web/src/app/receipts/MatchTransactionSection.tsx` | Create — candidate list + match/unmatch actions |
| `apps/web/src/app/receipts/UploadReceiptModal.tsx` | Create — manual upload form |
| `apps/web/src/app/receipts/page.tsx` | Modify — "Upload Receipt" button, modal wiring |

---

### Task 1: Receipt entity — source and image columns

**Files:**
- Modify: `apps/api/src/receipts/receipt.entity.ts`

**Interfaces:**
- Produces: `Receipt.source: string` (default `'gmail'`), `Receipt.imageData: Buffer | null`, `Receipt.imageMimeType: string | null` — consumed by every later backend task.

- [ ] **Step 1: Add the three columns**

Edit `apps/api/src/receipts/receipt.entity.ts` — insert after the `imported` column (after line 37, before `parsedAt`):

```typescript
  @Column({ default: 'gmail' })
  source: string;

  @Column({ type: 'bytea', nullable: true })
  imageData: Buffer | null;

  @Column({ nullable: true })
  imageMimeType: string | null;
```

- [ ] **Step 2: Restart the API and verify the schema updated**

Run: `npx nx serve api` (or let the already-running watch process pick it up), then:

```bash
psql "postgresql://postgres:postgres@localhost:5432/cofre_budget" -c "\d receipts"
```

Expected: `source`, `imagedata`, `imagemimetype` columns present (TypeORM lower-cases unquoted identifiers), `source` has a `'gmail'::character varying` default.

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/receipts/receipt.entity.ts
git commit -m "feat(receipts): add source and image columns to Receipt entity"
```

---

### Task 2: ReceiptFinderService — receipt → transaction candidates

**Files:**
- Modify: `apps/api/src/transactions/receipt-finder.service.ts`

**Interfaces:**
- Consumes: existing `Transaction`, `Receipt` repositories already injected in this service.
- Produces: `TransactionCandidate` interface, `findTransactionCandidates(userId: string, receiptId: string, windowDays = 4): Promise<TransactionCandidate[]>` — consumed by Task 3's controller endpoint.

- [ ] **Step 1: Add the `TransactionCandidate` interface**

Edit `apps/api/src/transactions/receipt-finder.service.ts` — add after the existing `ReceiptCandidate` interface (after line 21):

```typescript
export interface TransactionCandidate {
  id: string;
  name: string;
  date: string;
  amount: number;
  amountDelta: number;
  linked: boolean;
}
```

- [ ] **Step 2: Add `findTransactionCandidates` to the `ReceiptFinderService` class**

Add this method to the class, after the existing `findCandidates` method (after line 109, before the private `rank` method):

```typescript
  async findTransactionCandidates(
    userId: string, receiptId: string, windowDays = 4,
  ): Promise<TransactionCandidate[]> {
    const receipt = await this.receiptRepo.findOneBy({ id: receiptId, userId });
    if (!receipt) throw new NotFoundException('Receipt not found');

    const absTotal = Math.abs(Number(receipt.total));
    const from = receipt.orderDate ? shiftDate(receipt.orderDate, -windowDays) : null;
    const to = receipt.orderDate ? shiftDate(receipt.orderDate, windowDays) : null;

    const qb = this.txRepo.createQueryBuilder('t').where('t.userId = :userId', { userId });
    if (from && to) {
      qb.andWhere('(t.date BETWEEN :from AND :to OR t.receiptId = :receiptId)', { from, to, receiptId });
    }
    // Exclude transactions already linked to a *different* receipt.
    qb.andWhere('(t.receiptId IS NULL OR t.receiptId = :receiptId)', { receiptId });
    const candidates = await qb.getMany();

    return this.rankTransactions(candidates, receipt, absTotal);
  }
```

- [ ] **Step 3: Add the private `rankTransactions` helper**

Add after the existing private `rank` method (after line 146):

```typescript
  private rankTransactions(txs: Transaction[], receipt: Receipt, absTotal: number): TransactionCandidate[] {
    const receiptTime = receipt.orderDate ? new Date(`${receipt.orderDate}T00:00:00Z`).getTime() : null;
    const dateDist = new Map(txs.map((t) => [
      t.id,
      receiptTime !== null ? Math.abs(new Date(`${t.date}T00:00:00Z`).getTime() - receiptTime) : Number.MAX_SAFE_INTEGER,
    ]));

    return txs
      .map((t) => ({
        id: t.id,
        name: t.name,
        date: t.date,
        amount: Number(t.amount),
        amountDelta: +Math.abs(Math.abs(Number(t.amount)) - absTotal).toFixed(2),
        linked: t.receiptId === receipt.id,
      }))
      .sort((a, b) =>
        Number(b.linked) - Number(a.linked) ||
        a.amountDelta - b.amountDelta ||
        (dateDist.get(a.id) ?? 0) - (dateDist.get(b.id) ?? 0),
      );
  }
```

- [ ] **Step 4: Verify it compiles**

Run: `npx tsc --noEmit -p apps/api/tsconfig.app.json`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/transactions/receipt-finder.service.ts
git commit -m "feat(receipts): add receipt-to-transaction candidate matching"
```

---

### Task 3: Wire ReceiptFinderService into ReceiptsModule + candidates endpoint

**Files:**
- Modify: `apps/api/src/transactions/transactions.module.ts`
- Modify: `apps/api/src/receipts/receipts.module.ts`
- Modify: `apps/api/src/receipts/receipts.controller.ts`

**Interfaces:**
- Consumes: `ReceiptFinderService.findTransactionCandidates` (Task 2).
- Produces: `GET /receipts/:id/transaction-candidates?window=N` → `TransactionCandidate[]`, consumed by Task 11's `MatchTransactionSection`.

- [ ] **Step 1: Export `ReceiptFinderService` from `TransactionsModule`**

In `apps/api/src/transactions/transactions.module.ts`, change:

```typescript
  exports: [TransactionsService],
```

to:

```typescript
  exports: [TransactionsService, ReceiptFinderService],
```

- [ ] **Step 2: Import `TransactionsModule` into `ReceiptsModule`**

In `apps/api/src/receipts/receipts.module.ts`, add the import:

```typescript
import { TransactionsModule } from '../transactions/transactions.module';
```

and change:

```typescript
  imports: [TypeOrmModule.forFeature([Receipt, Transaction, BankAccount, Category]), GmailModule],
```

to:

```typescript
  imports: [TypeOrmModule.forFeature([Receipt, Transaction, BankAccount, Category]), GmailModule, TransactionsModule],
```

- [ ] **Step 3: Inject `ReceiptFinderService` into `ReceiptsController` and add the endpoint**

In `apps/api/src/receipts/receipts.controller.ts`, update the imports and constructor:

```typescript
import { Controller, Get, Post, Param, Body, Query, Request, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ReceiptsService, ImportSplit } from './receipts.service';
import { ReceiptFinderService } from '../transactions/receipt-finder.service';

@UseGuards(JwtAuthGuard)
@Controller('receipts')
export class ReceiptsController {
  constructor(
    private service: ReceiptsService,
    private receiptFinder: ReceiptFinderService,
  ) {}
```

Add this method after the existing `import` method:

```typescript
  @Get(':id/transaction-candidates')
  transactionCandidates(
    @Param('id') id: string,
    @Query('window') window: string,
    @Request() req: any,
  ) {
    return this.receiptFinder.findTransactionCandidates(req.user.id, id, window ? parseInt(window, 10) : 4);
  }
```

- [ ] **Step 4: Verify it compiles**

Run: `npx tsc --noEmit -p apps/api/tsconfig.app.json`
Expected: no errors.

- [ ] **Step 5: Manually verify against the running API**

With the API dev server running and a receipt id known (e.g. from `SELECT id FROM receipts LIMIT 1;`), mint a JWT and call the endpoint the same way earlier debugging in this session did:

```bash
TOKEN=$(node -e '
require("dotenv").config();
const jwt = require("jsonwebtoken");
console.log(jwt.sign({ sub: "<userId>", email: "<email>" }, process.env.JWT_SECRET, { expiresIn: "1h" }));
')
curl -sS "http://localhost:3333/api/receipts/<receiptId>/transaction-candidates" -H "Authorization: Bearer $TOKEN"
```

Expected: `200` with a JSON array of `TransactionCandidate` objects (or `[]` if no transactions are near that receipt's date/amount).

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/transactions/transactions.module.ts apps/api/src/receipts/receipts.module.ts apps/api/src/receipts/receipts.controller.ts
git commit -m "feat(receipts): add GET /receipts/:id/transaction-candidates"
```

---

### Task 4: Match status + matched-transaction in the receipts list

**Files:**
- Modify: `apps/api/src/receipts/receipts.service.ts`

**Interfaces:**
- Produces: `MatchStatus`, `MatchedTransaction`, `ReceiptListItem` types; `syncAndFind` now returns `{ receipts: ReceiptListItem[]; syncError: string | null }` — consumed by Task 7 (frontend `Receipt` type must match this shape exactly) and Task 11 (unmatch button needs `matchedTransaction.id`).

- [ ] **Step 1: Add imports and new types**

At the top of `apps/api/src/receipts/receipts.service.ts`, change:

```typescript
import { Injectable, Logger, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
```

to:

```typescript
import { Injectable, Logger, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Not, IsNull } from 'typeorm';
```

Add after the existing `ImportSplit` interface:

```typescript
export type MatchStatus = 'matched' | 'pending';

export interface MatchedTransaction {
  id: string;
  name: string;
  amount: number;
  date: string;
  category: { id: string; name: string; icon: string; color: string } | null;
}

export interface ReceiptListItem extends Receipt {
  matchStatus: MatchStatus;
  matchedTransaction: MatchedTransaction | null;
}
```

- [ ] **Step 2: Change `syncAndFind`'s return type and compute match status**

Change the method signature:

```typescript
  async syncAndFind(userId: string): Promise<{ receipts: ReceiptListItem[]; syncError: string | null }> {
```

Change both early-return points and the final return to build `ReceiptListItem[]` via a new private helper. Replace:

```typescript
    } catch (err) {
      // Gmail not connected or fetch failed — return cached results plus the reason, so the UI can surface it
      const message = (err as Error)?.message ?? 'Unknown error';
      this.logger.error(`fetchAndParseReceipts failed for user ${userId}: ${message}`, (err as Error)?.stack);
      return { receipts: existing, syncError: message };
    }
```

with:

```typescript
    } catch (err) {
      // Gmail not connected or fetch failed — return cached results plus the reason, so the UI can surface it
      const message = (err as Error)?.message ?? 'Unknown error';
      this.logger.error(`fetchAndParseReceipts failed for user ${userId}: ${message}`, (err as Error)?.stack);
      return { receipts: await this.withMatchStatus(userId, existing), syncError: message };
    }
```

and replace:

```typescript
    const receipts = await this.receiptRepo.find({ where: { userId }, order: { parsedAt: 'DESC' } });
    return { receipts, syncError: null };
  }
```

with:

```typescript
    const receipts = await this.receiptRepo.find({ where: { userId }, order: { parsedAt: 'DESC' } });
    return { receipts: await this.withMatchStatus(userId, receipts), syncError: null };
  }

  /** Annotates receipts with match status by loading every linked transaction for this
      user once and grouping by receiptId — avoids one query per receipt. When a receipt
      has more than one linked transaction (e.g. a multi-category "Create Transactions"
      import), the highest-amount one represents it for display. */
  private async withMatchStatus(userId: string, receipts: Receipt[]): Promise<ReceiptListItem[]> {
    const linkedTxs = await this.txRepo.find({
      where: { userId, receiptId: Not(IsNull()) },
      relations: ['categoryRef'],
      order: { amount: 'DESC' },
    });

    const byReceiptId = new Map<string, Transaction[]>();
    for (const tx of linkedTxs) {
      if (!tx.receiptId) continue;
      const list = byReceiptId.get(tx.receiptId) ?? [];
      list.push(tx);
      byReceiptId.set(tx.receiptId, list);
    }

    return receipts.map((receipt) => {
      const linked = byReceiptId.get(receipt.id) ?? [];
      const top = linked[0] ?? null;
      const matchedTransaction: MatchedTransaction | null = top
        ? {
            id: top.id,
            name: top.name,
            amount: Number(top.amount),
            date: top.date,
            category: top.categoryRef
              ? { id: top.categoryRef.id, name: top.categoryRef.name, icon: top.categoryRef.icon, color: top.categoryRef.color }
              : null,
          }
        : null;
      return {
        ...receipt,
        matchStatus: (linked.length > 0 ? 'matched' : 'pending') as MatchStatus,
        matchedTransaction,
      };
    });
  }
```

- [ ] **Step 3: Verify it compiles**

Run: `npx tsc --noEmit -p apps/api/tsconfig.app.json`
Expected: no errors.

- [ ] **Step 4: Manually verify**

```bash
TOKEN=$(node -e '
require("dotenv").config();
const jwt = require("jsonwebtoken");
console.log(jwt.sign({ sub: "<userId>", email: "<email>" }, process.env.JWT_SECRET, { expiresIn: "1h" }));
')
curl -sS http://localhost:3333/api/receipts -H "Authorization: Bearer $TOKEN" | node -e '
let d=""; process.stdin.on("data",c=>d+=c); process.stdin.on("end",()=>{
  const p = JSON.parse(d);
  console.log(p.receipts[0]);
});
'
```

Expected: each receipt object now includes `matchStatus` and `matchedTransaction` fields.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/receipts/receipts.service.ts
git commit -m "feat(receipts): compute match status and matched transaction in receipts list"
```

---

### Task 5: Manual receipt upload — backend

**Files:**
- Modify: `apps/api/src/receipts/receipts.service.ts`
- Modify: `apps/api/src/receipts/receipts.controller.ts`
- Modify: `package.json` (devDependency)

**Interfaces:**
- Produces: `CreateManualReceiptInput` type, `ReceiptsService.createManual(userId, input, file?)`, `POST /receipts/manual` — consumed by Task 12's `UploadReceiptModal`.

- [ ] **Step 1: Install multer types**

```bash
npm install -D @types/multer
```

- [ ] **Step 2: Add `createManual` to `ReceiptsService`**

Add after the existing `importToTransactions` method in `apps/api/src/receipts/receipts.service.ts`:

```typescript
export interface CreateManualReceiptInput {
  merchant: string;
  total: number;
  currency: string;
  orderDate: string | null;
  orderNumber: string | null;
  items: { name: string; quantity: number; unitPrice: number; total: number }[];
}
```

(Add this interface near the top, next to `ImportSplit`.)

```typescript
  async createManual(
    userId: string, input: CreateManualReceiptInput, file: Express.Multer.File | undefined,
  ): Promise<Receipt> {
    const items = input.items.length > 0
      ? input.items
      : [{ name: `${input.merchant} purchase`, quantity: 1, unitPrice: input.total, total: input.total }];

    return this.receiptRepo.save(
      this.receiptRepo.create({
        userId,
        gmailMessageId: `manual:${crypto.randomUUID()}`,
        merchant: input.merchant,
        orderNumber: input.orderNumber ?? undefined,
        orderDate: input.orderDate ?? undefined,
        total: input.total,
        currency: input.currency || 'USD',
        items,
        rawSubject: input.merchant,
        imported: false,
        source: 'manual',
        imageData: file ? file.buffer : null,
        imageMimeType: file ? file.mimetype : null,
      }),
    );
  }
```

`gmailMessageId` is `NOT NULL` and has a per-user unique index alongside it — manual receipts get a synthetic `manual:<uuid>` value so the column stays populated and unique without meaning anything Gmail-related. Add the import at the top of the file:

```typescript
import * as crypto from 'crypto';
```

- [ ] **Step 3: Add the upload endpoint to `ReceiptsController`**

Update the NestJS imports at the top of `apps/api/src/receipts/receipts.controller.ts`:

```typescript
import { Controller, Get, Post, Param, Body, Query, Request, UseGuards, UseInterceptors, UploadedFile, BadRequestException } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ReceiptsService, ImportSplit, CreateManualReceiptInput } from './receipts.service';
import { ReceiptFinderService } from '../transactions/receipt-finder.service';
```

Add this method, after the `transactionCandidates` method added in Task 3:

```typescript
  @Post('manual')
  @UseInterceptors(FileInterceptor('image', {
    limits: { fileSize: 8 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
      const allowed = ['image/jpeg', 'image/png', 'image/heic', 'application/pdf'];
      if (!allowed.includes(file.mimetype)) return cb(new BadRequestException('Unsupported file type'), false);
      cb(null, true);
    },
  }))
  uploadManual(
    @Request() req: any,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body() body: { merchant: string; total: string; currency?: string; orderDate?: string; orderNumber?: string; items?: string },
  ) {
    if (!body.merchant?.trim()) throw new BadRequestException('merchant is required');
    const total = Number(body.total);
    if (!Number.isFinite(total) || total <= 0) throw new BadRequestException('total must be a positive number');

    let items: CreateManualReceiptInput['items'] = [];
    if (body.items) {
      try {
        const parsed = JSON.parse(body.items);
        if (Array.isArray(parsed)) items = parsed;
      } catch {
        throw new BadRequestException('items must be valid JSON');
      }
    }

    const input: CreateManualReceiptInput = {
      merchant: body.merchant.trim(),
      total,
      currency: body.currency || 'USD',
      orderDate: body.orderDate || null,
      orderNumber: body.orderNumber || null,
      items,
    };
    return this.service.createManual(req.user.id, input, file);
  }
```

`FileInterceptor` uses multer's in-memory storage by default (no `storage` option given), which is what we want — `file.buffer` goes straight into the `imageData` column with no disk write, correctly for Cloud Run's stateless filesystem.

- [ ] **Step 4: Verify it compiles**

Run: `npx tsc --noEmit -p apps/api/tsconfig.app.json`
Expected: no errors.

- [ ] **Step 5: Manually verify**

```bash
TOKEN=$(node -e '
require("dotenv").config();
const jwt = require("jsonwebtoken");
console.log(jwt.sign({ sub: "<userId>", email: "<email>" }, process.env.JWT_SECRET, { expiresIn: "1h" }));
')
curl -sS -X POST http://localhost:3333/api/receipts/manual \
  -H "Authorization: Bearer $TOKEN" \
  -F "merchant=Test Hardware Store" \
  -F "total=42.50" \
  -F "orderDate=2026-08-01"
```

Expected: `201`/`200` with the created receipt JSON, `source: "manual"`, `imageData`/`imageMimeType` null (no file attached in this test). Then re-run with `-F "image=@/path/to/some.jpg"` added and confirm `imageMimeType` is set.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json apps/api/src/receipts/receipts.service.ts apps/api/src/receipts/receipts.controller.ts
git commit -m "feat(receipts): add manual receipt upload endpoint"
```

---

### Task 6: Serve the stored receipt image

**Files:**
- Modify: `apps/api/src/receipts/receipts.service.ts`
- Modify: `apps/api/src/receipts/receipts.controller.ts`

**Interfaces:**
- Produces: `ReceiptsService.getImage(userId, receiptId)`, `GET /receipts/:id/image` — consumed by Task 11's image preview (`<img src>` / download link).

- [ ] **Step 1: Add `getImage` to `ReceiptsService`**

Add after `createManual`:

```typescript
  async getImage(userId: string, receiptId: string): Promise<{ data: Buffer; mimeType: string } | null> {
    const receipt = await this.receiptRepo.findOneBy({ id: receiptId, userId });
    if (!receipt?.imageData || !receipt.imageMimeType) return null;
    return { data: receipt.imageData, mimeType: receipt.imageMimeType };
  }
```

- [ ] **Step 2: Add the endpoint to `ReceiptsController`**

Update the NestJS imports:

```typescript
import { Controller, Get, Post, Param, Body, Query, Request, Res, UseGuards, UseInterceptors, UploadedFile, BadRequestException, NotFoundException } from '@nestjs/common';
import { Response } from 'express';
```

Add this method:

```typescript
  @Get(':id/image')
  async image(@Param('id') id: string, @Request() req: any, @Res() res: Response) {
    const img = await this.service.getImage(req.user.id, id);
    if (!img) throw new NotFoundException();
    res.set('Content-Type', img.mimeType);
    res.send(img.data);
  }
```

- [ ] **Step 3: Verify it compiles**

Run: `npx tsc --noEmit -p apps/api/tsconfig.app.json`
Expected: no errors.

- [ ] **Step 4: Manually verify**

Using the receipt id created with an image in Task 5's verification step:

```bash
TOKEN=$(node -e '
require("dotenv").config();
const jwt = require("jsonwebtoken");
console.log(jwt.sign({ sub: "<userId>", email: "<email>" }, process.env.JWT_SECRET, { expiresIn: "1h" }));
')
curl -sS "http://localhost:3333/api/receipts/<receiptId>/image" -H "Authorization: Bearer $TOKEN" -o /tmp/out.jpg
file /tmp/out.jpg
```

Expected: `file` reports a valid JPEG (or whatever type was uploaded), matching the original.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/receipts/receipts.service.ts apps/api/src/receipts/receipts.controller.ts
git commit -m "feat(receipts): serve stored receipt image bytes"
```

---

### Task 7: Frontend derive.ts — types, statusLabel, updated stats, source filter (TDD)

**Files:**
- Modify: `apps/web/src/lib/receipts/derive.ts`
- Modify: `apps/web/src/lib/receipts/derive.test.ts`

**Interfaces:**
- Consumes: the `ReceiptListItem` shape from Task 4 (`matchStatus`, `matchedTransaction`), `source`/`imageMimeType` from Task 1.
- Produces: `ReceiptSource`, `MatchStatus`, `MatchedTransaction`, updated `Receipt`/`ReceiptLite`/`ReceiptFilters`/`StatTotals` types, `statusLabel()` — consumed by Tasks 8–12.

- [ ] **Step 1: Write the failing tests**

Replace the three `thisMonthTotal`-related tests in `apps/web/src/lib/receipts/derive.test.ts` (the `sums totals only for receipts dated in the current month`, `returns zeroes for an empty list`, and `correctly includes receipts at month boundaries` tests, plus drop the unused `NOW` constant and `currentMonthPrefix` references) and update the `receipt()` helper and imports. Full replacement of the file:

```typescript
import { describe, it, expect } from 'vitest';
import { statTotals, distinctMerchants, filterReceipts, countGroups, money, statusLabel, DEFAULT_FILTERS, type ReceiptLite } from './derive';

function receipt(p: Partial<ReceiptLite> = {}): ReceiptLite {
  return {
    id: 'r1', merchant: 'Amazon', rawSubject: 'Your order has shipped',
    total: 42.5, imported: false, orderDate: '2026-07-10', matchStatus: 'pending', ...p,
  };
}

describe('statTotals', () => {
  it('counts total, imported, and pending', () => {
    const receipts = [receipt({ imported: true }), receipt({ imported: false }), receipt({ imported: false })];
    const totals = statTotals(receipts);
    expect(totals.total).toBe(3);
    expect(totals.imported).toBe(1);
    expect(totals.pending).toBe(2);
  });

  it('counts matchedCount as imported-or-matched, and computes matchRate', () => {
    const receipts = [
      receipt({ imported: true, matchStatus: 'pending' }),   // counts via imported
      receipt({ imported: false, matchStatus: 'matched' }),  // counts via matchStatus
      receipt({ imported: false, matchStatus: 'pending' }),  // neither
    ];
    const totals = statTotals(receipts);
    expect(totals.matchedCount).toBe(2);
    expect(totals.matchRate).toBe(67); // 2/3 rounded
  });

  it('returns zeroes for an empty list', () => {
    expect(statTotals([])).toEqual({ total: 0, imported: 0, pending: 0, matchedCount: 0, matchRate: 0 });
  });
});

describe('distinctMerchants', () => {
  it('dedupes and sorts alphabetically', () => {
    const receipts = [receipt({ merchant: 'Walmart' }), receipt({ merchant: 'Amazon' }), receipt({ merchant: 'Amazon' })];
    expect(distinctMerchants(receipts)).toEqual(['Amazon', 'Walmart']);
  });
});

describe('filterReceipts', () => {
  it('returns everything when filters are default', () => {
    const receipts = [receipt(), receipt({ merchant: 'Costco' })];
    expect(filterReceipts(receipts, DEFAULT_FILTERS)).toHaveLength(2);
  });

  it('matches search against merchant or subject', () => {
    const receipts = [
      receipt({ merchant: 'Costco', rawSubject: 'Your receipt' }),
      receipt({ merchant: 'Amazon', rawSubject: 'Order shipped' }),
    ];
    expect(filterReceipts(receipts, { ...DEFAULT_FILTERS, search: 'costco' })).toHaveLength(1);
    expect(filterReceipts(receipts, { ...DEFAULT_FILTERS, search: 'shipped' })).toHaveLength(1);
  });

  it('filters by exact merchant', () => {
    const receipts = [receipt({ merchant: 'Costco' }), receipt({ merchant: 'Amazon' })];
    expect(filterReceipts(receipts, { ...DEFAULT_FILTERS, merchant: 'Costco' })).toHaveLength(1);
  });

  it('filters by status: imported takes priority, then matched, then pending', () => {
    const receipts = [
      receipt({ imported: true, matchStatus: 'matched' }),
      receipt({ imported: false, matchStatus: 'matched' }),
      receipt({ imported: false, matchStatus: 'pending' }),
    ];
    expect(filterReceipts(receipts, { ...DEFAULT_FILTERS, status: 'imported' })).toHaveLength(1);
    expect(filterReceipts(receipts, { ...DEFAULT_FILTERS, status: 'matched' })).toHaveLength(1);
    expect(filterReceipts(receipts, { ...DEFAULT_FILTERS, status: 'pending' })).toHaveLength(1);
  });

  it('filters by date range, excluding receipts with no orderDate when a bound is set', () => {
    const receipts = [
      receipt({ orderDate: '2026-07-01' }),
      receipt({ orderDate: '2026-07-15' }),
      receipt({ orderDate: null }),
    ];
    const inRange = filterReceipts(receipts, { ...DEFAULT_FILTERS, dateFrom: '2026-07-10', dateTo: '2026-07-31' });
    expect(inRange).toHaveLength(1);
    expect(inRange[0].orderDate).toBe('2026-07-15');
  });

  it('filters by source', () => {
    const receipts = [receipt({ source: 'gmail' }), receipt({ source: 'manual' })];
    expect(filterReceipts(receipts, { ...DEFAULT_FILTERS, source: 'manual' })).toHaveLength(1);
  });
});

describe('money', () => {
  it('formats a plain amount with two decimal places', () => {
    expect(money(12.5)).toBe('$12.50');
  });
  it('adds a thousands separator', () => {
    expect(money(1234.5)).toBe('$1,234.50');
  });
  it('takes the absolute value of negative amounts', () => {
    expect(money(-42)).toBe('$42.00');
  });
});

describe('countGroups', () => {
  it('returns 1 when nothing is categorized', () => {
    expect(countGroups(3, {})).toBe(1);
  });
  it('counts distinct categories plus one uncategorized bucket', () => {
    expect(countGroups(3, { 0: 'cat-a', 1: 'cat-a', 2: 'cat-b' })).toBe(2);
  });
  it('adds an uncategorized bucket when some items are unassigned', () => {
    expect(countGroups(3, { 0: 'cat-a' })).toBe(2); // cat-a + uncategorized
  });
  it('never returns zero for an empty item list', () => {
    expect(countGroups(0, {})).toBe(1);
  });
});

describe('statusLabel', () => {
  it('returns Imported when imported is true, regardless of matchStatus', () => {
    expect(statusLabel({ imported: true, matchStatus: 'pending' })).toBe('Imported');
    expect(statusLabel({ imported: true, matchStatus: 'matched' })).toBe('Imported');
  });
  it('returns Matched when not imported but matchStatus is matched', () => {
    expect(statusLabel({ imported: false, matchStatus: 'matched' })).toBe('Matched');
  });
  it('returns Pending when neither imported nor matched', () => {
    expect(statusLabel({ imported: false, matchStatus: 'pending' })).toBe('Pending');
  });
});
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `npx vitest run --root apps/web src/lib/receipts/derive.test.ts`
Expected: FAIL — `matchStatus`/`source` don't exist on `ReceiptLite`/`ReceiptFilters` yet, `statusLabel` isn't exported, `statTotals` still takes a `now` param and returns `thisMonthTotal`.

- [ ] **Step 3: Update `derive.ts`**

Replace the full contents of `apps/web/src/lib/receipts/derive.ts`:

```typescript
/* Pure, framework-free receipt derivation logic for the /receipts page:
   stat-strip totals, merchant list, list filtering, and transaction-
   group counting. Kept separate from the React components so it can be
   unit tested directly, mirroring src/lib/dashboard/derive.ts. */

export interface ReceiptItem { name: string; quantity: number; unitPrice: number; total: number }

export type ReceiptSource = 'gmail' | 'manual';
export type MatchStatus = 'matched' | 'pending';

export interface MatchedTransaction {
  id: string;
  name: string;
  amount: number;
  date: string;
  category: { id: string; name: string; icon: string; color: string } | null;
}

export interface Receipt {
  id: string;
  merchant: string;
  orderNumber: string | null;
  orderDate: string | null;
  total: number;
  currency: string;
  items: ReceiptItem[];
  rawSubject: string;
  imported: boolean;
  parsedAt: string;
  source: ReceiptSource;
  matchStatus: MatchStatus;
  matchedTransaction: MatchedTransaction | null;
  imageMimeType: string | null;
}

/** Subset of Receipt needed by stat/filter logic — any Receipt satisfies this structurally. */
export interface ReceiptLite {
  id: string;
  merchant: string;
  rawSubject: string;
  total: number;
  imported: boolean;
  orderDate: string | null;
  matchStatus: MatchStatus;
  source?: ReceiptSource;
}

export type ReceiptStatus = 'all' | 'imported' | 'matched' | 'pending';

export interface ReceiptFilters {
  search: string;
  merchant: string;
  dateFrom: string;   // '' = no lower bound, else 'YYYY-MM-DD'
  dateTo: string;     // '' = no upper bound
  status: ReceiptStatus;
  source: '' | ReceiptSource; // '' = all
}

export const DEFAULT_FILTERS: ReceiptFilters = {
  search: '', merchant: '', dateFrom: '', dateTo: '', status: 'all', source: '',
};

export interface StatTotals {
  total: number;
  imported: number;
  pending: number;
  matchedCount: number; // imported OR matched — either way it has a linked transaction
  matchRate: number;    // 0-100, rounded, matchedCount / total
}

export function statTotals(receipts: ReceiptLite[]): StatTotals {
  const imported = receipts.filter((r) => r.imported).length;
  const matchedCount = receipts.filter((r) => r.imported || r.matchStatus === 'matched').length;
  return {
    total: receipts.length,
    imported,
    pending: receipts.length - imported,
    matchedCount,
    matchRate: receipts.length ? Math.round((matchedCount / receipts.length) * 100) : 0,
  };
}

export function distinctMerchants(receipts: ReceiptLite[]): string[] {
  return [...new Set(receipts.map((r) => r.merchant))].sort((a, b) => a.localeCompare(b));
}

/** Imported takes priority (it's already a real transaction), then Matched, then Pending. */
export function statusLabel(r: { imported: boolean; matchStatus: MatchStatus }): 'Imported' | 'Matched' | 'Pending' {
  if (r.imported) return 'Imported';
  return r.matchStatus === 'matched' ? 'Matched' : 'Pending';
}

export function filterReceipts<T extends ReceiptLite>(receipts: T[], filters: ReceiptFilters): T[] {
  const search = filters.search.trim().toLowerCase();
  return receipts.filter((r) => {
    if (search && !r.merchant.toLowerCase().includes(search) && !r.rawSubject.toLowerCase().includes(search)) return false;
    if (filters.merchant && r.merchant !== filters.merchant) return false;
    if (filters.source && r.source !== filters.source) return false;
    const label = statusLabel(r);
    if (filters.status === 'imported' && label !== 'Imported') return false;
    if (filters.status === 'matched' && label !== 'Matched') return false;
    if (filters.status === 'pending' && label !== 'Pending') return false;
    if (filters.dateFrom && (!r.orderDate || r.orderDate < filters.dateFrom)) return false;
    if (filters.dateTo && (!r.orderDate || r.orderDate > filters.dateTo)) return false;
    return true;
  });
}

/** Shared dollar formatter for the receipts feature — always displays a
    positive figure (callers never need to show a negative sign here). */
export function money(n: number): string {
  return `$${Math.abs(Number(n)).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** Number of transactions creating a receipt's items will produce: one per
    distinct assigned category, plus one for any items left uncategorized. */
export function countGroups(itemCount: number, itemCategories: Record<number, string>): number {
  const assigned = new Set<string>();
  let hasUncategorized = false;
  for (let idx = 0; idx < itemCount; idx++) {
    const catId = itemCategories[idx];
    if (catId) assigned.add(catId);
    else hasUncategorized = true;
  }
  return assigned.size + (hasUncategorized ? 1 : 0) || 1;
}
```

Note: `ReceiptLite.source` is optional (`source?:`) because the `receipt()` test helper in some existing tests doesn't set it — `filterReceipts`'s source check (`r.source !== filters.source`) naturally excludes items with an `undefined` source whenever a specific source filter is active, and is skipped entirely when `filters.source === ''`.

- [ ] **Step 4: Run the tests again to confirm they pass**

Run: `npx vitest run --root apps/web src/lib/receipts/derive.test.ts`
Expected: PASS, all tests green.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/receipts/derive.ts apps/web/src/lib/receipts/derive.test.ts
git commit -m "feat(receipts): add match status, source, and statusLabel to derive.ts"
```

---

### Task 8: StatStrip — "Matched to Transactions" tile

**Files:**
- Modify: `apps/web/src/app/receipts/StatStrip.tsx`

**Interfaces:**
- Consumes: `StatTotals.matchedCount`/`matchRate` (Task 7).

- [ ] **Step 1: Replace the "This Month" tile**

In `apps/web/src/app/receipts/StatStrip.tsx`, replace the icon constants block:

```typescript
const I_DOC    = 'M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z M14 3v6h6 M9 13h6 M9 17h6';
const I_CHECK  = 'M4 12l5 5L20 6';
const I_CLOCK  = 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z M12 8v4l3 3';
const I_DOLLAR = 'M12 2v20 M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6';
```

with (drop `I_DOLLAR`, add `I_LINK`):

```typescript
const I_DOC    = 'M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z M14 3v6h6 M9 13h6 M9 17h6';
const I_CHECK  = 'M4 12l5 5L20 6';
const I_CLOCK  = 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z M12 8v4l3 3';
const I_LINK   = 'M9 17H7a5 5 0 0 1 0-10h2 M15 7h2a5 5 0 0 1 0 10h-2 M8 12h8';
```

and replace the tile definition:

```typescript
    { label: 'This Month', value: money(t.thisMonthTotal), color: 'var(--color-violet)', icon: I_DOLLAR },
```

with:

```typescript
    { label: 'Matched to Transactions', value: `${t.matchedCount} · ${t.matchRate}%`, color: 'var(--color-violet)', icon: I_LINK },
```

`money` is no longer used in this file if it was only used for that tile — check the import line at the top (`import { statTotals, money, type ReceiptLite } from '@/lib/receipts/derive';`) and remove `money` from it if so:

```typescript
import { statTotals, type ReceiptLite } from '@/lib/receipts/derive';
```

- [ ] **Step 2: Verify it compiles**

Run: `cd apps/web && npx tsc --noEmit -p tsconfig.json && cd ../..`
Expected: no errors. (This tsconfig doesn't set `noUnusedLocals`, so an unused `money` import wouldn't fail the build either way — it's removed here for cleanliness, not to satisfy the compiler.)

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/receipts/StatStrip.tsx
git commit -m "feat(receipts): replace This Month tile with Matched to Transactions"
```

---

### Task 9: FilterBar — Source filter + extended Status filter

**Files:**
- Modify: `apps/web/src/app/receipts/FilterBar.tsx`

**Interfaces:**
- Consumes: `ReceiptFilters.source`, extended `ReceiptStatus` (Task 7).

- [ ] **Step 1: Add the Source filter and the Matched status option**

Replace the full contents of `apps/web/src/app/receipts/FilterBar.tsx`:

```typescript
'use client';

import type { ReceiptFilters, ReceiptStatus, ReceiptSource } from '@/lib/receipts/derive';
import { DEFAULT_FILTERS } from '@/lib/receipts/derive';

interface Props {
  filters: ReceiptFilters;
  onChange: (next: ReceiptFilters) => void;
  merchants: string[];
}

const inputStyle: React.CSSProperties = {
  background: 'var(--color-elevated)',
  border: '1px solid var(--color-border)',
  color: 'var(--color-text-primary)',
};

export default function FilterBar({ filters, onChange, merchants }: Props) {
  function set<K extends keyof ReceiptFilters>(key: K, value: ReceiptFilters[K]) {
    onChange({ ...filters, [key]: value });
  }

  const isDefault =
    !filters.search && !filters.merchant && !filters.dateFrom && !filters.dateTo &&
    filters.status === 'all' && !filters.source;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <input
        type="text"
        placeholder="Search receipts, merchants…"
        value={filters.search}
        onChange={(e) => set('search', e.target.value)}
        className="flex-1 min-w-[180px] px-3 py-2 text-sm rounded-xl outline-none"
        style={inputStyle}
      />
      <select value={filters.source} onChange={(e) => set('source', e.target.value as '' | ReceiptSource)}
        className="px-3 py-2 text-sm rounded-xl outline-none" style={inputStyle}>
        <option value="">All Sources</option>
        <option value="gmail">Gmail</option>
        <option value="manual">Manual Upload</option>
      </select>
      <select value={filters.merchant} onChange={(e) => set('merchant', e.target.value)}
        className="px-3 py-2 text-sm rounded-xl outline-none" style={inputStyle}>
        <option value="">All Merchants</option>
        {merchants.map((m) => <option key={m} value={m}>{m}</option>)}
      </select>
      <input type="date" value={filters.dateFrom} onChange={(e) => set('dateFrom', e.target.value)}
        className="px-3 py-2 text-sm rounded-xl outline-none" style={inputStyle} />
      <span style={{ color: 'var(--color-text-muted)' }}>→</span>
      <input type="date" value={filters.dateTo} onChange={(e) => set('dateTo', e.target.value)}
        className="px-3 py-2 text-sm rounded-xl outline-none" style={inputStyle} />
      <select value={filters.status} onChange={(e) => set('status', e.target.value as ReceiptStatus)}
        className="px-3 py-2 text-sm rounded-xl outline-none" style={inputStyle}>
        <option value="all">All Statuses</option>
        <option value="imported">Imported</option>
        <option value="matched">Matched</option>
        <option value="pending">Pending Review</option>
      </select>
      {!isDefault && (
        <button
          onClick={() => onChange(DEFAULT_FILTERS)}
          className="px-3 py-2 text-sm font-medium rounded-xl transition-colors"
          style={{ color: 'var(--color-text-secondary)', border: '1px solid var(--color-border)' }}>
          Clear filters
        </button>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify it compiles**

Run: `cd apps/web && npx tsc --noEmit -p tsconfig.json && cd ../..`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/receipts/FilterBar.tsx
git commit -m "feat(receipts): add Source filter and Matched status option"
```

---

### Task 10: ReceiptRow — source icon, category, three-state status pill

**Files:**
- Modify: `apps/web/src/app/receipts/ReceiptRow.tsx`

**Interfaces:**
- Consumes: `Receipt.source`, `Receipt.matchedTransaction`, `statusLabel()` (Task 7).

- [ ] **Step 1: Rewrite the row**

Replace the full contents of `apps/web/src/app/receipts/ReceiptRow.tsx`:

```typescript
'use client';

import { money, statusLabel, type Receipt } from '@/lib/receipts/derive';

interface Props {
  receipt: Receipt;
  onClick: () => void;
}

function SourceIcon({ source }: { source: Receipt['source'] }) {
  const d = source === 'manual'
    ? 'M12 16V4 M7 9l5-5 5 5 M4 20h16' // upload arrow
    : 'M4 6h16v12H4z M4 6l8 7 8-7';    // envelope
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={d} />
    </svg>
  );
}

const STATUS_COLOR: Record<ReturnType<typeof statusLabel>, string> = {
  Imported: 'var(--color-green)',
  Matched: 'var(--color-sky)',
  Pending: 'var(--color-amber)',
};

export default function ReceiptRow({ receipt: r, onClick }: Props) {
  const label = statusLabel(r);
  const categoryText = r.matchedTransaction?.category?.name ?? 'Uncategorized';

  return (
    <button onClick={onClick}
      className="w-full text-left rounded-2xl p-4 transition-colors hover:brightness-110 flex items-center justify-between gap-3"
      style={{ background: 'var(--color-surface)', backdropFilter: 'var(--glass-blur)', border: 'var(--glass-border)' }}>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span style={{ color: 'var(--color-text-muted)' }}><SourceIcon source={r.source} /></span>
          <p className="font-semibold text-sm truncate" style={{ color: 'var(--color-text-primary)' }}>{r.merchant}</p>
        </div>
        <p className="text-xs mt-0.5 truncate" style={{ color: 'var(--color-text-muted)' }}>
          {r.orderDate ?? '—'}{r.orderNumber ? ` · Order ${r.orderNumber}` : ''} · {categoryText}
        </p>
      </div>
      <span className="text-xs px-2 py-1 rounded-full shrink-0 hidden sm:inline-block"
        style={{ background: 'color-mix(in srgb, var(--color-violet) 12%, transparent)', color: 'var(--color-violet)' }}>
        {r.items.length} item{r.items.length === 1 ? '' : 's'}
      </span>
      <div className="text-right shrink-0">
        <p className="font-bold text-sm" style={{ color: 'var(--color-text-primary)' }}>{money(r.total)}</p>
        <span className="text-xs px-2 py-0.5 rounded-full"
          style={{ background: `color-mix(in srgb, ${STATUS_COLOR[label]} 12%, transparent)`, color: STATUS_COLOR[label] }}>
          {label === 'Pending' ? 'Pending Review' : label}
        </span>
      </div>
    </button>
  );
}
```

- [ ] **Step 2: Verify it compiles**

Run: `cd apps/web && npx tsc --noEmit -p tsconfig.json && cd ../..`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/receipts/ReceiptRow.tsx
git commit -m "feat(receipts): add source icon, category, and three-state status pill to row list"
```

---

### Task 11: ReceiptDetailPanel — image preview + match-to-transaction

**Files:**
- Create: `apps/web/src/app/receipts/MatchTransactionSection.tsx`
- Modify: `apps/web/src/app/receipts/ReceiptDetailPanel.tsx`

**Interfaces:**
- Consumes: `GET /receipts/:id/transaction-candidates` (Task 3), `PATCH /transactions/:id/receipt` (existing), `GET /receipts/:id/image` (Task 6), `Receipt.matchedTransaction`/`imageMimeType` (Task 7).
- Produces: `MatchTransactionSection` component — `onChanged: () => void` prop, called after a successful match/unmatch so the parent page re-fetches.

- [ ] **Step 1: Create `MatchTransactionSection.tsx`**

```typescript
'use client';

import { useState, useEffect, useCallback } from 'react';
import { money, type Receipt } from '@/lib/receipts/derive';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3333/api';

interface TransactionCandidate {
  id: string;
  name: string;
  date: string;
  amount: number;
  amountDelta: number;
  linked: boolean;
}

interface Props {
  receipt: Receipt;
  onChanged: () => void;
}

export default function MatchTransactionSection({ receipt, onChanged }: Props) {
  const [candidates, setCandidates] = useState<TransactionCandidate[]>([]);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const search = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API}/receipts/${receipt.id}/transaction-candidates`, { credentials: 'include' });
      const data = await res.json();
      setCandidates(Array.isArray(data) ? data : []);
    } finally {
      setLoading(false);
    }
  }, [receipt.id]);

  useEffect(() => {
    if (expanded) search();
  }, [expanded, search]);

  async function link(txId: string | null) {
    const targetTxId = txId ?? receipt.matchedTransaction?.id;
    if (!targetTxId) return;
    setBusyId(txId ?? 'unlink');
    try {
      const res = await fetch(`${API}/transactions/${targetTxId}/receipt`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ receiptId: txId ? receipt.id : null }),
      });
      if (res.ok) onChanged();
    } finally {
      setBusyId(null);
    }
  }

  if (receipt.matchedTransaction) {
    const tx = receipt.matchedTransaction;
    return (
      <div className="rounded-xl p-3 mb-4"
        style={{ background: 'color-mix(in srgb, var(--color-sky) 8%, transparent)', border: '1px solid color-mix(in srgb, var(--color-sky) 20%, transparent)' }}>
        <p className="text-xs mb-1" style={{ color: 'var(--color-text-muted)' }}>Matched to transaction</p>
        <p className="text-sm font-medium" style={{ color: 'var(--color-text-primary)' }}>{tx.name} — {money(tx.amount)} on {tx.date}</p>
        <button onClick={() => link(null)} disabled={busyId === 'unlink'}
          className="mt-2 text-xs font-medium underline disabled:opacity-50"
          style={{ color: 'var(--color-card-orange)' }}>
          {busyId === 'unlink' ? 'Unmatching…' : 'Unmatch'}
        </button>
      </div>
    );
  }

  return (
    <div className="rounded-xl p-3 mb-4" style={{ background: 'var(--color-elevated)', border: '1px solid var(--color-border)' }}>
      <button onClick={() => setExpanded((v) => !v)} className="text-xs font-medium" style={{ color: 'var(--color-sky)' }}>
        {expanded ? 'Hide' : 'Match to Transaction'}
      </button>
      {expanded && (
        <div className="mt-2 space-y-1.5">
          {loading && <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>Searching…</p>}
          {!loading && candidates.length === 0 && (
            <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>No nearby transactions found.</p>
          )}
          {candidates.map((c) => (
            <div key={c.id} className="flex items-center justify-between gap-2 text-xs rounded-lg px-2 py-1.5"
              style={{ background: 'var(--color-surface)' }}>
              <span className="truncate" style={{ color: 'var(--color-text-primary)' }}>{c.name} · {money(c.amount)} · {c.date}</span>
              <button onClick={() => link(c.id)} disabled={busyId === c.id}
                className="shrink-0 px-2 py-1 rounded-md font-medium disabled:opacity-50"
                style={{ background: 'color-mix(in srgb, var(--color-sky) 15%, transparent)', color: 'var(--color-sky)' }}>
                {busyId === c.id ? 'Matching…' : 'Match'}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Add image preview + embed `MatchTransactionSection` in `ReceiptDetailPanel`**

In `apps/web/src/app/receipts/ReceiptDetailPanel.tsx`, add the import:

```typescript
import MatchTransactionSection from './MatchTransactionSection';
```

Add an `onReceiptChanged: () => void` prop to `Props` and the destructured parameters:

```typescript
interface Props {
  receipt: Receipt;
  categories: Category[];
  itemCategories: Record<number, string>;
  onSetCategory: (idx: number, categoryId: string) => void;
  onImport: () => void;
  importing: boolean;
  onClose: () => void;
  onReceiptChanged: () => void;
}

export default function ReceiptDetailPanel({
  receipt, categories, itemCategories, onSetCategory, onImport, importing, onClose, onReceiptChanged,
}: Props) {
```

Replace the static "Imported via Gmail" badge:

```typescript
      <span className="inline-flex items-center gap-1.5 text-[11px] font-medium mb-4 px-2 py-1 rounded-full self-start"
        style={{ background: 'color-mix(in srgb, var(--color-sky) 12%, transparent)', color: 'var(--color-sky)' }}>
        Imported via Gmail
      </span>
```

with:

```typescript
      <span className="inline-flex items-center gap-1.5 text-[11px] font-medium mb-4 px-2 py-1 rounded-full self-start"
        style={{ background: 'color-mix(in srgb, var(--color-sky) 12%, transparent)', color: 'var(--color-sky)' }}>
        {receipt.source === 'manual' ? 'Manually uploaded' : 'Imported via Gmail'}
      </span>

      {receipt.imageMimeType && (
        receipt.imageMimeType === 'application/pdf' ? (
          <a href={`${process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3333/api'}/receipts/${receipt.id}/image`}
            target="_blank" rel="noreferrer"
            className="mb-4 inline-block text-xs font-medium underline" style={{ color: 'var(--color-sky)' }}>
            View attached PDF
          </a>
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={`${process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3333/api'}/receipts/${receipt.id}/image`}
            alt={`${receipt.merchant} receipt`} className="mb-4 rounded-xl w-full object-cover"
            style={{ maxHeight: 220, border: '1px solid var(--color-border)' }} />
        )
      )}

      <MatchTransactionSection receipt={receipt} onChanged={onReceiptChanged} />
```

- [ ] **Step 3: Verify it compiles**

Run: `cd apps/web && npx tsc --noEmit -p tsconfig.json && cd ../..`
Expected: an error at the `page.tsx` call site (missing new `onReceiptChanged` prop) — expected, fixed in Task 12.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/receipts/MatchTransactionSection.tsx apps/web/src/app/receipts/ReceiptDetailPanel.tsx
git commit -m "feat(receipts): add image preview and match-to-transaction UI to detail panel"
```

---

### Task 12: Upload Receipt modal + page wiring

**Files:**
- Create: `apps/web/src/app/receipts/UploadReceiptModal.tsx`
- Modify: `apps/web/src/app/receipts/page.tsx`

**Interfaces:**
- Consumes: `POST /receipts/manual` (Task 5), `ReceiptDetailPanel`'s new `onReceiptChanged` prop (Task 11).

- [ ] **Step 1: Create `UploadReceiptModal.tsx`**

```typescript
'use client';

import { useState, useRef } from 'react';
import { createPortal } from 'react-dom';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3333/api';

interface Props {
  onCreated: () => void;
  onClose: () => void;
}

export default function UploadReceiptModal({ onCreated, onClose }: Props) {
  const [merchant, setMerchant] = useState('');
  const [total, setTotal] = useState('');
  const [orderDate, setOrderDate] = useState('');
  const [orderNumber, setOrderNumber] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function submit() {
    setError(null);
    if (!merchant.trim()) { setError('Merchant is required.'); return; }
    const totalNum = Number(total);
    if (!Number.isFinite(totalNum) || totalNum <= 0) { setError('Enter a valid total.'); return; }

    setSubmitting(true);
    try {
      const form = new FormData();
      form.set('merchant', merchant.trim());
      form.set('total', total);
      if (orderDate) form.set('orderDate', orderDate);
      if (orderNumber) form.set('orderNumber', orderNumber);
      if (file) form.set('image', file);

      const res = await fetch(`${API}/receipts/manual`, { method: 'POST', credentials: 'include', body: form });
      if (!res.ok) { setError('Could not save the receipt.'); return; }
      onCreated();
    } finally {
      setSubmitting(false);
    }
  }

  const inputStyle: React.CSSProperties = {
    background: 'var(--color-elevated)', border: '1px solid var(--color-border)', color: 'var(--color-text-primary)',
  };

  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.5)' }}>
      <div className="w-full max-w-md rounded-2xl p-6"
        style={{ background: 'var(--color-surface)', border: 'var(--glass-border)' }}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-bold text-lg" style={{ color: 'var(--color-text-primary)' }}>Upload Receipt</h2>
          <button onClick={onClose} className="w-8 h-8 rounded-lg" style={{ color: 'var(--color-text-muted)' }}>✕</button>
        </div>

        <div className="space-y-3">
          <input placeholder="Merchant" value={merchant} onChange={(e) => setMerchant(e.target.value)}
            className="w-full px-3 py-2 text-sm rounded-xl outline-none" style={inputStyle} />
          <input placeholder="Total" type="number" step="0.01" value={total} onChange={(e) => setTotal(e.target.value)}
            className="w-full px-3 py-2 text-sm rounded-xl outline-none" style={inputStyle} />
          <input type="date" value={orderDate} onChange={(e) => setOrderDate(e.target.value)}
            className="w-full px-3 py-2 text-sm rounded-xl outline-none" style={inputStyle} />
          <input placeholder="Order number (optional)" value={orderNumber} onChange={(e) => setOrderNumber(e.target.value)}
            className="w-full px-3 py-2 text-sm rounded-xl outline-none" style={inputStyle} />

          <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/heic,application/pdf"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="hidden" />
          <button onClick={() => fileRef.current?.click()}
            className="w-full px-3 py-2 text-sm rounded-xl text-left"
            style={inputStyle}>
            {file ? file.name : 'Attach photo or PDF (optional)'}
          </button>

          {error && <p className="text-xs" style={{ color: 'var(--color-card-orange)' }}>{error}</p>}

          <button onClick={submit} disabled={submitting}
            className="w-full py-3 rounded-xl font-semibold text-sm transition-opacity hover:opacity-80 disabled:opacity-50"
            style={{ background: 'linear-gradient(180deg, var(--color-card-violet), var(--color-primary))', color: '#fff' }}>
            {submitting ? 'Saving…' : 'Save Receipt'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
```

- [ ] **Step 2: Wire the modal and the new `onReceiptChanged` prop into `page.tsx`**

In `apps/web/src/app/receipts/page.tsx`, add the import:

```typescript
import UploadReceiptModal from './UploadReceiptModal';
```

Add state, alongside the existing `useState` calls:

```typescript
  const [showUpload, setShowUpload] = useState(false);
```

Add a `refetchReceipts` function (extracted from the existing `useEffect`'s receipts fetch, so both the initial load and post-match/post-upload refresh share the same logic) and use it in both places. Replace the `useEffect`:

```typescript
  useEffect(() => {
    fetch(`${API}/gmail/status`, { credentials: 'include' })
      .then((r) => r.json())
      .then((d) => setGmailConnected(d.connected))
      .catch(() => setGmailConnected(false));

    fetch(`${API}/categories`, { credentials: 'include' })
      .then((r) => r.json())
      .then(setCategories)
      .catch(() => {});

    fetch(`${API}/receipts`, { credentials: 'include' })
      .then((r) => r.json())
      .then((d) => { setReceipts(d.receipts); setSyncError(d.syncError); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);
```

with:

```typescript
  function refetchReceipts() {
    return fetch(`${API}/receipts`, { credentials: 'include' })
      .then((r) => r.json())
      .then((d) => { setReceipts(d.receipts); setSyncError(d.syncError); });
  }

  useEffect(() => {
    fetch(`${API}/gmail/status`, { credentials: 'include' })
      .then((r) => r.json())
      .then((d) => setGmailConnected(d.connected))
      .catch(() => setGmailConnected(false));

    fetch(`${API}/categories`, { credentials: 'include' })
      .then((r) => r.json())
      .then(setCategories)
      .catch(() => {});

    refetchReceipts()
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);
```

Add the "Upload Receipt" button in the header, replacing:

```typescript
          <div className="mb-6">
            <h1 className="text-2xl font-bold tracking-tight" style={{ color: 'var(--color-text-primary)' }}>Receipts</h1>
            <p className="text-sm mt-1" style={{ color: 'var(--color-text-secondary)' }}>
              Browse merchant receipts from your Gmail and create transactions.
            </p>
          </div>
```

with:

```typescript
          <div className="mb-6 flex items-start justify-between gap-3 flex-wrap">
            <div>
              <h1 className="text-2xl font-bold tracking-tight" style={{ color: 'var(--color-text-primary)' }}>Receipts</h1>
              <p className="text-sm mt-1" style={{ color: 'var(--color-text-secondary)' }}>
                Browse merchant receipts from your Gmail and create transactions.
              </p>
            </div>
            <button onClick={() => setShowUpload(true)}
              className="px-4 py-2 rounded-xl text-sm font-medium"
              style={{ background: 'color-mix(in srgb, var(--color-card-violet) 15%, transparent)', color: 'var(--color-card-violet)', border: '1px solid color-mix(in srgb, var(--color-card-violet) 25%, transparent)' }}>
              Upload Receipt
            </button>
          </div>

          {showUpload && (
            <UploadReceiptModal
              onClose={() => setShowUpload(false)}
              onCreated={() => { setShowUpload(false); refetchReceipts(); }}
            />
          )}
```

Pass `onReceiptChanged` to both `ReceiptDetailPanel` usages (desktop rail and mobile overlay) — add the prop to both:

```typescript
            onReceiptChanged={refetchReceipts}
```

- [ ] **Step 3: Verify it compiles**

Run: `cd apps/web && npx tsc --noEmit -p tsconfig.json && cd ../..`
Expected: no errors.

- [ ] **Step 4: End-to-end manual verification**

With both dev servers running:
- Load `/receipts`, confirm the page loads with no console errors.
- Click "Upload Receipt", fill in a merchant/total, attach a photo, submit — confirm it appears in the row list with the upload-arrow source icon and "Pending Review" status.
- Open it, confirm the photo renders in the detail panel.
- Click "Match to Transaction", confirm nearby transactions list (or "No nearby transactions found"), match one, confirm the row list updates to show "Matched" status and the transaction's category.
- Unmatch, confirm it reverts to "Pending Review" and "Uncategorized".
- Use the Source and Status filters, confirm they narrow the list correctly.
- Resize to ~360px and ~768px, confirm the row list, filter bar, upload modal, and match section all remain usable (no horizontal scroll, no clipped content).
- Confirm no hardcoded colors were introduced (all styling uses `var(--color-*)`).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/receipts/UploadReceiptModal.tsx apps/web/src/app/receipts/page.tsx
git commit -m "feat(receipts): add Upload Receipt modal and wire match/upload refresh"
```

---

## Self-Review Notes

- **Spec coverage:** Data model (Task 1) ✓, match-to-transaction status + candidates + link/unlink (Tasks 2–4, 11) ✓, manual upload (Tasks 5, 12) ✓, image storage/serving (Tasks 1, 6, 11) ✓, row-list Source/Category/Match-Status columns (Task 10) ✓, Source filter (Task 9) ✓, stat strip swap (Task 8) ✓, responsiveness (checked in Task 12's verification) ✓, no-AI-parsing decision honored (Task 5 has no Anthropic call) ✓, Amazon source explicitly out of scope (no task touches it) ✓.
- **Type consistency:** `ReceiptListItem`/`MatchedTransaction` (Task 4, backend) match `Receipt`/`MatchedTransaction` (Task 7, frontend) field-for-field. `TransactionCandidate` (Task 2) matches the shape consumed in `MatchTransactionSection.tsx` (Task 11). `statusLabel()` (Task 7) is the single source of truth for status text, used identically in `filterReceipts` and `ReceiptRow`.
- **Placeholder scan:** none found — every step has literal code, no "add error handling" or "similar to Task N" placeholders.
