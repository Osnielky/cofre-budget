# Project Purchase Transaction — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate double-counting between a project's `purchasePrice` estimate and a real linked bank transaction representing the same acquisition, by letting users designate one linked transaction as the "initial purchase."

**Architecture:** A new nullable `purchaseTxId` column on `Project` suppresses the `purchasePrice` estimate in the `costBasis` formula when set. A new `PATCH /projects/:id/purchase-tx` API endpoint sets or clears it. The transaction picker on the transactions page shows a two-option prompt (expense vs. initial purchase) when appropriate. The projects page shows a 🏷 Purchase badge on the designated transaction with a remove action.

**Tech Stack:** NestJS 11 + TypeORM + PostgreSQL (API), Next.js 16 / React 19 / Tailwind v4 (Web).

## Global Constraints

- No test runner configured — verify via API build (`npx nx build api --skip-nx-cache`) and TypeScript check (`npx tsc -p apps/web/tsconfig.json --noEmit`).
- TypeORM `synchronize: true` is active — adding a column to the entity auto-migrates on API restart.
- API: `npm run dev:api` → `http://localhost:3333/api`. Web: `npm run dev:web` → `http://localhost:3000`.
- Glassmorphism surfaces: `rgba` / `backdrop-filter: blur()`. Accent colors: `--color-card-violet #9B6DFF`, `--color-rose`, `--color-border`, `--color-elevated`, `--color-text-muted`.
- `purchasePrice` is never deleted or zeroed — it is suppressed in the formula only when `purchaseTxId` is set. If `purchaseTxId` is cleared, `purchasePrice` is automatically restored.
- `setPurchaseTx` must validate that the transaction is already linked to the project (`tx.projectId === projectId`) before designating it.

---

### Task 1: API — `purchaseTxId` column + `setPurchaseTx` + `costBasis` fix

**Files:**
- Modify: `apps/api/src/projects/project.entity.ts`
- Modify: `apps/api/src/projects/projects.service.ts`
- Modify: `apps/api/src/projects/projects.controller.ts`

**Interfaces:**
- Produces: `Project.purchaseTxId: string | null` — present on all API project responses (included automatically in `{ ...p }` spread since it's an entity column).
- Produces: `ProjectsService.setPurchaseTx(projectId, userId, transactionId | null): Promise<ProjectWithStats>`.
- Produces: `PATCH /api/projects/:id/purchase-tx` body `{ transactionId: string | null }` — returns full project with updated `costBasis`.

- [ ] **Step 1: Add `purchaseTxId` column to `project.entity.ts`**

Open `apps/api/src/projects/project.entity.ts`. After the `saleDate` column (line 45), add:

```typescript
@Column({ type: 'uuid', nullable: true })
purchaseTxId: string | null;
```

Full updated file:

```typescript
import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('projects')
export class Project {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column() userId: string;
  @Column() name: string;
  @Column({ default: 'other' }) type: string;
  @Column({ default: '📦' }) icon: string;
  @Column({ nullable: true }) color: string;
  @Column({ nullable: true }) description: string;
  @Column({ type: 'text', nullable: true }) imageUrl: string;
  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 }) purchasePrice: number;
  @Column({ type: 'date', nullable: true }) purchaseDate: string;
  @Column({ default: 'active' }) status: string;
  @Column({ type: 'decimal', precision: 12, scale: 2, nullable: true }) salePrice: number;
  @Column({ type: 'date', nullable: true }) saleDate: string;
  @Column({ type: 'uuid', nullable: true }) purchaseTxId: string | null;
  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}
```

- [ ] **Step 2: Fix `costBasis` formula in `findAllByUser` (line 150)**

In `apps/api/src/projects/projects.service.ts`, find this line in `findAllByUser`:

```typescript
const costBasis = Number(p.purchasePrice) + expenses;
```

Replace with:

```typescript
const costBasis = (p.purchaseTxId ? 0 : Number(p.purchasePrice)) + expenses;
```

- [ ] **Step 3: Fix `costBasis` formula in `withStats` (line 333)**

In the same file, inside `withStats`:

```typescript
const costBasis = Number(p.purchasePrice) + expenses;
```

Replace with:

```typescript
const costBasis = (p.purchaseTxId ? 0 : Number(p.purchasePrice)) + expenses;
```

- [ ] **Step 4: Add `setPurchaseTx` service method**

At the end of `ProjectsService`, just before the closing `}` of the class (after `withStats`, around line 339), add:

```typescript
async setPurchaseTx(projectId: string, userId: string, transactionId: string | null): Promise<ProjectWithStats> {
  const project = await this.repo.findOneByOrFail({ id: projectId, userId });

  if (transactionId) {
    const tx = await this.txRepo.findOneBy({ id: transactionId, userId, projectId });
    if (!tx) throw new NotFoundException('Transaction not found or not linked to this project');
  }

  project.purchaseTxId = transactionId ?? null;
  await this.repo.save(project);
  return this.withStats(project);
}
```

- [ ] **Step 5: Add the controller endpoint**

In `apps/api/src/projects/projects.controller.ts`, insert this method after the `unlinkTx` endpoint (after line 78):

```typescript
@Patch(':id/purchase-tx')
setPurchaseTx(
  @Param('id') id: string,
  @Request() req: any,
  @Body('transactionId') transactionId: string | null,
) {
  return this.service.setPurchaseTx(id, req.user.id, transactionId);
}
```

- [ ] **Step 6: Build and verify**

```bash
cd /path/to/repo && npx nx build api --skip-nx-cache 2>&1 | tail -20
```

Expected: `webpack compiled successfully`. Then restart the API (`npm run dev:api`) — TypeORM will auto-add the `purchaseTxId` column to the DB.

Manual verify: Create a project with `purchasePrice: 100`, link a `-$100` transaction to it. With `purchaseTxId` null, `costBasis` should be `100 + 100 = 200`. Then call:

```bash
curl -X PATCH http://localhost:3333/api/projects/<PROJECT_ID>/purchase-tx \
  -H "Content-Type: application/json" \
  -H "Cookie: access_token=<JWT>" \
  -d '{"transactionId":"<TX_ID>"}'
# Expect 200 with costBasis = 100 (counted once)
```

Then clear it:

```bash
curl -X PATCH http://localhost:3333/api/projects/<PROJECT_ID>/purchase-tx \
  -H "Content-Type: application/json" \
  -H "Cookie: access_token=<JWT>" \
  -d '{"transactionId":null}'
# Expect 200 with costBasis = 200 (estimate restored)
```

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/projects/project.entity.ts \
        apps/api/src/projects/projects.service.ts \
        apps/api/src/projects/projects.controller.ts
git commit -m "feat(api): add purchaseTxId to Project; fix costBasis double-counting; add PATCH /projects/:id/purchase-tx"
```

---

### Task 2: Frontend — Purchase prompt in the transaction picker

**Files:**
- Modify: `apps/web/src/app/transactions/page.tsx`

**Interfaces:**
- Consumes: `PATCH /api/projects/:id/purchase-tx` from Task 1
- Consumes: `Project.purchaseTxId: string | null` in the local `projects` state
- Produces: Modified project drill-down that shows a two-option prompt when appropriate; updates `projects` state with `purchaseTxId` after designation.

- [ ] **Step 1: Add `purchaseTxId` to the `Project` interface**

At line 20 in `apps/web/src/app/transactions/page.tsx`, the `Project` interface currently is:

```tsx
interface Project { id: string; name: string; icon: string; color: string; status: string; categories?: ProjectCategory[] }
```

Replace with:

```tsx
interface Project { id: string; name: string; icon: string; color: string; status: string; purchaseTxId: string | null; categories?: ProjectCategory[] }
```

- [ ] **Step 2: Add `pickerShowPurchasePrompt` state**

Find where picker-related states are declared (around line 108, near `pickerProjectDrill`). Add one new state immediately after `pickerProjectDrill`:

```tsx
const [pickerShowPurchasePrompt, setPickerShowPurchasePrompt] = useState(false);
```

- [ ] **Step 3: Reset `pickerShowPurchasePrompt` when picker closes**

Find every place `setOpenPickerId(null)` or `setPickerProjectDrill(null)` is called and add `setPickerShowPurchasePrompt(false)` alongside them. There are two key spots:

**In the picker button onClick** (around line 1261, the `if (isOpen) { setOpenPickerId(null)...` block):
```tsx
if (isOpen) { setOpenPickerId(null); setPickerProjectDrill(null); setPickerTransferStep(false); setPickerShowPurchasePrompt(false); return; }
```

**In `linkToProject`** (line 416, where `setOpenPickerId(null); setPickerProjectDrill(null)` is called):
```tsx
setOpenPickerId(null); setPickerProjectDrill(null); setPickerShowPurchasePrompt(false);
```

**In the drill-down back button** (line 1657, the `←` button onClick):
```tsx
onClick={() => { setPickerProjectDrill(null); setMarkAsSaleConfirm(null); setPickerShowPurchasePrompt(false); }}
```

- [ ] **Step 4: Add `markAsPurchase` function**

Insert this function after `linkToProject` (after line 420):

```typescript
async function markAsPurchase(txId: string, projectId: string) {
  setLinkingProj(true);
  try {
    // First link the transaction to the project (no category)
    await fetch(`${API}/projects/${projectId}/link/${txId}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
      body: JSON.stringify({ projectCategoryId: null }),
    });
    // Then designate it as the purchase transaction
    const res = await fetch(`${API}/projects/${projectId}/purchase-tx`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
      body: JSON.stringify({ transactionId: txId }),
    });
    if (!res.ok) return;
    const updatedProject = await res.json();
    setTransactions((prev) => prev.map((t) =>
      t.id === txId ? { ...t, projectId, projectCategoryId: null } : t,
    ));
    setProjects((prev) => prev.map((p) =>
      p.id === projectId ? { ...p, purchaseTxId: updatedProject.purchaseTxId } : p,
    ));
    setOpenPickerId(null);
    setPickerProjectDrill(null);
    setPickerShowPurchasePrompt(false);
  } catch {
    // silently ignore network errors
  } finally { setLinkingProj(false); }
}
```

Note: verify that the projects state setter is `setProjects` by searching for `useState` near the `projects` state declaration. If it's named differently, use the correct setter name.

- [ ] **Step 5: Modify the project drill-down to show the purchase prompt**

In the project drill-down (around line 1672), the "No specific category" button currently calls `linkToProject(tx.id, pickerProjectDrill!, null)` unconditionally.

Wrap it with a condition: when `tx.amount < 0` AND `proj.purchaseTxId == null` AND the transaction is not yet linked to this project, the click sets `pickerShowPurchasePrompt(true)` instead of linking. Add the purchase prompt UI that renders when `pickerShowPurchasePrompt` is true.

Replace the block starting at the `{/* No category option */}` comment (around line 1672) through the closing of the category list (line ~1709), with:

```tsx
{/* Purchase prompt — shown when user clicked the initial purchase flow */}
{pickerShowPurchasePrompt ? (
  <div className="px-3 py-3 flex flex-col gap-3">
    <p className="text-xs font-semibold" style={{ color: 'var(--color-text-primary)' }}>
      How should we record this?
    </p>
    <button
      onClick={() => { setPickerShowPurchasePrompt(false); linkToProject(tx.id, pickerProjectDrill!, null); }}
      disabled={linkingProj}
      className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-xs text-left transition-colors hover:bg-(--color-elevated) disabled:opacity-50"
      style={{ border: '1px solid var(--color-border)' }}>
      <span className="text-base">📂</span>
      <div>
        <p className="font-semibold" style={{ color: 'var(--color-text-primary)' }}>Project expense</p>
        <p style={{ color: 'var(--color-text-muted)' }}>Added to ongoing costs</p>
      </div>
    </button>
    <button
      onClick={() => markAsPurchase(tx.id, pickerProjectDrill!)}
      disabled={linkingProj}
      className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-xs text-left transition-colors disabled:opacity-50"
      style={{ border: '1px solid color-mix(in srgb, var(--color-card-violet) 35%, transparent)', background: 'color-mix(in srgb, var(--color-card-violet) 10%, transparent)' }}>
      <span className="text-base">🏷️</span>
      <div>
        <p className="font-semibold" style={{ color: 'var(--color-card-violet)' }}>Initial purchase</p>
        <p style={{ color: 'var(--color-text-muted)' }}>Replaces the ${Number(proj?.purchasePrice ?? 0).toFixed(0)} estimate</p>
      </div>
    </button>
  </div>
) : (
  <>
    {/* No category option */}
    <button
      onClick={() => {
        const proj = projects.find((p) => p.id === pickerProjectDrill);
        if (Number(tx.amount) < 0 && proj && !proj.purchaseTxId && tx.projectId !== pickerProjectDrill) {
          setPickerShowPurchasePrompt(true);
        } else {
          linkToProject(tx.id, pickerProjectDrill!, null);
        }
      }}
      disabled={linkingProj}
      className="w-full flex items-center gap-2.5 px-3 py-2 text-xs transition-colors hover:bg-(--color-elevated) disabled:opacity-50"
      style={tx.projectId === pickerProjectDrill && !tx.projectCategoryId ? { background: `${proj?.color || '#9B6DFF'}12` } : {}}>
      <span className="w-6 h-6 rounded-lg flex items-center justify-center text-sm shrink-0"
        style={{ background: 'var(--color-elevated)' }}>🏷️</span>
      <span className="flex-1 text-left" style={{ color: 'var(--color-text-secondary)' }}>
        {linkingProj ? 'Linking…' : 'No specific category'}
      </span>
      {tx.projectId === pickerProjectDrill && !tx.projectCategoryId && (
        <span className="text-xs" style={{ color: proj?.color || '#9B6DFF' }}>✓</span>
      )}
    </button>
    {/* Project categories */}
    {(proj?.categories ?? []).map((cat) => (
      <button key={cat.id}
        onClick={() => linkToProject(tx.id, pickerProjectDrill!, cat.id)}
        disabled={linkingProj}
        className="w-full flex items-center gap-2.5 px-3 py-2 text-xs transition-colors hover:bg-(--color-elevated) disabled:opacity-50"
        style={tx.projectId === pickerProjectDrill && tx.projectCategoryId === cat.id ? { background: `${cat.color}15` } : {}}>
        <span className="w-6 h-6 rounded-lg flex items-center justify-center text-sm shrink-0"
          style={{ background: `${cat.color}20` }}>{cat.icon}</span>
        <span className="flex-1 font-medium text-left"
          style={{ color: tx.projectId === pickerProjectDrill && tx.projectCategoryId === cat.id ? cat.color : 'var(--color-text-primary)' }}>
          {cat.name}
        </span>
        {tx.projectId === pickerProjectDrill && tx.projectCategoryId === cat.id && (
          <span className="text-xs" style={{ color: cat.color }}>✓</span>
        )}
      </button>
    ))}
    {(!proj?.categories || proj.categories.length === 0) && (
      <p className="text-xs px-3 py-2 text-center" style={{ color: 'var(--color-text-muted)' }}>
        No categories — add them in Projects page.
      </p>
    )}
  </>
)}
```

Note: `proj` is already declared at the top of the `pickerProjectDrill` IIFE (`const proj = projects.find((p) => p.id === pickerProjectDrill)!`). The `{/* Mark as SOLD */}` block that follows (line 1711) is unchanged — leave it in place after the above JSX.

- [ ] **Step 6: TypeScript check**

```bash
cd /path/to/repo && npx tsc -p apps/web/tsconfig.json --noEmit 2>&1 | head -20
```

Expected: no errors.

- [ ] **Step 7: Verify in browser**

1. Open the transactions page. Find a negative-amount transaction.
2. Click its chip → open picker → click a project.
3. With `project.purchaseTxId == null`: clicking "No specific category" shows the two-option prompt.
4. Click "Project expense" → links normally (prompt disappears, no purchase designation).
5. Try again, click "Initial purchase" → transaction is linked AND designated; re-opening the picker for the same transaction in the same project should go directly to "No specific category" (no prompt — `purchaseTxId` is now set).

- [ ] **Step 8: Commit**

```bash
git add apps/web/src/app/transactions/page.tsx
git commit -m "feat(web/transactions): show expense-vs-purchase prompt when linking to a project"
```

---

### Task 3: Frontend — Purchase badge + remove action + label on projects page

**Files:**
- Modify: `apps/web/src/app/projects/page.tsx`

**Interfaces:**
- Consumes: `Project.purchaseTxId: string | null` (already in API response from Task 1)
- Consumes: `PATCH /api/projects/:id/purchase-tx` with `{ transactionId: null }` from Task 1
- Produces: 🏷 Purchase badge on the designated transaction in the project detail view; "Remove purchase designation" action; updated cost breakdown label.

- [ ] **Step 1: Add `purchaseTxId` to the Project interface in projects page**

In `apps/web/src/app/projects/page.tsx`, find the Project interface (around line 58). It currently has `purchasePrice`, `purchaseDate`, etc. Add `purchaseTxId`:

```typescript
purchaseTxId: string | null;
```

alongside the existing fields.

- [ ] **Step 2: Add `removePurchaseTx` function**

Find where other async project-related functions are defined in the projects page. Add:

```typescript
async function removePurchaseTx(projectId: string) {
  const res = await fetch(`${API}/projects/${projectId}/purchase-tx`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ transactionId: null }),
  });
  if (!res.ok) return;
  const updated = await res.json();
  setProjects((prev) => prev.map((p) =>
    p.id === projectId
      ? { ...p, purchaseTxId: null, costBasis: updated.costBasis }
      : p,
  ));
}
```

Note: verify the API base URL constant name (`API` or `NEXT_PUBLIC_API_URL` or similar) and the projects state setter name by searching the file.

- [ ] **Step 3: Add the 🏷 Purchase badge to the linked transaction list**

Find where linked transactions are rendered in the project detail/expanded view. Search for where `tx.projectCategoryId` or `tx.date` is rendered in a list — this is the transaction row in the project detail panel.

On the transaction row for the transaction whose `id === project.purchaseTxId`, add a badge:

```tsx
{tx.id === sel.purchaseTxId && (
  <button
    onClick={() => removePurchaseTx(sel.id)}
    className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold shrink-0 hover:brightness-110 transition-all"
    style={{
      background: 'color-mix(in srgb, var(--color-card-violet) 15%, transparent)',
      color: 'var(--color-card-violet)',
      border: '1px solid color-mix(in srgb, var(--color-card-violet) 30%, transparent)',
    }}
    title="Remove purchase designation">
    🏷 Purchase
  </button>
)}
```

Place it next to the transaction amount or name, inside the existing row layout. `sel` is the currently selected/expanded project.

- [ ] **Step 4: Update the cost breakdown label (line ~1155)**

Find the cost breakdown text that currently reads (around line 1155):

```tsx
Cost basis <span className="font-semibold" style={{ color: 'var(--color-text-primary)' }}>${showSell.costBasis.toFixed(2)}</span>
<span className="opacity-50"> = ${Number(showSell.purchasePrice).toFixed(2)} purchase + ${showSell.expenses.toFixed(2)} expenses</span>
```

Replace the breakdown span with a conditional:

```tsx
Cost basis <span className="font-semibold" style={{ color: 'var(--color-text-primary)' }}>${showSell.costBasis.toFixed(2)}</span>
{showSell.purchaseTxId
  ? <span className="opacity-50"> = initial cost from transaction + ${showSell.expenses.toFixed(2)} expenses</span>
  : <span className="opacity-50"> = ${Number(showSell.purchasePrice).toFixed(2)} estimated purchase + ${showSell.expenses.toFixed(2)} expenses</span>
}
```

- [ ] **Step 5: TypeScript check**

```bash
cd /path/to/repo && npx tsc -p apps/web/tsconfig.json --noEmit 2>&1 | head -20
```

Expected: no errors.

- [ ] **Step 6: Verify in browser**

1. Open the projects page and expand a project that has a `purchaseTxId` set (from Task 2 testing).
2. Confirm the designated transaction shows the "🏷 Purchase" badge.
3. Click the badge → `removePurchaseTx` is called → badge disappears, transaction stays linked, cost basis label updates to show the estimated purchase price.
4. On the cost breakdown line (sell modal), confirm it now reads "initial cost from transaction" when `purchaseTxId` is set, and "estimated purchase" when it's not.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/app/projects/page.tsx
git commit -m "feat(web/projects): show purchase badge on designated tx; remove action; update cost breakdown label"
```
