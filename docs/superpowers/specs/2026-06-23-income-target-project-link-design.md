# Income Target — Project Link

**Date:** 2026-06-23  
**Status:** Approved

## Goal

Allow income targets to be optionally linked to a project. The link is visible in the creation form and on the target card after saving.

## Scope

- DB migration: add nullable `projectId` to `budgets`
- API: Budget entity, DTO, and service updated to carry `project` relation
- Web: income target modal gets a second dropdown for project selection
- Web: income target card shows project icon + name when linked

---

## 1. Database

Add a nullable FK column to the existing `budgets` table:

```sql
ALTER TABLE budgets
  ADD COLUMN "projectId" uuid REFERENCES projects(id) ON DELETE SET NULL;
```

No data migration needed — existing rows default to `NULL`.

---

## 2. API (`apps/api/`)

### Budget entity (`budget.entity.ts`)

Add two fields:

```typescript
@Column({ nullable: true })
projectId: string | null;

@ManyToOne(() => Project, { nullable: true, eager: true })
@JoinColumn({ name: 'projectId' })
project: Project | null;
```

Import `Project` entity in `database.config.ts` entities array (already present for transactions — verify it's listed).

### DTOs

`CreateBudgetDto` and `UpdateBudgetDto`: add optional `projectId?: string | null`.

### Service

The existing query already eager-loads `category`. Confirm `project` is included via the eager flag on the relation (TypeORM eager loads automatically). If using a QueryBuilder path, add `.leftJoinAndSelect('budget.project', 'project')`.

---

## 3. Web — Form (`apps/web/src/app/budgets/page.tsx`)

### State

```typescript
// existing
const [form, setForm] = useState({ categoryId: '', amount: '' });
// becomes
const [form, setForm] = useState({ categoryId: '', amount: '', projectId: '' });
```

### Data fetch

Add a `projects` state and fetch on page load alongside categories:

```typescript
fetch(`${API}/projects`, { credentials: 'include' }).then(r => r.json())
```

### Modal UI

Immediately after the CATEGORY section, add a PROJECT section — rendered only when `formKind === 'income'`:

```
[ PROJECT (optional) ]
┌───────────────────────────────┐
│ Select a project...        ▼  │
└───────────────────────────────┘
  ▾  (None)
  ▾  🚗 Honda Civic
  ▾  🏠 Beach House
  ▾  💼 Freelance Co.
```

- Identical visual style to the category dropdown (same class names, same color-coded highlight on selection)
- "None" row at the top clears `form.projectId` to `''`
- Selecting a project sets `form.projectId = project.id`
- `projectDropOpen` boolean controls open/close, same pattern as `catDropOpen`
- Pass `projectId: form.projectId || null` in the create/update payload

---

## 4. Web — Target Card

When `target.project` is set, render a secondary line below the category name:

```
💼 Freelance Co.
```

Style: small text, muted color (e.g. `var(--color-text-secondary)`), same row layout as other meta lines on the card.

---

## Non-goals

- No filtering of project categories based on selected project
- No aggregation of "project income vs target" on the project detail page (future feature)
- No required validation — project link is always optional
