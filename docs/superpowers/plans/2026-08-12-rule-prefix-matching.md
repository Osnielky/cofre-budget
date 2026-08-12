# Rule Prefix Matching Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an optional "starts with" match strategy to categorization rules, editable in Settings, so rules can auto-categorize ACH/payroll-style transactions whose text embeds a unique id and therefore never matches an exact-text rule.

**Architecture:** One new `matchStrategy: 'exact' | 'prefix'` column on `CategorizationRule` (defaulting to `'exact'`), threaded through the existing matching (`matchRule`, `applyToUncategorized`) and duplicate-detection logic in `CategorizationRulesService`. The one-click "Make permanent" creation flow is untouched — it always creates `'exact'` rules, matching current behavior. Only the Settings edit form gains a strategy toggle.

**Tech Stack:** NestJS 11 + TypeORM (api, `synchronize: true` — no migrations needed), Next.js 16 / React 19 / Tailwind v4 (web).

## Global Constraints

- No test runner is configured for either app — verify manually: `npm run build:api` / `npm run build:web` for type-safety, `curl`/psql for backend behavior, and a real browser (`npm run dev:web`) for UI behavior.
- No change to the one-click "Make permanent" trigger in the transaction view, and no change to the rule-provenance pin indicator — both already work correctly regardless of match strategy, since both only read/write `categoryId`/`categorizedByRuleId`.
- No AI-categorization work of any kind — out of scope per the design spec.
- No additional validation on prefix length/broadness — matches this repo's existing "trust the user" posture for rule text.

---

## Task 1: Backend — add `matchStrategy` and thread it through matching/duplicate-detection

**Files:**
- Modify: `apps/api/src/categorization-rules/categorization-rule.entity.ts`
- Modify: `apps/api/src/categorization-rules/categorization-rules.service.ts`
- Modify: `apps/api/src/categorization-rules/categorization-rules.controller.ts`

**Interfaces:**
- Consumes: nothing new from outside this task.
- Produces: `CategorizationRule.matchStrategy: 'exact' | 'prefix'` (new column, default `'exact'`). `CategorizationRulesService.update()`'s DTO gains an optional `matchStrategy?: 'exact' | 'prefix'`. `matchRule()`'s signature is unchanged (`(rules, candidate) => CategorizationRule | null`) but its internal precedence logic changes. Consumed by Task 2 (frontend edit form) via the `PATCH /categorization-rules/:id` body and the `GET /categorization-rules` response's `matchStrategy` field.

- [ ] **Step 1: Add the `matchStrategy` column and extend the uniqueness constraint**

In `apps/api/src/categorization-rules/categorization-rule.entity.ts`, change the class comment and `@Unique` decorator from:

```ts
/* Match text/category is fixed once created except via update(); duplicates for the
   same user+matchType+matchValue are rejected at create/update time (service-level
   check backed by this DB constraint). */
@Entity('categorization_rules')
@Unique(['userId', 'matchType', 'matchValue'])
export class CategorizationRule {
```

to:

```ts
/* Match text/category is fixed once created except via update(); duplicates for the
   same user+matchType+matchValue+matchStrategy are rejected at create/update time
   (service-level check backed by this DB constraint). */
@Entity('categorization_rules')
@Unique(['userId', 'matchType', 'matchValue', 'matchStrategy'])
export class CategorizationRule {
```

Add the new column right after `matchValue` (and before the `category`/`categoryId` fields):

```ts
  @Column()
  matchValue: string;

  /* 'exact' requires the full text to match; 'prefix' matches anything starting
     with matchValue — needed for ACH/payroll-style transactions that embed a
     unique id after a stable prefix. */
  @Column({ default: 'exact' })
  matchStrategy: 'exact' | 'prefix';

  @ManyToOne(() => Category, { onDelete: 'CASCADE' })
```

- [ ] **Step 2: Update `matchRule()`'s precedence logic**

In `apps/api/src/categorization-rules/categorization-rules.service.ts`, change `matchRule` from:

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

to:

```ts
  /* Picks the rule a new, uncategorized transaction should be categorized by, or
     null. Precedence: merchant-type before name-type; within each type, an exact
     match before a prefix match (exact is the more specific claim). */
  matchRule(rules: CategorizationRule[], candidate: { merchantName?: string | null; name: string }): CategorizationRule | null {
    const norm = (s: string) => s.trim().toLowerCase();
    const isMatch = (r: CategorizationRule, value: string) => {
      const v = norm(value);
      const rv = norm(r.matchValue);
      return r.matchStrategy === 'prefix' ? v.startsWith(rv) : v === rv;
    };
    const bestOfType = (matchType: 'merchant' | 'name', value: string): CategorizationRule | null => {
      const candidates = rules.filter((r) => r.matchType === matchType && isMatch(r, value));
      return candidates.find((r) => r.matchStrategy === 'exact') ?? candidates[0] ?? null;
    };
    if (candidate.merchantName) {
      const m = bestOfType('merchant', candidate.merchantName);
      if (m) return m;
    }
    return bestOfType('name', candidate.name);
  }
```

- [ ] **Step 3: Update `applyToUncategorized()` to branch on strategy**

Change `applyToUncategorized` from:

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

to:

```ts
  private async applyToUncategorized(userId: string, matchType: 'merchant' | 'name', matchValue: string, matchStrategy: 'exact' | 'prefix', categoryId: string, ruleId: string): Promise<number> {
    const column = matchType === 'merchant' ? 'merchantName' : 'name';
    const qb = this.txRepo
      .createQueryBuilder()
      .update(Transaction)
      .set({ categoryId, categorizedByRuleId: ruleId })
      .where('userId = :userId', { userId })
      .andWhere('categoryId IS NULL');
    if (matchStrategy === 'prefix') {
      // POSITION(...) = 1 avoids LIKE's %/_ wildcard-escaping concerns entirely — a
      // plain "does this substring start at position 1" check.
      qb.andWhere(`POSITION(LOWER(:matchValue) IN LOWER(TRIM("${column}"))) = 1`, { matchValue });
    } else {
      qb.andWhere(`LOWER(TRIM("${column}")) = LOWER(:matchValue)`, { matchValue });
    }
    const result = await qb.execute();
    return result.affected ?? 0;
  }
```

- [ ] **Step 4: Update `create()` — always exact, but scope duplicate-detection to `matchStrategy = 'exact'`**

Change `create()`'s pre-check from:

```ts
    const existing = await this.repo
      .createQueryBuilder('rule')
      .where('rule.userId = :userId', { userId })
      .andWhere('rule.matchType = :matchType', { matchType })
      .andWhere('LOWER(rule.matchValue) = LOWER(:matchValue)', { matchValue })
      .getOne();
    if (existing) {
      throw new ConflictException({ message: 'A rule for this merchant already exists', existingRuleId: existing.id });
    }

    let rule: CategorizationRule;
    try {
      rule = await this.repo.save(this.repo.create({ userId, matchType, matchValue, categoryId }));
    } catch (err) {
      throw await this.toConflictOrRethrow(err, userId, matchType, matchValue);
    }
    const appliedCount = await this.applyToUncategorized(userId, matchType, matchValue, categoryId, rule.id);
```

to:

```ts
    const existing = await this.repo
      .createQueryBuilder('rule')
      .where('rule.userId = :userId', { userId })
      .andWhere('rule.matchType = :matchType', { matchType })
      .andWhere('rule.matchStrategy = :matchStrategy', { matchStrategy: 'exact' })
      .andWhere('LOWER(rule.matchValue) = LOWER(:matchValue)', { matchValue })
      .getOne();
    if (existing) {
      throw new ConflictException({ message: 'A rule for this merchant already exists', existingRuleId: existing.id });
    }

    let rule: CategorizationRule;
    try {
      rule = await this.repo.save(this.repo.create({ userId, matchType, matchValue, categoryId }));
    } catch (err) {
      throw await this.toConflictOrRethrow(err, userId, matchType, matchValue, 'exact');
    }
    const appliedCount = await this.applyToUncategorized(userId, matchType, matchValue, 'exact', categoryId, rule.id);
```

(`this.repo.create({ userId, matchType, matchValue, categoryId })` is unchanged — omitting `matchStrategy` lets the entity's `@Column({ default: 'exact' })` apply at the database level, so every one-click-created rule is `'exact'` exactly as before.)

- [ ] **Step 5: Update `update()` to accept and apply `matchStrategy`**

Change `update()`'s signature and body from:

```ts
  async update(id: string, userId: string, dto: { matchValue?: string; categoryId?: string }): Promise<RuleWithApplyCount> {
    const rule = await this.repo.findOneBy({ id });
    if (!rule) throw new NotFoundException();
    if (rule.userId !== userId) throw new ForbiddenException();

    if (dto.categoryId) {
      const category = await this.catRepo.findOneBy({ id: dto.categoryId });
      if (!category || category.userId !== userId) throw new ForbiddenException('Category not found');
      rule.categoryId = dto.categoryId;
    }

    if (dto.matchValue !== undefined) {
      const matchValue = dto.matchValue.trim();
      if (!matchValue) throw new BadRequestException('Match text cannot be empty');
      const existing = await this.repo
        .createQueryBuilder('rule')
        .where('rule.userId = :userId', { userId })
        .andWhere('rule.matchType = :matchType', { matchType: rule.matchType })
        .andWhere('LOWER(rule.matchValue) = LOWER(:matchValue)', { matchValue })
        .getOne();
      if (existing && existing.id !== rule.id) {
        throw new ConflictException({ message: 'A rule for this merchant already exists', existingRuleId: existing.id });
      }
      rule.matchValue = matchValue;
    }

    try {
      await this.repo.save(rule);
    } catch (err) {
      throw await this.toConflictOrRethrow(err, userId, rule.matchType, rule.matchValue, rule.id);
    }
    const appliedCount = await this.applyToUncategorized(userId, rule.matchType, rule.matchValue, rule.categoryId, rule.id);
    return { rule: await this.repo.findOne({ where: { id: rule.id }, relations: ['category'] }), appliedCount };
  }
```

to:

```ts
  async update(id: string, userId: string, dto: { matchValue?: string; categoryId?: string; matchStrategy?: 'exact' | 'prefix' }): Promise<RuleWithApplyCount> {
    const rule = await this.repo.findOneBy({ id });
    if (!rule) throw new NotFoundException();
    if (rule.userId !== userId) throw new ForbiddenException();

    if (dto.categoryId) {
      const category = await this.catRepo.findOneBy({ id: dto.categoryId });
      if (!category || category.userId !== userId) throw new ForbiddenException('Category not found');
      rule.categoryId = dto.categoryId;
    }

    const nextMatchValue = dto.matchValue !== undefined ? dto.matchValue.trim() : rule.matchValue;
    const nextMatchStrategy = dto.matchStrategy ?? rule.matchStrategy;

    if (dto.matchValue !== undefined && !nextMatchValue) {
      throw new BadRequestException('Match text cannot be empty');
    }

    if (dto.matchValue !== undefined || dto.matchStrategy !== undefined) {
      const existing = await this.repo
        .createQueryBuilder('rule')
        .where('rule.userId = :userId', { userId })
        .andWhere('rule.matchType = :matchType', { matchType: rule.matchType })
        .andWhere('rule.matchStrategy = :matchStrategy', { matchStrategy: nextMatchStrategy })
        .andWhere('LOWER(rule.matchValue) = LOWER(:matchValue)', { matchValue: nextMatchValue })
        .getOne();
      if (existing && existing.id !== rule.id) {
        throw new ConflictException({ message: 'A rule for this merchant already exists', existingRuleId: existing.id });
      }
      rule.matchValue = nextMatchValue;
      rule.matchStrategy = nextMatchStrategy;
    }

    try {
      await this.repo.save(rule);
    } catch (err) {
      throw await this.toConflictOrRethrow(err, userId, rule.matchType, rule.matchValue, rule.matchStrategy, rule.id);
    }
    const appliedCount = await this.applyToUncategorized(userId, rule.matchType, rule.matchValue, rule.matchStrategy, rule.categoryId, rule.id);
    return { rule: await this.repo.findOne({ where: { id: rule.id }, relations: ['category'] }), appliedCount };
  }
```

- [ ] **Step 6: Update `toConflictOrRethrow()` to take and use `matchStrategy`**

Change:

```ts
  private async toConflictOrRethrow(
    err: unknown,
    userId: string,
    matchType: 'merchant' | 'name',
    matchValue: string,
    excludeId?: string,
  ): Promise<Error> {
    const code = (err as { code?: string })?.code;
    if (code !== '23505') return err as Error;

    let qb = this.repo
      .createQueryBuilder('rule')
      .where('rule.userId = :userId', { userId })
      .andWhere('rule.matchType = :matchType', { matchType })
      .andWhere('LOWER(rule.matchValue) = LOWER(:matchValue)', { matchValue });
    if (excludeId) qb = qb.andWhere('rule.id != :excludeId', { excludeId });
    const existing = await qb.getOne();

    if (existing) {
      return new ConflictException({ message: 'A rule for this merchant already exists', existingRuleId: existing.id });
    }
    // Unique violation but no matching row found (shouldn't normally happen) — surface the original error.
    return err as Error;
  }
```

to:

```ts
  private async toConflictOrRethrow(
    err: unknown,
    userId: string,
    matchType: 'merchant' | 'name',
    matchValue: string,
    matchStrategy: 'exact' | 'prefix',
    excludeId?: string,
  ): Promise<Error> {
    const code = (err as { code?: string })?.code;
    if (code !== '23505') return err as Error;

    let qb = this.repo
      .createQueryBuilder('rule')
      .where('rule.userId = :userId', { userId })
      .andWhere('rule.matchType = :matchType', { matchType })
      .andWhere('rule.matchStrategy = :matchStrategy', { matchStrategy })
      .andWhere('LOWER(rule.matchValue) = LOWER(:matchValue)', { matchValue });
    if (excludeId) qb = qb.andWhere('rule.id != :excludeId', { excludeId });
    const existing = await qb.getOne();

    if (existing) {
      return new ConflictException({ message: 'A rule for this merchant already exists', existingRuleId: existing.id });
    }
    // Unique violation but no matching row found (shouldn't normally happen) — surface the original error.
    return err as Error;
  }
```

- [ ] **Step 7: Accept `matchStrategy` in the controller's PATCH body**

In `apps/api/src/categorization-rules/categorization-rules.controller.ts`, change:

```ts
  @Patch(':id')
  update(@Param('id') id: string, @Request() req: any, @Body() body: { matchValue?: string; categoryId?: string }) {
    return this.service.update(id, req.user.id, body);
  }
```

to:

```ts
  @Patch(':id')
  update(@Param('id') id: string, @Request() req: any, @Body() body: { matchValue?: string; categoryId?: string; matchStrategy?: 'exact' | 'prefix' }) {
    return this.service.update(id, req.user.id, body);
  }
```

- [ ] **Step 8: Build and verify**

Run: `npm run build:api`
Expected: build succeeds with no type errors.

Run `npm run dev:api`, then with a logged-in session cookie:

1. Create a rule the normal way: `POST /categorization-rules` with `{"transactionId":"<a payroll-style transaction>","categoryId":"<a category>"}`. Confirm the response's `rule.matchStrategy` is `"exact"`.
2. Import/create a second transaction with a *different* unique id but the same stable prefix (e.g. same employer name, different `PAYROLL ID:`/`CO ID:` numbers) — confirm it does **not** get auto-categorized (exact-match rule correctly does not match it).
3. `PATCH /categorization-rules/<id>` with `{"matchValue":"<the stable prefix, e.g. everything before the payroll id>","matchStrategy":"prefix"}`. Confirm the response's `appliedCount` now includes the second transaction, and a follow-up `GET /transactions` shows it with `categoryId` and `categorizedByRuleId` set.
4. Create a third transaction with the same prefix but yet another unique id — confirm it auto-categorizes on creation (`POST /transactions` or CSV import, no explicit `categoryId`).
5. `POST /categorization-rules` a **second**, separate rule with the exact same match text as the prefix rule from step 3, but from a transaction whose full text equals that text — confirm this is allowed (201, not 409), since it's `matchStrategy: 'exact'` and the existing one is `'prefix'`.
6. Attempt to `PATCH` two different rules to the same `matchValue` + `matchStrategy` combination — confirm the second gets a 409 with `existingRuleId`.

- [ ] **Step 9: Commit**

```bash
git add apps/api/src/categorization-rules/categorization-rule.entity.ts apps/api/src/categorization-rules/categorization-rules.service.ts apps/api/src/categorization-rules/categorization-rules.controller.ts
git commit -m "feat(api): add optional prefix match strategy to categorization rules"
```

---

## Task 2: Frontend — strategy toggle + badge in Settings

**Files:**
- Modify: `apps/web/src/components/RulesManager.tsx`

**Interfaces:**
- Consumes: `matchStrategy` field on `GET /categorization-rules` and the `PATCH /categorization-rules/:id` body (Task 1).
- Produces: no new exports — this task only changes `RulesManager.tsx`'s internal state and JSX.

- [ ] **Step 1: Add `matchStrategy` to the `Rule` interface and add edit state**

Change the `Rule` interface from:

```ts
interface Rule {
  id: string;
  matchType: 'merchant' | 'name';
  matchValue: string;
  categoryId: string;
  category: CategoryLite | null;
  createdAt: string;
}
```

to:

```ts
interface Rule {
  id: string;
  matchType: 'merchant' | 'name';
  matchValue: string;
  matchStrategy: 'exact' | 'prefix';
  categoryId: string;
  category: CategoryLite | null;
  createdAt: string;
}
```

Add a new state var right after `editCategoryId`:

```ts
  const [editStrategy, setEditStrategy] = useState<'exact' | 'prefix'>('exact');
```

- [ ] **Step 2: Wire it into `startEdit` and `saveEdit`**

Change `startEdit` from:

```ts
  function startEdit(rule: Rule) {
    setEditingId(rule.id);
    setEditValue(rule.matchValue);
    setEditCategoryId(rule.categoryId);
    setSaveError('');
  }
```

to:

```ts
  function startEdit(rule: Rule) {
    setEditingId(rule.id);
    setEditValue(rule.matchValue);
    setEditCategoryId(rule.categoryId);
    setEditStrategy(rule.matchStrategy);
    setSaveError('');
  }
```

Change `saveEdit`'s PATCH body from:

```ts
      body: JSON.stringify({ matchValue: editValue, categoryId: editCategoryId }),
```

to:

```ts
      body: JSON.stringify({ matchValue: editValue, categoryId: editCategoryId, matchStrategy: editStrategy }),
```

- [ ] **Step 3: Add the strategy toggle to the edit form**

In the edit form (`isEditing` branch), right after the match-text `<input>`'s wrapping `<div>` and before the category `<select>`, insert:

```tsx
                    <div className="flex items-center gap-1">
                      <button type="button" onClick={() => setEditStrategy('exact')}
                        className="px-2.5 py-1 text-xs font-medium rounded-lg transition-colors"
                        style={editStrategy === 'exact'
                          ? { background: 'var(--color-card-violet)', color: '#fff' }
                          : { background: 'var(--color-elevated)', color: 'var(--color-text-secondary)', border: '1px solid var(--color-border)' }}>
                        Exact match
                      </button>
                      <button type="button" onClick={() => setEditStrategy('prefix')}
                        className="px-2.5 py-1 text-xs font-medium rounded-lg transition-colors"
                        style={editStrategy === 'prefix'
                          ? { background: 'var(--color-card-violet)', color: '#fff' }
                          : { background: 'var(--color-elevated)', color: 'var(--color-text-secondary)', border: '1px solid var(--color-border)' }}>
                        Starts with
                      </button>
                    </div>
```

- [ ] **Step 4: Add the "Starts with" badge to the read-only row**

In the non-editing row, right after the existing "Merchant"/"Description" badge `<span>` and before its closing `</div>`, insert:

```tsx
                        {rule.matchStrategy === 'prefix' && (
                          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded shrink-0 uppercase tracking-wide"
                            style={{ background: 'color-mix(in srgb, var(--color-card-violet) 15%, transparent)', color: 'var(--color-card-violet)' }}>
                            Starts with
                          </span>
                        )}
```

(No badge is shown for `'exact'` — consistent with this feature's existing convention of only marking the non-default case, same as the rule-provenance pin only appearing for automatic categorization.)

- [ ] **Step 5: Verify it compiles and behaves correctly**

Run: `npm run build:web`
Expected: build succeeds, no type errors.

Manually: `npm run dev:web`, open `/settings?tab=rules` (create a rule first via the transactions page if none exist):
- Confirm each rule row shows correctly with no "Starts with" badge (all rules start as `'exact'`).
- Click Edit on a rule, confirm the toggle defaults to "Exact match" selected, switch it to "Starts with", shorten the match text, Save — confirm the row now shows the "Starts with" badge and the new match text.
- Confirm `appliedCount`-driven side effects (e.g. other transactions picking up the category) still work as before after switching strategy.
- Edit it back to "Exact match" — confirm the badge disappears.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/components/RulesManager.tsx
git commit -m "feat(web): add exact/starts-with match strategy toggle to rule editing"
```

---

## Task 3: Full manual verification pass

**Files:** none (verification only).

- [ ] **Step 1: Run the full build suite**

```bash
npm run build:api
npm run build:web
```

Expected: both succeed with no errors.

- [ ] **Step 2: Walk the spec's testing checklist**

With `npm run dev:api` and `npm run dev:web` running, in the browser:

1. Create a rule from a payroll/ACH-style transaction (or any transaction) the normal way (one-click "Make permanent") — confirm it's created as exact-match with no visible change to that flow.
2. Confirm a differently-numbered occurrence of the "same" transaction does NOT auto-categorize (exact match correctly stays narrow).
3. In Settings, edit that rule down to a stable prefix and toggle to "Starts with" — confirm the retroactive apply picks up the other occurrence(s), and the toast/count matches what's expected.
4. Add a new occurrence (CSV import or manual entry) with yet another unique id but the same prefix — confirm it auto-categorizes and shows the rule-provenance pin on the transactions page.
5. Confirm an exact rule and a prefix rule can coexist with identical match text (create one of each, no 409).
6. Confirm two rules with truly identical `matchValue` + `matchStrategy` still 409 correctly.
7. Confirm the Settings rule list shows the "Starts with" badge only on prefix rules.

- [ ] **Step 3: Fix anything that doesn't match, then commit if any fixes were needed**

If Step 2 surfaces issues, fix them, re-run Step 1, and commit:

```bash
git add apps/api apps/web
git commit -m "fix: polish rule prefix matching after manual verification"
```

(Skip this step entirely if Step 2 found nothing to fix.)
