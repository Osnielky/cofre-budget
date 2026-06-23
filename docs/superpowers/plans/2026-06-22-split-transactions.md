# Split Transactions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow any transaction to be split into multiple pieces (each with its own category + partial amount), replacing the original row in the list with its split children — YNAB-style.

**Architecture:** Add `parentId` (self-referential FK, CASCADE) and `isSplitParent` boolean to the Transaction entity. Splitting creates child rows that are real transactions; the parent is hidden from all list queries via `WHERE isSplitParent = false`. Two new API endpoints (`POST /:id/split`, `DELETE /:id/unsplit`) plus a new `SplitTransactionModal` component on the frontend.

**Tech Stack:** NestJS 11, TypeORM (synchronize: true — no manual migrations needed), Next.js 16 / React 19, Tailwind v4, glassmorphism design system.

## Global Constraints

- `synchronize: true` is set in `apps/api/src/config/database.config.ts` — adding columns to the entity auto-migrates the DB on next API start. No migration files needed.
- No test runner is configured (`CLAUDE.md`: "No test runner is configured yet"). Use `curl` for API verification and browser observation for frontend verification.
- All new UI must use the glassmorphism design tokens: `var(--color-surface)`, `var(--color-elevated)`, `var(--glass-border)`, `var(--glass-shadow)`, `var(--glass-blur)`, `var(--popover-bg)`. Never use a solid background color on surfaces.
- Accent colors: `--color-primary` (#9B6DFF), `--color-green`, `--color-orange`, `--color-rose`, `--color-amber`.
- `NEXT_PUBLIC_API_URL` defaults to `http://localhost:3333/api`. Always use `const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3333/api'`.
- All API requests from the frontend must include `credentials: 'include'`.

---

## File Map

| File | Change |
|------|--------|
| `apps/api/src/transactions/transaction.entity.ts` | Add `parentId` (uuid, nullable) + `isSplitParent` (boolean, default false) |
| `apps/api/src/transactions/transactions.service.ts` | Filter `isSplitParent = false` in `findByUser`; add `split()` and `unsplit()` methods |
| `apps/api/src/transactions/transactions.controller.ts` | Add `POST /:id/split` and `DELETE /:id/unsplit` routes |
| `apps/web/src/components/SplitTransactionModal.tsx` | **New file** — modal UI: split lines, category pickers, amount inputs, remaining indicator |
| `apps/web/src/app/transactions/page.tsx` | Add `parentId`/`isSplitParent` to interface; split/unsplit hover buttons; split badge; wire modal |

---

## Task 1: Add parentId + isSplitParent to Transaction entity and filter findByUser

**Files:**
- Modify: `apps/api/src/transactions/transaction.entity.ts`
- Modify: `apps/api/src/transactions/transactions.service.ts` (lines 83–96, the `findByUser` query builder)

**Interfaces:**
- Produces: `Transaction.parentId: string | null`, `Transaction.isSplitParent: boolean` (used by Tasks 2, 4, 5, 6)

- [ ] **Step 1: Add the two columns to the entity**

Open `apps/api/src/transactions/transaction.entity.ts`. After the `updatedAt` field (line 95), add:

```typescript
  @Column({ type: 'uuid', nullable: true, default: null })
  parentId: string | null;

  @Column({ default: false })
  isSplitParent: boolean;
```

The complete end of the file becomes:

```typescript
  @Column({ type: 'date' })
  date: string;

  @Column({ default: false })
  pending: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @Column({ type: 'uuid', nullable: true, default: null })
  parentId: string | null;

  @Column({ default: false })
  isSplitParent: boolean;
}
```

- [ ] **Step 2: Filter split parents out of findByUser**

In `apps/api/src/transactions/transactions.service.ts`, inside `findByUser` (around line 84), the query builder already has `.where('tx.userId = :userId', { userId })`. Add one more `andWhere` just before the `.orderBy` calls:

```typescript
  findByUser(
    userId: string,
    bankAccountId?: string,
    from?: string,
    to?: string,
    limit = 500,
  ): Promise<Transaction[]> {
    const qb = this.repo.createQueryBuilder('tx')
      .leftJoinAndSelect('tx.categoryRef', 'categoryRef')
      .leftJoinAndSelect('tx.bankAccount', 'bankAccount')
      .leftJoinAndSelect('tx.transferAccount', 'transferAccount')
      .where('tx.userId = :userId', { userId })
      .andWhere('tx.isSplitParent = false')   // <-- add this line
      .orderBy('tx.date', 'DESC')
      .addOrderBy('tx.createdAt', 'DESC')
      .limit(limit);

    if (bankAccountId) qb.andWhere('tx.bankAccountId = :bankAccountId', { bankAccountId });
    if (from) qb.andWhere('tx.date >= :from', { from });
    if (to)   qb.andWhere('tx.date <= :to', { to });
    return qb.getMany();
  }
```

- [ ] **Step 3: Restart the API and verify the columns were created**

```bash
npm run dev:api
```

Expected in output: TypeORM synchronize runs without errors. Then:

```bash
psql -U postgres cofre_budget -c "\d transactions" | grep -E "parent|split"
```

Expected output (two rows):
```
 parentId      | uuid                        |           |          |
 isSplitParent | boolean                     |           |          | false
```

- [ ] **Step 4: Verify findByUser still returns normal transactions**

```bash
curl -s -b "access_token=<your_token>" http://localhost:3333/api/transactions | jq 'length'
```

Expected: same count as before (no change yet since all `isSplitParent = false` by default).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/transactions/transaction.entity.ts \
        apps/api/src/transactions/transactions.service.ts
git commit -m "feat(api): add parentId + isSplitParent columns to Transaction; filter split parents from list"
```

---

## Task 2: Add split() and unsplit() service methods

**Files:**
- Modify: `apps/api/src/transactions/transactions.service.ts`

**Interfaces:**
- Consumes: `Transaction.parentId`, `Transaction.isSplitParent` (from Task 1)
- Produces:
  - `split(id: string, userId: string, splits: { categoryId: string | null; amount: number }[]): Promise<Transaction[]>`
  - `unsplit(id: string, userId: string): Promise<Transaction>`

- [ ] **Step 1: Add split() method to TransactionsService**

At the end of `transactions.service.ts` (before the closing `}` of the class, before the `normalizeDate` helper function), add:

```typescript
  async split(
    id: string,
    userId: string,
    splits: { categoryId: string | null; amount: number }[],
  ): Promise<Transaction[]> {
    const tx = await this.repo.findOneByOrFail({ id, userId });
    if (tx.isSplitParent) throw new BadRequestException('Transaction is already split');
    if (tx.parentId) throw new BadRequestException('Cannot split a split piece — unsplit the parent first');
    if (splits.length < 2) throw new BadRequestException('At least 2 split pieces required');

    const txTotal = Math.abs(Number(tx.amount));
    const splitTotal = splits.reduce((s, p) => s + Math.abs(p.amount), 0);
    if (Math.abs(splitTotal - txTotal) > 0.01) {
      throw new BadRequestException(
        `Split amounts (${splitTotal.toFixed(2)}) must sum to the transaction total (${txTotal.toFixed(2)})`,
      );
    }

    // sign of parent determines sign of children (+income, -expense)
    const sign = Number(tx.amount) >= 0 ? 1 : -1;

    tx.isSplitParent = true;
    tx.categoryId = null;
    await this.repo.save(tx);

    const children: Transaction[] = [];
    for (const piece of splits) {
      const child = await this.repo.save(
        this.repo.create({
          userId: tx.userId,
          parentId: tx.id,
          bankAccountId: tx.bankAccountId ?? undefined,
          source: tx.source,
          name: tx.name,
          date: tx.date,
          amount: sign * Math.abs(piece.amount),
          categoryId: piece.categoryId ?? undefined,
          pending: tx.pending,
          isSplitParent: false,
        }),
      );
      const loaded = await this.repo.findOne({
        where: { id: child.id },
        relations: ['categoryRef', 'bankAccount'],
      });
      children.push(loaded);
    }
    return children;
  }

  async unsplit(id: string, userId: string): Promise<Transaction> {
    let tx = await this.repo.findOneBy({ id, userId });
    if (!tx) throw new NotFoundException();

    // Accept either a child id or the parent id
    if (tx.parentId) {
      tx = await this.repo.findOneBy({ id: tx.parentId, userId });
      if (!tx) throw new NotFoundException();
    }

    if (!tx.isSplitParent) throw new BadRequestException('Transaction is not split');

    await this.repo.delete({ parentId: tx.id, userId });

    tx.isSplitParent = false;
    tx.categoryId = null;
    const saved = await this.repo.save(tx);
    return this.repo.findOne({
      where: { id: saved.id },
      relations: ['categoryRef', 'bankAccount'],
    });
  }
```

- [ ] **Step 2: Ensure BadRequestException and NotFoundException are imported**

The top of `transactions.service.ts` already has:
```typescript
import { Injectable, ForbiddenException, NotFoundException, BadRequestException } from '@nestjs/common';
```

Verify both `NotFoundException` and `BadRequestException` are present. If `NotFoundException` is missing, add it.

- [ ] **Step 3: Restart API and verify it compiles without errors**

```bash
npm run dev:api
```

Expected: `[NestApplication] Nest application successfully started` with no TypeScript errors.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/transactions/transactions.service.ts
git commit -m "feat(api): add split() and unsplit() methods to TransactionsService"
```

---

## Task 3: Add split/unsplit controller routes

**Files:**
- Modify: `apps/api/src/transactions/transactions.controller.ts`

**Interfaces:**
- Consumes: `TransactionsService.split()`, `TransactionsService.unsplit()` (from Task 2)
- Produces: `POST /api/transactions/:id/split`, `DELETE /api/transactions/:id/unsplit`

- [ ] **Step 1: Add the two routes**

In `apps/api/src/transactions/transactions.controller.ts`, add the following two methods **before** the existing `@Delete(':id')` route (so NestJS resolves `/:id/unsplit` before `/:id`):

```typescript
  @Post(':id/split')
  split(
    @Param('id') id: string,
    @Request() req: any,
    @Body() body: { splits: { categoryId: string | null; amount: number }[] },
  ) {
    return this.service.split(id, req.user.id, body.splits);
  }

  @Delete(':id/unsplit')
  unsplit(@Param('id') id: string, @Request() req: any) {
    return this.service.unsplit(id, req.user.id);
  }
```

The full file should now look like:

```typescript
import { Controller, Get, Post, Patch, Delete, Param, Body, Query, UseGuards, Request } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { TransactionsService, CsvRow } from './transactions.service';

@UseGuards(JwtAuthGuard)
@Controller('transactions')
export class TransactionsController {
  constructor(private service: TransactionsService) {}

  @Get('category-hints')
  getCategoryHints(@Request() req: any) {
    return this.service.getCategoryHints(req.user.id);
  }

  @Get('project-hints')
  getProjectHints(@Request() req: any) {
    return this.service.getProjectHints(req.user.id);
  }

  @Get('matches')
  findTransferMatches(
    @Request() req: any,
    @Query('amount') amount: string,
    @Query('date') date: string,
    @Query('excludeAccountId') excludeAccountId: string,
  ) {
    return this.service.findTransferMatches(req.user.id, parseFloat(amount), date, excludeAccountId);
  }

  @Get()
  list(
    @Request() req: any,
    @Query('accountId') accountId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('limit') limit?: string,
  ) {
    return this.service.findByUser(req.user.id, accountId, from, to, limit ? parseInt(limit) : 500);
  }

  @Post()
  create(@Request() req: any, @Body() body: { name: string; amount: number; date: string; bankAccountId?: string | null; categoryId?: string | null; debtId?: string | null }) {
    return this.service.createManual(req.user.id, body);
  }

  @Post('check-duplicates')
  checkDuplicates(
    @Request() req: any,
    @Body() body: { bankAccountId: string; rows: CsvRow[] },
  ) {
    return this.service.checkDuplicates(req.user.id, body.bankAccountId, body.rows);
  }

  @Post('import')
  importCsv(
    @Request() req: any,
    @Body() body: { bankAccountId: string; rows: CsvRow[]; finalBalance?: number },
  ) {
    return this.service.importCsv(req.user.id, body.bankAccountId, body.rows, body.finalBalance);
  }

  @Post(':id/split')
  split(
    @Param('id') id: string,
    @Request() req: any,
    @Body() body: { splits: { categoryId: string | null; amount: number }[] },
  ) {
    return this.service.split(id, req.user.id, body.splits);
  }

  @Patch(':id')
  updateManual(
    @Param('id') id: string,
    @Request() req: any,
    @Body() body: { name?: string; amount?: number; date?: string; bankAccountId?: string | null },
  ) {
    return this.service.updateManual(id, req.user.id, body);
  }

  @Delete(':id/unsplit')
  unsplit(@Param('id') id: string, @Request() req: any) {
    return this.service.unsplit(id, req.user.id);
  }

  @Delete(':id')
  deleteManual(@Param('id') id: string, @Request() req: any) {
    return this.service.deleteManual(id, req.user.id);
  }

  @Patch(':id/category')
  updateCategory(
    @Param('id') id: string,
    @Request() req: any,
    @Body('categoryId') categoryId: string | null,
  ) {
    return this.service.updateCategory(id, req.user.id, categoryId);
  }

  @Patch(':id/transfer-account')
  updateTransferAccount(
    @Param('id') id: string,
    @Request() req: any,
    @Body('transferAccountId') transferAccountId: string | null,
    @Body('matchTxId') matchTxId?: string | null,
  ) {
    return this.service.updateTransferAccount(id, req.user.id, transferAccountId, matchTxId);
  }
}
```

- [ ] **Step 2: Restart API and verify routes are registered**

```bash
npm run dev:api
```

Expected: no errors. Then pick any transaction id from the list and test the split endpoint:

```bash
# Replace <TOKEN> with your access_token cookie value, <TX_ID> with a real transaction id,
# and the amounts with two values that sum to that transaction's absolute amount.
curl -s -X POST http://localhost:3333/api/transactions/<TX_ID>/split \
  -H "Content-Type: application/json" \
  -H "Cookie: access_token=<TOKEN>" \
  -d '{"splits":[{"categoryId":null,"amount":10},{"categoryId":null,"amount":5}]}'
```

For a -$15 expense transaction, expected response: JSON array of 2 transaction objects, both with `parentId` set, amounts `-10` and `-5`.

```bash
# Now verify the parent is hidden from the list
curl -s -H "Cookie: access_token=<TOKEN>" \
  "http://localhost:3333/api/transactions?from=2024-01-01&to=2026-12-31" | jq '[.[] | select(.isSplitParent == true)] | length'
```

Expected: `0` (parents are never returned).

```bash
# Test unsplit using the child id
curl -s -X DELETE http://localhost:3333/api/transactions/<CHILD_ID>/unsplit \
  -H "Cookie: access_token=<TOKEN>"
```

Expected: the restored parent transaction object with `isSplitParent: false`.

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/transactions/transactions.controller.ts
git commit -m "feat(api): add POST /:id/split and DELETE /:id/unsplit routes"
```

---

## Task 4: Create SplitTransactionModal component

**Files:**
- Create: `apps/web/src/components/SplitTransactionModal.tsx`

**Interfaces:**
- Consumes: `Transaction` (with `parentId`, `isSplitParent`), `Category` — both defined in page.tsx; re-defined locally here for isolation
- Produces: `default export SplitTransactionModal({ tx, categories, onSave, onClose })` where `onSave` receives the created children array

- [ ] **Step 1: Create the file**

Create `apps/web/src/components/SplitTransactionModal.tsx` with the following complete content:

```tsx
'use client';

import { useState } from 'react';
import { createPortal } from 'react-dom';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3333/api';

interface Category { id: string; name: string; icon: string; color: string; type: string }
interface Transaction {
  id: string; name: string; amount: number; date: string;
  categoryId: string | null; bankAccountId: string;
  parentId: string | null; isSplitParent: boolean;
}

interface SplitLine { categoryId: string; amount: string }

interface Props {
  tx: Transaction;
  categories: Category[];
  onSave: (children: Transaction[]) => void;
  onClose: () => void;
}

export default function SplitTransactionModal({ tx, categories, onSave, onClose }: Props) {
  const absTotal = Math.abs(Number(tx.amount));
  const isExpense = Number(tx.amount) < 0;

  const [lines, setLines] = useState<SplitLine[]>([
    { categoryId: tx.categoryId ?? '', amount: absTotal.toFixed(2) },
    { categoryId: '', amount: '' },
  ]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [openPickerIdx, setOpenPickerIdx] = useState<number | null>(null);

  const allocated = lines.reduce((s, l) => s + (parseFloat(l.amount) || 0), 0);
  const remaining = absTotal - allocated;
  const balanced = Math.abs(remaining) < 0.01;

  function updateLine(idx: number, patch: Partial<SplitLine>) {
    setLines((prev) => prev.map((l, i) => (i === idx ? { ...l, ...patch } : l)));
  }

  function addLine() {
    const rem = absTotal - lines.reduce((s, l) => s + (parseFloat(l.amount) || 0), 0);
    setLines((prev) => [...prev, { categoryId: '', amount: rem > 0.005 ? rem.toFixed(2) : '' }]);
  }

  function removeLine(idx: number) {
    if (lines.length <= 2) return;
    setLines((prev) => prev.filter((_, i) => i !== idx));
  }

  async function handleSave() {
    setError('');
    if (!balanced) { setError('Amounts must sum to the transaction total.'); return; }
    setSaving(true);
    try {
      const res = await fetch(`${API}/transactions/${tx.id}/split`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          splits: lines.map((l) => ({
            categoryId: l.categoryId || null,
            amount: parseFloat(l.amount),
          })),
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setError((err as any).message ?? 'Failed to split transaction.');
        return;
      }
      const children: Transaction[] = await res.json();
      onSave(children);
    } finally {
      setSaving(false);
    }
  }

  const primaryCats = categories.filter(
    (c) => c.type === (isExpense ? 'expense' : 'income') || c.type === 'both',
  );
  const secondaryCats = categories.filter(
    (c) => c.type !== (isExpense ? 'expense' : 'income') && c.type !== 'both' && c.type !== 'transfer',
  );

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(6px)' }}
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="w-full max-w-md flex flex-col rounded-2xl"
        style={{
          background: 'var(--color-elevated)',
          border: 'var(--glass-border)',
          boxShadow: 'var(--glass-shadow)',
          maxHeight: '90dvh',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-4" style={{ borderBottom: '1px solid var(--color-border)' }}>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-bold uppercase tracking-widest mb-0.5" style={{ color: 'var(--color-primary)' }}>
              ✂ Split Transaction
            </p>
            <p className="text-sm font-semibold truncate">{tx.name}</p>
          </div>
          <span
            className="text-sm font-bold tabular-nums px-2.5 py-1 rounded-lg shrink-0"
            style={{
              background: isExpense
                ? 'color-mix(in srgb, var(--color-orange) 15%, transparent)'
                : 'color-mix(in srgb, var(--color-green) 15%, transparent)',
              color: isExpense ? 'var(--color-orange)' : 'var(--color-green)',
            }}
          >
            {isExpense ? '-' : '+'}${absTotal.toFixed(2)}
          </span>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-[var(--color-elevated)] shrink-0"
            style={{ color: 'var(--color-text-muted)' }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Split lines */}
        <div className="flex flex-col gap-2 px-5 py-4 overflow-y-auto flex-1">
          {lines.map((line, idx) => {
            const cat = categories.find((c) => c.id === line.categoryId);
            return (
              <div key={idx} className="flex items-center gap-2">
                {/* Category picker */}
                <div className="flex-1 relative">
                  <button
                    type="button"
                    onClick={() => setOpenPickerIdx(openPickerIdx === idx ? null : idx)}
                    className="w-full flex items-center gap-2 px-3 py-2.5 rounded-xl text-xs text-left transition-all hover:brightness-110"
                    style={
                      cat
                        ? { background: `${cat.color}18`, border: `1px solid ${cat.color}35`, color: cat.color }
                        : { background: 'var(--color-surface)', border: '1px solid var(--color-border)', color: 'var(--color-text-muted)' }
                    }
                  >
                    {cat ? (
                      <><span>{cat.icon}</span><span className="font-medium truncate flex-1">{cat.name}</span></>
                    ) : (
                      <span className="flex-1">Category (optional)</span>
                    )}
                    <svg width="8" height="8" viewBox="0 0 12 12" fill="none" style={{ opacity: 0.4, flexShrink: 0 }}>
                      <path d="M2 4l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </button>

                  {openPickerIdx === idx && (
                    <div
                      className="absolute left-0 top-full mt-1 z-50 rounded-xl py-1 overflow-y-auto"
                      style={{
                        background: 'var(--popover-bg)',
                        border: 'var(--glass-border)',
                        boxShadow: 'var(--glass-shadow)',
                        minWidth: '180px',
                        maxHeight: '200px',
                        width: '100%',
                      }}
                    >
                      {cat && (
                        <button
                          onClick={() => { updateLine(idx, { categoryId: '' }); setOpenPickerIdx(null); }}
                          className="w-full flex items-center gap-2 px-3 py-2 text-xs transition-colors hover:bg-[var(--color-elevated)]"
                          style={{ color: 'var(--color-rose)' }}
                        >
                          <span>✕</span><span>Remove</span>
                        </button>
                      )}
                      {primaryCats.map((c) => (
                        <button
                          key={c.id}
                          onClick={() => { updateLine(idx, { categoryId: c.id }); setOpenPickerIdx(null); }}
                          className="w-full flex items-center gap-2.5 px-3 py-2 text-xs transition-colors hover:bg-[var(--color-elevated)]"
                          style={line.categoryId === c.id ? { background: `${c.color}15` } : {}}
                        >
                          <span className="w-5 h-5 rounded-lg flex items-center justify-center text-sm shrink-0" style={{ background: `${c.color}20` }}>{c.icon}</span>
                          <span className="font-medium flex-1 text-left" style={{ color: line.categoryId === c.id ? c.color : 'var(--color-text-primary)' }}>{c.name}</span>
                          {line.categoryId === c.id && <span style={{ color: c.color }}>✓</span>}
                        </button>
                      ))}
                      {secondaryCats.length > 0 && (
                        <>
                          <div style={{ borderTop: '1px solid var(--color-border)', margin: '4px 0' }} />
                          {secondaryCats.map((c) => (
                            <button
                              key={c.id}
                              onClick={() => { updateLine(idx, { categoryId: c.id }); setOpenPickerIdx(null); }}
                              className="w-full flex items-center gap-2.5 px-3 py-2 text-xs transition-colors hover:bg-[var(--color-elevated)]"
                              style={line.categoryId === c.id ? { background: `${c.color}15` } : {}}
                            >
                              <span className="w-5 h-5 rounded-lg flex items-center justify-center text-sm shrink-0" style={{ background: `${c.color}20` }}>{c.icon}</span>
                              <span className="font-medium flex-1 text-left" style={{ color: line.categoryId === c.id ? c.color : 'var(--color-text-primary)' }}>{c.name}</span>
                              {line.categoryId === c.id && <span style={{ color: c.color }}>✓</span>}
                            </button>
                          ))}
                        </>
                      )}
                    </div>
                  )}
                </div>

                {/* Amount input */}
                <div className="flex items-center gap-1 shrink-0">
                  <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>$</span>
                  <input
                    type="number"
                    min="0.01"
                    step="0.01"
                    placeholder="0.00"
                    value={line.amount}
                    onChange={(e) => updateLine(idx, { amount: e.target.value })}
                    className="w-24 px-2 py-2 text-sm font-semibold outline-none rounded-xl text-right tabular-nums"
                    style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', color: 'var(--color-text-primary)' }}
                  />
                </div>

                {/* Remove button */}
                <button
                  type="button"
                  onClick={() => removeLine(idx)}
                  disabled={lines.length <= 2}
                  className="w-7 h-7 rounded-lg flex items-center justify-center transition-colors hover:bg-red-500/20 disabled:opacity-0 shrink-0"
                  style={{ color: 'var(--color-rose)' }}
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M18 6 6 18M6 6l12 12" />
                  </svg>
                </button>
              </div>
            );
          })}

          {/* Remaining indicator */}
          <div
            className="flex items-center justify-between px-3 py-2 rounded-xl mt-1"
            style={{
              background: balanced
                ? 'color-mix(in srgb, var(--color-green) 8%, transparent)'
                : remaining < 0
                ? 'color-mix(in srgb, var(--color-rose) 8%, transparent)'
                : 'var(--color-surface)',
              border: `1px solid ${
                balanced
                  ? 'color-mix(in srgb, var(--color-green) 25%, transparent)'
                  : remaining < 0
                  ? 'color-mix(in srgb, var(--color-rose) 25%, transparent)'
                  : 'var(--color-border)'
              }`,
            }}
          >
            <span className="text-xs font-semibold" style={{ color: 'var(--color-text-muted)' }}>
              {balanced ? '✓ Balanced' : 'Remaining'}
            </span>
            <span
              className="text-sm font-bold tabular-nums"
              style={{ color: balanced ? 'var(--color-green)' : remaining < 0 ? 'var(--color-rose)' : 'var(--color-text-primary)' }}
            >
              {balanced ? '$0.00' : `$${Math.abs(remaining).toFixed(2)}${remaining < 0 ? ' over' : ''}`}
            </span>
          </div>

          {/* Add piece */}
          <button
            type="button"
            onClick={addLine}
            className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold transition-all hover:brightness-110 mt-1"
            style={{
              background: 'color-mix(in srgb, var(--color-primary) 10%, transparent)',
              border: '1px solid color-mix(in srgb, var(--color-primary) 25%, transparent)',
              color: 'var(--color-primary)',
            }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 5v14M5 12h14" />
            </svg>
            Add piece
          </button>

          {error && <p className="text-xs text-center mt-1" style={{ color: 'var(--color-rose)' }}>{error}</p>}
        </div>

        {/* Footer */}
        <div className="flex gap-3 px-5 py-4" style={{ borderTop: '1px solid var(--color-border)' }}>
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-2.5 text-sm font-semibold rounded-xl transition-all hover:brightness-110"
            style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', color: 'var(--color-text-muted)' }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={!balanced || saving}
            className="flex-1 py-2.5 text-sm font-bold rounded-xl transition-all hover:brightness-110 disabled:opacity-40"
            style={{ background: 'var(--color-primary)', color: 'white' }}
          >
            {saving ? 'Splitting…' : 'Split transaction'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/components/SplitTransactionModal.tsx
git commit -m "feat(web): add SplitTransactionModal component"
```

---

## Task 5: Wire split/unsplit into the transactions page

**Files:**
- Modify: `apps/web/src/app/transactions/page.tsx`

**Interfaces:**
- Consumes: `SplitTransactionModal` (from Task 4); `POST /transactions/:id/split`, `DELETE /transactions/:id/unsplit` (from Task 3)

- [ ] **Step 1: Add SplitTransactionModal import**

At the top of `apps/web/src/app/transactions/page.tsx`, after the existing imports, add:

```typescript
import SplitTransactionModal from '@/components/SplitTransactionModal';
```

- [ ] **Step 2: Add parentId and isSplitParent to the Transaction interface**

Find the `interface Transaction {` block (around line 21). Add two fields:

```typescript
interface Transaction {
  id: string; name: string; amount: number; date: string; source: string; pending: boolean;
  categoryId: string | null; categoryRef: Category | null;
  bankAccountId: string; bankAccount: BankAccount | null;
  projectId: string | null;
  projectCategoryId: string | null;
  transferAccountId: string | null;
  transferAccount: BankAccount | null;
  counterpartTxId: string | null;
  debtId: string | null;
  parentId: string | null;       // <-- add
  isSplitParent: boolean;        // <-- add
}
```

- [ ] **Step 3: Add splitTx state**

Find the block of `useState` declarations (around lines 83–130). After the `const [debts, setDebts]` line, add:

```typescript
const [splitTx, setSplitTx] = useState<Transaction | null>(null);
```

- [ ] **Step 4: Add unsplitTransaction function**

After the `unlinkFromProject` function (around line 434), add:

```typescript
  async function unsplitTransaction(tx: Transaction) {
    const parentId = tx.parentId!;
    const res = await fetch(`${API}/transactions/${tx.id}/unsplit`, {
      method: 'DELETE', credentials: 'include',
    });
    if (!res.ok) return;
    const restored: Transaction = await res.json();
    setTransactions((prev) => [
      restored,
      ...prev.filter((t) => t.parentId !== parentId && t.id !== parentId),
    ]);
  }
```

- [ ] **Step 5: Change left accent bar color for split children to group siblings visually**

Find the left accent bar div inside the transaction row render (around line 1118):

```tsx
                              {/* Income/expense/transfer bar */}
                              <div className="w-1 h-8 rounded-full shrink-0"
                                style={{ background: txIsTransfer ? '#6B6B8A' : isIncome ? 'var(--color-green)' : 'var(--color-orange)' }} />
```

Replace the `style` so split children get the primary (violet) accent color instead:

```tsx
                              {/* Income/expense/transfer bar */}
                              <div className="w-1 h-8 rounded-full shrink-0"
                                style={{ background: tx.parentId ? 'var(--color-primary)' : txIsTransfer ? '#6B6B8A' : isIncome ? 'var(--color-green)' : 'var(--color-orange)' }} />
```

This visually groups all siblings (they share the same date and appear consecutively) with a consistent violet bar, distinct from regular income/expense rows.

- [ ] **Step 6: Replace source badge with split badge for children, and add Split/Unsplit hover buttons**

Find this block inside the transaction row render (around line 1125):

```tsx
                                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md uppercase"
                                    style={{ background: 'var(--color-elevated)', color: 'var(--color-text-muted)' }}>
                                    {tx.source}
                                  </span>
```

Replace it with:

```tsx
                                  {tx.parentId ? (
                                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md"
                                      style={{ background: 'color-mix(in srgb, var(--color-primary) 14%, transparent)', border: '1px solid color-mix(in srgb, var(--color-primary) 28%, transparent)', color: 'var(--color-primary)' }}>
                                      ✂ Split
                                    </span>
                                  ) : (
                                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md uppercase"
                                      style={{ background: 'var(--color-elevated)', color: 'var(--color-text-muted)' }}>
                                      {tx.source}
                                    </span>
                                  )}
```

Now find the edit button block (around line 1657) — it starts with:

```tsx
                          {/* Delete — manual only */}
                          {tx.source === 'manual' && deleteConfirmId !== tx.id && (
```

Just **before** this comment, add the Split/Unsplit buttons:

```tsx
                          {/* Split / Unsplit */}
                          {!tx.debtId && !txIsTransfer && (
                            tx.parentId ? (
                              <button
                                onClick={() => unsplitTransaction(tx)}
                                className="opacity-0 group-hover:opacity-100 flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs font-semibold transition-all hover:brightness-110 shrink-0"
                                style={{ background: 'color-mix(in srgb, var(--color-text-muted) 10%, transparent)', border: '1px solid var(--color-border)', color: 'var(--color-text-muted)' }}
                                title="Unsplit — recombine into one transaction"
                              >
                                ↩ Unsplit
                              </button>
                            ) : (
                              <button
                                onClick={() => setSplitTx(tx)}
                                className="opacity-0 group-hover:opacity-100 flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs font-semibold transition-all hover:brightness-110 shrink-0"
                                style={{ background: 'color-mix(in srgb, var(--color-primary) 10%, transparent)', border: '1px solid color-mix(in srgb, var(--color-primary) 25%, transparent)', color: 'var(--color-primary)' }}
                                title="Split into multiple categories"
                              >
                                ✂ Split
                              </button>
                            )
                          )}
```

- [ ] **Step 7: Mount SplitTransactionModal**

Find the section where other modals are mounted (around line 1779 — the `{showManualTx && createPortal(...`). Just before that section, add:

```tsx
        {/* Split transaction modal */}
        {splitTx && (
          <SplitTransactionModal
            tx={splitTx}
            categories={categories}
            onSave={(children) => {
              setTransactions((prev) => [
                ...children,
                ...prev.filter((t) => t.id !== splitTx.id),
              ]);
              setSplitTx(null);
            }}
            onClose={() => setSplitTx(null)}
          />
        )}
```

- [ ] **Step 8: Start dev servers and test the full flow**

```bash
npm run dev:web
npm run dev:api
```

Open `http://localhost:3000/transactions`. Verify:

1. Hovering a transaction row shows the `✂ Split` button.
2. Clicking it opens the SplitTransactionModal with the transaction name, total amount, and two pre-filled lines.
3. Adjusting amounts so "Remaining" shows `$0.00 ✓ Balanced` enables the "Split transaction" button.
4. Saving: the modal closes, the original row disappears, and the two (or more) split pieces appear in its place — each with a `✂ Split` badge and a violet left bar.
5. Hovering a split child shows the `↩ Unsplit` button. Clicking it removes the children and restores the original row.
6. The category picker inside the modal lists all relevant categories, opens on click, closes on selection.
7. "Add piece" appends a new line pre-filled with the remaining amount.
8. Lines can be removed (button hidden when only 2 lines remain).
9. Split children can each be assigned independent categories via the row's normal category picker.

- [ ] **Step 9: Commit**

```bash
git add apps/web/src/app/transactions/page.tsx
git commit -m "feat(web): wire split/unsplit into transactions page — hover buttons, split badge, modal"
```
