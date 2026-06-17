# Debt-Payment Transactions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a manual income transaction be tagged as a repayment of a specific open debt — recording a linked `DebtPayment` (reducing the debt's remaining and the net-worth receivable) and excluding the transaction from income/expense totals.

**Architecture:** Add `Transaction.debtId` + `DebtPayment.transactionId`. `DebtsService` (exported) gains `recordPaymentFromTransaction` / `removePaymentByTransaction`; `TransactionsService` injects it (one-way `TransactionsModule → DebtsModule`). `createManual` creates the linked payment; `deleteManual` removes it. Frontend: the manual modal offers open debts as a "Debt repayment" option (income only); both the dashboard and transactions page exclude `debtId` transactions from totals (same as transfers); the Debts page shows transaction-sourced payments read-only.

**Tech Stack:** NestJS 11, TypeORM, Next.js 16, Tailwind v4. No test runner — verify via `tsc` + `npm run build:*` + local API smoke + manual. **Commit locally; do NOT push** (user batches pushes).

---

### Task 1: Schema — link columns

**Files:**
- Modify: `apps/api/src/transactions/transaction.entity.ts`
- Modify: `apps/api/src/debts/debt-payment.entity.ts`

- [ ] **Step 1: Add `debtId` to Transaction.** After the `category` column block in `transaction.entity.ts`, add:
```ts
  /* Set when this transaction is a repayment of a debt (excluded from income/expense). */
  @Column({ type: 'varchar', nullable: true })
  debtId: string | null;
```

- [ ] **Step 2: Add `transactionId` to DebtPayment.** In `debt-payment.entity.ts`, after the `note` column add:
```ts
  /* Set when this payment was created from a manual transaction (managed by it). */
  @Column({ type: 'varchar', nullable: true }) transactionId: string | null;
```

- [ ] **Step 3: Type-check**

Run: `npx tsc -p apps/api/tsconfig.app.json --noEmit`
Expected: no errors. (Both entities are already registered in `database.config.ts`; `synchronize` adds the columns.)

- [ ] **Step 4: Commit (local only)**
```bash
git add apps/api/src/transactions/transaction.entity.ts apps/api/src/debts/debt-payment.entity.ts
git commit -m "feat(api): Transaction.debtId + DebtPayment.transactionId link columns"
```

---

### Task 2: DebtsService — payment-from-transaction methods + export

**Files:**
- Modify: `apps/api/src/debts/debts.service.ts`
- Modify: `apps/api/src/debts/debts.module.ts`

- [ ] **Step 1: Add two public methods** to `DebtsService` (they reuse the existing private `owned` and `recomputeStatus`). Add after `sendStatement`:
```ts
  async recordPaymentFromTransaction(debtId: string, userId: string, p: { amount: number; date: string; transactionId: string }): Promise<void> {
    await this.owned(debtId, userId); // throws NotFound/Forbidden if not the user's debt
    await this.payments.save(this.payments.create({ debtId, amount: p.amount, date: p.date, transactionId: p.transactionId }));
    await this.recomputeStatus(debtId, userId);
  }

  async removePaymentByTransaction(transactionId: string): Promise<void> {
    const payment = await this.payments.findOneBy({ transactionId });
    if (!payment) return;
    const debt = await this.debts.findOneBy({ id: payment.debtId });
    await this.payments.delete({ transactionId });
    if (debt) await this.recomputeStatus(debt.id, debt.userId);
  }
```

- [ ] **Step 2: Export DebtsService** from `debts.module.ts` — add `exports: [DebtsService]` to the `@Module` decorator:
```ts
@Module({
  imports: [TypeOrmModule.forFeature([Debt, DebtPayment]), MailModule],
  controllers: [DebtsController],
  providers: [DebtsService],
  exports: [DebtsService],
})
export class DebtsModule {}
```

- [ ] **Step 3: Type-check**

Run: `npx tsc -p apps/api/tsconfig.app.json --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit (local only)**
```bash
git add apps/api/src/debts/debts.service.ts apps/api/src/debts/debts.module.ts
git commit -m "feat(api): DebtsService methods to record/remove a payment from a transaction"
```

---

### Task 3: TransactionsService — create/delete the linked payment

**Files:**
- Modify: `apps/api/src/transactions/transactions.module.ts`
- Modify: `apps/api/src/transactions/transactions.service.ts`
- Modify: `apps/api/src/transactions/transactions.controller.ts`

- [ ] **Step 1: Wire DebtsModule into TransactionsModule.** In `transactions.module.ts` add `import { DebtsModule } from '../debts/debts.module';` and add `DebtsModule` to the `imports` array.

- [ ] **Step 2: Inject DebtsService** into `TransactionsService`. Add the import `import { DebtsService } from '../debts/debts.service';` and add the constructor parameter `private debtsService: DebtsService,` (alongside the existing repo injections).

- [ ] **Step 3: Handle `debtId` in `createManual`.** Change the dto type to include `debtId?: string | null` and create the linked payment. Replace the method body's save + return with:
```ts
  async createManual(userId: string, dto: {
    name: string; amount: number; date: string;
    bankAccountId?: string | null; categoryId?: string | null; debtId?: string | null;
  }): Promise<Transaction> {
    if (dto.bankAccountId) {
      const account = await this.accountRepo.findOneBy({ id: dto.bankAccountId });
      if (!account || account.userId !== userId) throw new ForbiddenException();
    }
    if (dto.debtId && !(dto.amount > 0)) throw new BadRequestException('A debt repayment must be a positive (income) amount.');
    const saved = await this.repo.save(
      this.repo.create({
        userId,
        bankAccountId: dto.bankAccountId ?? undefined,
        source: 'manual',
        amount: dto.amount,
        name: dto.name,
        date: dto.date,
        pending: false,
        categoryId: dto.debtId ? undefined : (dto.categoryId ?? undefined),
        debtId: dto.debtId ?? undefined,
      }),
    );
    if (dto.debtId) {
      try {
        await this.debtsService.recordPaymentFromTransaction(dto.debtId, userId, { amount: dto.amount, date: dto.date, transactionId: saved.id });
      } catch (e) {
        await this.repo.remove(saved); // don't leave an orphaned tx if the debt was invalid
        throw e;
      }
    }
    return this.repo.findOne({ where: { id: saved.id }, relations: ['categoryRef', 'bankAccount'] });
  }
```
(Ensure `BadRequestException` is imported in this file — it's already used by `deleteManual`.)

- [ ] **Step 4: Remove the linked payment in `deleteManual`.** Right after the `if (tx.source !== 'manual')` guard, add:
```ts
    if (tx.debtId) {
      await this.debtsService.removePaymentByTransaction(tx.id);
    }
```

- [ ] **Step 5: Accept `debtId` in the controller create body.** In `transactions.controller.ts`, widen the `@Post()` handler's body type to include `debtId?: string | null` (the body is forwarded to `createManual`).

- [ ] **Step 6: Build the API** (catches DI cycles)

Run: `npm run build:api`
Expected: `Successfully ran target build for project api`.

- [ ] **Step 7: Commit (local only)**
```bash
git add apps/api/src/transactions/
git commit -m "feat(api): manual tx can record/clear a debt repayment via debtId"
```

---

### Task 4: Local API smoke test

**Files:** none (verification)

- [ ] **Step 1: Start the built API on 3334**
```bash
PORT=3334 RESEND_API_KEY=dummy MAIL_FROM='Cofre <onboarding@resend.dev>' node -r dotenv/config dist/apps/api/main.js > /tmp/cofre-debttx-smoke.log 2>&1 &
curl -s --retry 20 --retry-connrefused --retry-delay 1 -o /dev/null -w "boot %{http_code}\n" http://localhost:3334/api/auth/me
```
Expected: `boot 401`.

- [ ] **Step 2: Create a debt, then a manual income tx linked to it; expect remaining to drop**
```bash
USER_ID=$(psql -h localhost -U postgres -d cofre_budget -tAc "SELECT id FROM users LIMIT 1")
TOKEN=$(node -e "require('dotenv').config();console.log(require('jsonwebtoken').sign({sub:'$USER_ID',email:'t'},process.env.JWT_SECRET,{expiresIn:'5m'}))")
DID=$(curl -s -X POST http://localhost:3334/api/debts -H 'Content-Type: application/json' -b "access_token=$TOKEN" -d '{"borrowerName":"TxSmoke","principal":300}' | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>console.log(JSON.parse(d).id))")
TXID=$(curl -s -X POST http://localhost:3334/api/transactions -H 'Content-Type: application/json' -b "access_token=$TOKEN" -d "{\"name\":\"Repayment\",\"amount\":120,\"date\":\"2026-06-17\",\"debtId\":\"$DID\"}" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>console.log(JSON.parse(d).id))")
echo "after-pay: $(curl -s http://localhost:3334/api/debts/$DID -b "access_token=$TOKEN" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{const r=JSON.parse(d);console.log('remaining',r.remaining,'payments',r.payments.length,'txId',r.payments[0]&&r.payments[0].transactionId)})")"
```
Expected: `remaining 180 payments 1 txId <the tx id>`.

- [ ] **Step 3: Delete the transaction; expect remaining restored to 300**
```bash
curl -s -o /dev/null -X DELETE http://localhost:3334/api/transactions/$TXID -b "access_token=$TOKEN"
echo "after-del: $(curl -s http://localhost:3334/api/debts/$DID -b "access_token=$TOKEN" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{const r=JSON.parse(d);console.log('remaining',r.remaining,'payments',r.payments.length)})")"
```
Expected: `remaining 300 payments 0`.

- [ ] **Step 4: Negative amount with debtId is rejected (expect 400)**
```bash
curl -s -o /dev/null -w "neg %{http_code}\n" -X POST http://localhost:3334/api/transactions -H 'Content-Type: application/json' -b "access_token=$TOKEN" -d "{\"name\":\"bad\",\"amount\":-50,\"date\":\"2026-06-17\",\"debtId\":\"$DID\"}"
```
Expected: `neg 400`.

- [ ] **Step 5: Clean up + stop**
```bash
curl -s -o /dev/null -X DELETE http://localhost:3334/api/debts/$DID -b "access_token=$TOKEN"
PID=$(lsof -nP -iTCP:3334 -sTCP:LISTEN -t 2>/dev/null) && kill "$PID"
```
No commit.

---

### Task 5: Frontend — manual modal offers debts; totals exclude them (transactions page)

**Files:**
- Modify: `apps/web/src/app/transactions/page.tsx`

- [ ] **Step 1: Type + state.** Add `debtId: string | null` to the `Transaction` interface. Add a debts state + type near the other state:
```tsx
  interface DebtLite { id: string; borrowerName: string; remaining: number; status: 'open' | 'paid' }
  const [debts, setDebts] = useState<DebtLite[]>([]);
```
Add `debtId: ''` to the `manualTx` useState initial object, and to wherever `manualTx` is reset (the `setManualTx({...})` resets — include `debtId: ''`).

- [ ] **Step 2: Fetch debts.** Wherever the page loads categories/accounts (the initial `useEffect`/loader), add a fetch:
```tsx
  fetch(`${API}/debts`, { credentials: 'include' }).then(r => r.json()).then(d => setDebts(Array.isArray(d) ? d : [])).catch(() => {});
```
Derive `const openDebts = debts.filter(d => d.status === 'open');`.

- [ ] **Step 3: Exclude debt-payment txs from totals/filters.** Change the `isTransfer` helper (line ~484) to also treat debt payments as excluded (keeps every existing `!isTransfer` exclusion correct):
```tsx
  // Excluded from income/expense (transfers between own accounts, and debt repayments)
  const isTransfer = (t: Transaction) => t.categoryRef?.type === 'transfer' || !!t.debtId;
```

- [ ] **Step 4: Manual picker — offer open debts (income only).** In the manual modal's category dropdown (the `manualCatOpen` block), when `manualTx.sign === '+'` and `openDebts.length > 0`, render a "Debt repayment" group above/below the normal `catOptions`, each row: `{borrowerName} — ${fmt(remaining)} left`. On click: `setManualTx(f => ({ ...f, debtId: d.id, categoryId: '' })); setManualCatOpen(false);`. The dropdown trigger label shows `Debt repayment · {borrower}` when `manualTx.debtId` is set (look up the debt by id). Switching the type toggle to `-`/expense already clears `categoryId`; also clear `debtId` there: in both `setManualTx((f) => ({ ...f, sign: '-', categoryId: '' }))` handlers add `debtId: ''`.

- [ ] **Step 5: Submit `debtId`.** In `saveManualTx`, include `debtId` in the POST body when set:
```tsx
          debtId: manualTx.debtId || null,
```
(added to the existing `JSON.stringify({ name, amount, date, bankAccountId, categoryId })` object).

- [ ] **Step 6: List label.** Where a transaction row renders its category, if `t.debtId` is set show `Debt repayment · {borrowerName}` (look up `debts.find(d => d.id === t.debtId)?.borrowerName`) with the muted/transfer-like styling instead of the normal category.

- [ ] **Step 7: Type-check + build**

Run: `npx tsc -p apps/web/tsconfig.json --noEmit && npm run build:web`
Expected: build succeeds.

- [ ] **Step 8: Commit (local only)**
```bash
git add apps/web/src/app/transactions/page.tsx
git commit -m "feat(web): tag a manual income tx as a debt repayment"
```

---

### Task 6: Frontend — dashboard excludes debt-payment txs

**Files:**
- Modify: `apps/web/src/app/dashboard/page.tsx`

- [ ] **Step 1: Type + exclusion.** Add `debtId?: string | null` to the dashboard `Transaction` interface. Change the `isTransfer` helper (line ~149) to also exclude debt payments:
```tsx
  // Excluded from income/expense (transfers + debt repayments)
  const isTransfer   = (t: Transaction) => t.categoryRef?.type === 'transfer' || !!t.debtId;
```
All existing `!isTransfer(t)` filters (income, expenses, prevInc/prevExp, trends, breakdowns) then correctly drop debt-payment transactions.

- [ ] **Step 2: Type-check + build**

Run: `npx tsc -p apps/web/tsconfig.json --noEmit && npm run build:web`
Expected: build succeeds.

- [ ] **Step 3: Commit (local only)**
```bash
git add apps/web/src/app/dashboard/page.tsx
git commit -m "fix(web): exclude debt-repayment txs from dashboard income/expense"
```

---

### Task 7: Frontend — Debts page marks transaction-sourced payments read-only

**Files:**
- Modify: `apps/web/src/app/debts/page.tsx`

- [ ] **Step 1: Type.** Add `transactionId: string | null` to the `Payment` interface.

- [ ] **Step 2: Read-only display.** In the payment-history rows, when `p.transactionId` is set, show a small muted "via transaction" tag and **hide the ✕ delete button** (those are managed by deleting the transaction). The existing manual `deletePayment(p.id)` ✕ renders only when `!p.transactionId`:
```tsx
                                  {p.transactionId
                                    ? <span className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>via transaction</span>
                                    : <button onClick={() => deletePayment(p.id)} className="hover:opacity-70" style={{ color: 'var(--color-text-muted)' }}>✕</button>}
```
(replacing the current unconditional ✕ button next to the amount).

- [ ] **Step 3: Type-check + build**

Run: `npx tsc -p apps/web/tsconfig.json --noEmit && npm run build:web`
Expected: build succeeds.

- [ ] **Step 4: Commit (local only)**
```bash
git add apps/web/src/app/debts/page.tsx
git commit -m "feat(web): show transaction-sourced debt payments read-only"
```

---

### Task 8: Manual verification (after the user pushes)

**Files:** none (user-run; no new secrets — deploys via existing pipeline when the user chooses to push)

- [ ] **Step 1:** On the live site: create a debt with a borrower. On **Transactions → + New**, switch to **Income**, enter an amount, open the category picker → a **"Debt repayment"** group lists the open debt → select it → save.
- [ ] **Step 2:** The transaction appears labelled "Debt repayment · <borrower>"; the **Debts page** shows the payment (remaining dropped) with a "via transaction" tag and no ✕.
- [ ] **Step 3:** The **dashboard** income figure did NOT increase; **Net Worth**'s "owed to you" dropped by the payment.
- [ ] **Step 4:** Delete that transaction → the debt's remaining is restored.
- [ ] **Step 5:** Confirm the "Debt repayment" group does **not** appear when the entry is an Expense, and disappears once a debt is fully paid.

No commit.

---

## Self-Review

**Spec coverage:**
- `Transaction.debtId` + `DebtPayment.transactionId` → Task 1. ✓
- `DebtsService.recordPaymentFromTransaction` / `removePaymentByTransaction`, exported → Task 2. ✓
- `TransactionsModule → DebtsModule` (one-way), inject DebtsService → Task 3 steps 1–2. ✓
- `createManual` accepts `debtId` (income-only, owned via `owned()`), creates linked payment, rolls back tx on failure → Task 3 step 3. ✓
- Delete tx removes linked payment → Task 3 step 4. ✓
- Manual modal "Debt repayment" group, income only, sets debtId → Task 5 step 4. ✓
- Tx list label + exclude from filters; dashboard income/expense exclude debtId → Task 5 (steps 3,6) + Task 6. ✓
- Net worth receivable drops (already wired) → verified Task 8 step 3. ✓
- Debts page transaction-sourced payments read-only → Task 7. ✓
- Local smoke + manual verification → Tasks 4, 8. ✓

**Placeholder scan:** Task 5 steps 4 & 6 describe insertions into the large existing manual-modal dropdown and the transaction-row renderer in prose rather than full JSX, because those are sizeable existing blocks whose exact markup must be matched in place; the data (`openDebts`, borrower lookup), the handlers (`setManualTx`), and the exact state/submit/exclusion code are all given concretely. This is "follow the existing pattern in this file," not an invented API.

**Type consistency:** `debtId` is `string | null` on the entity and `debtId?: string | null` through `createManual`/controller/submit. `recordPaymentFromTransaction(debtId, userId, { amount, date, transactionId })` (Task 2) is called with exactly that shape in Task 3. `DebtLite`/`Payment.transactionId` types (Tasks 5, 7) match the API fields. The `isTransfer` helper is extended identically in both pages (Tasks 5 & 6).
