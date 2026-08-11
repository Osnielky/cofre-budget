# Post-Categorize Rule Trigger & Provenance Indicator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the "check a box before picking a category" rule-creation trigger with a "Make permanent" nudge that appears on a transaction row right after it's manually categorized, and add a durable pin indicator (+ revert menu) on any row whose category was actually set by a rule.

**Architecture:** One new nullable FK column (`Transaction.categorizedByRuleId` → `CategorizationRule`, `onDelete: 'SET NULL'`) is the source of truth for "was this row's category set by a rule." Backend: `CategorizationRulesService.matchRule` now returns the matched rule (not just its `categoryId`) so every write path can stamp both fields together; `TransactionsService.updateCategory` clears the field on any manual change. Frontend: the transactions page drops its checkbox-in-picker mechanism for a post-assign nudge, and adds a pin+menu driven by the new field.

**Tech Stack:** NestJS 11 + TypeORM (api, `synchronize: true` — no migrations needed), Next.js 16 / React 19 / Tailwind v4 (web).

## Global Constraints

- No test runner is configured for either app — verify manually: `npm run build:api` / `npm run build:web` for type-safety, `curl` against a running API for backend behavior, and a real browser (`npm run dev:web`) for UI behavior.
- Colors/surfaces must only ever come from the CSS variables already defined in `apps/web/src/app/globals.css` (`--color-*`) — never hardcode theme colors in components.
- No backfill migration — this feature has no real-world usage yet, so no existing transaction needs retroactive `categorizedByRuleId` data.
- No change to `POST/PATCH/DELETE /categorization-rules` or the Settings Rules tab — this plan only changes *when* the frontend calls `POST /categorization-rules` and adds provenance tracking, not the rule CRUD API itself.

---

## Task 1: Backend — track which rule categorized each transaction

**Files:**
- Modify: `apps/api/src/transactions/transaction.entity.ts`
- Modify: `apps/api/src/categorization-rules/categorization-rules.service.ts`
- Modify: `apps/api/src/transactions/transactions.service.ts`
- Modify: `apps/api/src/plaid/plaid.service.ts`

**Interfaces:**
- Consumes: nothing new from outside this task.
- Produces: `Transaction.categorizedByRuleId: string | null` and `Transaction.categorizedByRule: CategorizationRule | null` (relation), exposed on `GET /transactions` responses. `CategorizationRulesService.matchRule(rules, candidate): CategorizationRule | null` (**signature change** — previously returned `string | null`, the matched category id; now returns the whole matched rule, or `null`). Consumed by Task 2/3's frontend work only indirectly (via the API response shape) — no other backend task depends on this.

- [ ] **Step 1: Add the `categorizedByRuleId` column + relation**

In `apps/api/src/transactions/transaction.entity.ts`, add the import after the existing `ProjectCategory` import (line 8):

```ts
import { CategorizationRule } from '../categorization-rules/categorization-rule.entity';
```

Add this after the existing `receiptId` column (the last field in the class, lines 118-119), right before the closing `}`:

```ts
  /* Set when this transaction's category was applied automatically by a
     CategorizationRule, rather than picked manually — powers the "ruled"
     indicator and lets it be cleared without affecting the category itself. */
  @ManyToOne(() => CategorizationRule, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'categorizedByRuleId' })
  categorizedByRule: CategorizationRule;

  @Column({ type: 'uuid', nullable: true, default: null })
  categorizedByRuleId: string | null;
```

- [ ] **Step 2: Change `matchRule` to return the matched rule, and thread the rule id through `applyToUncategorized`**

In `apps/api/src/categorization-rules/categorization-rules.service.ts`, change `matchRule` (lines 29-39) from:

```ts
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
```

to:

```ts
  /* Picks the rule a new, uncategorized transaction should be categorized by,
     or null. A merchant-type match takes precedence over a name-type match. */
  matchRule(rules: CategorizationRule[], candidate: { merchantName?: string | null; name: string }): CategorizationRule | null {
    const norm = (s: string) => s.trim().toLowerCase();
    if (candidate.merchantName) {
      const m = rules.find((r) => r.matchType === 'merchant' && norm(r.matchValue) === norm(candidate.merchantName!));
      if (m) return m;
    }
    const n = rules.find((r) => r.matchType === 'name' && norm(r.matchValue) === norm(candidate.name));
    return n ?? null;
  }
```

Change `applyToUncategorized` (lines 143-154) from:

```ts
  private async applyToUncategorized(userId: string, matchType: 'merchant' | 'name', matchValue: string, categoryId: string): Promise<number> {
    const column = matchType === 'merchant' ? 'merchantName' : 'name';
    const result = await this.txRepo
      .createQueryBuilder()
      .update(Transaction)
      .set({ categoryId })
      .where('userId = :userId', { userId })
      .andWhere('categoryId IS NULL')
      .andWhere(`LOWER(TRIM("${column}")) = LOWER(:matchValue)`, { matchValue })
      .execute();
    return result.affected ?? 0;
  }
```

to:

```ts
  private async applyToUncategorized(userId: string, matchType: 'merchant' | 'name', matchValue: string, categoryId: string, ruleId: string): Promise<number> {
    const column = matchType === 'merchant' ? 'merchantName' : 'name';
    const result = await this.txRepo
      .createQueryBuilder()
      .update(Transaction)
      .set({ categoryId, categorizedByRuleId: ruleId })
      .where('userId = :userId', { userId })
      .andWhere('categoryId IS NULL')
      .andWhere(`LOWER(TRIM("${column}")) = LOWER(:matchValue)`, { matchValue })
      .execute();
    return result.affected ?? 0;
  }
```

Update both call sites: in `create()` (line 68), change `const appliedCount = await this.applyToUncategorized(userId, matchType, matchValue, categoryId);` to `const appliedCount = await this.applyToUncategorized(userId, matchType, matchValue, categoryId, rule.id);`. In `update()` (line 103), change `const appliedCount = await this.applyToUncategorized(userId, rule.matchType, rule.matchValue, rule.categoryId);` to `const appliedCount = await this.applyToUncategorized(userId, rule.matchType, rule.matchValue, rule.categoryId, rule.id);`.

- [ ] **Step 3: Update the 3 transaction-creation call sites for the new `matchRule` return type**

In `apps/api/src/transactions/transactions.service.ts`, `importCsv`'s row-creation call (lines 188-200) currently reads:

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
```

Change it to:

```ts
      const matchedRule = this.rulesService.matchRule(rules, { name: row.name });
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
          categoryId: matchedRule?.categoryId ?? undefined,
          categorizedByRuleId: matchedRule?.id ?? undefined,
        }),
      );
```

`createManual` (lines 242-259) currently reads:

```ts
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

Change it to:

```ts
    const matchedRule = dto.debtId || dto.categoryId
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
        categoryId: dto.debtId ? undefined : (dto.categoryId ?? matchedRule?.categoryId ?? undefined),
        categorizedByRuleId: dto.debtId || dto.categoryId ? undefined : (matchedRule?.id ?? undefined),
        debtId: dto.debtId ?? undefined,
      }),
    );
```

In `apps/api/src/plaid/plaid.service.ts`, `syncTransactions`'s new-transaction-creation call (lines 153-167) currently reads:

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

Change it to:

```ts
        const matchedRule = this.rulesService.matchRule(rules, { merchantName: pt.merchant_name, name: pt.name });
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
            categoryId: matchedRule?.categoryId ?? undefined,
            categorizedByRuleId: matchedRule?.id ?? undefined,
          }),
        );
```

- [ ] **Step 4: Clear provenance on any manual category change, and expose it on `GET /transactions`**

In `apps/api/src/transactions/transactions.service.ts`'s `updateCategory` (lines 330-356), change:

```ts
    tx.categoryId = categoryId;
    const saved = await this.repo.save(tx);
```

to:

```ts
    tx.categoryId = categoryId;
    tx.categorizedByRuleId = null;
    const saved = await this.repo.save(tx);
```

(This one line covers both "user manually re-picks a category" and "uncategorize this one" — both call this same method with a real `categoryId` or `null` respectively; either way, the category is no longer rule-derived afterward.)

In `findByUser` (lines 86-94), change:

```ts
    const qb = this.repo.createQueryBuilder('tx')
      .leftJoinAndSelect('tx.categoryRef', 'categoryRef')
      .leftJoinAndSelect('tx.bankAccount', 'bankAccount')
      .leftJoinAndSelect('tx.transferAccount', 'transferAccount')
      .where('tx.userId = :userId', { userId })
```

to:

```ts
    const qb = this.repo.createQueryBuilder('tx')
      .leftJoinAndSelect('tx.categoryRef', 'categoryRef')
      .leftJoinAndSelect('tx.bankAccount', 'bankAccount')
      .leftJoinAndSelect('tx.transferAccount', 'transferAccount')
      .leftJoinAndSelect('tx.categorizedByRule', 'categorizedByRule')
      .where('tx.userId = :userId', { userId })
```

- [ ] **Step 5: Build and verify**

Run: `npm run build:api`
Expected: build succeeds with no type errors.

Run `npm run dev:api`, then with a logged-in session cookie:

1. Find (or create) a category and a few uncategorized transactions sharing a merchant/name. `POST /categorization-rules` with `{"transactionId":"<one of them>","categoryId":"<a category id>"}`.
2. `GET /transactions` — confirm the *other* (sibling) transactions that got auto-applied now show `"categorizedByRuleId": "<the rule's id>"` and a populated `"categorizedByRule": {"id": "...", "matchValue": "...", ...}` object. Confirm the *originating* transaction (the one passed as `transactionId` to the POST) also shows `categorizedByRuleId` set — the retroactive bulk-apply and the create-call both stamp it via `applyToUncategorized`/the rule-creation flow, since at rule-creation time the originating transaction's category was already manually set moments before by whatever test-setup you used (this is expected: Task 1 only wires the *backend* field; Task 2/3 add the frontend UX where the originating transaction is deliberately excluded from getting the pin, by not calling `applyToUncategorized` against it a second time — verify this distinction doesn't matter yet, since at this stage the field is just being tracked correctly by the bulk apply, and the frontend nudge doesn't exist yet).
3. `POST /transactions` with `{"name":"<a name matching an active name-type rule>","amount":-5,"date":"2026-08-11"}` (no `categoryId` in the body) — confirm the response has both `categoryId` and `categorizedByRuleId` set to the matching rule.
4. `PATCH /transactions/<id>/category` with `{"categoryId":"<a different category>"}` on a transaction that currently has `categorizedByRuleId` set — confirm the response now has `"categorizedByRuleId": null`.
5. `PATCH /transactions/<id>/category` with `{"categoryId": null}` on a transaction that currently has `categorizedByRuleId` set — confirm the response has both `categoryId` and `categorizedByRuleId` as `null`.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/transactions/transaction.entity.ts apps/api/src/categorization-rules/categorization-rules.service.ts apps/api/src/transactions/transactions.service.ts apps/api/src/plaid/plaid.service.ts
git commit -m "feat(api): track which rule categorized each transaction"
```

---

## Task 2: Frontend — replace the picker checkbox with a post-categorize nudge

**Files:**
- Modify: `apps/web/src/app/transactions/page.tsx`

**Interfaces:**
- Consumes: `POST /categorization-rules` (unchanged), `PATCH /transactions/:id/category` (unchanged response shape — Task 1 only added a field to it).
- Produces: `justCategorizedId: string | null` state, used only within this file. `createRule(tx, categoryId)` keeps its existing signature — this task changes *who calls it* (a new button, not `chooseCategory`), not its internals.

- [ ] **Step 1: Remove the checkbox-in-picker mechanism**

In `apps/web/src/app/transactions/page.tsx`, remove the `pickerMakePermanent` state declaration:

```ts
  const [pickerMakePermanent, setPickerMakePermanent] = useState(false);
```

Remove the effect that resets it:

```ts
  useEffect(() => {
    setPickerMakePermanent(false);
  }, [openPickerId]);
```

Remove the `chooseCategory` function entirely:

```ts
  async function chooseCategory(tx: Transaction, categoryId: string) {
    const makePermanent = pickerMakePermanent;
    const assigned = await assignCategory(tx.id, categoryId);
    if (makePermanent && assigned) {
      await createRule(tx, categoryId);
    }
  }
```

Keep `createRule` exactly as-is (it's reused by Task 2's new button, unchanged internally).

- [ ] **Step 2: Add `justCategorizedId` state and set it from `assignCategory`**

Add the new state right after where `pickerMakePermanent` used to be declared (alongside the other picker-related state, e.g. after `pickerSearch`):

```ts
  const [justCategorizedId, setJustCategorizedId] = useState<string | null>(null);
```

In `assignCategory`, change the end of the function from:

```ts
    setUpdatingId(null);
    return true;
  }
```

to:

```ts
    setUpdatingId(null);
    if (categoryId) {
      setJustCategorizedId(txId);
    } else {
      setJustCategorizedId((prev) => (prev === txId ? null : prev));
    }
    return true;
  }
```

(Every caller of `assignCategory` with a real `categoryId` always passes a non-transfer category — transfer-type picks route through the separate `transferModal` flow instead of calling `assignCategory` directly, so no extra type check is needed here.)

- [ ] **Step 3: Restore the picker's category buttons to call `assignCategory` directly**

Find the "Normal categories" block. The checkbox currently sits right after the block's opening `<>`:

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

Remove the `<label>...</label>` block entirely, so it reads:

```tsx
                                ) : !pickerProjectDrill ? (
                                  /* ── Normal categories ── */
                                  <>
                                    {pickerCats.map((c) => (
```

Inside that same `.map()`, the transfer branch currently has a `pickerMakePermanent` guard:

```tsx
                                        if (isTransfer) {
                                          if (pickerMakePermanent) {
                                            setOpenPickerId(null);
                                            if (ruleToastTimer.current) clearTimeout(ruleToastTimer.current);
                                            setRuleToast({
                                              kind: 'error',
                                              matchLabel: tx.merchantName || tx.name,
                                              reason: "Rules can't be created for transfer categories",
                                            });
                                            ruleToastTimer.current = setTimeout(() => setRuleToast(null), 6000);
                                            return;
                                          }
                                          setOpenPickerId(null);
                                          setTransferModal({ tx, categoryId: c.id });
```

Remove the guard block, so it reads:

```tsx
                                        if (isTransfer) {
                                          setOpenPickerId(null);
                                          setTransferModal({ tx, categoryId: c.id });
```

Further down in the same handler, change:

```ts
                                        } else {
                                          chooseCategory(tx, c.id);
                                        }
```

to:

```ts
                                        } else {
                                          assignCategory(tx.id, c.id);
                                        }
```

In the secondary-type list right below (`pickerCatsAlt.map`), change:

```tsx
                                          <button key={c.id} onClick={() => chooseCategory(tx, c.id)}
```

to:

```tsx
                                          <button key={c.id} onClick={() => assignCategory(tx.id, c.id)}
```

- [ ] **Step 4: Render the "Make permanent" nudge on the row**

Find where the category-picker's wrapper `<div className="relative shrink-0">...</div>` closes — it's immediately followed by a `{/* Find receipt in email */}` comment. Insert this new block between them:

```tsx
                          {/* Make this categorization permanent (nudge right after a manual pick) */}
                          {justCategorizedId === tx.id && tx.categoryId && (
                            <div className="flex items-center gap-1 shrink-0">
                              <button
                                onClick={() => { setJustCategorizedId(null); createRule(tx, tx.categoryId!); }}
                                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all hover:brightness-110"
                                style={{ background: 'color-mix(in srgb, var(--color-card-violet) 15%, transparent)', border: '1px solid color-mix(in srgb, var(--color-card-violet) 35%, transparent)', color: 'var(--color-card-violet)' }}>
                                📌 Make permanent
                              </button>
                              <button
                                onClick={() => setJustCategorizedId(null)}
                                className="w-6 h-6 rounded-lg flex items-center justify-center transition-colors hover:bg-[var(--color-elevated)] shrink-0"
                                style={{ color: 'var(--color-text-muted)' }} title="Dismiss">
                                <CloseIcon />
                              </button>
                            </div>
                          )}

                          {/* Find receipt in email */}
```

(`CloseIcon` is already defined later in this same file and used by the existing import/rule toasts — no new import needed.)

- [ ] **Step 5: Verify it compiles and behaves correctly**

Run: `npm run build:web`
Expected: build succeeds, no type errors.

Manually: `npm run dev:web`, open `/transactions`:
- Categorize an uncategorized transaction via the picker (no checkbox exists anymore — just pick a category like before this whole feature existed). Confirm the row shows the new "📌 Make permanent" button + a dismiss (×) right next to the category chip.
- Click "Make permanent" — confirm it creates the rule (existing toast behavior: created/duplicate/error) and the nudge disappears from that row.
- On a different transaction, categorize it, then click the dismiss (×) instead — confirm the nudge disappears and no rule was created (check the Settings Rules tab or `GET /categorization-rules`).
- Pick a transfer category on a transaction — confirm no nudge appears (transfer picks route through the separate transfer modal, never call `assignCategory` directly).
- Reload the page — confirm no nudge appears anywhere (it's not persisted).

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/app/transactions/page.tsx
git commit -m "feat(web): replace picker checkbox with post-categorize permanent-rule nudge"
```

---

## Task 3: Frontend — rule-provenance pin + revert menu

**Files:**
- Modify: `apps/web/src/app/transactions/page.tsx`

**Interfaces:**
- Consumes: `tx.categorizedByRuleId` / `tx.categorizedByRule` (Task 1's API addition), `assignCategory` (existing), `DELETE /categorization-rules/:id` (existing endpoint, previously only called from Settings).
- Produces: no new exports — this task only adds JSX/state/handlers local to this file.

- [ ] **Step 1: Add the new fields to the `Transaction` interface**

Change the `Transaction` interface (currently):

```ts
interface Transaction {
  id: string; name: string; merchantName: string | null; amount: number; date: string; source: string; pending: boolean;
  categoryId: string | null; categoryRef: Category | null;
  bankAccountId: string; bankAccount: BankAccount | null;
  projectId: string | null;
  projectCategoryId: string | null;
  transferAccountId: string | null;
  transferAccount: BankAccount | null;
  counterpartTxId: string | null;
  debtId: string | null;
  parentId: string | null;
  isSplitParent: boolean;
  note: string | null;
  receiptId: string | null;
}
```

to:

```ts
interface Transaction {
  id: string; name: string; merchantName: string | null; amount: number; date: string; source: string; pending: boolean;
  categoryId: string | null; categoryRef: Category | null;
  bankAccountId: string; bankAccount: BankAccount | null;
  projectId: string | null;
  projectCategoryId: string | null;
  transferAccountId: string | null;
  transferAccount: BankAccount | null;
  counterpartTxId: string | null;
  debtId: string | null;
  parentId: string | null;
  isSplitParent: boolean;
  note: string | null;
  receiptId: string | null;
  categorizedByRuleId: string | null;
  categorizedByRule: { id: string; matchValue: string } | null;
}
```

- [ ] **Step 2: Add state and outside-click handling for the pin's dropdown**

Add these state declarations alongside the other picker-adjacent state (e.g. right after `justCategorizedId`):

```ts
  const [ruleMenuTxId, setRuleMenuTxId] = useState<string | null>(null);
  const [ruleMenuPos, setRuleMenuPos]   = useState<{ top: number; left: number } | null>(null);
  const [deletingRuleId, setDeletingRuleId] = useState<string | null>(null);
  const ruleMenuRef = useRef<HTMLDivElement>(null);
```

Add a new effect (its own, separate from the existing picker-close effect) right after that existing outside-click effect:

```ts
  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (ruleMenuTxId && ruleMenuRef.current && !ruleMenuRef.current.contains(e.target as Node)) {
        setRuleMenuTxId(null);
      }
    }
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [ruleMenuTxId]);
```

- [ ] **Step 3: Add the revert-menu action handlers**

Add these functions near `createRule` (e.g. right after it):

```ts
  async function uncategorizeOne(tx: Transaction) {
    setRuleMenuTxId(null);
    await assignCategory(tx.id, null);
  }

  async function deleteRuleFromRow(tx: Transaction) {
    if (!tx.categorizedByRuleId) return;
    setDeletingRuleId(tx.categorizedByRuleId);
    setRuleMenuTxId(null);
    await fetch(`${API}/categorization-rules/${tx.categorizedByRuleId}`, { method: 'DELETE', credentials: 'include' });
    setDeletingRuleId(null);
    loadTransactions();
  }
```

- [ ] **Step 4: Render the pin + dropdown**

Right after the "Make permanent" nudge block added in Task 2 (and before the `{/* Find receipt in email */}` comment), add:

```tsx
                          {/* Rule-provenance indicator */}
                          {tx.categorizedByRuleId && (
                            <button
                              onClick={(e) => {
                                if (ruleMenuTxId === tx.id) { setRuleMenuTxId(null); return; }
                                const rect = (e.currentTarget as HTMLButtonElement).getBoundingClientRect();
                                setRuleMenuPos({ top: rect.bottom + 4, left: Math.max(4, rect.right - 180) });
                                setRuleMenuTxId(tx.id);
                              }}
                              title={tx.categorizedByRule ? `Categorized by rule: ${tx.categorizedByRule.matchValue}` : 'Categorized by a rule'}
                              className="w-7 h-7 rounded-lg flex items-center justify-center text-sm transition-colors hover:bg-[var(--color-elevated)] shrink-0">
                              📌
                            </button>
                          )}

                          {ruleMenuTxId === tx.id && ruleMenuPos && createPortal(
                            <div ref={ruleMenuRef} className="py-1 rounded-xl overflow-hidden"
                              style={{ ...glass, position: 'fixed', top: ruleMenuPos.top, left: ruleMenuPos.left, width: '180px', zIndex: 9999 }}>
                              <button onClick={() => uncategorizeOne(tx)}
                                className="w-full flex items-center gap-2 px-3 py-2 text-xs text-left transition-colors hover:bg-[var(--color-elevated)]"
                                style={{ color: 'var(--color-text-secondary)' }}>
                                Uncategorize this one
                              </button>
                              <button onClick={() => deleteRuleFromRow(tx)} disabled={deletingRuleId === tx.categorizedByRuleId}
                                className="w-full flex items-center gap-2 px-3 py-2 text-xs text-left transition-colors hover:bg-red-500/20 disabled:opacity-40"
                                style={{ color: 'var(--color-rose)' }}>
                                {deletingRuleId === tx.categorizedByRuleId ? 'Deleting rule…' : 'Delete the rule'}
                              </button>
                            </div>,
                            document.body
                          )}

                          {/* Find receipt in email */}
```

- [ ] **Step 5: Verify it compiles and behaves correctly**

Run: `npm run build:web`
Expected: build succeeds, no type errors.

Manually: `npm run dev:web`, open `/transactions`:
- Categorize a transaction and click "Make permanent" so a rule exists. Confirm sibling transactions with the same merchant/name that get auto-categorized now show the 📌 pin, and the *originating* row (the one you manually picked) does **not** show a pin (its `categorizedByRuleId` stays `null` — only `applyToUncategorized`-touched rows and future rule-matched rows get stamped, not the transaction the rule was created *from*).
- Click a pin — confirm the dropdown shows "Uncategorize this one" and "Delete the rule", positioned correctly near the pin and not clipped by the scrollable list.
- Click "Uncategorize this one" — confirm that row goes back to uncategorized and its pin disappears; other rule-categorized rows are unaffected.
- Click a different pin → "Delete the rule" — confirm the Settings Rules tab no longer lists it, every transaction it had categorized keeps its category, and all their pins disappear (list refetches).
- Manually re-categorize a pinned row to a different category — confirm its pin disappears (and, per Task 2, a fresh "Make permanent" nudge appears for the new pick).
- Reload the page — confirm pins persist correctly (driven by the API's `categorizedByRuleId`, not local-only state).

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/app/transactions/page.tsx
git commit -m "feat(web): add rule-provenance indicator with uncategorize/delete-rule menu"
```

---

## Task 4: Full manual verification pass

**Files:** none (verification only).

- [ ] **Step 1: Run the full build suite**

```bash
npm run build:api
npm run build:web
```

Expected: both succeed with no errors.

- [ ] **Step 2: Walk the spec's testing checklist**

With `npm run dev:api` and `npm run dev:web` running, in the browser:

1. Manually categorize an uncategorized transaction → confirm the "Make permanent" button appears on that row and only that row.
2. Click it → confirm the rule is created, sibling uncategorized transactions with the same merchant get auto-categorized, and the *originating* row does NOT show the pin (it was a manual pick), while the *sibling* rows now DO show the pin.
3. Dismiss the nudge on a different row without clicking it → confirm it disappears and no rule is created.
4. Reload the page → confirm pins persist on rule-categorized rows, and no nudge reappears anywhere.
5. Click a pin → "Uncategorize this one" → confirm that transaction goes back to uncategorized and its pin disappears, while other rule-categorized transactions are unaffected.
6. Click a pin → "Delete the rule" → confirm the Settings Rules tab no longer lists it, all transactions it had categorized keep their category, and all of their pins disappear.
7. Manually re-categorize a pinned row to a different category → confirm its pin disappears and a fresh "Make permanent" nudge appears for the new category.
8. Confirm no nudge appears when assigning a transfer category, and that assigning one still works exactly as before (opens the transfer modal normally).
9. Resize to a mobile width — confirm the nudge button/dismiss and the pin/dropdown remain usable and don't overflow the row, per this repo's responsive-design requirement.

- [ ] **Step 3: Fix anything that doesn't match, then commit if any fixes were needed**

If Step 2 surfaces issues, fix them, re-run Step 1, and commit:

```bash
git add apps/api apps/web
git commit -m "fix: polish post-categorize rule trigger after manual verification"
```

(Skip this step entirely if Step 2 found nothing to fix.)
