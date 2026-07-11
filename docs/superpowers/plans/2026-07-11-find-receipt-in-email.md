# Find Receipt in Email Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** From a transaction row, search the user's Gmail for the matching receipt email, view its parsed line items, link it to the transaction, and optionally pre-fill the Split modal from the items.

**Architecture:** A new `ReceiptFinderService` in the transactions module queries the local `receipts` cache first, then falls back to a targeted Gmail search (merchant alias + date window) through a new public `GmailService.searchReceipts` method, upserting parses into `receipts`. Two new endpoints expose find + link. The web adds a `FindReceiptModal` and a receipt button per transaction row; split prefill rides a new optional `initialLines` prop on `SplitTransactionModal`.

**Tech Stack:** NestJS 11 + TypeORM (Postgres), googleapis Gmail readonly, Anthropic SDK (claude-haiku-4-5 parser — already in place), Next.js 16 / React 19 / Tailwind v4.

## Global Constraints

- No test runner is configured in this repo; each task verifies with `npm run build:api` (API) and, for web tasks, the Turbopack dev server + Playwright screenshot scripts (pattern: `scratchpad/verify-chart.js` — forged `access_token` cookie + `ctx.route('**/api/**')` mocks).
- Spec: `docs/superpowers/specs/2026-07-11-find-receipt-in-email-design.md`.
- `Receipt.total` is a Postgres `decimal` → arrives as a **string** at runtime; always wrap in `Number()` before math.
- All entities are already registered in `apps/api/src/config/database.config.ts`; do not touch it.
- Never auto-link a candidate; the user picks (Amazon split shipments make charge ≠ order total common).
- Components consume theme CSS variables only — no hardcoded colors.
- Commit after each task on branch `dev`; commit messages end with `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.

---

### Task 1: `GmailService.searchReceipts` (public, query-parameterized)

**Files:**
- Modify: `apps/api/src/gmail/gmail.service.ts:159-200` (`fetchAndParseReceipts`)

**Interfaces:**
- Consumes: existing private `getAuthorizedClient`, `extractHeader`, `extractBody`, `parseWithClaude`, and the `RawReceipt` interface (exported at top of the file).
- Produces: `async searchReceipts(userId: string, query: string, maxResults = 10): Promise<RawReceipt[]>` — Task 2 calls this.

- [ ] **Step 1: Generalize the fetch loop**

Replace the body of `fetchAndParseReceipts` and add `searchReceipts` (the old fixed `QUERY` moves into the delegating wrapper):

```typescript
  async fetchAndParseReceipts(userId: string): Promise<RawReceipt[]> {
    const QUERY =
      'from:(ship-confirm@amazon.com OR auto-confirm@amazon.com OR doordash.com OR ubereats.com OR order@walmart.com OR no-reply@apple.com OR noreply@doordash.com) newer_than:90d';
    return this.searchReceipts(userId, QUERY, 50);
  }

  /** Search Gmail with an arbitrary query and parse each hit into a receipt. */
  async searchReceipts(userId: string, query: string, maxResults = 10): Promise<RawReceipt[]> {
    const client = await this.getAuthorizedClient(userId);
    const gmail = google.gmail({ version: 'v1', auth: client });

    const listRes = await gmail.users.messages.list({ userId: 'me', q: query, maxResults });
    const messages = listRes.data.messages ?? [];
    const results: RawReceipt[] = [];

    for (const msg of messages) {
      if (!msg.id) continue;
      const full = await gmail.users.messages.get({ userId: 'me', id: msg.id, format: 'full' });
      const subject = this.extractHeader(full.data.payload?.headers ?? [], 'Subject');
      const body = this.extractBody(full.data.payload);
      if (!body) continue;
      const parsed = await this.parseWithClaude(body, subject);
      if (parsed) {
        results.push({ gmailMessageId: msg.id, subject, ...parsed });
      } else {
        // Parse failed — keep a fallback receipt so the email is not silently lost
        results.push({
          gmailMessageId: msg.id,
          subject,
          merchant: subject.slice(0, 100) || 'Unknown Merchant',
          orderNumber: null,
          orderDate: null,
          currency: 'USD',
          total: 0,
          items: [{ name: 'Order total (parsing failed — check email for details)', quantity: 1, unitPrice: 0, total: 0 }],
        });
      }
    }

    return results;
  }
```

The per-message loop is byte-identical to the old `fetchAndParseReceipts` body — this is a pure extract-method refactor plus the new public entry point.

- [ ] **Step 2: Verify build**

Run: `npm run build:api`
Expected: exits 0, no TypeScript errors.

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/gmail/gmail.service.ts
git commit -m "refactor(gmail): extract query-parameterized searchReceipts from fetchAndParseReceipts"
```

---

### Task 2: `ReceiptFinderService` + endpoints + module wiring

**Files:**
- Create: `apps/api/src/transactions/receipt-finder.service.ts`
- Modify: `apps/api/src/transactions/transactions.module.ts`
- Modify: `apps/api/src/transactions/transactions.controller.ts` (append two routes)

**Interfaces:**
- Consumes: `GmailService.searchReceipts(userId, query, maxResults)` and `GmailService.getConnection(userId)` from Task 1; `Receipt` entity; `Transaction` entity (`receiptId: string | null` column exists).
- Produces (Tasks 4–5 depend on these exact shapes):
  - `GET /api/transactions/:id/receipt-candidates?window=4` → `ReceiptCandidate[]`
  - `PATCH /api/transactions/:id/receipt` body `{ receiptId: string | null }` → updated `Transaction`
  - 409 `{ statusCode: 409, message: 'gmail_not_connected', ... }` when Gmail is not connected and the cache had no hits.
  - `ReceiptCandidate = { id, gmailMessageId, merchant, orderNumber, orderDate, total: number, currency, items, rawSubject, amountDelta: number, source: 'cache' | 'gmail', linked: boolean }`

- [ ] **Step 1: Create `receipt-finder.service.ts`**

```typescript
import { Injectable, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Receipt } from '../receipts/receipt.entity';
import { Transaction } from './transaction.entity';
import { GmailService } from '../gmail/gmail.service';

export interface ReceiptCandidate {
  id: string;
  gmailMessageId: string;
  merchant: string;
  orderNumber: string | null;
  orderDate: string | null;
  total: number;
  currency: string;
  items: { name: string; quantity: number; unitPrice: number; total: number }[];
  rawSubject: string | null;
  amountDelta: number;
  source: 'cache' | 'gmail';
  linked: boolean;
}

/** tx.name → Gmail search term. First alias hit wins; fallback = first word ≥ 4 letters. */
const MERCHANT_ALIASES: [RegExp, string][] = [
  [/\bAMZN\b|\bAMAZON\b/i, 'amazon.com'],
  [/\bWAL-?MART\b/i, 'walmart.com'],
  [/\bAPPLE(\.COM)?\b/i, 'apple.com'],
  [/\bDOORDASH\b|^DD\s?\*/i, 'doordash.com'],
  [/\bUBER\s*EATS\b/i, 'ubereats.com'],
];

export function merchantTerm(txName: string): string {
  for (const [re, term] of MERCHANT_ALIASES) if (re.test(txName)) return term;
  const cleaned = txName.replace(/\*\S*/g, ' ');
  const token = cleaned.split(/\s+/).find((w) => w.replace(/[^a-z]/gi, '').length >= 4);
  return (token ?? txName.trim().split(/\s+/)[0] ?? '').toLowerCase();
}

function shiftDate(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

@Injectable()
export class ReceiptFinderService {
  constructor(
    @InjectRepository(Transaction) private txRepo: Repository<Transaction>,
    @InjectRepository(Receipt) private receiptRepo: Repository<Receipt>,
    private gmail: GmailService,
  ) {}

  async findCandidates(userId: string, txId: string, windowDays = 4): Promise<ReceiptCandidate[]> {
    const tx = await this.txRepo.findOneBy({ id: txId, userId });
    if (!tx) throw new NotFoundException('Transaction not found');

    const absAmount = Math.abs(Number(tx.amount));
    const from = shiftDate(tx.date, -windowDays);
    const to = shiftDate(tx.date, windowDays);

    // 1) Local cache first — instant when the receipt was parsed before.
    const cached = await this.receiptRepo
      .createQueryBuilder('r')
      .where('r.userId = :userId', { userId })
      .andWhere('(r.orderDate BETWEEN :from AND :to OR r.orderDate IS NULL)', { from, to })
      .getMany();

    if (cached.length > 0) {
      return this.rank(cached, tx, absAmount, 'cache');
    }

    // 2) Gmail fallback.
    const conn = await this.gmail.getConnection(userId);
    if (!conn) throw new ConflictException('gmail_not_connected');

    const query = `${merchantTerm(tx.name)} after:${from} before:${shiftDate(to, 1)}`;
    const raw = await this.gmail.searchReceipts(userId, query, 10);

    for (const r of raw) {
      const validItems = (r.items ?? []).filter(
        (i) =>
          typeof i.name === 'string' && typeof i.quantity === 'number' &&
          typeof i.unitPrice === 'number' && typeof i.total === 'number',
      );
      await this.receiptRepo.upsert(
        {
          userId,
          gmailMessageId: r.gmailMessageId,
          merchant: r.merchant,
          orderNumber: r.orderNumber ?? undefined,
          orderDate: r.orderDate ?? undefined,
          total: r.total,
          currency: r.currency,
          items: validItems,
          rawSubject: r.subject,
        },
        ['userId', 'gmailMessageId'],
      );
    }

    const fresh = raw.length
      ? await this.receiptRepo
          .createQueryBuilder('r')
          .where('r.userId = :userId', { userId })
          .andWhere('r.gmailMessageId IN (:...ids)', { ids: raw.map((r) => r.gmailMessageId) })
          .getMany()
      : [];
    return this.rank(fresh, tx, absAmount, 'gmail');
  }

  private async rank(
    receipts: Receipt[], tx: Transaction, absAmount: number, source: 'cache' | 'gmail',
  ): Promise<ReceiptCandidate[]> {
    // Always surface the already-linked receipt, even if outside the window.
    if (tx.receiptId && !receipts.some((r) => r.id === tx.receiptId)) {
      const linked = await this.receiptRepo.findOneBy({ id: tx.receiptId, userId: tx.userId });
      if (linked) receipts = [linked, ...receipts];
    }

    const txTime = new Date(`${tx.date}T00:00:00Z`).getTime();
    const dateDist = (r: Receipt) =>
      r.orderDate ? Math.abs(new Date(`${r.orderDate}T00:00:00Z`).getTime() - txTime) : Number.MAX_SAFE_INTEGER;

    return receipts
      .map((r) => ({
        id: r.id,
        gmailMessageId: r.gmailMessageId,
        merchant: r.merchant,
        orderNumber: r.orderNumber ?? null,
        orderDate: r.orderDate ?? null,
        total: Number(r.total),
        currency: r.currency,
        items: r.items ?? [],
        rawSubject: r.rawSubject ?? null,
        amountDelta: +Math.abs(Number(r.total) - absAmount).toFixed(2),
        source,
        linked: r.id === tx.receiptId,
      }))
      .sort((a, b) =>
        Number(b.linked) - Number(a.linked) ||
        a.amountDelta - b.amountDelta ||
        dateDist(receipts.find((r) => r.id === a.id)!) - dateDist(receipts.find((r) => r.id === b.id)!),
      );
  }

  async linkReceipt(userId: string, txId: string, receiptId: string | null): Promise<Transaction> {
    const tx = await this.txRepo.findOneBy({ id: txId, userId });
    if (!tx) throw new NotFoundException('Transaction not found');
    if (receiptId) {
      // IDOR guard: the receipt must belong to the caller.
      const receipt = await this.receiptRepo.findOneBy({ id: receiptId });
      if (!receipt || receipt.userId !== userId) throw new ForbiddenException();
    }
    tx.receiptId = receiptId;
    return this.txRepo.save(tx);
  }
}
```

**Note for the implementer:** the already-linked receipt is handled inside `rank()`
(prepended even when outside the date window), not in `findCandidates` itself.

- [ ] **Step 2: Wire the module**

`apps/api/src/transactions/transactions.module.ts` becomes:

```typescript
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Transaction } from './transaction.entity';
import { BankAccount } from '../bank-accounts/bank-account.entity';
import { ProjectCategory } from '../projects/project-category.entity';
import { Receipt } from '../receipts/receipt.entity';
import { TransactionsService } from './transactions.service';
import { ReceiptFinderService } from './receipt-finder.service';
import { TransactionsController } from './transactions.controller';
import { DebtsModule } from '../debts/debts.module';
import { GmailModule } from '../gmail/gmail.module';

@Module({
  imports: [TypeOrmModule.forFeature([Transaction, BankAccount, ProjectCategory, Receipt]), DebtsModule, GmailModule],
  providers: [TransactionsService, ReceiptFinderService],
  controllers: [TransactionsController],
  exports: [TransactionsService],
})
export class TransactionsModule {}
```

- [ ] **Step 3: Add controller routes**

In `apps/api/src/transactions/transactions.controller.ts`: inject the service —
constructor becomes
`constructor(private service: TransactionsService, private receiptFinder: ReceiptFinderService) {}`
(add `import { ReceiptFinderService } from './receipt-finder.service';`), and append inside the class:

```typescript
  @Get(':id/receipt-candidates')
  receiptCandidates(
    @Param('id') id: string,
    @Request() req: any,
    @Query('window') window?: string,
  ) {
    return this.receiptFinder.findCandidates(req.user.id, id, window ? parseInt(window) : 4);
  }

  @Patch(':id/receipt')
  linkReceipt(
    @Param('id') id: string,
    @Request() req: any,
    @Body('receiptId') receiptId: string | null,
  ) {
    return this.receiptFinder.linkReceipt(req.user.id, id, receiptId ?? null);
  }
```

- [ ] **Step 4: Verify build + boot**

Run: `npm run build:api`
Expected: exits 0.

Run: `node dist/apps/api/main.js` (Ctrl-C after boot)
Expected: Nest logs all routes mapped including `/api/transactions/:id/receipt-candidates` and no DI errors (a DI error here means GmailModule import or Receipt forFeature was missed).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/transactions/receipt-finder.service.ts apps/api/src/transactions/transactions.module.ts apps/api/src/transactions/transactions.controller.ts
git commit -m "feat(api): per-transaction receipt finder — cache-first Gmail search, ranked candidates, link endpoint"
```

---

### Task 3: `SplitTransactionModal` optional `initialLines`

**Files:**
- Modify: `apps/web/src/components/SplitTransactionModal.tsx:15-31`

**Interfaces:**
- Produces: `initialLines?: { categoryId: string; amount: string }[]` prop; when given with ≥ 2 entries it seeds the modal's lines verbatim. Task 5 passes it.

- [ ] **Step 1: Add the prop**

```typescript
interface Props {
  tx: Transaction;
  categories: Category[];
  onSave: (children: Transaction[]) => void;
  onClose: () => void;
  /** Optional pre-seeded lines (e.g. from a linked receipt's items). Used as-is when ≥ 2 lines. */
  initialLines?: SplitLine[];
}

export default function SplitTransactionModal({ tx, categories, onSave, onClose, initialLines }: Props) {
  const absTotal = Math.abs(Number(tx.amount));
  const isExpense = Number(tx.amount) < 0;

  const [lines, setLines] = useState<SplitLine[]>(
    initialLines && initialLines.length >= 2
      ? initialLines
      : [
          { categoryId: tx.categoryId ?? '', amount: absTotal.toFixed(2) },
          { categoryId: '', amount: '' },
        ],
  );
```

Everything below the state seed is untouched — validation, save, and picker logic already operate on `lines`.

- [ ] **Step 2: Verify web compiles**

Run: `curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/transactions` (dev server running)
Expected: `200` (or `307` redirect to login without a cookie — either proves compilation; a Turbopack compile error returns 500).

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/SplitTransactionModal.tsx
git commit -m "feat(web): SplitTransactionModal accepts optional initialLines for receipt prefill"
```

---

### Task 4: `FindReceiptModal` component

**Files:**
- Create: `apps/web/src/components/FindReceiptModal.tsx`

**Interfaces:**
- Consumes: `GET ${API}/transactions/:id/receipt-candidates?window=N` and `PATCH ${API}/transactions/:id/receipt` from Task 2 (shapes in Task 2's Produces block).
- Produces (Task 5 renders it):

```typescript
interface Props {
  tx: { id: string; name: string; amount: number; date: string; categoryId: string | null; receiptId: string | null };
  onLinked: () => void; // called after any link/unlink so the page can reload
  onSplitFromItems: (lines: { categoryId: string; amount: string }[]) => void;
  onClose: () => void;
}
```

- [ ] **Step 1: Create the component**

```tsx
'use client';

import { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3333/api';

interface ReceiptItem { name: string; quantity: number; unitPrice: number; total: number }
interface ReceiptCandidate {
  id: string; gmailMessageId: string; merchant: string; orderNumber: string | null;
  orderDate: string | null; total: number; currency: string; items: ReceiptItem[];
  rawSubject: string | null; amountDelta: number; source: 'cache' | 'gmail'; linked: boolean;
}

interface Props {
  tx: { id: string; name: string; amount: number; date: string; categoryId: string | null; receiptId: string | null };
  onLinked: () => void;
  onSplitFromItems: (lines: { categoryId: string; amount: string }[]) => void;
  onClose: () => void;
}

const money = (n: number) => `$${Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2 })}`;

export default function FindReceiptModal({ tx, onLinked, onSplitFromItems, onClose }: Props) {
  const [candidates, setCandidates] = useState<ReceiptCandidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<'not_connected' | 'failed' | null>(null);
  const [window_, setWindow] = useState(4);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const search = useCallback(async (days: number) => {
    setLoading(true); setError(null);
    try {
      const res = await fetch(`${API}/transactions/${tx.id}/receipt-candidates?window=${days}`, { credentials: 'include' });
      if (res.status === 409) { setError('not_connected'); setCandidates([]); return; }
      if (!res.ok) { setError('failed'); setCandidates([]); return; }
      const data = await res.json();
      setCandidates(Array.isArray(data) ? data : []);
    } catch { setError('failed'); setCandidates([]); }
    finally { setLoading(false); }
  }, [tx.id]);

  useEffect(() => { search(window_); }, [search, window_]);

  async function setLink(receiptId: string | null) {
    setBusyId(receiptId ?? 'unlink');
    try {
      const res = await fetch(`${API}/transactions/${tx.id}/receipt`, {
        method: 'PATCH', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ receiptId }),
      });
      if (res.ok) onLinked();
    } finally { setBusyId(null); }
  }

  function splitLines(c: ReceiptCandidate) {
    const lines = c.items
      .filter((i) => i.total > 0)
      .map((i, idx) => ({ categoryId: idx === 0 ? (tx.categoryId ?? '') : '', amount: i.total.toFixed(2) }));
    while (lines.length < 2) lines.push({ categoryId: '', amount: '' });
    return lines;
  }

  const gmailSearchUrl =
    `https://mail.google.com/mail/u/0/#search/${encodeURIComponent(`${tx.name.split(/\s+/)[0]} ${money(Number(tx.amount))}`)}`;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.55)' }} onClick={onClose}>
      <div className="w-full max-w-xl max-h-[85vh] flex flex-col rounded-2xl overflow-hidden"
        style={{ background: 'var(--color-elevated)', border: 'var(--glass-border)', boxShadow: 'var(--glass-shadow)' }}
        onClick={(e) => e.stopPropagation()}>

        {/* Header */}
        <div className="flex items-start justify-between px-6 pt-5 pb-3">
          <div>
            <p className="text-base font-bold">Find receipt in email</p>
            <p className="text-xs mt-0.5" style={{ color: 'var(--color-text-muted)' }}>
              {tx.name} · {tx.date} · <span className="font-semibold">{money(Number(tx.amount))}</span>
            </p>
          </div>
          <button onClick={onClose} aria-label="Close" className="text-lg leading-none px-1 cursor-pointer" style={{ color: 'var(--color-text-muted)' }}>×</button>
        </div>

        <div className="px-6 pb-5 overflow-y-auto flex flex-col gap-2.5">
          {loading && <p className="text-sm py-8 text-center" style={{ color: 'var(--color-text-muted)' }}>Searching your email…</p>}

          {!loading && error === 'not_connected' && (
            <div className="text-sm py-6 text-center flex flex-col gap-3" style={{ color: 'var(--color-text-secondary)' }}>
              <p>Gmail is not connected, so Cofre can&apos;t search your inbox.</p>
              <a href="/settings?tab=integrations" className="font-semibold underline" style={{ color: 'var(--color-primary)' }}>
                Connect Gmail in Settings → Integrations
              </a>
            </div>
          )}

          {!loading && error === 'failed' && (
            <p className="text-sm py-8 text-center" style={{ color: 'var(--color-rose)' }}>Search failed — try again in a moment.</p>
          )}

          {!loading && !error && candidates.length === 0 && (
            <div className="text-sm py-6 text-center flex flex-col gap-3" style={{ color: 'var(--color-text-secondary)' }}>
              <p>No receipt emails found within ±{window_} days.</p>
              <div className="flex items-center justify-center gap-3">
                {window_ < 10 && (
                  <button onClick={() => setWindow(10)} className="px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer"
                    style={{ background: 'color-mix(in srgb, var(--color-primary) 12%, transparent)', border: '1px solid color-mix(in srgb, var(--color-primary) 30%, transparent)', color: 'var(--color-primary)' }}>
                    Widen to ±10 days
                  </button>
                )}
                <a href={gmailSearchUrl} target="_blank" rel="noreferrer" className="text-xs font-semibold underline" style={{ color: 'var(--color-text-muted)' }}>
                  Search Gmail manually ↗
                </a>
              </div>
            </div>
          )}

          {!loading && !error && candidates.map((c) => {
            const exact = c.amountDelta === 0;
            const expanded = expandedId === c.id;
            return (
              <div key={c.id} className="rounded-xl px-4 py-3 flex flex-col gap-2"
                style={{ border: c.linked ? '1px solid color-mix(in srgb, var(--color-green) 45%, transparent)' : 'var(--glass-border)', background: 'var(--color-surface)' }}>
                <div className="flex items-center justify-between gap-3 min-w-0">
                  <div className="min-w-0">
                    <p className="text-sm font-bold truncate">
                      {c.merchant}
                      {c.linked && <span className="ml-2 text-[10px] font-semibold px-1.5 py-0.5 rounded" style={{ background: 'color-mix(in srgb, var(--color-green) 15%, transparent)', color: 'var(--color-green)' }}>LINKED</span>}
                    </p>
                    <p className="text-[11px] truncate" style={{ color: 'var(--color-text-muted)' }}>
                      {c.orderDate ?? 'no date'} · {c.rawSubject ?? c.orderNumber ?? c.gmailMessageId}
                    </p>
                  </div>
                  <p className="text-sm font-bold tabular-nums shrink-0" style={{ color: exact ? 'var(--color-green)' : 'var(--color-text-primary)' }}>
                    {money(c.total)}{exact ? ' ✓' : ''}
                  </p>
                </div>

                <div className="flex items-center gap-2 flex-wrap text-[11px] font-semibold">
                  <button onClick={() => setExpandedId(expanded ? null : c.id)} className="px-2 py-1 rounded-lg cursor-pointer"
                    style={{ border: '1px solid var(--color-border)', color: 'var(--color-text-secondary)' }}>
                    {expanded ? 'Hide items' : `Items (${c.items.length})`}
                  </button>
                  {c.linked ? (
                    <button onClick={() => setLink(null)} disabled={busyId !== null} className="px-2 py-1 rounded-lg cursor-pointer disabled:opacity-50"
                      style={{ border: '1px solid var(--color-border)', color: 'var(--color-text-muted)' }}>
                      Unlink
                    </button>
                  ) : (
                    <button onClick={() => setLink(c.id)} disabled={busyId !== null} className="px-2 py-1 rounded-lg cursor-pointer disabled:opacity-50"
                      style={{ background: 'color-mix(in srgb, var(--color-green) 12%, transparent)', border: '1px solid color-mix(in srgb, var(--color-green) 30%, transparent)', color: 'var(--color-green)' }}>
                      {busyId === c.id ? 'Linking…' : 'Link receipt'}
                    </button>
                  )}
                  <button
                    onClick={async () => { if (!c.linked) await setLink(c.id); onSplitFromItems(splitLines(c)); }}
                    disabled={busyId !== null || c.items.filter((i) => i.total > 0).length < 2}
                    title={c.items.filter((i) => i.total > 0).length < 2 ? 'Needs at least 2 priced items' : 'Pre-fill the split modal from these items'}
                    className="px-2 py-1 rounded-lg cursor-pointer disabled:opacity-40"
                    style={{ background: 'color-mix(in srgb, var(--color-violet) 12%, transparent)', border: '1px solid color-mix(in srgb, var(--color-violet) 30%, transparent)', color: 'var(--color-violet)' }}>
                    Split from items
                  </button>
                  <a href={`https://mail.google.com/mail/u/0/#all/${c.gmailMessageId}`} target="_blank" rel="noreferrer"
                    className="px-2 py-1 rounded-lg no-underline" style={{ border: '1px solid var(--color-border)', color: 'var(--color-text-secondary)' }}>
                    Open in Gmail ↗
                  </a>
                </div>

                {expanded && (
                  <div className="flex flex-col gap-1 pt-1" style={{ borderTop: '1px solid var(--color-border)' }}>
                    {c.items.length === 0 && <p className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>No line items parsed.</p>}
                    {c.items.map((it, i) => (
                      <div key={i} className="flex items-center justify-between gap-3 text-[12px]">
                        <span className="truncate" style={{ color: 'var(--color-text-secondary)' }}>{it.quantity > 1 ? `${it.quantity}× ` : ''}{it.name}</span>
                        <span className="tabular-nums shrink-0">{money(it.total)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>,
    document.body,
  );
}
```

- [ ] **Step 2: Verify web compiles**

Run: `curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/transactions`
Expected: `200`/`307` (not 500).

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/FindReceiptModal.tsx
git commit -m "feat(web): FindReceiptModal — ranked receipt candidates with link, Gmail deep link, split prefill"
```

---

### Task 5: Transactions page wiring

**Files:**
- Modify: `apps/web/src/app/transactions/page.tsx` (four small edits: type, imports/state, row button, modal rendering)

**Interfaces:**
- Consumes: `FindReceiptModal` (Task 4), `initialLines` prop (Task 3), `receiptId` returned by `GET /transactions` (entity column — already serialized).

- [ ] **Step 1: Type + import + state**

Add to the `Transaction` interface (after `note: string | null;`, ~line 35):

```typescript
  receiptId: string | null;
```

Add import next to the SplitTransactionModal import (~line 12):

```typescript
import FindReceiptModal from '@/components/FindReceiptModal';
```

Add state next to `splitTx` (~line 136):

```typescript
  const [receiptTx, setReceiptTx] = useState<Transaction | null>(null);
  const [splitInitialLines, setSplitInitialLines] = useState<{ categoryId: string; amount: string }[] | null>(null);
```

- [ ] **Step 2: Row button**

Directly BEFORE the `{/* Split / Unsplit */}` block (~line 1845), add (same hover-action pattern as the Split button; linked rows keep the chip always visible):

```tsx
                          {/* Find receipt in email */}
                          {!tx.isSplitParent && (
                            <button
                              onClick={() => setReceiptTx(tx)}
                              className={`${tx.receiptId ? '' : 'opacity-0 group-hover:opacity-100'} flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs font-semibold transition-all hover:brightness-110 shrink-0`}
                              style={{ background: 'color-mix(in srgb, var(--color-violet) 10%, transparent)', border: '1px solid color-mix(in srgb, var(--color-violet) 25%, transparent)', color: 'var(--color-violet)' }}
                              title={tx.receiptId ? 'View linked receipt' : 'Find receipt in email'}
                            >
                              ✉ {tx.receiptId ? 'Receipt ✓' : 'Receipt'}
                            </button>
                          )}
```

- [ ] **Step 3: Render the modal + prefill the split modal**

Replace the split-modal block (~lines 1990-2001) with:

```tsx
        {/* Split transaction modal */}
        {splitTx && (
          <SplitTransactionModal
            tx={splitTx}
            categories={categories}
            initialLines={splitInitialLines ?? undefined}
            onSave={() => {
              loadTransactions();
              setSplitTx(null);
              setSplitInitialLines(null);
            }}
            onClose={() => { setSplitTx(null); setSplitInitialLines(null); }}
          />
        )}

        {/* Find receipt modal */}
        {receiptTx && (
          <FindReceiptModal
            tx={receiptTx}
            onLinked={() => { loadTransactions(); setReceiptTx(null); }}
            onSplitFromItems={(lines) => {
              setSplitInitialLines(lines);
              setSplitTx(receiptTx);
              setReceiptTx(null);
            }}
            onClose={() => setReceiptTx(null)}
          />
        )}
```

- [ ] **Step 4: Verify end-to-end with mocked API**

Write `scratchpad/verify-receipt.js` following the `verify-chart.js` pattern (forged cookie, `ctx.route`), mocking:
- `GET **/transactions?**` → one row: `{ id: 't1', name: 'AMAZON MKTPL*XV11W3NZ3 Amzn.com/billWA', amount: -42.38, date: '2026-07-02', source: 'csv', pending: false, categoryId: null, categoryRef: null, bankAccountId: 'b1', bankAccount: null, projectId: null, projectCategoryId: null, transferAccountId: null, transferAccount: null, counterpartTxId: null, debtId: null, parentId: null, isSplitParent: false, note: null, receiptId: null }` (plus `[]` for other endpoints).
- `GET **/receipt-candidates**` → two candidates, one with `amountDelta: 0` and 3 items, one with `amountDelta: 12.5`.
- `PATCH **/receipt` → `{}` 200.

Drive: goto /transactions → hover row → click `✉ Receipt` → screenshot modal → click `Items` → screenshot expanded → click `Split from items` → screenshot split modal with prefilled amounts. Read all screenshots; confirm zero console errors, candidates ranked (exact match first, green total), and split lines = item totals.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/transactions/page.tsx
git commit -m "feat(web): receipt button on transaction rows — find, link, and split from email receipts"
```

---

### Task 6: Final verification + push

- [ ] **Step 1: API build + boot**

Run: `npm run build:api && node dist/apps/api/main.js` (Ctrl-C after routes log)
Expected: routes mapped, no DI errors.

- [ ] **Step 2: Re-run the Task 5 Playwright script**

Expected: all screenshots correct, `console errors: none`.

- [ ] **Step 3: Push**

```bash
git push origin dev
```

Real-Gmail end-to-end (connect account, search a live Amazon charge) is user-assisted after deploy — the API path is covered by boot + the mocked UI flow.
