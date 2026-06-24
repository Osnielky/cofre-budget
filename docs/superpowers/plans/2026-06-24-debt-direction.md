# Debt Direction (I Lent / I Owe) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `direction` field (`'lent' | 'owed'`) to debts so users can track both money they lent to others and money they personally owe.

**Architecture:** A single new column on the `Debt` entity handles both directions. TypeORM `synchronize: true` auto-migrates on API restart — no manual migration needed. The frontend adds a direction toggle to the create modal, tabs + per-tab summary cards to the debts page, and extends the transactions page dropdown so both debt directions auto-set the transaction sign.

**Tech Stack:** NestJS 11 + TypeORM + PostgreSQL (API), Next.js 16 / React 19 / Tailwind v4 (Web).

## Global Constraints

- No test runner configured — verify all changes by running dev servers and testing manually in browser.
- TypeORM `synchronize: true` is active — adding a column to the entity auto-migrates on API restart.
- API: `npm run dev:api` → `http://localhost:3333/api`. Web: `npm run dev:web` → `http://localhost:3000`.
- Existing debts have no `direction` column; the DB `DEFAULT 'lent'` makes them all `'lent'` automatically.
- Never rename `borrowerName` or `borrowerEmail` DB columns (deliberate Approach A decision).
- Glassmorphism surfaces: use `rgba` / `backdrop-filter: blur()`. Never solid `--color-surface` backgrounds on cards.
- Accent colors: `--color-card-violet #9B6DFF`, `--color-green`, `--color-orange`, `--color-card-sky`, `--color-amber`.

---

### Task 1: Add `direction` column to Debt entity and update service

**Files:**
- Modify: `apps/api/src/debts/debt.entity.ts`
- Modify: `apps/api/src/debts/debts.service.ts`

**Interfaces:**
- Produces: `Debt.direction: 'lent' | 'owed'` — present on all API responses for debt objects
- Produces: `CreateDebtDto.direction?: 'lent' | 'owed'` (optional, defaults to `'lent'`)
- Produces: `findAll(userId, direction?: 'lent' | 'owed'): Promise<DebtWithBalance[]>`

- [ ] **Step 1: Add `direction` column to `debt.entity.ts`**

Full replacement of `apps/api/src/debts/debt.entity.ts`:

```typescript
import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('debts')
export class Debt {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column() userId: string;
  @Column() borrowerName: string;
  @Column({ type: 'varchar', nullable: true }) borrowerEmail: string | null;
  @Column({ type: 'decimal', precision: 12, scale: 2 }) principal: number;
  @Column({ type: 'varchar', nullable: true }) description: string | null;
  @Column({ type: 'date', nullable: true }) startDate: string | null;
  @Column({ type: 'date', nullable: true }) dueDate: string | null;
  @Column({ type: 'varchar', default: 'open' }) status: 'open' | 'paid';
  @Column({ type: 'varchar', length: 10, default: 'lent' }) direction: 'lent' | 'owed';
  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}
```

- [ ] **Step 2: Update `CreateDebtDto` in `debts.service.ts`**

Find the `CreateDebtDto` interface and replace it:

```typescript
export interface CreateDebtDto {
  borrowerName: string;
  borrowerEmail?: string | null;
  principal: number;
  description?: string | null;
  startDate?: string | null;
  dueDate?: string | null;
  direction?: 'lent' | 'owed';
}
```

- [ ] **Step 3: Update `findAll()` to accept an optional direction filter**

Replace the `findAll` method:

```typescript
async findAll(userId: string, direction?: 'lent' | 'owed'): Promise<DebtWithBalance[]> {
  const where: any = { userId };
  if (direction) where.direction = direction;
  const list = await this.debts.find({ where, order: { createdAt: 'DESC' } });
  return Promise.all(list.map((d) => this.withBalance(d)));
}
```

- [ ] **Step 4: Update `create()` to save direction**

Replace the `create` method:

```typescript
async create(userId: string, dto: CreateDebtDto): Promise<DebtWithBalance> {
  if (!(dto.principal > 0)) throw new BadRequestException('Amount must be greater than zero.');
  const debt = await this.debts.save(this.debts.create({
    userId,
    borrowerName: dto.borrowerName,
    borrowerEmail: dto.borrowerEmail ?? null,
    principal: dto.principal,
    description: dto.description ?? null,
    startDate: dto.startDate ?? null,
    dueDate: dto.dueDate ?? null,
    status: 'open',
    direction: dto.direction ?? 'lent',
  }));
  return this.withBalance(debt);
}
```

- [ ] **Step 5: Update `update()` to accept direction**

Replace the `update` method:

```typescript
async update(id: string, userId: string, dto: Partial<CreateDebtDto>): Promise<DebtWithBalance> {
  const debt = await this.owned(id, userId);
  if (dto.principal !== undefined && !(dto.principal > 0)) throw new BadRequestException('Amount must be greater than zero.');
  debt.borrowerName = dto.borrowerName ?? debt.borrowerName;
  if (dto.borrowerEmail !== undefined) debt.borrowerEmail = dto.borrowerEmail;
  if (dto.principal !== undefined) debt.principal = dto.principal;
  if (dto.description !== undefined) debt.description = dto.description;
  if (dto.startDate !== undefined) debt.startDate = dto.startDate;
  if (dto.dueDate !== undefined) debt.dueDate = dto.dueDate;
  if (dto.direction !== undefined) debt.direction = dto.direction;
  await this.debts.save(debt);
  return this.recomputeStatus(id, userId);
}
```

- [ ] **Step 6: Restart the API and verify the column is added**

```bash
npm run dev:api
```

Watch the console — TypeORM will log an ALTER TABLE statement adding the `direction` column. Then verify:

```bash
psql -U postgres -d cofre_budget -c '\d debts'
```

Expected: a `direction` column appears with `character varying(10)` type and default `'lent'`.

- [ ] **Step 7: Verify `GET /debts` returns `direction`**

In a browser or curl, hit `GET /api/debts` (logged-in session). Confirm each debt object includes `"direction": "lent"` for existing rows.

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/debts/debt.entity.ts apps/api/src/debts/debts.service.ts
git commit -m "feat(api): add direction field to Debt entity and service"
```

---

### Task 2: New Debt modal — direction toggle and dynamic labels

**Files:**
- Modify: `apps/web/src/app/debts/page.tsx`

**Interfaces:**
- Consumes: `POST /debts` now accepts `direction: 'lent' | 'owed'` in request body (Task 1)

- [ ] **Step 1: Add `formDir` state**

Find the `form` state line (near the top of `DebtsPage`):

```tsx
const [form, setForm] = useState({ borrowerName: '', borrowerEmail: '', principal: '', description: '', startDate: today(), dueDate: '' });
```

Add `formDir` on the line immediately before it:

```tsx
const [formDir, setFormDir] = useState<'lent' | 'owed'>('lent');
const [form, setForm] = useState({ borrowerName: '', borrowerEmail: '', principal: '', description: '', startDate: today(), dueDate: '' });
```

- [ ] **Step 2: Define a reset helper inline to avoid repeating the reset block**

Just below the `formDir` and `form` state lines, add:

```tsx
const resetForm = () => {
  setFormDir('lent');
  setForm({ borrowerName: '', borrowerEmail: '', principal: '', description: '', startDate: today(), dueDate: '' });
};
```

- [ ] **Step 3: Use `resetForm` in `createDebt` and close handlers**

In the `createDebt` async function, replace the two reset lines after `setSaving(false); setShowForm(false);` with:

```tsx
setSaving(false); setShowForm(false); resetForm();
```

- [ ] **Step 4: Add `direction` to the create request body**

In `createDebt`, update the `body: JSON.stringify({...})` call to include `direction: formDir`:

```tsx
body: JSON.stringify({
  borrowerName: form.borrowerName,
  borrowerEmail: form.borrowerEmail || null,
  principal: parseFloat(form.principal),
  description: form.description || null,
  startDate: form.startDate || null,
  dueDate: form.dueDate || null,
  direction: formDir,
}),
```

- [ ] **Step 5: Replace the modal form JSX with the direction-aware version**

Find the `{showForm && createPortal(...)}` block. Replace the entire `<form>` element inside it with:

```tsx
<form onSubmit={createDebt} className="w-full max-w-sm flex flex-col rounded-2xl"
  style={{ background: 'var(--color-elevated)', border: '1px solid var(--color-border)', boxShadow: 'var(--glass-shadow)' }}>
  <div className="px-5 py-4 flex items-center justify-between rounded-t-2xl" style={{ borderBottom: '1px solid var(--color-border)' }}>
    <p className="font-bold text-sm">New Debt</p>
    <button type="button" onClick={() => { setShowForm(false); resetForm(); }}
      className="w-8 h-8 rounded-lg hover:bg-[var(--color-surface)]" style={{ color: 'var(--color-text-muted)' }}>✕</button>
  </div>
  <div className="flex flex-col gap-3 px-5 py-4">
    {/* Direction toggle */}
    <div className="flex gap-1 p-1 rounded-xl self-start" style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
      {(['lent', 'owed'] as const).map((dir) => (
        <button key={dir} type="button" onClick={() => setFormDir(dir)}
          className="px-3 py-1.5 rounded-lg text-xs font-bold transition-all"
          style={{
            background: formDir === dir ? 'color-mix(in srgb, var(--color-card-violet) 18%, transparent)' : 'transparent',
            color: formDir === dir ? 'var(--color-card-violet)' : 'var(--color-text-muted)',
            border: formDir === dir ? '1px solid color-mix(in srgb, var(--color-card-violet) 35%, transparent)' : '1px solid transparent',
          }}>
          {dir === 'lent' ? 'I Lent' : 'I Owe'}
        </button>
      ))}
    </div>
    {/* Fields with direction-aware labels */}
    {([
      ['borrowerName', formDir === 'lent' ? 'Borrower name' : 'Lender name', 'text', true],
      ['borrowerEmail', 'Email (optional)', 'email', false],
      ['principal', formDir === 'lent' ? 'Amount lent' : 'Amount owed', 'number', true],
      ['description', 'Note (optional)', 'text', false],
      ['startDate', formDir === 'lent' ? 'Date lent' : 'Date borrowed', 'date', false],
      ['dueDate', 'Due date (optional)', 'date', false],
    ] as const).map(([key, label, type, req]) => (
      <label key={key} className="flex flex-col gap-1.5">
        <span className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'var(--color-text-muted)' }}>{label}</span>
        <input required={req} type={type} step={type === 'number' ? '0.01' : undefined} min={type === 'number' ? '0.01' : undefined}
          value={(form as any)[key]} onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
          className="px-3 py-2.5 text-sm rounded-xl outline-none"
          style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', color: 'var(--color-text-primary)' }} />
      </label>
    ))}
  </div>
  <div className="flex gap-2 justify-end px-5 py-4" style={{ borderTop: '1px solid var(--color-border)' }}>
    <button type="button" onClick={() => { setShowForm(false); resetForm(); }}
      className="px-4 py-2 text-sm font-medium rounded-xl"
      style={{ color: 'var(--color-text-secondary)', border: '1px solid var(--color-border)' }}>Cancel</button>
    <button type="submit" disabled={saving}
      className="px-5 py-2 text-sm font-semibold text-white rounded-xl hover:brightness-110 disabled:opacity-50"
      style={{ background: 'var(--color-card-violet)' }}>{saving ? 'Saving…' : 'Create'}</button>
  </div>
</form>
```

Also update the backdrop `onMouseDown` to call `resetForm`:

```tsx
onMouseDown={e => { if (e.target === e.currentTarget) { setShowForm(false); resetForm(); } }}
```

- [ ] **Step 6: Verify in browser**

1. Open `http://localhost:3000/debts`, click "Add Debt"
2. Confirm "I Lent" / "I Owe" pills appear at top of modal
3. Click "I Owe" — verify labels change: "Lender name", "Amount owed", "Date borrowed"
4. Click "I Lent" — labels revert
5. Create one debt as "I Lent" and one as "I Owe"; confirm both save without error

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/app/debts/page.tsx
git commit -m "feat(web/debts): add direction toggle to New Debt modal"
```

---

### Task 3: Debts page — tabs and per-tab summary cards

**Files:**
- Modify: `apps/web/src/app/debts/page.tsx`

**Interfaces:**
- Consumes: `Debt.direction: 'lent' | 'owed'` on all debt objects returned by the API (Task 1)

- [ ] **Step 1: Add `direction` to the `Debt` interface**

Find the `Debt` interface at the top of the file:

```tsx
interface Debt {
  id: string; borrowerName: string; borrowerEmail: string | null; principal: number;
  description: string | null; startDate: string | null; dueDate: string | null; status: 'open' | 'paid';
  paid: number; remaining: number; percentage: number;
}
```

Replace with:

```tsx
interface Debt {
  id: string; borrowerName: string; borrowerEmail: string | null; principal: number;
  description: string | null; startDate: string | null; dueDate: string | null; status: 'open' | 'paid';
  paid: number; remaining: number; percentage: number; direction: 'lent' | 'owed';
}
```

- [ ] **Step 2: Add `activeTab` state**

Add after the existing `useState` calls near the top of `DebtsPage`:

```tsx
const [activeTab, setActiveTab] = useState<'lent' | 'owed'>('lent');
```

- [ ] **Step 3: Replace summary variable block with per-tab derivations**

Find the four summary lines (currently):
```tsx
const totalLent = debts.reduce(...);
const totalRepaid = debts.reduce(...);
const outstanding = debts.filter(...).reduce(...);
const peopleOwing = debts.filter(...).length;
```

Replace with:

```tsx
const lentDebts  = debts.filter(d => d.direction === 'lent');
const owedDebts  = debts.filter(d => d.direction === 'owed');
const tabDebts   = activeTab === 'lent' ? lentDebts : owedDebts;

const totalLent     = lentDebts.reduce((s, d) => s + Number(d.principal), 0);
const totalRepaid   = lentDebts.reduce((s, d) => s + Number(d.paid), 0);
const outstanding   = lentDebts.filter(d => d.status === 'open').reduce((s, d) => s + Number(d.remaining), 0);
const peopleOwing   = lentDebts.filter(d => d.status === 'open').length;

const totalOwed     = owedDebts.reduce((s, d) => s + Number(d.principal), 0);
const totalPaidBack = owedDebts.reduce((s, d) => s + Number(d.paid), 0);
const stillOwe      = owedDebts.filter(d => d.status === 'open').reduce((s, d) => s + Number(d.remaining), 0);
const creditors     = owedDebts.filter(d => d.status === 'open').length;
```

- [ ] **Step 4: Replace the sticky header with the version that includes tabs**

Find the entire `<div className="sticky top-14 md:top-0 z-20 ...">` block and replace it:

```tsx
<div className="sticky top-14 md:top-0 z-20 px-6 pt-5 pb-4 flex flex-col gap-3"
  style={{ background: 'var(--header-bg)', backdropFilter: 'var(--glass-blur)', WebkitBackdropFilter: 'var(--glass-blur)', borderBottom: '1px solid var(--color-border)' }}>
  <div className="flex items-center justify-between gap-4 flex-wrap">
    <div>
      <h1 className="text-xl font-bold tracking-tight">Debts</h1>
      <p className="text-xs mt-0.5" style={{ color: 'var(--color-text-muted)' }}>Track money you lend and owe</p>
    </div>
    <button onClick={() => setShowForm(true)}
      className="px-4 py-2 text-sm font-semibold text-white rounded-xl hover:brightness-110 transition-all flex items-center gap-1.5"
      style={{ background: 'var(--color-card-violet)' }}>
      <span className="text-base leading-none">+</span> Add Debt
    </button>
  </div>
  <div className="flex gap-1 p-1 rounded-xl self-start" style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
    {(['lent', 'owed'] as const).map((tab) => (
      <button key={tab} type="button" onClick={() => setActiveTab(tab)}
        className="px-4 py-1.5 rounded-lg text-xs font-bold transition-all"
        style={{
          background: activeTab === tab ? 'color-mix(in srgb, var(--color-card-violet) 18%, transparent)' : 'transparent',
          color: activeTab === tab ? 'var(--color-card-violet)' : 'var(--color-text-muted)',
          border: activeTab === tab ? '1px solid color-mix(in srgb, var(--color-card-violet) 35%, transparent)' : '1px solid transparent',
        }}>
        {tab === 'lent' ? 'I Lent' : 'I Owe'}
      </button>
    ))}
  </div>
</div>
```

- [ ] **Step 5: Replace summary cards grid with per-tab version**

Find the summary cards grid block (the `{!loading && debts.length > 0 && (...)}` block with four cards). Replace it:

```tsx
{!loading && debts.length > 0 && (
  <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
    {(activeTab === 'lent' ? [
      { label: 'Total Lent',   value: `$${fmt(totalLent)}`,    color: 'var(--color-card-violet)' },
      { label: 'Total Repaid', value: `$${fmt(totalRepaid)}`,  color: 'var(--color-green)' },
      { label: 'Outstanding',  value: `$${fmt(outstanding)}`,  color: 'var(--color-orange)' },
      { label: 'People Owing', value: `${peopleOwing}`,        color: 'var(--color-card-sky)' },
    ] : [
      { label: 'Total Owed',     value: `$${fmt(totalOwed)}`,     color: 'var(--color-card-violet)' },
      { label: 'Total Paid Back',value: `$${fmt(totalPaidBack)}`, color: 'var(--color-green)' },
      { label: 'Still Owe',      value: `$${fmt(stillOwe)}`,      color: 'var(--color-orange)' },
      { label: 'Creditors',      value: `${creditors}`,           color: 'var(--color-card-sky)' },
    ]).map(s => (
      <div key={s.label} className="p-4 rounded-2xl flex flex-col gap-1.5"
        style={{ background: 'var(--color-surface)', backdropFilter: 'var(--glass-blur)', WebkitBackdropFilter: 'var(--glass-blur)', border: '1px solid var(--color-border)' }}>
        <span className="text-[10px] font-bold tracking-widest uppercase" style={{ color: s.color }}>{s.label}</span>
        <span className="text-xl font-extrabold leading-none tabular-nums">{s.value}</span>
      </div>
    ))}
  </div>
)}
```

- [ ] **Step 6: Render `tabDebts` instead of `debts` in the list area**

In the loading / empty / list conditional block, make two targeted changes:

Change the empty state check from `debts.length === 0` to `tabDebts.length === 0`.

Change the list render from `debts.map(d => {` to `tabDebts.map(d => {`.

Also update the empty state description to be tab-aware:

```tsx
<p className="text-sm mt-1" style={{ color: 'var(--color-text-muted)' }}>
  {activeTab === 'lent'
    ? 'Record money you lent so you can track repayments.'
    : 'Record money you owe so you can track payments.'}
</p>
```

- [ ] **Step 7: Verify in browser**

1. Open `http://localhost:3000/debts`
2. Confirm "I Lent" / "I Owe" tabs appear below the header
3. Debts created as "I Lent" appear only in the "I Lent" tab; "I Owe" debts only in "I Owe" tab
4. Summary cards change when switching tabs
5. Empty state message is correct for each tab

- [ ] **Step 8: Commit**

```bash
git add apps/web/src/app/debts/page.tsx
git commit -m "feat(web/debts): add I Lent / I Owe tabs and per-tab summary cards"
```

---

### Task 4: Debt detail — copy and color adjustments for "I Owe" direction

**Files:**
- Modify: `apps/web/src/app/debts/page.tsx`

**Interfaces:**
- Consumes: `Debt.direction: 'lent' | 'owed'` on the `d` variable inside the debt list map (available since Task 3)

- [ ] **Step 1: Update the date display in the debt card summary row**

Find the date display block inside the debt card (inside `debts.map` / `tabDebts.map`):

```tsx
{d.startDate ? `Lent ${d.startDate}` : ''}
```

Replace with:

```tsx
{d.startDate ? `${d.direction === 'owed' ? 'Borrowed' : 'Lent'} ${d.startDate}` : ''}
```

- [ ] **Step 2: Update the payment form label**

In the expanded detail section, find:

```tsx
<span className="text-[10px] uppercase tracking-wider" style={{ color: 'var(--color-text-muted)' }}>Payment</span>
```

Replace with:

```tsx
<span className="text-[10px] uppercase tracking-wider" style={{ color: 'var(--color-text-muted)' }}>
  {d.direction === 'owed' ? 'Amount paid back' : 'Payment'}
</span>
```

- [ ] **Step 3: Update the "Email receipt" checkbox label**

Find:

```tsx
Email receipt
```

Replace with:

```tsx
{d.direction === 'owed' ? 'Email confirmation' : 'Email receipt'}
```

- [ ] **Step 4: Update payment amount display color and sign in the payment history**

Find:

```tsx
<span className="font-bold tabular-nums" style={{ color: 'var(--color-green)' }}>+${fmt(p.amount)}</span>
```

Replace with:

```tsx
<span className="font-bold tabular-nums" style={{ color: d.direction === 'owed' ? 'var(--color-orange)' : 'var(--color-green)' }}>
  {d.direction === 'owed' ? '−' : '+'}${fmt(p.amount)}
</span>
```

- [ ] **Step 5: Verify in browser**

1. Open an "I Owe" debt's expanded detail
2. Confirm date label shows "Borrowed" instead of "Lent"
3. Confirm payment label shows "Amount paid back"
4. Confirm checkbox says "Email confirmation"
5. Record a payment on the "I Owe" debt and confirm it shows `−$` in orange in the payment history

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/app/debts/page.tsx
git commit -m "feat(web/debts): adjust payment copy and colors for I Owe direction"
```

---

### Task 5: Transactions page — bidirectional debt dropdown

**Files:**
- Modify: `apps/web/src/app/transactions/page.tsx`

**Interfaces:**
- Consumes: `GET /debts` now returns `direction: 'lent' | 'owed'` on each debt (Task 1)
- Produces: selecting an "I owe" debt forces sign `−`; selecting an "I lent" debt forces sign `+`

- [ ] **Step 1: Add `direction` to `DebtLite`**

Find:

```tsx
interface DebtLite { id: string; borrowerName: string; remaining: number; status: 'open' | 'paid' }
```

Replace with:

```tsx
interface DebtLite { id: string; borrowerName: string; remaining: number; status: 'open' | 'paid'; direction: 'lent' | 'owed' }
```

- [ ] **Step 2: Remove the income-only gate on the debt section in the category dropdown**

Find:

```tsx
{!isExpense && openDebts.length > 0 && (
```

Replace with:

```tsx
{openDebts.length > 0 && (
```

This makes the "Debt repayment" section visible for both expense and income transactions.

- [ ] **Step 3: Auto-set sign when a debt is selected**

Find the `onClick` on the debt item buttons inside `openDebts.map`:

```tsx
onClick={() => { setManualTx((f) => ({ ...f, debtId: d.id, categoryId: '' })); setManualCatOpen(false); }}
```

Replace with:

```tsx
onClick={() => {
  setManualTx((f) => ({ ...f, debtId: d.id, categoryId: '', sign: d.direction === 'owed' ? '-' : '+' }));
  setManualCatOpen(false);
}}
```

- [ ] **Step 4: Add directional prefix to debt labels in the dropdown**

Find inside `openDebts.map`:

```tsx
<span className="font-medium flex-1 text-left">{d.borrowerName}</span>
```

Replace with:

```tsx
<span className="font-medium flex-1 text-left">
  {d.direction === 'owed' ? '↓ ' : '↑ '}{d.borrowerName}
</span>
```

- [ ] **Step 5: Update the selected debt label in the category trigger button**

Find:

```tsx
<span className="flex-1 font-medium" style={{ color: 'var(--color-card-violet)' }}>Debt repayment · {selDebt.borrowerName}</span>
```

Replace with:

```tsx
<span className="flex-1 font-medium" style={{ color: 'var(--color-card-violet)' }}>
  {selDebt.direction === 'owed' ? 'Debt payment · ' : 'Debt repayment · '}{selDebt.borrowerName}
</span>
```

- [ ] **Step 6: Update the transaction row display for "I Owe" debts**

Find:

```tsx
<><span>🤝</span><span>Debt repayment · {debts.find((d) => d.id === tx.debtId)?.borrowerName ?? 'debt'}</span></>
```

Replace with:

```tsx
{(() => {
  const linkedDebt = debts.find((d) => d.id === tx.debtId);
  return (
    <><span>🤝</span><span>
      {linkedDebt?.direction === 'owed' ? 'Debt payment · ' : 'Debt repayment · '}
      {linkedDebt?.borrowerName ?? 'debt'}
    </span></>
  );
})()}
```

- [ ] **Step 7: Verify in browser**

1. Open `http://localhost:3000/transactions`, click "Add transaction"
2. Switch to "− Expense", open category dropdown — confirm "I Owe" debts appear with "↓" prefix
3. Select an "I Owe" debt — confirm sign auto-switches to `−`
4. Switch to "+ Income", open category dropdown — confirm "I Lent" debts appear with "↑" prefix
5. Select an "I Lent" debt — confirm sign stays `+`
6. Save a transaction linked to an "I Owe" debt
7. Open Debts → "I Owe" tab, expand the debt — confirm the payment appears in history
8. Confirm the transaction row shows "Debt payment · [name]" for the owed debt

- [ ] **Step 8: Commit**

```bash
git add apps/web/src/app/transactions/page.tsx
git commit -m "feat(web/transactions): extend debt dropdown to support I Owe direction"
```
