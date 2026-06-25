# Transaction Note Field & Cross-Type Category Picker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an optional `note` field to manual transactions (stored, displayed in the list as a subtitle), and group the income category picker so expense categories appear below a divider for use as reimbursement offsets.

**Architecture:** TypeORM `synchronize: true` handles the DB column automatically — no migration file needed, just add the entity column and restart the API. The category grouping is purely a frontend rendering change; no API work required. All changes live in three files: the Transaction entity, the transactions controller/service (backend), and the transactions page (frontend).

**Tech Stack:** NestJS 11, TypeORM with `synchronize: true`, Next.js 16, React 19, Tailwind v4, TypeScript.

## Global Constraints

- No test runner is configured — verify each task by running the app and exercising the feature manually.
- TypeORM `synchronize: true` is enabled — adding a column to the entity is sufficient; no migration file needed.
- `note` is optional and nullable everywhere — never required, never validated beyond `maxLength={500}` on the input.
- The expense category picker (negative transactions) must remain unchanged — only the income picker gets the grouped layout.
- Commit after each task.

---

### Task 1: API — Add `note` to Transaction entity, controller, and service

**Files:**
- Modify: `apps/api/src/transactions/transaction.entity.ts`
- Modify: `apps/api/src/transactions/transactions.controller.ts:42`
- Modify: `apps/api/src/transactions/transactions.service.ts:227-258`

**Interfaces:**
- Produces: `Transaction.note: string | null` persisted and returned in all transaction responses (TypeORM relations are already loaded in `createManual`'s final `findOne`).

---

- [ ] **Step 1: Add `note` column to the Transaction entity**

  In `apps/api/src/transactions/transaction.entity.ts`, add after the `isSplitParent` column (line 102):

  ```typescript
  @Column({ type: 'varchar', length: 500, nullable: true, default: null })
  note: string | null;
  ```

  Full entity after edit (the new column goes before the closing `}`):

  ```typescript
  @Column({ default: false })
  isSplitParent: boolean;

  @Column({ type: 'varchar', length: 500, nullable: true, default: null })
  note: string | null;
  }
  ```

- [ ] **Step 2: Add `note` to the controller's POST body type**

  In `apps/api/src/transactions/transactions.controller.ts`, find the `@Post()` handler (line 41-44):

  ```typescript
  @Post()
  create(@Request() req: any, @Body() body: { name: string; amount: number; date: string; bankAccountId?: string | null; categoryId?: string | null; debtId?: string | null }) {
    return this.service.createManual(req.user.id, body);
  }
  ```

  Change it to:

  ```typescript
  @Post()
  create(@Request() req: any, @Body() body: { name: string; amount: number; date: string; bankAccountId?: string | null; categoryId?: string | null; debtId?: string | null; note?: string | null }) {
    return this.service.createManual(req.user.id, body);
  }
  ```

- [ ] **Step 3: Add `note` to `createManual()` in the service**

  In `apps/api/src/transactions/transactions.service.ts`, find `createManual` (line 227). Update the DTO type signature:

  ```typescript
  async createManual(userId: string, dto: {
    name: string; amount: number; date: string;
    bankAccountId?: string | null; categoryId?: string | null; debtId?: string | null;
    note?: string | null;
  }): Promise<Transaction> {
  ```

  Then inside `this.repo.create({...})`, add `note` after the `pending` line:

  ```typescript
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

- [ ] **Step 4: Add `note` to the PATCH controller endpoint**

  In `apps/api/src/transactions/transactions.controller.ts`, find the `@Patch(':id')` handler. Update its body type to include `note`:

  ```typescript
  @Patch(':id')
  update(
    @Param('id') id: string,
    @Request() req: any,
    @Body() body: { name?: string; amount?: number; date?: string; bankAccountId?: string | null; note?: string | null },
  ) {
    return this.service.updateManual(id, req.user.id, body);
  }
  ```

- [ ] **Step 5: Add `note` to `updateManual()` in the service**

  In `apps/api/src/transactions/transactions.service.ts`, find `updateManual` (~line 260). Update its DTO type:

  ```typescript
  async updateManual(id: string, userId: string, dto: {
    name?: string; amount?: number; date?: string; bankAccountId?: string | null; note?: string | null;
  }): Promise<Transaction> {
  ```

  Then add `note` handling after the `dto.date` check:

  ```typescript
  if (dto.name !== undefined) tx.name = dto.name;
  if (dto.amount !== undefined) tx.amount = dto.amount;
  if (dto.date !== undefined) tx.date = dto.date;
  if (dto.note !== undefined) tx.note = dto.note ?? null;
  ```

- [ ] **Step 6: Restart the API and verify the column is created**

  ```bash
  npm run dev:api
  ```

  Check the logs — TypeORM will log `ALTER TABLE "transactions" ADD "note" character varying(500)` (or similar). No error = column created.

- [ ] **Step 7: Verify via curl**

  ```bash
  curl -s -X POST http://localhost:3333/api/transactions \
    -H "Content-Type: application/json" \
    --cookie "access_token=<your_token>" \
    -d '{"name":"Test note","amount":10,"date":"2026-06-25","bankAccountId":"<any_valid_id>","note":"This is a test note"}' \
    | grep -o '"note":"[^"]*"'
  ```

  Expected output: `"note":"This is a test note"`

- [ ] **Step 8: Commit**

  ```bash
  git add apps/api/src/transactions/transaction.entity.ts \
          apps/api/src/transactions/transactions.controller.ts \
          apps/api/src/transactions/transactions.service.ts
  git commit -m "feat(transactions): add note field to entity, create, and update endpoints"
  ```

---

### Task 2: Frontend — Note field in the manual form and transaction list

**Files:**
- Modify: `apps/web/src/app/transactions/page.tsx`

**Interfaces:**
- Consumes: `Transaction.note: string | null` returned by the API (Task 1).
- Changes touch: `Transaction` interface (line 22), `manualTx` state (line 132), `saveManualTx` function (line 328), the edit pre-population block (line 1861), the transaction list name block (line 1194), the form UI section (after category picker, ~line 2167).

---

- [ ] **Step 1: Add `note` to the `Transaction` interface**

  Find the `Transaction` interface at line 22:

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
    parentId: string | null;
    isSplitParent: boolean;
  }
  ```

  Add `note` after `isSplitParent`:

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
    parentId: string | null;
    isSplitParent: boolean;
    note: string | null;
  }
  ```

- [ ] **Step 2: Add `note` to `manualTx` state**

  Find line 132:

  ```typescript
  const [manualTx, setManualTx] = useState({ name: '', amountStr: '', sign: '-' as '+' | '-', date: today, bankAccountId: '', categoryId: '', debtId: '' });
  ```

  Add `note: ''`:

  ```typescript
  const [manualTx, setManualTx] = useState({ name: '', amountStr: '', sign: '-' as '+' | '-', date: today, bankAccountId: '', categoryId: '', debtId: '', note: '' });
  ```

- [ ] **Step 3: Include `note` in both the POST and PATCH bodies of `saveManualTx`**

  **PATCH body** (edit flow, ~line 342):

  ```typescript
  body: JSON.stringify({ name: manualTx.name, amount: finalAmount, date: manualTx.date, bankAccountId: manualTx.bankAccountId }),
  ```

  Change to:

  ```typescript
  body: JSON.stringify({ name: manualTx.name, amount: finalAmount, date: manualTx.date, bankAccountId: manualTx.bankAccountId, note: manualTx.note || null }),
  ```

  **POST body** (create flow, ~line 356):

  ```typescript
  body: JSON.stringify({
    name: manualTx.name,
    amount: finalAmount,
    date: manualTx.date,
    bankAccountId: manualTx.bankAccountId,
    categoryId: manualTx.debtId ? null : (manualTx.categoryId || null),
    debtId: manualTx.debtId || null,
  }),
  ```

  Add `note`:

  ```typescript
  body: JSON.stringify({
    name: manualTx.name,
    amount: finalAmount,
    date: manualTx.date,
    bankAccountId: manualTx.bankAccountId,
    categoryId: manualTx.debtId ? null : (manualTx.categoryId || null),
    debtId: manualTx.debtId || null,
    note: manualTx.note || null,
  }),
  ```

- [ ] **Step 4: Reset `note` in all `setManualTx` reset calls**

  There are two reset calls — after edit save (~line 349) and after create save (~line 369). Both currently read:

  ```typescript
  setManualTx({ name: '', amountStr: '', sign: '-', date: today, bankAccountId: '', categoryId: '', debtId: '' });
  ```

  Update both to include `note: ''`:

  ```typescript
  setManualTx({ name: '', amountStr: '', sign: '-', date: today, bankAccountId: '', categoryId: '', debtId: '', note: '' });
  ```

- [ ] **Step 5: Pre-populate `note` when opening edit form**

  Find the edit pre-population block (~line 1861):

  ```typescript
  setManualTx({
    name: tx.name,
    amountStr: String(absAmt),
    sign: Number(tx.amount) >= 0 ? '+' : '-',
    date: tx.date,
    bankAccountId: tx.bankAccountId ?? '',
    categoryId: tx.categoryId ?? '',
    debtId: tx.debtId ?? '',
  });
  ```

  Add `note`:

  ```typescript
  setManualTx({
    name: tx.name,
    amountStr: String(absAmt),
    sign: Number(tx.amount) >= 0 ? '+' : '-',
    date: tx.date,
    bankAccountId: tx.bankAccountId ?? '',
    categoryId: tx.categoryId ?? '',
    debtId: tx.debtId ?? '',
    note: tx.note ?? '',
  });
  ```

- [ ] **Step 6: Add the `note` input field to the form UI**

  Find the closing `</div>` of the form body section, just before the footer (`{/* Footer */}`) at ~line 2169-2172:

  ```tsx
                  </div>

                </div>

                {/* Footer */}
  ```

  Insert the note field between the category picker's `</div>` and the outer `</div>`:

  ```tsx
                  </div>

                  {/* Note */}
                  <div className="flex flex-col gap-1.5">
                    <span className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'var(--color-text-muted)' }}>
                      Note <span style={{ opacity: 0.5, textTransform: 'none', letterSpacing: 0 }}>(optional)</span>
                    </span>
                    <input
                      type="text"
                      placeholder="Add a note…"
                      maxLength={500}
                      value={manualTx.note}
                      onChange={(e) => setManualTx((f) => ({ ...f, note: e.target.value }))}
                      className="px-3 py-2.5 text-sm outline-none rounded-xl w-full"
                      style={{ background: 'var(--color-elevated)', border: '1px solid var(--color-border)', color: 'var(--color-text-primary)' }}
                    />
                  </div>

                </div>

                {/* Footer */}
  ```

- [ ] **Step 7: Show `note` as subtitle in the transaction list**

  Find the transaction name block in the list at line 1193-1194:

  ```tsx
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium truncate leading-snug">{tx.name}</p>
  ```

  Add the note subtitle after the `<p>`:

  ```tsx
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium truncate leading-snug">{tx.name}</p>
                                {tx.note && (
                                  <p className="text-[11px] truncate leading-snug" style={{ color: 'var(--color-text-muted)' }}>{tx.note}</p>
                                )}
  ```

- [ ] **Step 8: Verify manually**

  - Start both API and web dev server.
  - Open the manual transaction form, add a note to a new income transaction. Submit.
  - Check the transaction list — the note should appear as a muted subtitle under the name.
  - Open the edit form for that transaction — the note should be pre-filled.
  - Submit a transaction without a note — no subtitle rendered.

- [ ] **Step 9: Commit**

  ```bash
  git add apps/web/src/app/transactions/page.tsx
  git commit -m "feat(transactions): add note field to manual form and display in list"
  ```

---

### Task 3: Frontend — Grouped income category picker

**Files:**
- Modify: `apps/web/src/app/transactions/page.tsx`

**Interfaces:**
- Consumes: `categories` array with `type: 'expense' | 'income' | 'both' | 'transfer'` (already loaded, no changes needed).

---

- [ ] **Step 1: Split `catOptions` into two groups for income**

  Find line 2000 inside the manual transaction modal's IIFE:

  ```typescript
  const catOptions = categories.filter((c) => c.type === (isExpense ? 'expense' : 'income') || c.type === 'both');
  ```

  Replace with:

  ```typescript
  const catOptions = isExpense
    ? categories.filter((c) => c.type === 'expense' || c.type === 'both')
    : null;
  const incomePrimary = !isExpense
    ? categories.filter((c) => c.type === 'income' || c.type === 'both')
    : null;
  const incomeSecondary = !isExpense
    ? categories.filter((c) => c.type === 'expense')
    : null;
  ```

- [ ] **Step 2: Update the category list rendering to use the grouped options**

  Find the block that renders category options in the dropdown (~line 2154-2164):

  ```tsx
                          {catOptions.map((c) => (
                            <button key={c.id} type="button"
                              onClick={() => { setManualTx((f) => ({ ...f, categoryId: c.id })); setManualCatOpen(false); }}
                              className="w-full flex items-center gap-2.5 px-3 py-2.5 text-sm transition-colors"
                              style={{ background: manualTx.categoryId === c.id ? `${c.color}18` : 'transparent', color: manualTx.categoryId === c.id ? c.color : 'var(--color-text-primary)' }}
                              onMouseEnter={(e) => (e.currentTarget.style.background = `${c.color}12`)}
                              onMouseLeave={(e) => (e.currentTarget.style.background = manualTx.categoryId === c.id ? `${c.color}18` : 'transparent')}>
                              <span className="w-6 h-6 rounded-lg flex items-center justify-center text-sm shrink-0" style={{ background: `${c.color}20` }}>{c.icon}</span>
                              <span className="font-medium">{c.name}</span>
                            </button>
                          ))}
  ```

  Replace with:

  ```tsx
                          {isExpense ? (
                            catOptions!.map((c) => (
                              <button key={c.id} type="button"
                                onClick={() => { setManualTx((f) => ({ ...f, categoryId: c.id })); setManualCatOpen(false); }}
                                className="w-full flex items-center gap-2.5 px-3 py-2.5 text-sm transition-colors"
                                style={{ background: manualTx.categoryId === c.id ? `${c.color}18` : 'transparent', color: manualTx.categoryId === c.id ? c.color : 'var(--color-text-primary)' }}
                                onMouseEnter={(e) => (e.currentTarget.style.background = `${c.color}12`)}
                                onMouseLeave={(e) => (e.currentTarget.style.background = manualTx.categoryId === c.id ? `${c.color}18` : 'transparent')}>
                                <span className="w-6 h-6 rounded-lg flex items-center justify-center text-sm shrink-0" style={{ background: `${c.color}20` }}>{c.icon}</span>
                                <span className="font-medium">{c.name}</span>
                              </button>
                            ))
                          ) : (
                            <>
                              {incomePrimary!.map((c) => (
                                <button key={c.id} type="button"
                                  onClick={() => { setManualTx((f) => ({ ...f, categoryId: c.id })); setManualCatOpen(false); }}
                                  className="w-full flex items-center gap-2.5 px-3 py-2.5 text-sm transition-colors"
                                  style={{ background: manualTx.categoryId === c.id ? `${c.color}18` : 'transparent', color: manualTx.categoryId === c.id ? c.color : 'var(--color-text-primary)' }}
                                  onMouseEnter={(e) => (e.currentTarget.style.background = `${c.color}12`)}
                                  onMouseLeave={(e) => (e.currentTarget.style.background = manualTx.categoryId === c.id ? `${c.color}18` : 'transparent')}>
                                  <span className="w-6 h-6 rounded-lg flex items-center justify-center text-sm shrink-0" style={{ background: `${c.color}20` }}>{c.icon}</span>
                                  <span className="font-medium">{c.name}</span>
                                </button>
                              ))}
                              {incomeSecondary!.length > 0 && (
                                <>
                                  <p className="px-3 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--color-text-muted)' }}>Expense categories</p>
                                  {incomeSecondary!.map((c) => (
                                    <button key={c.id} type="button"
                                      onClick={() => { setManualTx((f) => ({ ...f, categoryId: c.id })); setManualCatOpen(false); }}
                                      className="w-full flex items-center gap-2.5 px-3 py-2.5 text-sm transition-colors"
                                      style={{ background: manualTx.categoryId === c.id ? `${c.color}18` : 'transparent', color: manualTx.categoryId === c.id ? c.color : 'var(--color-text-primary)' }}
                                      onMouseEnter={(e) => (e.currentTarget.style.background = `${c.color}12`)}
                                      onMouseLeave={(e) => (e.currentTarget.style.background = manualTx.categoryId === c.id ? `${c.color}18` : 'transparent')}>
                                      <span className="w-6 h-6 rounded-lg flex items-center justify-center text-sm shrink-0" style={{ background: `${c.color}20` }}>{c.icon}</span>
                                      <span className="font-medium">{c.name}</span>
                                    </button>
                                  ))}
                                </>
                              )}
                            </>
                          )}
  ```

- [ ] **Step 3: Verify manually**

  - Open the manual form and set it to **Income**.
  - Open the category dropdown — income/both categories should appear first, then an "Expense categories" label, then all expense categories below.
  - Select "Food & Dining" (an expense category) for an income transaction and save — it should save correctly.
  - Switch to **Expense** mode and open the dropdown — only expense/both categories should appear, no divider, no income categories.

- [ ] **Step 4: Commit**

  ```bash
  git add apps/web/src/app/transactions/page.tsx
  git commit -m "feat(transactions): show expense categories in income picker for reimbursements"
  ```
