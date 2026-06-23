# Income Target — Project Link Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow income targets to optionally link to a project — selectable in the creation/edit form, displayed as a badge on the target card.

**Architecture:** Add a nullable `projectId` FK to the `budgets` table (TypeORM `synchronize: true` auto-creates it). Update the API service/controller to accept and persist `projectId`. On the web, fetch projects alongside categories, add a project dropdown to the income target form, and render the linked project on the target card.

**Tech Stack:** NestJS 11 + TypeORM (API), Next.js 16 + React 19 + Tailwind v4 (web), PostgreSQL.

## Global Constraints

- `synchronize: true` in TypeORM config — no manual SQL migration needed; adding a column to the entity is sufficient.
- No test runner configured — manual verification only.
- Web dev server: `npm run dev:web` → http://localhost:3000
- API dev server: `npm run dev:api`
- `Project` entity is already imported in `apps/api/src/config/database.config.ts` — do not add it again.
- Never use solid `--color-surface` on cards; use `rgba(35,35,47,0.5)` with `backdropFilter`.
- Accent colors available: `--color-card-violet`, `--color-card-green`, `--color-card-orange`, `--color-card-amber`, `--color-card-sky`.

---

### Task 1: API — Add `projectId` to Budget entity

**Files:**
- Modify: `apps/api/src/budgets/budget.entity.ts`

**Interfaces:**
- Produces: `Budget.projectId: string | null`, `Budget.project: Project | null` — used by Tasks 2 and 3.

- [ ] **Step 1: Add imports and fields to Budget entity**

Open `apps/api/src/budgets/budget.entity.ts`. Replace the entire file with:

```typescript
import {
  Entity, PrimaryGeneratedColumn, Column,
  ManyToOne, JoinColumn, Unique,
  CreateDateColumn, UpdateDateColumn,
} from 'typeorm';
import { Category } from '../categories/category.entity';
import { Project } from '../projects/project.entity';

@Entity('budgets')
@Unique(['userId', 'categoryId', 'month'])
export class Budget {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  userId: string;

  @ManyToOne(() => Category, { eager: true, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'categoryId' })
  category: Category;

  @Column()
  categoryId: string;

  @Column({ default: '2026-06' })
  month: string;

  /* Month this value was last explicitly set. Carried-forward copies preserve
     the origin; an explicit edit stamps the edit's month. Null = legacy/own month. */
  @Column({ nullable: true })
  sourceMonth: string;

  @Column({ type: 'decimal', precision: 12, scale: 2 })
  amount: number;

  @Column({ nullable: true })
  projectId: string | null;

  @ManyToOne(() => Project, { nullable: true, eager: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'projectId' })
  project: Project | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
```

- [ ] **Step 2: Restart the API and verify the column is created**

Run:
```bash
npm run dev:api
```

Watch the startup log. TypeORM's `synchronize: true` will emit a SQL `ALTER TABLE budgets ADD COLUMN "projectId" uuid` line. No error means success.

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/budgets/budget.entity.ts
git commit -m "feat(api): add nullable projectId FK to Budget entity"
```

---

### Task 2: API — Service and controller accept `projectId`

**Files:**
- Modify: `apps/api/src/budgets/budgets.service.ts`
- Modify: `apps/api/src/budgets/budgets.controller.ts`

**Interfaces:**
- Consumes: `Budget.projectId` from Task 1.
- Produces: `POST /budgets` and `PATCH /budgets/:id` now accept optional `projectId?: string | null`.

- [ ] **Step 1: Update `create()` to accept and persist `projectId`**

In `apps/api/src/budgets/budgets.service.ts`, find the `create` method signature (line 155):

```typescript
async create(userId: string, dto: { categoryId: string; amount: number; month: string }): Promise<Budget> {
```

Change it to:

```typescript
async create(userId: string, dto: { categoryId: string; amount: number; month: string; projectId?: string | null }): Promise<Budget> {
```

Then in the same method, the `existing` branch currently does:
```typescript
existing.amount = dto.amount;
existing.sourceMonth = dto.month;
await this.repo.save(existing);
```

Add `projectId` update:
```typescript
existing.amount = dto.amount;
existing.sourceMonth = dto.month;
if (dto.projectId !== undefined) existing.projectId = dto.projectId ?? null;
await this.repo.save(existing);
```

And in the `else` branch:
```typescript
await this.repo.save(this.repo.create({ ...dto, userId, sourceMonth: dto.month }));
```

This already spreads `dto` so `projectId` is included automatically — no change needed here.

- [ ] **Step 2: Update `propagateForward()` to carry `projectId` forward**

Find the `propagateForward` signature (line 135):

```typescript
private async propagateForward(userId: string, categoryId: string, amount: number, fromMonth: string): Promise<void> {
```

Change it to:

```typescript
private async propagateForward(userId: string, categoryId: string, amount: number, fromMonth: string, projectId?: string | null): Promise<void> {
```

Inside the method, update the `if (existing)` branch from:
```typescript
existing.amount = amount;
existing.sourceMonth = fromMonth;
await this.repo.save(existing);
```

To:
```typescript
existing.amount = amount;
existing.sourceMonth = fromMonth;
if (projectId !== undefined) existing.projectId = projectId ?? null;
await this.repo.save(existing);
```

Update the `else` branch from:
```typescript
await this.repo.save(this.repo.create({ userId, categoryId, amount, month, sourceMonth: fromMonth }));
```

To:
```typescript
await this.repo.save(this.repo.create({ userId, categoryId, amount, month, sourceMonth: fromMonth, projectId: projectId ?? null }));
```

Update the two call sites in `create` (line ~165):
```typescript
await this.propagateForward(userId, dto.categoryId, dto.amount, dto.month, dto.projectId);
```

And in `update` (line ~176):
```typescript
await this.propagateForward(userId, budget.categoryId, dto.amount, budget.month, dto.projectId);
```

- [ ] **Step 3: Update `update()` to accept and persist `projectId`**

Find the `update` method signature (line 169):

```typescript
async update(id: string, userId: string, dto: { amount: number }): Promise<Budget> {
```

Change it to:

```typescript
async update(id: string, userId: string, dto: { amount: number; projectId?: string | null }): Promise<Budget> {
```

After `budget.amount = dto.amount;` and before `await this.repo.save(budget);`, add:

```typescript
if (dto.projectId !== undefined) budget.projectId = dto.projectId ?? null;
```

- [ ] **Step 4: Update `ensureMonthBudgets()` to copy `projectId`**

Find this line in `ensureMonthBudgets` (line ~96):
```typescript
this.repo.save(this.repo.create({ userId, categoryId: b.categoryId, amount: b.amount, month, sourceMonth: b.sourceMonth ?? b.month }))
```

Change it to:
```typescript
this.repo.save(this.repo.create({ userId, categoryId: b.categoryId, amount: b.amount, month, sourceMonth: b.sourceMonth ?? b.month, projectId: b.projectId ?? null }))
```

- [ ] **Step 5: Update `copyMonth()` to copy `projectId`**

Find this line in `copyMonth` (line ~108):
```typescript
this.repo.save(this.repo.create({ userId, categoryId: b.categoryId, amount: b.amount, month: toMonth, sourceMonth: b.sourceMonth ?? b.month }))
```

Change it to:
```typescript
this.repo.save(this.repo.create({ userId, categoryId: b.categoryId, amount: b.amount, month: toMonth, sourceMonth: b.sourceMonth ?? b.month, projectId: b.projectId ?? null }))
```

- [ ] **Step 6: Update controller POST body to accept `projectId`**

In `apps/api/src/budgets/budgets.controller.ts`, find the `create` method (line 39):

```typescript
@Post()
create(@Request() req: any, @Body() body: { categoryId: string; amount: number; month?: string }) {
  return this.service.create(req.user.id, { ...body, month: body.month ?? currentMonth() });
}
```

Change the body type:

```typescript
@Post()
create(@Request() req: any, @Body() body: { categoryId: string; amount: number; month?: string; projectId?: string | null }) {
  return this.service.create(req.user.id, { ...body, month: body.month ?? currentMonth() });
}
```

- [ ] **Step 7: Update controller PATCH body to accept `projectId`**

Find the `update` method (line 43):

```typescript
@Patch(':id')
update(@Param('id') id: string, @Request() req: any, @Body() body: { amount: number }) {
  return this.service.update(id, req.user.id, body);
}
```

Change the body type:

```typescript
@Patch(':id')
update(@Param('id') id: string, @Request() req: any, @Body() body: { amount: number; projectId?: string | null }) {
  return this.service.update(id, req.user.id, body);
}
```

- [ ] **Step 8: Verify API compiles**

```bash
npm run build:api
```

Expected: build completes with no TypeScript errors.

- [ ] **Step 9: Commit**

```bash
git add apps/api/src/budgets/budgets.service.ts apps/api/src/budgets/budgets.controller.ts
git commit -m "feat(api): pass projectId through budget create/update/propagate"
```

---

### Task 3: Web — Types, state, and project fetch

**Files:**
- Modify: `apps/web/src/app/budgets/page.tsx` (lines 1–67 area)

**Interfaces:**
- Produces: `Project` interface, updated `BudgetWithSpent` with `project` field, `projects` state, `projectDropOpen` state, `projectId` in form state.

- [ ] **Step 1: Add `Project` interface and update `BudgetWithSpent`**

At the top of `apps/web/src/app/budgets/page.tsx`, the current interfaces are (lines 10–15):

```typescript
interface Category { id: string; name: string; icon: string; color: string; type: string }
interface MonthSummary { month: string; total: number; count: number }
interface BudgetWithSpent {
  id: string; categoryId: string; category: Category; month?: string; sourceMonth?: string | null;
  amount: number; spent: number; percentage: number; remaining: number;
}
```

Replace with:

```typescript
interface Category { id: string; name: string; icon: string; color: string; type: string }
interface MonthSummary { month: string; total: number; count: number }
interface Project { id: string; name: string; icon: string; color?: string | null; type: string; status: string }
interface BudgetWithSpent {
  id: string; categoryId: string; category: Category; month?: string; sourceMonth?: string | null;
  amount: number; spent: number; percentage: number; remaining: number;
  projectId?: string | null; project?: Project | null;
}
```

- [ ] **Step 2: Add `projects` state and `projectDropOpen` state**

In the component state block (around line 60), after:
```typescript
const [catDropOpen, setCatDropOpen] = useState(false);
```

Add:
```typescript
const [projects, setProjects]           = useState<Project[]>([]);
const [projectDropOpen, setProjectDropOpen] = useState(false);
```

- [ ] **Step 3: Add `projectId` to form initial state**

Change (line 58):
```typescript
const [form, setForm]             = useState({ categoryId: '', amount: '' });
```

To:
```typescript
const [form, setForm]             = useState({ categoryId: '', amount: '', projectId: '' });
```

- [ ] **Step 4: Fetch projects on page load**

The data-fetch block (around lines 157–172) currently fetches budgets and categories in parallel:

```typescript
.then(() => Promise.all([
  fetch(`${API}/budgets?month=${month}`, { credentials: 'include' }).then(r => r.json()),
  fetch(`${API}/categories`, { credentials: 'include' }).then(r => r.json()),
]))
.then(([b, c]) => {
  setBudgets(Array.isArray(b) ? b : []);
  setCategories(Array.isArray(c) ? c : []);
})
```

Change to fetch projects too:

```typescript
.then(() => Promise.all([
  fetch(`${API}/budgets?month=${month}`, { credentials: 'include' }).then(r => r.json()),
  fetch(`${API}/categories`, { credentials: 'include' }).then(r => r.json()),
  fetch(`${API}/projects`, { credentials: 'include' }).then(r => r.json()),
]))
.then(([b, c, p]) => {
  setBudgets(Array.isArray(b) ? b : []);
  setCategories(Array.isArray(c) ? c : []);
  setProjects(Array.isArray(p) ? p : []);
})
```

- [ ] **Step 5: Update all form reset calls to include `projectId`**

There are several places that call `setForm({ categoryId: '', amount: '' })`. Change each one to:
```typescript
setForm({ categoryId: '', amount: '', projectId: '' })
```

Occurrences to update (search the file for `setForm({ categoryId: '', amount: '' })`):
1. Line 627: `onClick={() => { setFormKind('income'); setShowForm(true); setEditingId(null); setForm({ categoryId: '', amount: '' }); }}`
2. Line 650: same pattern
3. Line 230: `setShowForm(false); setEditingId(null); setForm({ categoryId: '', amount: '' });`

Also update the `handleSubmit` close at line 230 to also close `projectDropOpen`:
```typescript
setShowForm(false); setEditingId(null); setProjectDropOpen(false); setForm({ categoryId: '', amount: '', projectId: '' });
```

- [ ] **Step 6: Update the edit button's `setForm` call to include `projectId`**

Find the edit button (line 686):
```typescript
onClick={() => { setFormKind('income'); setEditingId(t.id); setForm({ categoryId: t.categoryId, amount: String(t.amount) }); setShowForm(true); }}
```

Change to:
```typescript
onClick={() => { setFormKind('income'); setEditingId(t.id); setForm({ categoryId: t.categoryId, amount: String(t.amount), projectId: t.projectId ?? '' }); setShowForm(true); }}
```

- [ ] **Step 7: Update modal close button to also reset `projectDropOpen`**

Find the close (✕) button inside the modal (line 750):
```typescript
onClick={() => { setShowForm(false); setEditingId(null); setCatDropOpen(false); }}
```

Change to:
```typescript
onClick={() => { setShowForm(false); setEditingId(null); setCatDropOpen(false); setProjectDropOpen(false); setForm({ categoryId: '', amount: '', projectId: '' }); }}
```

Also update the backdrop `onMouseDown` handler (line 723):
```typescript
onMouseDown={(e) => { if (e.target === e.currentTarget) { setShowForm(false); setEditingId(null); setCatDropOpen(false); } }}
```

Change to:
```typescript
onMouseDown={(e) => { if (e.target === e.currentTarget) { setShowForm(false); setEditingId(null); setCatDropOpen(false); setProjectDropOpen(false); setForm({ categoryId: '', amount: '', projectId: '' }); } }}
```

- [ ] **Step 8: Commit**

```bash
git add apps/web/src/app/budgets/page.tsx
git commit -m "feat(web): add Project type, projectId form state, and projects fetch to budgets page"
```

---

### Task 4: Web — Project picker in the income target modal

**Files:**
- Modify: `apps/web/src/app/budgets/page.tsx` (modal section, ~lines 755–830)

**Interfaces:**
- Consumes: `projects` state, `projectDropOpen` / `setProjectDropOpen`, `form.projectId` / `setForm` from Task 3.
- Consumes: `Budget.project` from Task 1 (API response shape).

- [ ] **Step 1: Add the project picker section after the category picker**

In the modal, the category picker section ends around line 788:
```typescript
                    </div>
                    </div>

                    {/* Amount */}
```

Insert the project picker between the category section closing `</div>` and the `{/* Amount */}` comment. The new block should only render when `formKind === 'income'`:

```tsx
                    {/* Project picker — income targets only */}
                    {formKind === 'income' && (
                      <div className="flex flex-col gap-1.5">
                        <span className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'var(--color-text-muted)' }}>
                          Project <span style={{ color: 'var(--color-text-muted)', fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>(optional)</span>
                        </span>
                        <div style={{ position: 'relative' }}>
                          {(() => {
                            const selProj = projects.find(p => p.id === form.projectId);
                            const projColor = selProj?.color ?? '#9B6DFF';
                            return (
                              <>
                                <button type="button" onClick={() => setProjectDropOpen(o => !o)}
                                  className="w-full px-3 py-2.5 text-sm flex items-center gap-2.5 rounded-xl outline-none text-left"
                                  style={{ background: 'var(--color-surface)', border: `1px solid ${selProj ? projColor + '44' : 'var(--color-border)'}`, color: selProj ? 'var(--color-text-primary)' : 'var(--color-text-muted)' }}>
                                  {selProj ? (
                                    <><span className="w-6 h-6 rounded-lg flex items-center justify-center text-sm shrink-0" style={{ background: `${projColor}20` }}>{selProj.icon}</span>
                                    <span className="flex-1 font-medium" style={{ color: projColor }}>{selProj.name}</span></>
                                  ) : <span className="flex-1">Select a project…</span>}
                                  <svg width="10" height="10" viewBox="0 0 12 12" fill="none" style={{ opacity: 0.4, flexShrink: 0, transform: projectDropOpen ? 'rotate(180deg)' : undefined }}>
                                    <path d="M2 4l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                                  </svg>
                                </button>
                                {projectDropOpen && (
                                  <div className="absolute top-full left-0 right-0 mt-1 rounded-xl overflow-hidden overflow-y-auto"
                                    style={{ background: 'var(--popover-bg)', border: '1px solid var(--color-border)', boxShadow: 'var(--glass-shadow)', zIndex: 10, maxHeight: '50vh' }}>
                                    {/* None option */}
                                    <button type="button"
                                      onClick={() => { setForm(f => ({ ...f, projectId: '' })); setProjectDropOpen(false); }}
                                      className="w-full flex items-center gap-2.5 px-3 py-2.5 text-sm transition-colors"
                                      style={{ background: form.projectId === '' ? 'rgba(155,109,255,0.08)' : 'transparent', color: form.projectId === '' ? 'var(--color-text-primary)' : 'var(--color-text-muted)' }}
                                      onMouseEnter={e => (e.currentTarget.style.background = 'rgba(155,109,255,0.06)')}
                                      onMouseLeave={e => (e.currentTarget.style.background = form.projectId === '' ? 'rgba(155,109,255,0.08)' : 'transparent')}>
                                      <span className="w-6 h-6 rounded-lg flex items-center justify-center text-sm shrink-0" style={{ background: 'rgba(155,109,255,0.12)' }}>—</span>
                                      <span className="font-medium">None</span>
                                    </button>
                                    {projects.filter(p => p.status === 'active').map(p => {
                                      const pc = p.color ?? '#9B6DFF';
                                      return (
                                        <button key={p.id} type="button"
                                          onClick={() => { setForm(f => ({ ...f, projectId: p.id })); setProjectDropOpen(false); }}
                                          className="w-full flex items-center gap-2.5 px-3 py-2.5 text-sm transition-colors"
                                          style={{ background: form.projectId === p.id ? `${pc}18` : 'transparent', color: form.projectId === p.id ? pc : 'var(--color-text-primary)' }}
                                          onMouseEnter={e => (e.currentTarget.style.background = `${pc}12`)}
                                          onMouseLeave={e => (e.currentTarget.style.background = form.projectId === p.id ? `${pc}18` : 'transparent')}>
                                          <span className="w-6 h-6 rounded-lg flex items-center justify-center text-sm shrink-0" style={{ background: `${pc}20` }}>{p.icon}</span>
                                          <span className="font-medium">{p.name}</span>
                                        </button>
                                      );
                                    })}
                                  </div>
                                )}
                              </>
                            );
                          })()}
                        </div>
                      </div>
                    )}
```

- [ ] **Step 2: Pass `projectId` in the `handleSubmit` POST payload**

In `handleSubmit` (line 225), the POST body currently is:
```typescript
body: JSON.stringify({ categoryId: form.categoryId, amount: amt, month })
```

Change to:
```typescript
body: JSON.stringify({ categoryId: form.categoryId, amount: amt, month, projectId: form.projectId || null })
```

Also update the PATCH for editing (line 220):
```typescript
body: JSON.stringify({ amount: amt })
```

Change to:
```typescript
body: JSON.stringify({ amount: amt, projectId: form.projectId || null })
```

And update the optimistic state update after PATCH (line 223) to also reflect the new `projectId`:
```typescript
setBudgets(bs => bs.map(b => b.id === editingId ? {
  ...b,
  amount: amt,
  projectId: form.projectId || null,
  project: projects.find(p => p.id === form.projectId) ?? null,
  percentage: amt > 0 ? Math.round((spentAmt / amt) * 100) : 0,
  remaining: amt - spentAmt
} : b));
```

And for the POST optimistic update (line 228), update the project field:
```typescript
setBudgets(bs => [...bs, {
  ...created,
  category: cat ?? created.category,
  project: projects.find(p => p.id === form.projectId) ?? null,
  amount: amt, spent: 0, percentage: 0, remaining: amt
}]);
```

- [ ] **Step 3: Verify the modal renders and the project dropdown works**

Start both servers:
```bash
npm run dev:api &
npm run dev:web
```

Open http://localhost:3000/budgets, click "Add Target", confirm:
- The PROJECT (optional) section appears below CATEGORY.
- Opening the dropdown shows "None" plus all active projects.
- Selecting a project highlights it and closes the dropdown.
- Selecting "None" clears the selection.
- Category dropdown still works independently.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/budgets/page.tsx
git commit -m "feat(web): add project picker to income target modal"
```

---

### Task 5: Web — Show project on income target card

**Files:**
- Modify: `apps/web/src/app/budgets/page.tsx` (target card render, ~lines 656–711)

**Interfaces:**
- Consumes: `BudgetWithSpent.project: Project | null` from Task 3.

- [ ] **Step 1: Add project badge to target card**

Inside the target card, the category row currently is (lines 670–683):

```tsx
<div className="flex items-center justify-between gap-2">
  <div className="flex items-center gap-2.5 min-w-0">
    <span className="w-8 h-8 rounded-lg flex items-center justify-center text-base shrink-0"
      style={{ background: `${tColor}20`, border: `1px solid ${tColor}30` }}>
      {t.category?.icon ?? '💼'}
    </span>
    <span className="text-sm font-semibold truncate">{t.category?.name ?? 'Unknown'}</span>
    {reached && (
      <span className="text-[9px] font-bold px-2 py-0.5 rounded-full shrink-0"
        style={{ background: 'color-mix(in srgb, var(--color-green) 15%, transparent)', color: 'var(--color-green)' }}>
        GOAL MET
      </span>
    )}
  </div>
  ...
```

Change the inner `<div className="flex items-center gap-2.5 min-w-0">` block to stack the category name and project badge vertically:

```tsx
<div className="flex items-center gap-2.5 min-w-0">
  <span className="w-8 h-8 rounded-lg flex items-center justify-center text-base shrink-0"
    style={{ background: `${tColor}20`, border: `1px solid ${tColor}30` }}>
    {t.category?.icon ?? '💼'}
  </span>
  <div className="flex flex-col min-w-0">
    <div className="flex items-center gap-1.5">
      <span className="text-sm font-semibold truncate">{t.category?.name ?? 'Unknown'}</span>
      {reached && (
        <span className="text-[9px] font-bold px-2 py-0.5 rounded-full shrink-0"
          style={{ background: 'color-mix(in srgb, var(--color-green) 15%, transparent)', color: 'var(--color-green)' }}>
          GOAL MET
        </span>
      )}
    </div>
    {t.project && (
      <span className="text-[11px] truncate flex items-center gap-1" style={{ color: 'var(--color-text-muted)' }}>
        <span>{t.project.icon}</span>
        <span>{t.project.name}</span>
      </span>
    )}
  </div>
</div>
```

- [ ] **Step 2: Verify project badge renders on the card**

In the browser at http://localhost:3000/budgets:
1. Create a new income target and link it to a project.
2. After saving, confirm the target card shows a small `{icon} {name}` line below the category name.
3. Create a target with no project — confirm no badge appears.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/budgets/page.tsx
git commit -m "feat(web): show linked project on income target card"
```

---

### Task 6: End-to-end verification

- [ ] **Step 1: Full create flow**

1. Open http://localhost:3000/budgets.
2. Click "Add Target".
3. Select a category (e.g., Freelance).
4. Select a project from the dropdown.
5. Enter an amount and click "Create Target".
6. Confirm the new card shows the category AND the project badge.

- [ ] **Step 2: Edit flow**

1. Click the ✏️ edit button on a target that has a project.
2. Confirm the project dropdown pre-selects the linked project.
3. Change the project to "None" and save.
4. Confirm the project badge disappears from the card.

- [ ] **Step 3: No-project flow**

1. Create a target without selecting a project.
2. Confirm the card shows only the category — no project badge.

- [ ] **Step 4: Expense budget form unchanged**

1. Click "Add Budget" (expense side).
2. Confirm the project picker does NOT appear — it's income-only.
