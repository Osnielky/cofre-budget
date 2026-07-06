# Subscription Expense Identifier Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade the Insights panel from a passive tracker into a proactive tool that identifies unnecessary recurring expenses, detects duplicate services, monitors for charges after cancellation, and shows money saved.

**Architecture:** All changes are frontend-only in `InsightsPanel.tsx`. The `SubscriptionStore` type gains a `cancelledAt` field. `DigestView` gets a burden header, duplicate-detection section, and a "Still Charging" warning block. `TransactionDetailView` gets a post-cancellation warning banner. The savings counter goes in the digest footer. No backend changes.

**Tech Stack:** React 19, Next.js 16, TypeScript, Tailwind v4, CSS variables (glassmorphism). No test runner — verification is `npx nx build web` + visual inspection.

## Global Constraints

- Glassmorphism: surfaces use `rgba(35,35,47,0.5)` + `backdropFilter: blur()` — never solid `--color-surface` on cards.
- Accent colors: `--color-card-violet`, `--color-card-green`, `--color-card-orange`, `--color-card-amber` (`#F5C842`), `--color-card-sky`. Status: `--color-green`, `--color-rose`. Text: `--color-text-primary/secondary/muted`. Surface: `--color-surface`, `--color-elevated`, `--color-border`.
- Only file changed in Tasks 1–4: `apps/web/src/app/transactions/InsightsPanel.tsx`.
- `normalize` and `RecurringInfo` are already imported from `./recurring` — do not import them again.
- `SubscriptionStore` is exported — the type change in Task 3 propagates to `page.tsx` automatically; no changes needed there.
- No comments unless the WHY is non-obvious.
- Working directory: `/Users/osnielky/Desktop/cofre-budget`.

---

### Task 1: Burden Header + Unreviewed Status Indicators

**Files:**
- Modify: `apps/web/src/app/transactions/InsightsPanel.tsx` — `DigestView` function only

**What this does:** Adds a colored burden card above the recurring list that shows how many subscriptions are unreviewed and their total monthly cost. Changes the sort order so unreviewed charges appear first. Replaces the existing status badge with a three-state indicator (Review / Tracked / To cancel). Hides cancelled merchants from the main list.

**Interfaces:**
- Consumes: existing `DigestView` props (unchanged), existing `subscriptions` state
- Produces: no new exports; pure visual change

- [ ] **Step 1: Update the sort + filter logic in `DigestView`**

Replace the existing `recurringThisMonth` derivation (around line 92) with:

```tsx
function statusPriority(sub: { status: SubStatus } | undefined): number {
  if (!sub) return 0;
  if (sub.status === 'to-cancel') return 1;
  if (sub.status === 'active') return 2;
  return 3; // cancelled — filtered out below
}

const recurringThisMonth = [...recurringMap.values()]
  .filter((r) => r.occurrences.some((o) => o.month === currentMonth))
  .filter((r) => subscriptions[r.normalized]?.status !== 'cancelled')
  .sort((a, b) => {
    const pa = statusPriority(subscriptions[a.normalized]);
    const pb = statusPriority(subscriptions[b.normalized]);
    if (pa !== pb) return pa - pb;
    return b.medianAmount - a.medianAmount;
  });

const unreviewedList = recurringThisMonth.filter((r) => !subscriptions[r.normalized]);
const unreviewedTotal = unreviewedList.reduce((sum, r) => sum + r.medianAmount, 0);
```

Define `statusPriority` outside `DigestView` (after the `DigestView` function's closing brace, before `TransactionDetailView`) so it doesn't re-create on every render.

- [ ] **Step 2: Add the burden card above the recurring list**

Inside the `DigestView` return, before the `{/* Recurring this month */}` div, add:

```tsx
{/* Burden header */}
{recurringThisMonth.length > 0 && (
  <div className="rounded-xl px-3 py-2.5"
    style={{
      background: unreviewedList.length > 0
        ? 'color-mix(in srgb, var(--color-card-amber) 8%, transparent)'
        : 'color-mix(in srgb, var(--color-green) 8%, transparent)',
      border: `1px solid ${unreviewedList.length > 0
        ? 'color-mix(in srgb, var(--color-card-amber) 20%, transparent)'
        : 'color-mix(in srgb, var(--color-green) 20%, transparent)'}`,
    }}>
    {unreviewedList.length > 0 ? (
      <>
        <p className="text-xs font-bold" style={{ color: 'var(--color-card-amber)' }}>
          {unreviewedList.length} unreviewed subscription{unreviewedList.length !== 1 ? 's' : ''}
        </p>
        <p className="text-[10px] mt-0.5" style={{ color: 'var(--color-text-muted)' }}>
          ${unreviewedTotal.toFixed(2)}/mo you haven&apos;t evaluated yet
        </p>
      </>
    ) : (
      <>
        <p className="text-xs font-bold" style={{ color: 'var(--color-green)' }}>
          All subscriptions reviewed ✓
        </p>
        <p className="text-[10px] mt-0.5" style={{ color: 'var(--color-text-muted)' }}>
          Nothing new to evaluate this month
        </p>
      </>
    )}
  </div>
)}
```

- [ ] **Step 3: Update the status badge on each recurring row**

In the `.map((r) => ...)` block, replace the existing `{sub && sub.status !== 'cancelled' && (...)}` badge with:

```tsx
{!sub ? (
  <span className="text-[9px] font-bold px-1.5 py-0.5 rounded shrink-0"
    style={{ background: 'color-mix(in srgb, var(--color-card-amber) 15%, transparent)', color: 'var(--color-card-amber)' }}>
    Review
  </span>
) : sub.status === 'to-cancel' ? (
  <span className="text-[9px] font-bold px-1.5 py-0.5 rounded shrink-0"
    style={{ background: 'color-mix(in srgb, var(--color-rose) 15%, transparent)', color: 'var(--color-rose)' }}>
    To cancel
  </span>
) : (
  <span className="text-[9px] font-bold px-1.5 py-0.5 rounded shrink-0"
    style={{ background: 'color-mix(in srgb, var(--color-green) 15%, transparent)', color: 'var(--color-green)' }}>
    Tracked
  </span>
)}
```

- [ ] **Step 4: Build and verify**

```bash
npx nx build web 2>&1 | tail -5
```

Expected: `NX   Successfully ran target build for project web`

Visual checks:
- Burden card appears at top of digest (amber when unreviewed exist, green when all reviewed)
- Unreviewed merchants appear at top of list with amber "Review" badge
- Cancelled merchants no longer appear in the list

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/transactions/InsightsPanel.tsx
git commit -m "feat(insights): burden header + unreviewed status indicators"
```

---

### Task 2: Duplicate Service Detection

**Files:**
- Modify: `apps/web/src/app/transactions/InsightsPanel.tsx` — `DigestView` function only

**What this does:** Detects when two or more unreviewed recurring merchants share the same expense category (e.g., two streaming services, two gym memberships). Shows a "Possible Duplicates" section above the main recurring list so the user knows to evaluate both.

**Interfaces:**
- Consumes: `transactions` (already a `DigestView` prop), `recurringMap`, `subscriptions`
- Produces: no new exports

- [ ] **Step 1: Compute `merchantCategoryMap` and `duplicateGroups` inside `DigestView`**

Add after the `unreviewedTotal` line:

```tsx
// Map each recurring merchant to its most common expense category
const merchantCategoryMap = new Map<string, { id: string; name: string; icon: string; color: string } | null>();
for (const r of recurringMap.values()) {
  const counts = new Map<string, { count: number; ref: { id: string; name: string; icon: string; color: string } }>();
  for (const t of transactions) {
    if (normalize(t.name) !== r.normalized || !t.categoryRef || t.categoryRef.type !== 'expense') continue;
    const existing = counts.get(t.categoryRef.id);
    if (existing) existing.count++;
    else counts.set(t.categoryRef.id, { count: 1, ref: t.categoryRef });
  }
  if (counts.size === 0) { merchantCategoryMap.set(r.normalized, null); continue; }
  const top = [...counts.values()].sort((a, b) => b.count - a.count)[0];
  merchantCategoryMap.set(r.normalized, top.ref);
}

// Group unreviewed recurring merchants by category; flag when 2+ share one
const catGroups = new Map<string, { cat: { id: string; name: string; icon: string; color: string }; merchants: typeof recurringThisMonth }>();
for (const r of unreviewedList) {
  const cat = merchantCategoryMap.get(r.normalized);
  if (!cat) continue;
  if (!catGroups.has(cat.id)) catGroups.set(cat.id, { cat, merchants: [] });
  catGroups.get(cat.id)!.merchants.push(r);
}
const duplicateGroups = [...catGroups.values()].filter((g) => g.merchants.length >= 2);
```

- [ ] **Step 2: Render the "Possible Duplicates" section**

Add this block inside the `DigestView` return, after the burden header and before the `{/* Recurring this month */}` block:

```tsx
{/* Possible duplicates */}
{duplicateGroups.length > 0 && (
  <div>
    <p className="text-[10px] font-bold tracking-widest uppercase mb-2"
      style={{ color: 'var(--color-card-amber)' }}>
      Possible Duplicates
    </p>
    <div className="flex flex-col gap-1.5">
      {duplicateGroups.map(({ cat, merchants }) => (
        <div key={cat.id} className="rounded-xl p-3"
          style={{
            background: 'color-mix(in srgb, var(--color-card-amber) 8%, transparent)',
            border: '1px solid color-mix(in srgb, var(--color-card-amber) 20%, transparent)',
          }}>
          <p className="text-[10px] font-semibold mb-2"
            style={{ color: 'var(--color-card-amber)' }}>
            {cat.icon} {cat.name} — {merchants.length} services
          </p>
          {merchants.map((r) => (
            <div key={r.normalized} className="flex items-center justify-between py-0.5">
              <span className="text-[11px]" style={{ color: 'var(--color-text-secondary)' }}>
                {r.displayName}
              </span>
              <span className="text-[11px] tabular-nums" style={{ color: 'var(--color-text-muted)' }}>
                ${r.medianAmount.toFixed(2)}/mo
              </span>
            </div>
          ))}
          <p className="text-[10px] mt-2 pt-1.5 border-t"
            style={{ color: 'var(--color-text-muted)', borderColor: 'color-mix(in srgb, var(--color-card-amber) 20%, transparent)' }}>
            Do you need both? ${merchants.reduce((s, r) => s + r.medianAmount, 0).toFixed(2)}/mo total
          </p>
        </div>
      ))}
    </div>
  </div>
)}
```

- [ ] **Step 3: Build and verify**

```bash
npx nx build web 2>&1 | tail -5
```

Expected: `NX   Successfully ran target build for project web`

Visual checks:
- If two unreviewed recurring merchants share the same expense category, a "Possible Duplicates" amber card appears
- Each card lists the merchants and a combined monthly total
- The section does not appear when all recurring merchants are in unique categories or are already reviewed

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/transactions/InsightsPanel.tsx
git commit -m "feat(insights): duplicate service detection by category"
```

---

### Task 3: cancelledAt + Post-Cancellation Monitoring

**Files:**
- Modify: `apps/web/src/app/transactions/InsightsPanel.tsx` — `SubscriptionStore` type, `SubscriptionControls`, `TransactionDetailView`, `DigestView`

**What this does:** Stores the cancellation date when a subscription is marked cancelled. In the detail view, shows a warning banner if any transaction for that merchant occurred after the cancellation date. In the digest, adds a "Still Charging!" section listing cancelled merchants that have post-cancellation charges, with a "Re-open cancellation" button.

**Interfaces:**
- Consumes: `sub.cancelledAt?: string` (new field — ISO date string `YYYY-MM-DD`)
- Produces: updated `SubscriptionStore` export type (automatically picked up by `page.tsx` via import)

- [ ] **Step 1: Update the `SubscriptionStore` type**

On line 18, change:

```ts
export type SubscriptionStore = Record<string, { note: string; status: SubStatus }>;
```

to:

```ts
export type SubscriptionStore = Record<string, { note: string; status: SubStatus; cancelledAt?: string }>;
```

- [ ] **Step 2: Store `cancelledAt` in `SubscriptionControls.update()`**

In `SubscriptionControls`, update the `update` function:

```ts
function update(patch: Partial<{ note: string; status: SubStatus }>) {
  const cancelledAt = patch.status === 'cancelled'
    ? new Date().toISOString().slice(0, 10)
    : sub?.cancelledAt;
  onSubscriptionChange({
    ...subscriptions,
    [merchantKey]: {
      note: noteValue,
      status: 'active',
      ...sub,
      ...patch,
      ...(cancelledAt ? { cancelledAt } : {}),
    },
  });
}
```

- [ ] **Step 3: Add post-cancellation warning in `TransactionDetailView`**

After the `const [historyOpen, setHistoryOpen]` line, add:

```tsx
const postCancellationCharges = sub?.status === 'cancelled' && sub.cancelledAt
  ? allOccurrences.filter((o) => o.date > sub.cancelledAt!)
  : [];
```

Then inside the `TransactionDetailView` return, add this warning block immediately after the Details pills `</div>` and before the History block:

```tsx
{/* Post-cancellation warning */}
{postCancellationCharges.length > 0 && (
  <div className="rounded-xl px-3 py-2.5"
    style={{
      background: 'color-mix(in srgb, var(--color-rose) 10%, transparent)',
      border: '1px solid color-mix(in srgb, var(--color-rose) 25%, transparent)',
    }}>
    <p className="text-xs font-bold" style={{ color: 'var(--color-rose)' }}>
      ⚠ Still charging after cancellation
    </p>
    <p className="text-[10px] mt-0.5" style={{ color: 'var(--color-text-muted)' }}>
      {postCancellationCharges.length} charge{postCancellationCharges.length !== 1 ? 's' : ''} detected after {sub!.cancelledAt}
    </p>
  </div>
)}
```

- [ ] **Step 4: Add "Still Charging!" section in `DigestView`**

Add after the `const duplicateGroups` line:

```tsx
const stillCharging = [...recurringMap.values()].filter((r) => {
  const sub = subscriptions[r.normalized];
  return sub?.status === 'cancelled' && sub.cancelledAt &&
    r.occurrences.some((o) => o.date > sub.cancelledAt!);
});
```

Then inside the `DigestView` return, add this block after the `{/* To Cancel */}` section and before the `{/* Monthly total */}` footer:

```tsx
{/* Still charging after cancellation */}
{stillCharging.length > 0 && (
  <div>
    <p className="text-[10px] font-bold tracking-widest uppercase mb-2"
      style={{ color: 'var(--color-rose)' }}>
      Still Charging!
    </p>
    <div className="flex flex-col gap-1.5">
      {stillCharging.map((r) => {
        const sub = subscriptions[r.normalized]!;
        const postCharges = r.occurrences.filter((o) => o.date > sub.cancelledAt!);
        const postTotal = postCharges.reduce((s, o) => s + o.amount, 0);
        return (
          <div key={r.normalized} className="rounded-xl px-3 py-2.5"
            style={{
              background: 'color-mix(in srgb, var(--color-rose) 10%, transparent)',
              border: '1px solid color-mix(in srgb, var(--color-rose) 25%, transparent)',
            }}>
            <p className="text-xs font-semibold truncate">{r.displayName}</p>
            <p className="text-[10px] mt-0.5" style={{ color: 'var(--color-text-muted)' }}>
              {postCharges.length} charge{postCharges.length !== 1 ? 's' : ''} after cancellation · ${postTotal.toFixed(2)} total
            </p>
            <button
              onClick={() => onSubscriptionChange({
                ...subscriptions,
                [r.normalized]: { ...sub, status: 'to-cancel' },
              })}
              className="mt-2 text-[10px] font-semibold px-2 py-1 rounded-lg transition-all hover:brightness-110"
              style={{
                background: 'color-mix(in srgb, var(--color-rose) 15%, transparent)',
                color: 'var(--color-rose)',
                border: '1px solid color-mix(in srgb, var(--color-rose) 25%, transparent)',
              }}>
              Re-open cancellation
            </button>
          </div>
        );
      })}
    </div>
  </div>
)}
```

- [ ] **Step 5: Build and verify**

```bash
npx nx build web 2>&1 | tail -5
```

Expected: `NX   Successfully ran target build for project web`

Visual checks:
- Clicking "Done — cancelled ✓" on a subscription stores today's date as `cancelledAt` in localStorage
- If you then click a transaction from that merchant dated after the cancellation date, the detail view shows the ⚠ warning banner
- The digest "Still Charging!" section appears for any cancelled merchant with post-cancellation occurrences

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/app/transactions/InsightsPanel.tsx
git commit -m "feat(insights): cancelledAt field + post-cancellation monitoring"
```

---

### Task 4: Savings Recovered Counter

**Files:**
- Modify: `apps/web/src/app/transactions/InsightsPanel.tsx` — `DigestView` footer only

**What this does:** Calculates the monthly savings from cancelled subscriptions that have no post-cancellation charges (confirmed cancellations). Shows a green `✓ $Y/mo saved` line below the existing `↻ $X/mo in recurring charges` footer line.

**Interfaces:**
- Consumes: `recurringMap`, `subscriptions` (already available in `DigestView`)
- Produces: no new exports

- [ ] **Step 1: Compute `confirmedSavings` inside `DigestView`**

Add after the `stillCharging` computation from Task 3:

```tsx
const confirmedSavings = [...recurringMap.values()]
  .filter((r) => {
    const sub = subscriptions[r.normalized];
    if (!sub || sub.status !== 'cancelled') return false;
    if (!sub.cancelledAt) return true;
    return !r.occurrences.some((o) => o.date > sub.cancelledAt!);
  })
  .reduce((sum, r) => sum + r.medianAmount, 0);
```

- [ ] **Step 2: Update the monthly total footer**

Replace the existing `{/* Monthly total */}` block:

```tsx
{/* Monthly total */}
{totalRecurring > 0 && (
  <div className="rounded-xl px-3 py-2.5 text-center"
    style={{ background: 'var(--color-elevated)', border: '1px solid var(--color-border)' }}>
    <p className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>
      ↻ <span className="font-bold">${totalRecurring.toFixed(2)}</span>/mo in recurring charges
    </p>
  </div>
)}
```

with:

```tsx
{/* Monthly total + savings */}
{(totalRecurring > 0 || confirmedSavings > 0) && (
  <div className="rounded-xl px-3 py-2.5 flex flex-col gap-1"
    style={{ background: 'var(--color-elevated)', border: '1px solid var(--color-border)' }}>
    {totalRecurring > 0 && (
      <p className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>
        ↻ <span className="font-bold tabular-nums">${totalRecurring.toFixed(2)}</span>/mo in recurring charges
      </p>
    )}
    {confirmedSavings > 0 && (
      <p className="text-[11px]" style={{ color: 'var(--color-green)' }}>
        ✓ <span className="font-bold tabular-nums">${confirmedSavings.toFixed(2)}</span>/mo saved
      </p>
    )}
  </div>
)}
```

- [ ] **Step 3: Build and verify**

```bash
npx nx build web 2>&1 | tail -5
```

Expected: `NX   Successfully ran target build for project web`

Visual checks:
- After marking a subscription as cancelled (with no post-cancellation charges in the transaction history), the footer shows a green `✓ $X/mo saved` line
- The line does not appear if there are post-cancellation charges (those go to "Still Charging!" instead)
- The existing `↻ $X/mo in recurring charges` line is unchanged

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/transactions/InsightsPanel.tsx
git commit -m "feat(insights): savings recovered counter in digest footer"
```
