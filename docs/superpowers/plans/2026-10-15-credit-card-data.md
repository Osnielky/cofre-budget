# Credit Card Data (Phase 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Store each credit card's limit, APRs, statement, minimum payment and due date (from Plaid Liabilities, or typed in by hand), plus a per-user card profile, and show them on a new responsive `/cards` page.

**Architecture:** A new `apps/api/src/cards/` module owns two tables (`credit_card_details`, one row per credit account; `card_profiles`, one per user), pure helpers for mapping Plaid data / merging manual edits / validating input, and a `CreditCardsService` + `/api/cards` controller. `PlaidService` gains `syncLiabilities()` which calls `liabilitiesGet` and hands each credit account to `CreditCardsService.applyPlaidReport()`. The web adds `lib/cards/` pure helpers (tested) and an `app/cards/` page.

**Tech Stack:** NestJS 11 + TypeORM (Postgres; sqlite in tests), Plaid Node SDK 42.2.0, Next.js 16 / React 19 / Tailwind v4, Vitest.

**Spec:** `docs/superpowers/specs/2026-10-15-credit-card-expert-design.md` (sections "Build order" phase 1 and "1. Card data"). Phase 2 adds `productId`; it is **not** part of this plan.

## Global Constraints

- Entities and migrations are imported explicitly: add entities to `ENTITIES` in `apps/api/src/config/entities.ts`, migrations to `MIGRATIONS` in `apps/api/src/migrations/index.ts`.
- Never spread or `Object.assign` a request body onto an entity — validate into a whitelisted object, then assign field by field.
- JSON/array columns use `simple-json` / `simple-array` (not `jsonb`) so the entities run on the sqlite test `DataSource`.
- Logging: product names, item IDs, counts, error codes only — never balances, limits, APRs, amounts, card names, tokens or Plaid error bodies (axios errors carry the request, which contains the access token).
- Calls to Plaid are wrapped in `timed('plaid', '<operation>', fn)`.
- Web components consume theme variables only (`var(--color-…)`); utilization bar uses `--color-green` / `--color-amber` / `--color-rose` (status colors, not chart series).
- Every page is responsive: works at 375px wide with no horizontal scroll.
- Do not `git push` — commit locally only.
- Plaid card-data failures must never fail the bank connection, sync, or reconnect that triggered them.

## Review Focus

1. **Two `/cards` loads at once for a user with a new credit account** → exactly one detail row, no 500. (Task 4, test "concurrent list creates one row")
2. **A user PATCHes another user's account id, or their own checking account** → 404, nothing written. (Task 4, tests "rejects other user's account" / "rejects non-credit account")
3. **Typed values like `"1,200"`, `-5`, APR `250`, date `2026-02-30`, empty strings** → API returns 400 for non-numbers/out-of-range; the web form turns `"$1,200.50"` into `1200.5`, `""` into `null`, and shows an error for the rest. (Task 3 `validateDetailPatch` tests; Task 6 `formToPatch` tests)
4. **Plaid later reports `null` for a limit or APRs the card had before** → last known value is kept, not erased. (Task 3 merge test "null from Plaid keeps last known value")
5. **An account that is no longer a credit card (type changed) or was deleted** → not listed; its detail row is ignored or cascaded away. (Task 4 test "lists only credit accounts")

---

## File map

**API — create**
- `apps/api/src/cards/card-types.ts` — shared types (`CardApr`, `PlaidCardData`, `LiabilitiesStatus`, `CardView`, `CardProfileView`).
- `apps/api/src/cards/credit-card-detail.entity.ts`
- `apps/api/src/cards/card-profile.entity.ts`
- `apps/api/src/cards/liabilities.mapper.ts` (+ `.test.ts`) — Plaid response → `PlaidCardData`; Plaid error code → status.
- `apps/api/src/cards/detail-merge.ts` (+ `.test.ts`) — manual-override rule.
- `apps/api/src/cards/card-validation.ts` (+ `.test.ts`) — PATCH / profile body validation.
- `apps/api/src/cards/credit-cards.service.ts` (+ `.test.ts`)
- `apps/api/src/cards/cards.controller.ts`
- `apps/api/src/cards/cards.module.ts`
- `apps/api/src/migrations/<timestamp>-CreditCardDetails.ts` (generated)
- `apps/api/src/plaid/plaid.service.liabilities.test.ts`

**API — modify**
- `apps/api/src/config/entities.ts`, `apps/api/src/migrations/index.ts`, `apps/api/src/app/app.module.ts`
- `apps/api/src/plaid/plaid.service.ts`, `plaid.controller.ts`, `plaid-webhook.controller.ts`, `plaid.module.ts`
- `apps/api/src/plaid/plaid.service.institution-cap.test.ts`, `plaid.service.upgrade-merge.test.ts` (constructor arg)

**Web — create**
- `apps/web/src/lib/cards/types.ts`, `utilization.ts`, `card-notice.ts`, `detail-form.ts`, `profile.ts` (+ tests)
- `apps/web/src/app/cards/page.tsx`
- `apps/web/src/app/cards/components/TotalUtilization.tsx`, `CardTile.tsx`, `CardDetailDrawer.tsx`, `CardProfileForm.tsx`

**Web — modify**
- `apps/web/vitest.config.ts` (include `src/lib/cards/**/*.test.ts`)
- `apps/web/src/components/Sidebar.tsx` (nav entry)
- `apps/web/src/app/settings/plaid-oauth-redirect/page.tsx` (`liabilities` mode)

**Docs — modify:** `CLAUDE.md`, the spec.

---

### Task 1: Entities and migration

**Files:**
- Create: `apps/api/src/cards/card-types.ts`, `apps/api/src/cards/credit-card-detail.entity.ts`, `apps/api/src/cards/card-profile.entity.ts`, `apps/api/src/migrations/<ts>-CreditCardDetails.ts`
- Modify: `apps/api/src/config/entities.ts`, `apps/api/src/migrations/index.ts`
- Test: `apps/api/src/migrations/migrations.test.ts` (existing, unchanged)

**Interfaces:**
- Produces: types `CardApr`, `AprType`, `PlaidCardData`, `LiabilitiesStatus`, `CardView`, `CardProfileView`, `CardGoal`, `ScoreBand`; entities `CreditCardDetail`, `CardProfile` with the columns below.

- [ ] **Step 1: Write the shared types**

`apps/api/src/cards/card-types.ts`:

```ts
/* Shapes shared by the cards module's entities, pure helpers and API responses.
   apps/web/src/lib/cards/types.ts mirrors CardView / CardProfileView — keep in sync. */

export type AprType = 'purchase' | 'balance_transfer' | 'cash_advance' | 'special';

export interface CardApr {
  type: AprType;
  percentage: number;
  /* Plaid-only; null for APRs typed in by hand. */
  balanceSubjectTo: number | null;
  interestCharged: number | null;
}

/* synced: Plaid Liabilities data present · unsupported: bank or card doesn't offer it ·
   not_consented: Item linked before Liabilities, needs update-mode consent ·
   pending: Plaid still extracting · manual: not a Plaid account */
export type LiabilitiesStatus = 'synced' | 'unsupported' | 'not_consented' | 'pending' | 'manual';

/* What Plaid reports for one credit account. Any field may be null. */
export interface PlaidCardData {
  creditLimit: number | null;
  officialName: string | null;
  aprs: CardApr[] | null;
  lastStatementBalance: number | null;
  lastStatementDate: string | null;
  minimumPayment: number | null;
  nextPaymentDueDate: string | null;
  lastPaymentAmount: number | null;
  lastPaymentDate: string | null;
  isOverdue: boolean | null;
}

export interface CardView {
  accountId: string;
  bankName: string;
  accountName: string;
  last4: string | null;
  /* Amount owed, always >= 0. */
  balance: number;
  provider: 'manual' | 'plaid';
  plaidItemId: string | null;
  /* PlaidItem.status ('active' | 'error' …); null for manual cards. */
  plaidItemStatus: string | null;
  creditLimit: number | null;
  officialName: string | null;
  aprs: CardApr[];
  lastStatementBalance: number | null;
  lastStatementDate: string | null;
  minimumPayment: number | null;
  nextPaymentDueDate: string | null;
  lastPaymentAmount: number | null;
  lastPaymentDate: string | null;
  isOverdue: boolean | null;
  promoAprEndsOn: string | null;
  rewardsBalance: number | null;
  liabilitiesStatus: LiabilitiesStatus;
  manualFields: string[];
  liabilitiesSyncedAt: string | null;
  /* True when a Plaid snapshot exists, so "Use bank data" can restore it. */
  hasBankData: boolean;
}

export const CARD_GOALS = ['pay_off_debt', 'cashback', 'travel', 'build_credit'] as const;
export type CardGoal = (typeof CARD_GOALS)[number];

export const SCORE_BANDS = ['<580', '580-669', '670-739', '740-799', '800+'] as const;
export type ScoreBand = (typeof SCORE_BANDS)[number];

export interface CardProfileView {
  goal: CardGoal | null;
  annualFeeOk: boolean | null;
  creditScoreBand: ScoreBand | null;
  monthlyDebtBudget: number | null;
  plannedPurchaseAmount: number | null;
  plannedPurchaseNote: string | null;
}
```

- [ ] **Step 2: Write the `CreditCardDetail` entity**

`apps/api/src/cards/credit-card-detail.entity.ts`:

```ts
import {
  Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, Index,
  CreateDateColumn, UpdateDateColumn,
} from 'typeorm';
import { User } from '../users/user.entity';
import { BankAccount } from '../bank-accounts/bank-account.entity';
import type { CardApr, LiabilitiesStatus, PlaidCardData } from './card-types';

/* One row per credit-type BankAccount: the card data Plaid Liabilities reports, or
   the user typed in. Created lazily by CreditCardsService.ensureDetail. */
@Entity('credit_card_details')
export class CreditCardDetail {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column()
  userId: string;

  @ManyToOne(() => BankAccount, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'bankAccountId' })
  bankAccount: BankAccount;

  @Index({ unique: true })
  @Column()
  bankAccountId: string;

  @Column({ type: 'decimal', precision: 12, scale: 2, nullable: true })
  creditLimit: number | null;

  @Column({ type: 'varchar', nullable: true })
  officialName: string | null;

  @Column({ type: 'simple-json', nullable: true })
  aprs: CardApr[] | null;

  @Column({ type: 'decimal', precision: 12, scale: 2, nullable: true })
  lastStatementBalance: number | null;

  @Column({ type: 'date', nullable: true })
  lastStatementDate: string | null;

  @Column({ type: 'decimal', precision: 12, scale: 2, nullable: true })
  minimumPayment: number | null;

  @Column({ type: 'date', nullable: true })
  nextPaymentDueDate: string | null;

  @Column({ type: 'decimal', precision: 12, scale: 2, nullable: true })
  lastPaymentAmount: number | null;

  @Column({ type: 'date', nullable: true })
  lastPaymentDate: string | null;

  @Column({ type: 'boolean', nullable: true })
  isOverdue: boolean | null;

  /* Manual only — Plaid doesn't report when a promo APR ends. */
  @Column({ type: 'date', nullable: true })
  promoAprEndsOn: string | null;

  /* Manual only. */
  @Column({ type: 'decimal', precision: 12, scale: 2, nullable: true })
  rewardsBalance: number | null;

  @Column({ type: 'varchar', default: 'pending' })
  liabilitiesStatus: LiabilitiesStatus;

  /* Fields the user typed in; Plaid sync leaves them alone (see detail-merge.ts). */
  @Column({ type: 'simple-array', nullable: true })
  manualFields: string[] | null;

  @Column({ type: Date, nullable: true, default: null })
  manualEditedAt: Date | null;

  /* Last Plaid report, non-null fields accumulated — lets "Use bank data" restore
     bank values immediately instead of waiting for the next sync. */
  @Column({ type: 'simple-json', nullable: true })
  plaidData: PlaidCardData | null;

  @Column({ type: Date, nullable: true, default: null })
  liabilitiesSyncedAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
```

- [ ] **Step 3: Write the `CardProfile` entity**

`apps/api/src/cards/card-profile.entity.ts`:

```ts
import {
  Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, Index,
  CreateDateColumn, UpdateDateColumn,
} from 'typeorm';
import { User } from '../users/user.entity';
import type { CardGoal, ScoreBand } from './card-types';

/* What the card advisor needs to know that Plaid can't tell us. One per user. */
@Entity('card_profiles')
export class CardProfile {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @Index({ unique: true })
  @Column()
  userId: string;

  @Column({ type: 'varchar', nullable: true })
  goal: CardGoal | null;

  @Column({ type: 'boolean', nullable: true })
  annualFeeOk: boolean | null;

  @Column({ type: 'varchar', nullable: true })
  creditScoreBand: ScoreBand | null;

  @Column({ type: 'decimal', precision: 12, scale: 2, nullable: true })
  monthlyDebtBudget: number | null;

  @Column({ type: 'decimal', precision: 12, scale: 2, nullable: true })
  plannedPurchaseAmount: number | null;

  @Column({ type: 'varchar', length: 120, nullable: true })
  plannedPurchaseNote: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
```

- [ ] **Step 4: Register the entities**

In `apps/api/src/config/entities.ts` add the imports and append to `ENTITIES`:

```ts
import { CreditCardDetail } from '../cards/credit-card-detail.entity';
import { CardProfile } from '../cards/card-profile.entity';

export const ENTITIES = [User, BankAccount, PlaidItem, Transaction, RecurringRule, Category, Budget, Project, ProjectCategory, Debt, DebtPayment, ConnectedApp, Receipt, CategorizationRule, AiConversation, AiMessage, AiPendingAction, Subscription, NetWorthSnapshot, CreditCardDetail, CardProfile];
```

- [ ] **Step 5: Run the migration test to see it fail**

Run (local Postgres must be running): `npm run test:api -- src/migrations/migrations.test.ts`
Expected: FAIL — the entity schema has `credit_card_details` / `card_profiles` that no migration builds.

- [ ] **Step 6: Generate the migration**

Run: `npm run migration:generate -- CreditCardDetails`
Expected: a new file `apps/api/src/migrations/<timestamp>-CreditCardDetails.ts`. Open it and check `up()` contains exactly: `CREATE TABLE "credit_card_details"` (with `"aprs" text`, `"manualFields" text`, `"plaidData" text`, `"liabilitiesStatus" character varying NOT NULL DEFAULT 'pending'`), `CREATE TABLE "card_profiles"`, two `CREATE UNIQUE INDEX` (on `bankAccountId` and on `card_profiles.userId`), and three `ADD CONSTRAINT … FOREIGN KEY … ON DELETE CASCADE` (detail→users, detail→bank_accounts, profile→users). If it contains anything else, your local DB has drifted — run `npm run migration:run` first and regenerate.

- [ ] **Step 7: Register the migration**

In `apps/api/src/migrations/index.ts` import the generated class and append it to `MIGRATIONS` (use the generated timestamp):

```ts
import { CreditCardDetails1792000000000 } from './1792000000000-CreditCardDetails';

export const MIGRATIONS = [Baseline1790610365591, NetWorthSnapshots1790968124309, InvestmentsAsSavings1791301606403, UserLastSeen1791904532417, CreditCardDetails1792000000000];
```

- [ ] **Step 8: Verify**

Run: `npm run test:api -- src/migrations/migrations.test.ts` → PASS.
Run: `npm run migration:run && npm run migration:check` → exits 0 ("No changes in database schema were found").

- [ ] **Step 9: Commit**

```bash
git add apps/api/src/cards apps/api/src/config/entities.ts apps/api/src/migrations
git commit -m "feat(cards): credit_card_details and card_profiles tables"
```

---

### Task 2: Plaid Liabilities mapper

**Files:**
- Create: `apps/api/src/cards/liabilities.mapper.ts`
- Test: `apps/api/src/cards/liabilities.mapper.test.ts`

**Interfaces:**
- Consumes: `PlaidCardData`, `CardApr`, `LiabilitiesStatus` (Task 1).
- Produces:
  - `mapPlaidCard(account: PlaidAccountLike, credit: PlaidCreditLike | null): PlaidCardData`
  - `liabilitiesErrorStatus(errorCode: string | undefined): LiabilitiesStatus | null`
  - types `PlaidAccountLike`, `PlaidCreditLike` (structural subsets of Plaid's `AccountBase` and `CreditCardLiability`).

- [ ] **Step 1: Write the failing tests**

`apps/api/src/cards/liabilities.mapper.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { mapPlaidCard, liabilitiesErrorStatus } from './liabilities.mapper';

const account = { account_id: 'acc-1', official_name: 'Chase Sapphire Preferred', balances: { limit: 12000 } };
const credit = {
  account_id: 'acc-1',
  aprs: [
    { apr_type: 'purchase_apr', apr_percentage: 24.99, balance_subject_to_apr: 1500.5, interest_charge_amount: 31.2 },
    { apr_type: 'balance_transfer_apr', apr_percentage: 0, balance_subject_to_apr: 2000, interest_charge_amount: 0 },
    { apr_type: 'cash_apr', apr_percentage: 29.99, balance_subject_to_apr: null, interest_charge_amount: null },
    { apr_type: 'special', apr_percentage: 0, balance_subject_to_apr: null, interest_charge_amount: null },
  ],
  is_overdue: false,
  last_payment_amount: 250,
  last_payment_date: '2026-09-20',
  last_statement_issue_date: '2026-10-01',
  last_statement_balance: 3500.5,
  minimum_payment_amount: 45,
  next_payment_due_date: '2026-10-28',
};

describe('mapPlaidCard', () => {
  it('maps limit, name, APRs and statement fields', () => {
    expect(mapPlaidCard(account, credit)).toEqual({
      creditLimit: 12000,
      officialName: 'Chase Sapphire Preferred',
      aprs: [
        { type: 'purchase', percentage: 24.99, balanceSubjectTo: 1500.5, interestCharged: 31.2 },
        { type: 'balance_transfer', percentage: 0, balanceSubjectTo: 2000, interestCharged: 0 },
        { type: 'cash_advance', percentage: 29.99, balanceSubjectTo: null, interestCharged: null },
        { type: 'special', percentage: 0, balanceSubjectTo: null, interestCharged: null },
      ],
      lastStatementBalance: 3500.5,
      lastStatementDate: '2026-10-01',
      minimumPayment: 45,
      nextPaymentDueDate: '2026-10-28',
      lastPaymentAmount: 250,
      lastPaymentDate: '2026-09-20',
      isOverdue: false,
    });
  });

  it('drops APR types it does not know', () => {
    const data = mapPlaidCard(account, { ...credit, aprs: [{ apr_type: 'mystery_apr', apr_percentage: 5, balance_subject_to_apr: null, interest_charge_amount: null }] });
    expect(data.aprs).toEqual([]);
  });

  it('without liabilities data keeps only limit and name', () => {
    const data = mapPlaidCard({ account_id: 'acc-1', official_name: null, balances: { limit: null } }, null);
    expect(data).toEqual({
      creditLimit: null, officialName: null, aprs: null,
      lastStatementBalance: null, lastStatementDate: null, minimumPayment: null, nextPaymentDueDate: null,
      lastPaymentAmount: null, lastPaymentDate: null, isOverdue: null,
    });
  });
});

describe('liabilitiesErrorStatus', () => {
  it.each([
    ['ADDITIONAL_CONSENT_REQUIRED', 'not_consented'],
    ['PRODUCT_NOT_READY', 'pending'],
    ['PRODUCTS_NOT_SUPPORTED', 'unsupported'],
    ['NO_LIABILITY_ACCOUNTS', 'unsupported'],
  ])('%s → %s', (code, status) => {
    expect(liabilitiesErrorStatus(code)).toBe(status);
  });

  it('returns null for real failures', () => {
    expect(liabilitiesErrorStatus('ITEM_LOGIN_REQUIRED')).toBeNull();
    expect(liabilitiesErrorStatus(undefined)).toBeNull();
  });
});
```

- [ ] **Step 2: Run to see it fail**

Run: `npm run test:api -- src/cards/liabilities.mapper.test.ts`
Expected: FAIL — cannot resolve `./liabilities.mapper`.

- [ ] **Step 3: Implement**

`apps/api/src/cards/liabilities.mapper.ts`:

```ts
import type { CardApr, LiabilitiesStatus, PlaidCardData } from './card-types';

/* Structural subsets of Plaid's AccountBase / CreditCardLiability, so this file and its
   tests don't depend on the SDK's full types. */
export interface PlaidAccountLike {
  account_id: string;
  official_name?: string | null;
  balances: { limit?: number | null };
}

export interface PlaidCreditLike {
  account_id: string | null;
  aprs: { apr_type: string; apr_percentage: number; balance_subject_to_apr: number | null; interest_charge_amount: number | null }[];
  is_overdue: boolean | null;
  last_payment_amount: number | null;
  last_payment_date: string | null;
  last_statement_issue_date: string | null;
  last_statement_balance: number | null;
  minimum_payment_amount: number | null;
  next_payment_due_date: string | null;
}

const APR_TYPES: Record<string, CardApr['type']> = {
  purchase_apr: 'purchase',
  balance_transfer_apr: 'balance_transfer',
  cash_apr: 'cash_advance',
  special: 'special',
};

export function mapPlaidCard(account: PlaidAccountLike, credit: PlaidCreditLike | null): PlaidCardData {
  return {
    creditLimit: account.balances.limit ?? null,
    officialName: account.official_name ?? null,
    aprs: credit
      ? credit.aprs
          .filter((a) => a.apr_type in APR_TYPES)
          .map((a) => ({
            type: APR_TYPES[a.apr_type],
            percentage: a.apr_percentage,
            balanceSubjectTo: a.balance_subject_to_apr ?? null,
            interestCharged: a.interest_charge_amount ?? null,
          }))
      : null,
    lastStatementBalance: credit?.last_statement_balance ?? null,
    lastStatementDate: credit?.last_statement_issue_date ?? null,
    minimumPayment: credit?.minimum_payment_amount ?? null,
    nextPaymentDueDate: credit?.next_payment_due_date ?? null,
    lastPaymentAmount: credit?.last_payment_amount ?? null,
    lastPaymentDate: credit?.last_payment_date ?? null,
    isOverdue: credit?.is_overdue ?? null,
  };
}

/* Plaid error codes that mean "no Liabilities data for this Item right now" rather than
   a failure. Anything else returns null and is treated as a real error. */
export function liabilitiesErrorStatus(errorCode: string | undefined): LiabilitiesStatus | null {
  switch (errorCode) {
    case 'ADDITIONAL_CONSENT_REQUIRED': return 'not_consented';
    case 'PRODUCT_NOT_READY': return 'pending';
    case 'PRODUCTS_NOT_SUPPORTED':
    case 'NO_LIABILITY_ACCOUNTS': return 'unsupported';
    default: return null;
  }
}
```

- [ ] **Step 4: Run to see it pass**

Run: `npm run test:api -- src/cards/liabilities.mapper.test.ts` → PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/cards/liabilities.mapper.ts apps/api/src/cards/liabilities.mapper.test.ts
git commit -m "feat(cards): map Plaid Liabilities responses to card data"
```

---

### Task 3: Manual-override merge and input validation

**Files:**
- Create: `apps/api/src/cards/detail-merge.ts`, `apps/api/src/cards/card-validation.ts`
- Test: `apps/api/src/cards/detail-merge.test.ts`, `apps/api/src/cards/card-validation.test.ts`

**Interfaces:**
- Consumes: `PlaidCardData`, `CardApr`, `CARD_GOALS`, `SCORE_BANDS` (Task 1).
- Produces:
  - `STATEMENT_FIELDS`, `MANUAL_FIELDS` (readonly tuples), type `ManualField`
  - `interface MergeState { manualFields: string[]; manualEditedAt: Date | null }`
  - `mergePlaidData(state: MergeState, plaid: PlaidCardData): { values: Partial<PlaidCardData>; manualFields: string[] }`
  - `mergeSnapshot(prev: PlaidCardData | null, next: PlaidCardData): PlaidCardData`
  - `type DetailPatch = Partial<Pick<CardView, ManualField>>` (values `number | string | CardApr[] | null`)
  - `validateDetailPatch(body: unknown): DetailPatch` — throws `BadRequestException`
  - `type ProfileInput = Partial<CardProfileView>`; `validateProfile(body: unknown): ProfileInput` — throws `BadRequestException`

- [ ] **Step 1: Write the failing merge tests**

`apps/api/src/cards/detail-merge.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { mergePlaidData, mergeSnapshot } from './detail-merge';
import type { PlaidCardData } from './card-types';

const plaid: PlaidCardData = {
  creditLimit: 10000,
  officialName: 'Freedom Unlimited',
  aprs: [{ type: 'purchase', percentage: 22.99, balanceSubjectTo: 900, interestCharged: 17 }],
  lastStatementBalance: 900,
  lastStatementDate: '2026-10-01',
  minimumPayment: 35,
  nextPaymentDueDate: '2026-10-26',
  lastPaymentAmount: 100,
  lastPaymentDate: '2026-09-25',
  isOverdue: false,
};

describe('mergePlaidData', () => {
  it('takes every Plaid value when nothing was edited by hand', () => {
    const r = mergePlaidData({ manualFields: [], manualEditedAt: null }, plaid);
    expect(r.values).toEqual(plaid);
    expect(r.manualFields).toEqual([]);
  });

  it('leaves hand-edited fields alone', () => {
    const r = mergePlaidData({ manualFields: ['creditLimit', 'aprs'], manualEditedAt: new Date('2026-10-05T12:00:00Z') }, plaid);
    expect(r.values).not.toHaveProperty('creditLimit');
    expect(r.values).not.toHaveProperty('aprs');
    expect(r.values.minimumPayment).toBe(35);
    expect(r.manualFields).toEqual(['creditLimit', 'aprs']);
  });

  it('a statement newer than the manual edit replaces statement fields', () => {
    const r = mergePlaidData(
      { manualFields: ['creditLimit', 'lastStatementBalance', 'minimumPayment', 'nextPaymentDueDate', 'lastStatementDate'], manualEditedAt: new Date('2026-09-15T12:00:00Z') },
      plaid,
    );
    expect(r.values.lastStatementBalance).toBe(900);
    expect(r.values.minimumPayment).toBe(35);
    expect(r.values.nextPaymentDueDate).toBe('2026-10-26');
    expect(r.values.lastStatementDate).toBe('2026-10-01');
    expect(r.values).not.toHaveProperty('creditLimit');
    expect(r.manualFields).toEqual(['creditLimit']);
  });

  it('a statement from the same day as the edit does not replace it', () => {
    const r = mergePlaidData({ manualFields: ['minimumPayment'], manualEditedAt: new Date('2026-10-01T18:00:00Z') }, plaid);
    expect(r.values).not.toHaveProperty('minimumPayment');
    expect(r.manualFields).toEqual(['minimumPayment']);
  });

  it('null from Plaid keeps last known value', () => {
    const r = mergePlaidData({ manualFields: [], manualEditedAt: null }, { ...plaid, creditLimit: null, aprs: null });
    expect(r.values).not.toHaveProperty('creditLimit');
    expect(r.values).not.toHaveProperty('aprs');
  });
});

describe('mergeSnapshot', () => {
  it('keeps earlier non-null values the new report lacks', () => {
    const next = { ...plaid, aprs: null, minimumPayment: null, creditLimit: 11000 };
    expect(mergeSnapshot(plaid, next)).toEqual({ ...plaid, creditLimit: 11000 });
  });

  it('starts from nothing', () => {
    expect(mergeSnapshot(null, plaid)).toEqual(plaid);
  });
});
```

- [ ] **Step 2: Write the failing validation tests**

`apps/api/src/cards/card-validation.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import { validateDetailPatch, validateProfile } from './card-validation';

describe('validateDetailPatch', () => {
  it('accepts valid values and drops unknown keys', () => {
    expect(validateDetailPatch({
      creditLimit: 5000.456, minimumPayment: null, nextPaymentDueDate: '2026-11-05',
      aprs: [{ type: 'purchase', percentage: 21.5 }],
      id: 'evil', userId: 'evil', liabilitiesStatus: 'synced', lastPaymentAmount: 1,
    })).toEqual({
      creditLimit: 5000.46, minimumPayment: null, nextPaymentDueDate: '2026-11-05',
      aprs: [{ type: 'purchase', percentage: 21.5, balanceSubjectTo: null, interestCharged: null }],
    });
  });

  it.each([
    [{ creditLimit: '1,200' }],
    [{ creditLimit: -5 }],
    [{ creditLimit: Number.NaN }],
    [{ creditLimit: 20_000_000 }],
    [{ rewardsBalance: Infinity }],
    [{ aprs: [{ type: 'purchase', percentage: 250 }] }],
    [{ aprs: [{ type: 'teaser', percentage: 5 }] }],
    [{ aprs: 'purchase' }],
    [{ aprs: Array.from({ length: 9 }, () => ({ type: 'special', percentage: 0 })) }],
    [{ nextPaymentDueDate: '2026-02-30' }],
    [{ promoAprEndsOn: '11/05/2026' }],
    [{ lastStatementDate: '' }],
  ])('rejects %j', (body) => {
    expect(() => validateDetailPatch(body)).toThrow(BadRequestException);
  });

  it('rejects a non-object body', () => {
    expect(() => validateDetailPatch(null)).toThrow(BadRequestException);
    expect(() => validateDetailPatch([])).toThrow(BadRequestException);
  });
});

describe('validateProfile', () => {
  it('accepts a full profile and trims the note', () => {
    expect(validateProfile({
      goal: 'pay_off_debt', annualFeeOk: false, creditScoreBand: '670-739',
      monthlyDebtBudget: 600, plannedPurchaseAmount: null, plannedPurchaseNote: '  new laptop  ', userId: 'evil',
    })).toEqual({
      goal: 'pay_off_debt', annualFeeOk: false, creditScoreBand: '670-739',
      monthlyDebtBudget: 600, plannedPurchaseAmount: null, plannedPurchaseNote: 'new laptop',
    });
  });

  it('turns a blank note into null', () => {
    expect(validateProfile({ plannedPurchaseNote: '   ' })).toEqual({ plannedPurchaseNote: null });
  });

  it.each([
    [{ goal: 'get_rich' }],
    [{ creditScoreBand: '900' }],
    [{ annualFeeOk: 'yes' }],
    [{ monthlyDebtBudget: -1 }],
    [{ plannedPurchaseNote: 'x'.repeat(121) }],
  ])('rejects %j', (body) => {
    expect(() => validateProfile(body)).toThrow(BadRequestException);
  });
});
```

- [ ] **Step 3: Run to see both fail**

Run: `npm run test:api -- src/cards/detail-merge.test.ts src/cards/card-validation.test.ts`
Expected: FAIL — modules not found.

- [ ] **Step 4: Implement the merge**

`apps/api/src/cards/detail-merge.ts`:

```ts
import type { PlaidCardData } from './card-types';

/* Fields that come from a statement — a newer Plaid statement supersedes a hand edit. */
export const STATEMENT_FIELDS = ['lastStatementBalance', 'lastStatementDate', 'minimumPayment', 'nextPaymentDueDate'] as const;

/* Fields a user may type in. promoAprEndsOn / rewardsBalance are manual-only. */
export const MANUAL_FIELDS = ['creditLimit', 'aprs', ...STATEMENT_FIELDS, 'promoAprEndsOn', 'rewardsBalance'] as const;
export type ManualField = (typeof MANUAL_FIELDS)[number];

const PLAID_FIELDS = [
  'creditLimit', 'officialName', 'aprs', 'lastStatementBalance', 'lastStatementDate', 'minimumPayment',
  'nextPaymentDueDate', 'lastPaymentAmount', 'lastPaymentDate', 'isOverdue',
] as const satisfies readonly (keyof PlaidCardData)[];

export interface MergeState {
  manualFields: string[];
  manualEditedAt: Date | null;
}

/**
 * The manual-override rule. A field the user typed in is not overwritten by Plaid,
 * except that a Plaid statement dated after the edit (by calendar day) replaces the
 * statement fields and clears them from manualFields. A null from Plaid never erases a
 * value. Returns only the fields to write.
 */
export function mergePlaidData(state: MergeState, plaid: PlaidCardData): { values: Partial<PlaidCardData>; manualFields: string[] } {
  const manual = new Set(state.manualFields);
  const editedOn = state.manualEditedAt ? state.manualEditedAt.toISOString().slice(0, 10) : null;
  if (plaid.lastStatementDate && editedOn && plaid.lastStatementDate > editedOn) {
    for (const f of STATEMENT_FIELDS) manual.delete(f);
  }

  const values: Partial<PlaidCardData> = {};
  for (const key of PLAID_FIELDS) {
    if (manual.has(key) || plaid[key] === null) continue;
    (values as Record<string, unknown>)[key] = plaid[key];
  }
  return { values, manualFields: state.manualFields.filter((f) => manual.has(f)) };
}

/* Accumulates Plaid reports: a later report's nulls don't wipe what an earlier one said. */
export function mergeSnapshot(prev: PlaidCardData | null, next: PlaidCardData): PlaidCardData {
  if (!prev) return { ...next };
  const out = { ...prev };
  for (const key of PLAID_FIELDS) {
    if (next[key] !== null) (out as Record<string, unknown>)[key] = next[key];
  }
  return out;
}
```

- [ ] **Step 5: Implement validation**

`apps/api/src/cards/card-validation.ts`:

```ts
import { BadRequestException } from '@nestjs/common';
import { CARD_GOALS, SCORE_BANDS, type CardApr, type CardProfileView } from './card-types';
import { MANUAL_FIELDS, type ManualField } from './detail-merge';

const MONEY_FIELDS = ['creditLimit', 'lastStatementBalance', 'minimumPayment', 'rewardsBalance'] as const;
const DATE_FIELDS = ['lastStatementDate', 'nextPaymentDueDate', 'promoAprEndsOn'] as const;
const APR_TYPES: readonly CardApr['type'][] = ['purchase', 'balance_transfer', 'cash_advance', 'special'];
const MAX_MONEY = 10_000_000;
const MAX_APRS = 8;

export type DetailPatch = Partial<Record<ManualField, number | string | CardApr[] | null>>;
export type ProfileInput = Partial<CardProfileView>;

function asObject(body: unknown): Record<string, unknown> {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new BadRequestException('Expected a JSON object');
  return body as Record<string, unknown>;
}

function has(obj: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(obj, key) && obj[key] !== undefined;
}

function money(value: unknown, field: string): number | null {
  if (value === null) return null;
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > MAX_MONEY) {
    throw new BadRequestException(`${field} must be a number between 0 and ${MAX_MONEY}`);
  }
  return Math.round(value * 100) / 100;
}

function isoDate(value: unknown, field: string): string | null {
  if (value === null) return null;
  const m = typeof value === 'string' ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(value) : null;
  if (m) {
    const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
    const dt = new Date(Date.UTC(y, mo - 1, d));
    if (dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d) return value as string;
  }
  throw new BadRequestException(`${field} must be a YYYY-MM-DD date`);
}

function aprList(value: unknown): CardApr[] | null {
  if (value === null) return null;
  if (!Array.isArray(value) || value.length > MAX_APRS) throw new BadRequestException(`aprs must be a list of at most ${MAX_APRS}`);
  return value.map((raw) => {
    const a = asObject(raw);
    if (!APR_TYPES.includes(a.type as CardApr['type'])) throw new BadRequestException('Unknown APR type');
    const pct = a.percentage;
    if (typeof pct !== 'number' || !Number.isFinite(pct) || pct < 0 || pct > 100) {
      throw new BadRequestException('APR must be between 0 and 100');
    }
    return { type: a.type as CardApr['type'], percentage: Math.round(pct * 100) / 100, balanceSubjectTo: null, interestCharged: null };
  });
}

/* Whitelists and validates a card-detail PATCH body. Unknown keys are dropped. */
export function validateDetailPatch(body: unknown): DetailPatch {
  const obj = asObject(body);
  const out: DetailPatch = {};
  for (const f of MONEY_FIELDS) if (has(obj, f)) out[f] = money(obj[f], f);
  for (const f of DATE_FIELDS) if (has(obj, f)) out[f] = isoDate(obj[f], f);
  if (has(obj, 'aprs')) out.aprs = aprList(obj.aprs);
  // Every key written above is a ManualField; this guards future edits.
  for (const k of Object.keys(out)) if (!(MANUAL_FIELDS as readonly string[]).includes(k)) delete (out as Record<string, unknown>)[k];
  return out;
}

/* Whitelists and validates a card-profile PUT body. */
export function validateProfile(body: unknown): ProfileInput {
  const obj = asObject(body);
  const out: ProfileInput = {};
  if (has(obj, 'goal')) {
    if (obj.goal !== null && !CARD_GOALS.includes(obj.goal as never)) throw new BadRequestException('Unknown goal');
    out.goal = obj.goal as ProfileInput['goal'];
  }
  if (has(obj, 'creditScoreBand')) {
    if (obj.creditScoreBand !== null && !SCORE_BANDS.includes(obj.creditScoreBand as never)) throw new BadRequestException('Unknown credit score band');
    out.creditScoreBand = obj.creditScoreBand as ProfileInput['creditScoreBand'];
  }
  if (has(obj, 'annualFeeOk')) {
    if (obj.annualFeeOk !== null && typeof obj.annualFeeOk !== 'boolean') throw new BadRequestException('annualFeeOk must be true, false or null');
    out.annualFeeOk = obj.annualFeeOk as boolean | null;
  }
  if (has(obj, 'monthlyDebtBudget')) out.monthlyDebtBudget = money(obj.monthlyDebtBudget, 'monthlyDebtBudget');
  if (has(obj, 'plannedPurchaseAmount')) out.plannedPurchaseAmount = money(obj.plannedPurchaseAmount, 'plannedPurchaseAmount');
  if (has(obj, 'plannedPurchaseNote')) {
    const note = obj.plannedPurchaseNote;
    if (note !== null && typeof note !== 'string') throw new BadRequestException('plannedPurchaseNote must be text');
    const trimmed = typeof note === 'string' ? note.trim() : null;
    if (trimmed && trimmed.length > 120) throw new BadRequestException('plannedPurchaseNote is limited to 120 characters');
    out.plannedPurchaseNote = trimmed || null;
  }
  return out;
}
```

- [ ] **Step 6: Run to see both pass**

Run: `npm run test:api -- src/cards/detail-merge.test.ts src/cards/card-validation.test.ts` → PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/cards/detail-merge.ts apps/api/src/cards/detail-merge.test.ts apps/api/src/cards/card-validation.ts apps/api/src/cards/card-validation.test.ts
git commit -m "feat(cards): manual-override merge rule and card input validation"
```

---

### Task 4: `CreditCardsService`, controller and module

**Files:**
- Create: `apps/api/src/cards/credit-cards.service.ts`, `apps/api/src/cards/cards.controller.ts`, `apps/api/src/cards/cards.module.ts`
- Modify: `apps/api/src/app/app.module.ts`
- Test: `apps/api/src/cards/credit-cards.service.test.ts`

**Interfaces:**
- Consumes: entities (Task 1), `mergePlaidData`, `mergeSnapshot`, `MANUAL_FIELDS`, `validateDetailPatch`, `validateProfile` (Task 3).
- Produces (used by Task 5):
  - `interface PlaidCardReport { plaidAccountId: string; data: PlaidCardData; status: LiabilitiesStatus }`
  - `CreditCardsService.applyPlaidReport(userId: string, report: PlaidCardReport): Promise<void>`
  - `CreditCardsService.listForUser(userId): Promise<CardView[]>`, `updateDetail(userId, accountId, body: unknown): Promise<CardView>`, `useBankData(userId, accountId): Promise<CardView>`, `getProfile(userId): Promise<CardProfileView | null>`, `saveProfile(userId, body: unknown): Promise<CardProfileView>`
  - `CardsModule` exporting `CreditCardsService`
  - HTTP: `GET /api/cards`, `PATCH /api/cards/:accountId`, `POST /api/cards/:accountId/use-bank-data`, `GET /api/cards/profile`, `PUT /api/cards/profile`

- [ ] **Step 1: Write the failing tests**

`apps/api/src/cards/credit-cards.service.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { DataSource } from 'typeorm';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { User } from '../users/user.entity';
import { BankAccount } from '../bank-accounts/bank-account.entity';
import { PlaidItem } from '../plaid/plaid-item.entity';
import { CreditCardDetail } from './credit-card-detail.entity';
import { CardProfile } from './card-profile.entity';
import { CreditCardsService } from './credit-cards.service';
import type { PlaidCardData } from './card-types';

async function makeDataSource() {
  const ds = new DataSource({
    type: 'better-sqlite3', database: ':memory:', dropSchema: true,
    entities: [User, BankAccount, PlaidItem, CreditCardDetail, CardProfile],
    synchronize: true,
  });
  await ds.initialize();
  return ds;
}

const plaidData: PlaidCardData = {
  creditLimit: 8000, officialName: 'Citi Double Cash',
  aprs: [{ type: 'purchase', percentage: 19.24, balanceSubjectTo: 1200, interestCharged: 19 }],
  lastStatementBalance: 1200, lastStatementDate: '2026-10-02', minimumPayment: 40, nextPaymentDueDate: '2026-10-29',
  lastPaymentAmount: 300, lastPaymentDate: '2026-09-28', isOverdue: false,
};

describe('CreditCardsService', () => {
  let ds: DataSource;
  let service: CreditCardsService;
  let card: BankAccount;

  beforeEach(async () => {
    ds = await makeDataSource();
    const users = ds.getRepository(User);
    await users.save(users.create({ id: 'u1', email: 'u1@example.com' }));
    await users.save(users.create({ id: 'u2', email: 'u2@example.com' }));
    const accounts = ds.getRepository(BankAccount);
    card = await accounts.save(accounts.create({
      userId: 'u1', bankName: 'Citi', accountName: 'Double Cash', accountType: 'credit',
      balance: -1234.5, provider: 'plaid', plaidAccountId: 'p-card',
    }));
    await accounts.save(accounts.create({ userId: 'u1', bankName: 'Citi', accountName: 'Checking', accountType: 'checking', balance: 50 }));
    service = new CreditCardsService(
      ds.getRepository(CreditCardDetail), ds.getRepository(CardProfile),
      ds.getRepository(BankAccount), ds.getRepository(PlaidItem),
    );
  });

  it('lists only credit accounts, creating a pending detail row for Plaid cards', async () => {
    const list = await service.listForUser('u1');
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ accountId: card.id, balance: 1234.5, liabilitiesStatus: 'pending', aprs: [], hasBankData: false });
    expect(await ds.getRepository(CreditCardDetail).count()).toBe(1);
  });

  it('gives manual credit accounts the manual status', async () => {
    const accounts = ds.getRepository(BankAccount);
    await accounts.save(accounts.create({ userId: 'u2', bankName: 'Amex', accountName: 'Blue', accountType: 'credit', balance: 10 }));
    const [view] = await service.listForUser('u2');
    expect(view.liabilitiesStatus).toBe('manual');
  });

  it('concurrent list creates one row', async () => {
    await Promise.all([service.listForUser('u1'), service.listForUser('u1')]);
    expect(await ds.getRepository(CreditCardDetail).count()).toBe(1);
  });

  it('applyPlaidReport stores values, snapshot and status', async () => {
    await service.applyPlaidReport('u1', { plaidAccountId: 'p-card', data: plaidData, status: 'synced' });
    const [view] = await service.listForUser('u1');
    expect(view).toMatchObject({
      creditLimit: 8000, officialName: 'Citi Double Cash', minimumPayment: 40,
      nextPaymentDueDate: '2026-10-29', liabilitiesStatus: 'synced', hasBankData: true,
    });
    expect(view.aprs[0].percentage).toBe(19.24);
    expect(view.liabilitiesSyncedAt).not.toBeNull();
  });

  it('applyPlaidReport ignores accounts of other users and non-credit accounts', async () => {
    await service.applyPlaidReport('u2', { plaidAccountId: 'p-card', data: plaidData, status: 'synced' });
    expect(await ds.getRepository(CreditCardDetail).count()).toBe(0);
  });

  it('a manual edit survives the next sync', async () => {
    await service.applyPlaidReport('u1', { plaidAccountId: 'p-card', data: plaidData, status: 'synced' });
    await service.updateDetail('u1', card.id, { creditLimit: 9500 });
    await service.applyPlaidReport('u1', { plaidAccountId: 'p-card', data: { ...plaidData, creditLimit: 8000 }, status: 'synced' });
    const [view] = await service.listForUser('u1');
    expect(view.creditLimit).toBe(9500);
    expect(view.manualFields).toEqual(['creditLimit']);
  });

  it('useBankData restores the Plaid values', async () => {
    await service.applyPlaidReport('u1', { plaidAccountId: 'p-card', data: plaidData, status: 'synced' });
    await service.updateDetail('u1', card.id, { creditLimit: 9500 });
    const view = await service.useBankData('u1', card.id);
    expect(view.creditLimit).toBe(8000);
    expect(view.manualFields).toEqual([]);
  });

  it('useBankData on a manual card is a 400', async () => {
    const accounts = ds.getRepository(BankAccount);
    const manual = await accounts.save(accounts.create({ userId: 'u1', bankName: 'Amex', accountName: 'Blue', accountType: 'credit', balance: 0 }));
    await expect(service.useBankData('u1', manual.id)).rejects.toThrow(BadRequestException);
  });

  it("rejects other user's account", async () => {
    await expect(service.updateDetail('u2', card.id, { creditLimit: 1 })).rejects.toThrow(NotFoundException);
    expect(await ds.getRepository(CreditCardDetail).count()).toBe(0);
  });

  it('rejects non-credit account', async () => {
    const checking = await ds.getRepository(BankAccount).findOneByOrFail({ accountName: 'Checking' });
    await expect(service.updateDetail('u1', checking.id, { creditLimit: 1 })).rejects.toThrow(NotFoundException);
  });

  it('ignores client-sent id / userId / status on PATCH', async () => {
    const view = await service.updateDetail('u1', card.id, { creditLimit: 500, userId: 'u2', id: 'x', liabilitiesStatus: 'synced' });
    expect(view.creditLimit).toBe(500);
    const row = await ds.getRepository(CreditCardDetail).findOneByOrFail({ bankAccountId: card.id });
    expect(row.userId).toBe('u1');
    expect(row.liabilitiesStatus).toBe('pending');
  });

  it('saves and reads the card profile, ignoring userId in the body', async () => {
    expect(await service.getProfile('u1')).toBeNull();
    await service.saveProfile('u1', { goal: 'cashback', monthlyDebtBudget: 400, userId: 'u2' });
    const saved = await service.saveProfile('u1', { annualFeeOk: true });
    expect(saved).toEqual({
      goal: 'cashback', annualFeeOk: true, creditScoreBand: null,
      monthlyDebtBudget: 400, plannedPurchaseAmount: null, plannedPurchaseNote: null,
    });
    expect(await service.getProfile('u2')).toBeNull();
  });
});
```

- [ ] **Step 2: Run to see it fail**

Run: `npm run test:api -- src/cards/credit-cards.service.test.ts`
Expected: FAIL — cannot resolve `./credit-cards.service`.

- [ ] **Step 3: Implement the service**

`apps/api/src/cards/credit-cards.service.ts`:

```ts
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BankAccount } from '../bank-accounts/bank-account.entity';
import { PlaidItem } from '../plaid/plaid-item.entity';
import { CreditCardDetail } from './credit-card-detail.entity';
import { CardProfile } from './card-profile.entity';
import type { CardProfileView, CardView, LiabilitiesStatus, PlaidCardData } from './card-types';
import { MANUAL_FIELDS, mergePlaidData, mergeSnapshot } from './detail-merge';
import { validateDetailPatch, validateProfile } from './card-validation';

export interface PlaidCardReport {
  plaidAccountId: string;
  data: PlaidCardData;
  status: LiabilitiesStatus;
}

const PROFILE_FIELDS = ['goal', 'annualFeeOk', 'creditScoreBand', 'monthlyDebtBudget', 'plannedPurchaseAmount', 'plannedPurchaseNote'] as const;

/* Postgres returns decimals as strings; sqlite as numbers. */
const num = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v));

@Injectable()
export class CreditCardsService {
  constructor(
    @InjectRepository(CreditCardDetail) private details: Repository<CreditCardDetail>,
    @InjectRepository(CardProfile) private profiles: Repository<CardProfile>,
    @InjectRepository(BankAccount) private accounts: Repository<BankAccount>,
    @InjectRepository(PlaidItem) private items: Repository<PlaidItem>,
  ) {}

  async listForUser(userId: string): Promise<CardView[]> {
    const cards = await this.accounts.find({ where: { userId, accountType: 'credit' }, order: { createdAt: 'ASC' } });
    if (cards.length === 0) return [];
    const items = await this.items.find({ where: { userId } });
    const statusByItem = new Map(items.map((i) => [i.id, i.status]));
    const views: CardView[] = [];
    for (const account of cards) {
      const detail = await this.ensureDetail(account);
      views.push(toView(account, detail, account.plaidItemId ? statusByItem.get(account.plaidItemId) ?? null : null));
    }
    return views;
  }

  async updateDetail(userId: string, accountId: string, body: unknown): Promise<CardView> {
    const patch = validateDetailPatch(body);
    const account = await this.ownedCreditAccount(userId, accountId);
    const detail = await this.ensureDetail(account);
    const edited = new Set(detail.manualFields ?? []);
    for (const key of MANUAL_FIELDS) {
      if (!(key in patch)) continue;
      (detail as unknown as Record<string, unknown>)[key] = patch[key];
      edited.add(key);
    }
    detail.manualFields = [...edited];
    detail.manualEditedAt = new Date();
    await this.details.save(detail);
    return this.viewOf(account, detail);
  }

  async useBankData(userId: string, accountId: string): Promise<CardView> {
    const account = await this.ownedCreditAccount(userId, accountId);
    if (account.provider !== 'plaid') throw new BadRequestException('This card is not connected to a bank');
    const detail = await this.ensureDetail(account);
    detail.manualFields = [];
    detail.manualEditedAt = null;
    if (detail.plaidData) Object.assign(detail, mergePlaidData({ manualFields: [], manualEditedAt: null }, detail.plaidData).values);
    await this.details.save(detail);
    return this.viewOf(account, detail);
  }

  /* Called by PlaidService for each credit account on an Item. Unknown accounts, other
     users' accounts and non-credit accounts are skipped. */
  async applyPlaidReport(userId: string, report: PlaidCardReport): Promise<void> {
    const account = await this.accounts.findOneBy({ userId, plaidAccountId: report.plaidAccountId });
    if (!account || account.accountType !== 'credit') return;
    const detail = await this.ensureDetail(account);
    const merged = mergePlaidData({ manualFields: detail.manualFields ?? [], manualEditedAt: detail.manualEditedAt }, report.data);
    Object.assign(detail, merged.values);
    detail.manualFields = merged.manualFields;
    detail.plaidData = mergeSnapshot(detail.plaidData, report.data);
    detail.liabilitiesStatus = report.status;
    if (report.status === 'synced') detail.liabilitiesSyncedAt = new Date();
    await this.details.save(detail);
  }

  async getProfile(userId: string): Promise<CardProfileView | null> {
    const profile = await this.profiles.findOneBy({ userId });
    return profile ? profileView(profile) : null;
  }

  async saveProfile(userId: string, body: unknown): Promise<CardProfileView> {
    const input = validateProfile(body);
    const profile = (await this.profiles.findOneBy({ userId })) ?? this.profiles.create({ userId });
    for (const key of PROFILE_FIELDS) {
      if (key in input) (profile as unknown as Record<string, unknown>)[key] = input[key];
    }
    return profileView(await this.profiles.save(profile));
  }

  private async ownedCreditAccount(userId: string, accountId: string): Promise<BankAccount> {
    const account = await this.accounts.findOneBy({ id: accountId, userId });
    if (!account || account.accountType !== 'credit') throw new NotFoundException('Card not found');
    return account;
  }

  /* Lazily creates the detail row. Two requests can race to create it; the unique
     index on bankAccountId makes the loser fail, and it re-reads the winner's row. */
  private async ensureDetail(account: BankAccount): Promise<CreditCardDetail> {
    const existing = await this.details.findOneBy({ bankAccountId: account.id });
    if (existing) return existing;
    try {
      return await this.details.save(this.details.create({
        userId: account.userId,
        bankAccountId: account.id,
        liabilitiesStatus: account.provider === 'plaid' ? 'pending' : 'manual',
        manualFields: [],
      }));
    } catch (err) {
      const winner = await this.details.findOneBy({ bankAccountId: account.id });
      if (winner) return winner;
      throw err;
    }
  }

  private async viewOf(account: BankAccount, detail: CreditCardDetail): Promise<CardView> {
    const item = account.plaidItemId ? await this.items.findOneBy({ id: account.plaidItemId }) : null;
    return toView(account, detail, item?.status ?? null);
  }
}

function toView(account: BankAccount, d: CreditCardDetail, plaidItemStatus: string | null): CardView {
  return {
    accountId: account.id,
    bankName: account.bankName,
    accountName: account.accountName,
    last4: account.last4 ?? null,
    balance: Math.abs(Number(account.balance)),
    provider: account.provider === 'plaid' ? 'plaid' : 'manual',
    plaidItemId: account.plaidItemId ?? null,
    plaidItemStatus,
    creditLimit: num(d.creditLimit),
    officialName: d.officialName,
    aprs: d.aprs ?? [],
    lastStatementBalance: num(d.lastStatementBalance),
    lastStatementDate: d.lastStatementDate,
    minimumPayment: num(d.minimumPayment),
    nextPaymentDueDate: d.nextPaymentDueDate,
    lastPaymentAmount: num(d.lastPaymentAmount),
    lastPaymentDate: d.lastPaymentDate,
    isOverdue: d.isOverdue,
    promoAprEndsOn: d.promoAprEndsOn,
    rewardsBalance: num(d.rewardsBalance),
    liabilitiesStatus: d.liabilitiesStatus,
    manualFields: d.manualFields ?? [],
    liabilitiesSyncedAt: d.liabilitiesSyncedAt ? new Date(d.liabilitiesSyncedAt).toISOString() : null,
    hasBankData: d.plaidData !== null && d.plaidData !== undefined,
  };
}

function profileView(p: CardProfile): CardProfileView {
  return {
    goal: p.goal ?? null,
    annualFeeOk: p.annualFeeOk ?? null,
    creditScoreBand: p.creditScoreBand ?? null,
    monthlyDebtBudget: num(p.monthlyDebtBudget),
    plannedPurchaseAmount: num(p.plannedPurchaseAmount),
    plannedPurchaseNote: p.plannedPurchaseNote ?? null,
  };
}
```

- [ ] **Step 4: Run to see it pass**

Run: `npm run test:api -- src/cards/credit-cards.service.test.ts` → PASS.
If "concurrent list creates one row" fails with a unique-constraint error escaping, the catch in `ensureDetail` isn't re-reading — fix there, not in the test.

- [ ] **Step 5: Controller and module**

`apps/api/src/cards/cards.controller.ts`:

```ts
import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Put, Request, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CreditCardsService } from './credit-cards.service';

/* Card data is available on every plan; only the advisor (Ask Cofre) is metered. */
@UseGuards(JwtAuthGuard)
@Controller('cards')
export class CardsController {
  constructor(private service: CreditCardsService) {}

  @Get()
  list(@Request() req: any) {
    return this.service.listForUser(req.user.id);
  }

  @Get('profile')
  getProfile(@Request() req: any) {
    return this.service.getProfile(req.user.id);
  }

  @Put('profile')
  saveProfile(@Request() req: any, @Body() body: unknown) {
    return this.service.saveProfile(req.user.id, body);
  }

  @Patch(':accountId')
  update(@Param('accountId', ParseUUIDPipe) accountId: string, @Request() req: any, @Body() body: unknown) {
    return this.service.updateDetail(req.user.id, accountId, body);
  }

  @Post(':accountId/use-bank-data')
  useBankData(@Param('accountId', ParseUUIDPipe) accountId: string, @Request() req: any) {
    return this.service.useBankData(req.user.id, accountId);
  }
}
```

`apps/api/src/cards/cards.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BankAccount } from '../bank-accounts/bank-account.entity';
import { PlaidItem } from '../plaid/plaid-item.entity';
import { CreditCardDetail } from './credit-card-detail.entity';
import { CardProfile } from './card-profile.entity';
import { CreditCardsService } from './credit-cards.service';
import { CardsController } from './cards.controller';

@Module({
  imports: [TypeOrmModule.forFeature([CreditCardDetail, CardProfile, BankAccount, PlaidItem])],
  providers: [CreditCardsService],
  controllers: [CardsController],
  exports: [CreditCardsService],
})
export class CardsModule {}
```

In `apps/api/src/app/app.module.ts` add `import { CardsModule } from '../cards/cards.module';` and `CardsModule,` to `imports` after `DebtsModule,`.

- [ ] **Step 6: Build and smoke-test**

Run: `npm run build:api` → succeeds.
Run the API (`npm run dev:api`), log in in the browser at http://localhost:3000, then in the browser devtools console:
`await (await fetch('http://localhost:3333/api/cards', { credentials: 'include' })).json()` → an array (one entry per credit account).
`await (await fetch('http://localhost:3333/api/cards/not-a-uuid', { method: 'PATCH', credentials: 'include', headers: {'Content-Type':'application/json'}, body: '{}' })).status` → `400`.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/cards apps/api/src/app/app.module.ts
git commit -m "feat(cards): /api/cards — card details, manual edits, card profile"
```

---

### Task 5: Plaid Liabilities sync

**Files:**
- Modify: `apps/api/src/plaid/plaid.service.ts`, `apps/api/src/plaid/plaid.controller.ts`, `apps/api/src/plaid/plaid-webhook.controller.ts`, `apps/api/src/plaid/plaid.module.ts`, `apps/api/src/plaid/plaid.service.institution-cap.test.ts`, `apps/api/src/plaid/plaid.service.upgrade-merge.test.ts`
- Test: `apps/api/src/plaid/plaid.service.liabilities.test.ts`

**Interfaces:**
- Consumes: `mapPlaidCard`, `liabilitiesErrorStatus` (Task 2); `CreditCardsService.applyPlaidReport`, `CardsModule` (Task 4).
- Produces:
  - `PlaidService` constructor gains a 7th parameter `creditCards: CreditCardsService`.
  - `PlaidService.syncLiabilities(item: PlaidItem, accessToken: string): Promise<void>` — never throws.
  - `PlaidService.syncLiabilitiesByExternalItemId(externalItemId: string): Promise<void>`
  - `PlaidService.createLiabilitiesLinkToken(userId: string, plaidItemId: string): Promise<string>`
  - `PlaidService.completeLiabilitiesConsent(plaidItemId: string, userId: string): Promise<void>`
  - HTTP: `POST /api/plaid/liabilities-token/:itemId` → `{ link_token }`; `POST /api/plaid/liabilities/:itemId/complete` → `{ ok: true }`.

- [ ] **Step 1: Write the failing tests**

`apps/api/src/plaid/plaid.service.liabilities.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { DataSource } from 'typeorm';
import { PlaidItem } from './plaid-item.entity';
import { BankAccount } from '../bank-accounts/bank-account.entity';
import { Transaction } from '../transactions/transaction.entity';
import { User } from '../users/user.entity';
import { Category } from '../categories/category.entity';
import { ProjectCategory } from '../projects/project-category.entity';
import { CategorizationRule } from '../categorization-rules/categorization-rule.entity';
import { CreditCardDetail } from '../cards/credit-card-detail.entity';
import { CardProfile } from '../cards/card-profile.entity';
import { CreditCardsService } from '../cards/credit-cards.service';
import { PlaidService } from './plaid.service';
import { deriveKey, encryptToken } from '../common/token-crypto.util';

const SECRET = 'test-secret-at-least-this-long';

async function makeDataSource() {
  const ds = new DataSource({
    type: 'better-sqlite3', database: ':memory:', dropSchema: true,
    entities: [PlaidItem, BankAccount, Transaction, User, Category, ProjectCategory, CategorizationRule, CreditCardDetail, CardProfile],
    synchronize: true,
  });
  await ds.initialize();
  return ds;
}

const plaidAccounts = [
  { account_id: 'p-card', type: 'credit', subtype: 'credit card', official_name: 'Venture Rewards', balances: { current: 900, limit: 5000 } },
  { account_id: 'p-chk', type: 'depository', subtype: 'checking', official_name: null, balances: { current: 100, limit: null } },
];
const creditLiab = {
  account_id: 'p-card',
  aprs: [{ apr_type: 'purchase_apr', apr_percentage: 26.99, balance_subject_to_apr: 900, interest_charge_amount: 20 }],
  is_overdue: false, last_payment_amount: 50, last_payment_date: '2026-09-30',
  last_statement_issue_date: '2026-10-03', last_statement_balance: 900,
  minimum_payment_amount: 30, next_payment_due_date: '2026-10-30',
};

function plaidError(code: string) {
  return Object.assign(new Error('plaid'), { response: { data: { error_code: code } } });
}

describe('PlaidService liabilities', () => {
  let ds: DataSource;
  let item: PlaidItem;

  beforeEach(async () => {
    ds = await makeDataSource();
    await ds.getRepository(User).save(ds.getRepository(User).create({ id: 'user-1', email: 'u@example.com' }));
    item = await ds.getRepository(PlaidItem).save(ds.getRepository(PlaidItem).create({
      userId: 'user-1', itemId: 'item-1', institutionId: 'ins', institutionName: 'Capital One',
      accessToken: encryptToken('access-tok', deriveKey(SECRET)),
    }));
    const accounts = ds.getRepository(BankAccount);
    await accounts.save(accounts.create({ userId: 'user-1', bankName: 'Capital One', accountName: 'Venture', accountType: 'credit', balance: 900, provider: 'plaid', plaidItemId: item.id, plaidAccountId: 'p-card' }));
    await accounts.save(accounts.create({ userId: 'user-1', bankName: 'Capital One', accountName: 'Checking', accountType: 'checking', balance: 100, provider: 'plaid', plaidItemId: item.id, plaidAccountId: 'p-chk' }));
  });

  // Real constructor order: (config, itemRepo, accountRepo, txRepo, userRepo, rulesService, creditCards).
  function makeService(client: any) {
    const creditCards = new CreditCardsService(
      ds.getRepository(CreditCardDetail), ds.getRepository(CardProfile), ds.getRepository(BankAccount), ds.getRepository(PlaidItem),
    );
    const service = new PlaidService(
      { get: (k: string, d?: string) => ({ PLAID_ENV: 'sandbox', JWT_SECRET: SECRET } as Record<string, string>)[k] ?? d } as any,
      ds.getRepository(PlaidItem), ds.getRepository(BankAccount), ds.getRepository(Transaction), ds.getRepository(User),
      { getActiveRules: async () => [], matchRule: () => null } as any,
      creditCards,
    );
    (service as any).client = client;
    return service;
  }

  const details = () => ds.getRepository(CreditCardDetail).find();

  it('stores Liabilities data for credit accounts only', async () => {
    const service = makeService({
      liabilitiesGet: async () => ({ data: { accounts: plaidAccounts, liabilities: { credit: [creditLiab], mortgage: null, student: null } } }),
    });
    await service.syncLiabilities(item, 'access-tok');
    const rows = await details();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ liabilitiesStatus: 'synced', officialName: 'Venture Rewards', nextPaymentDueDate: '2026-10-30' });
    expect(Number(rows[0].creditLimit)).toBe(5000);
    expect(rows[0].aprs?.[0]).toMatchObject({ type: 'purchase', percentage: 26.99 });
  });

  it('marks a credit account missing from the Liabilities response as unsupported', async () => {
    const service = makeService({
      liabilitiesGet: async () => ({ data: { accounts: plaidAccounts, liabilities: { credit: [], mortgage: null, student: null } } }),
    });
    await service.syncLiabilities(item, 'access-tok');
    const [row] = await details();
    expect(row.liabilitiesStatus).toBe('unsupported');
    expect(Number(row.creditLimit)).toBe(5000);
  });

  it('falls back to accountsGet when consent is missing', async () => {
    const service = makeService({
      liabilitiesGet: async () => { throw plaidError('ADDITIONAL_CONSENT_REQUIRED'); },
      accountsGet: async () => ({ data: { accounts: plaidAccounts } }),
    });
    await service.syncLiabilities(item, 'access-tok');
    const [row] = await details();
    expect(row.liabilitiesStatus).toBe('not_consented');
    expect(Number(row.creditLimit)).toBe(5000);
    expect(row.aprs).toBeNull();
  });

  it('never throws on a real Plaid failure and writes nothing', async () => {
    const service = makeService({ liabilitiesGet: async () => { throw plaidError('ITEM_LOGIN_REQUIRED'); } });
    await expect(service.syncLiabilities(item, 'access-tok')).resolves.toBeUndefined();
    expect(await details()).toHaveLength(0);
  });

  it('asks for Liabilities as an optional product on new links', async () => {
    let req: any;
    const service = makeService({
      userCreate: async () => ({ data: { user_id: 'plaid-user' } }),
      linkTokenCreate: async (r: any) => { req = r; return { data: { link_token: 'lt' } }; },
    });
    await service.createLinkToken('user-1');
    expect(req.products).toEqual(['transactions']);
    expect(req.optional_products).toEqual(['liabilities']);
  });

  it('builds an update-mode token that adds Liabilities consent', async () => {
    let req: any;
    const service = makeService({
      userCreate: async () => ({ data: { user_id: 'plaid-user' } }),
      linkTokenCreate: async (r: any) => { req = r; return { data: { link_token: 'lt-liab' } }; },
    });
    await expect(service.createLiabilitiesLinkToken('user-1', item.id)).resolves.toBe('lt-liab');
    expect(req.access_token).toBe('access-tok');
    expect(req.additional_consented_products).toEqual(['liabilities']);
    expect(req.products).toBeUndefined();
  });

  it("won't build a consent token for another user's item", async () => {
    const service = makeService({});
    await expect(service.createLiabilitiesLinkToken('someone-else', item.id)).rejects.toThrow(/not found/i);
  });
});
```

- [ ] **Step 2: Run to see it fail**

Run: `npm run test:api -- src/plaid/plaid.service.liabilities.test.ts`
Expected: FAIL — `service.syncLiabilities is not a function` / `optional_products` undefined.

- [ ] **Step 3: Wire `CreditCardsService` into `PlaidService`**

In `apps/api/src/plaid/plaid.service.ts`:

Change the `plaid` import to also bring in `AccountType`:

```ts
import {
  Configuration,
  PlaidApi,
  PlaidEnvironments,
  Products,
  CountryCode,
  AccountType,
} from 'plaid';
```

Add imports below the existing ones:

```ts
import { CreditCardsService } from '../cards/credit-cards.service';
import { mapPlaidCard, liabilitiesErrorStatus } from '../cards/liabilities.mapper';
import type { LiabilitiesStatus } from '../cards/card-types';
```

Add the constructor parameter after `rulesService`:

```ts
    private rulesService: CategorizationRulesService,
    private creditCards: CreditCardsService,
  ) {
```

In `plaid.module.ts` add `import { CardsModule } from '../cards/cards.module';` and change `imports` to:

```ts
  imports: [TypeOrmModule.forFeature([PlaidItem, BankAccount, Transaction, User]), CategorizationRulesModule, CardsModule],
```

Update the two existing tests' `new PlaidService(...)` calls to pass a 7th argument, and update the constructor-order comment in `plaid.service.institution-cap.test.ts` to list `creditCards`:

```ts
      { applyPlaidReport: async () => undefined } as any, // CreditCardsService stub
```

In `plaid.service.upgrade-merge.test.ts` also add to the fake `client` object (confirmExchange now syncs liabilities):

```ts
    liabilitiesGet: async () => ({ data: { accounts: [], liabilities: { credit: [], mortgage: null, student: null } } }),
```

- [ ] **Step 4: Request Liabilities on new links**

In `createLinkToken`, after `products: [Products.Transactions],` add:

```ts
        /* Best effort: banks without Liabilities still link; cards there get manual entry. */
        optional_products: [Products.Liabilities],
```

- [ ] **Step 5: Add `syncLiabilities` and the by-external-id variant**

Add these methods to `PlaidService` directly after `markItemStatus`:

```ts
  /* Card data (limit, APRs, statement, due date) from /liabilities/get, handed to
     CreditCardsService per credit account. Never throws: a card-data problem must not
     fail the connect / sync / reconnect that triggered it. Expected "no data" errors
     (no consent yet, unsupported bank, still extracting) fall back to /accounts/get so
     limit and card name are still stored, and set that status on each card. Logs only
     the Plaid error code — axios errors carry the request, which holds the access token. */
  async syncLiabilities(item: PlaidItem, accessToken: string): Promise<void> {
    try {
      let accounts;
      let credit: { account_id: string | null }[] = [];
      let status: LiabilitiesStatus = 'synced';
      try {
        const res = await timed('plaid', 'liabilitiesGet', () => this.client.liabilitiesGet({ access_token: accessToken }));
        accounts = res.data.accounts;
        credit = res.data.liabilities.credit ?? [];
      } catch (err) {
        const code: string | undefined = (err as any)?.response?.data?.error_code;
        const fallback = liabilitiesErrorStatus(code);
        if (!fallback) throw err;
        this.logger.log(`Liabilities unavailable for item ${item.itemId}: ${code}`);
        status = fallback;
        accounts = (await timed('plaid', 'accountsGet', () => this.client.accountsGet({ access_token: accessToken }))).data.accounts;
      }

      const creditById = new Map(credit.map((c) => [c.account_id, c]));
      for (const pa of accounts) {
        if (pa.type !== AccountType.Credit) continue;
        const liability = (creditById.get(pa.account_id) ?? null) as Parameters<typeof mapPlaidCard>[1];
        await this.creditCards.applyPlaidReport(item.userId, {
          plaidAccountId: pa.account_id,
          data: mapPlaidCard(pa, liability),
          status: status === 'synced' && !liability ? 'unsupported' : status,
        });
      }
    } catch (err) {
      const code = (err as any)?.response?.data?.error_code ?? (err as Error)?.message;
      this.logger.error(`Liabilities sync failed for item ${item.itemId}: ${code}`);
    }
  }

  async syncLiabilitiesByExternalItemId(externalItemId: string): Promise<void> {
    const item = await this.itemRepo
      .createQueryBuilder('item')
      .addSelect('item.accessToken')
      .where('item.itemId = :externalItemId', { externalItemId })
      .getOne();
    if (!item) return;
    await this.syncLiabilities(item, decryptToken(item.accessToken, this.encKey));
  }
```

- [ ] **Step 6: Call it from the existing flows**

- In `confirmExchange`, after `await this.runSync(item, accessToken, cutoverDates.size > 0 ? cutoverDates : undefined);` add `await this.syncLiabilities(item, accessToken);`
- In `syncItem`, after the balance-refresh `for` loop add `await this.syncLiabilities(item, accessToken);`
- In `completeReconnect`, after `await this.runSync(item, accessToken);` add `await this.syncLiabilities(item, accessToken);`

- [ ] **Step 7: Update-mode consent token — share code with reconnect**

Replace the body of `createReconnectLinkToken` with a call to a new private helper, and add `createLiabilitiesLinkToken` + `completeLiabilitiesConsent`:

```ts
  /* Update-mode link token: reuses the existing Item's access token so the user
     re-authenticates the same connection instead of creating a new one. */
  createReconnectLinkToken(userId: string, plaidItemId: string): Promise<string> {
    return this.updateModeLinkToken(userId, plaidItemId, {}, 'reconnect');
  }

  /* Update mode that asks the user to consent to Liabilities on an Item linked before
     Cofre requested it. Plaid bills Liabilities per Item from then on. */
  createLiabilitiesLinkToken(userId: string, plaidItemId: string): Promise<string> {
    return this.updateModeLinkToken(userId, plaidItemId, { additional_consented_products: [Products.Liabilities] }, 'liabilities');
  }

  async completeLiabilitiesConsent(plaidItemId: string, userId: string): Promise<void> {
    const item = await this.itemRepo
      .createQueryBuilder('item')
      .addSelect('item.accessToken')
      .where('item.id = :plaidItemId AND item.userId = :userId', { plaidItemId, userId })
      .getOne();
    if (!item) throw new NotFoundException('Bank connection not found');
    await this.syncLiabilities(item, decryptToken(item.accessToken, this.encKey));
  }

  private async updateModeLinkToken(
    userId: string,
    plaidItemId: string,
    extra: { additional_consented_products?: Products[] },
    purpose: string,
  ): Promise<string> {
    const item = await this.itemRepo
      .createQueryBuilder('item')
      .addSelect('item.accessToken')
      .where('item.id = :plaidItemId AND item.userId = :userId', { plaidItemId, userId })
      .getOne();
    if (!item) throw new NotFoundException('Bank connection not found');

    const accessToken = decryptToken(item.accessToken, this.encKey);
    const plaidUserId = await this.getOrCreatePlaidUserId(userId);
    const webhook = this.config.get<string>('PLAID_WEBHOOK_URL');
    const redirectUri = this.config.get<string>('PLAID_OAUTH_REDIRECT_URI');
    try {
      const res = await timed('plaid', 'linkTokenCreate', () => this.client.linkTokenCreate({
        user_id: plaidUserId,
        client_name: 'Cofre Budget',
        access_token: accessToken,
        country_codes: [CountryCode.Us],
        language: 'en',
        ...extra,
        ...(webhook ? { webhook } : {}),
        ...(redirectUri ? { redirect_uri: redirectUri } : {}),
      }));
      return res.data.link_token;
    } catch (err) {
      this.logger.error(`linkTokenCreate (${purpose}) failed`, (err as any)?.response?.data ?? err);
      throw err;
    }
  }
```

- [ ] **Step 8: Routes and webhook**

In `apps/api/src/plaid/plaid.controller.ts` add after `completeReconnect`:

```ts
  @Post('liabilities-token/:itemId')
  async createLiabilitiesLinkToken(@Param('itemId') itemId: string, @Request() req: any) {
    const linkToken = await this.service.createLiabilitiesLinkToken(req.user.id, itemId);
    return { link_token: linkToken };
  }

  @Post('liabilities/:itemId/complete')
  async completeLiabilitiesConsent(@Param('itemId') itemId: string, @Request() req: any) {
    await this.service.completeLiabilitiesConsent(itemId, req.user.id);
    return { ok: true };
  }
```

In `apps/api/src/plaid/plaid-webhook.controller.ts`, add a branch before the final `else`:

```ts
    } else if (webhookType === 'LIABILITIES' && webhookCode === 'DEFAULT_UPDATE') {
      await this.service.syncLiabilitiesByExternalItemId(itemId);
```

- [ ] **Step 9: Run all Plaid tests**

Run: `npm run test:api -- src/plaid` → PASS (liabilities, institution-cap, upgrade-merge, webhook-signature).

- [ ] **Step 10: Full API suite and build**

Run: `npm run test:api` → PASS. Run: `npm run build:api` → succeeds.

- [ ] **Step 11: Sandbox check**

With `PLAID_ENV=sandbox`, connect "First Platypus Bank" (`user_good` / `pass_good`) from Settings. Then `GET /api/cards` in the devtools console → the sandbox credit card has `liabilitiesStatus: 'synced'`, a `creditLimit`, and a purchase APR.

- [ ] **Step 12: Commit**

```bash
git add apps/api/src/plaid
git commit -m "feat(plaid): sync Liabilities card data; consent flow for existing banks"
```

---

### Task 6: Web card helpers

**Files:**
- Create: `apps/web/src/lib/cards/types.ts`, `utilization.ts`, `card-notice.ts`, `detail-form.ts`, `profile.ts`
- Test: `apps/web/src/lib/cards/utilization.test.ts`, `card-notice.test.ts`, `detail-form.test.ts`
- Modify: `apps/web/vitest.config.ts`

**Interfaces:**
- Consumes: the `/api/cards` response shape (Task 4).
- Produces:
  - types `CardView`, `CardApr`, `LiabilitiesStatus`, `CardProfileView`, `CardGoal`, `ScoreBand`
  - `utilization(balance: number, limit: number | null): number | null`
  - `totalUtilization(cards: Pick<CardView, 'balance' | 'creditLimit'>[]): { balance: number; limit: number; ratio: number | null }`
  - `utilizationLevel(ratio: number): 'ok' | 'watch' | 'high'`, `LEVEL_COLOR: Record<level, string>`
  - `aprOf(card: Pick<CardView, 'aprs'>, type: AprType): number | null`
  - `cardNotice(card: CardView): CardNotice | null` with `type CardNotice = { kind: 'reconnect' | 'enable' | 'pending' | 'add_details'; message: string }`
  - `interface DetailForm { creditLimit: string; purchaseApr: string; promoApr: string; promoAprEndsOn: string; lastStatementBalance: string; minimumPayment: string; nextPaymentDueDate: string; rewardsBalance: string }`
  - `formFromCard(card: CardView): DetailForm`, `formToPatch(form: DetailForm, card: CardView): { patch: Record<string, unknown>; errors: Partial<Record<keyof DetailForm, string>> }`
  - `GOAL_LABELS`, `SCORE_BANDS`

- [ ] **Step 1: Types**

`apps/web/src/lib/cards/types.ts`:

```ts
/* Mirror of apps/api/src/cards/card-types.ts (CardView / CardProfileView) — keep in sync. */

export type AprType = 'purchase' | 'balance_transfer' | 'cash_advance' | 'special';
export interface CardApr { type: AprType; percentage: number; balanceSubjectTo: number | null; interestCharged: number | null }
export type LiabilitiesStatus = 'synced' | 'unsupported' | 'not_consented' | 'pending' | 'manual';

export interface CardView {
  accountId: string;
  bankName: string;
  accountName: string;
  last4: string | null;
  balance: number;
  provider: 'manual' | 'plaid';
  plaidItemId: string | null;
  plaidItemStatus: string | null;
  creditLimit: number | null;
  officialName: string | null;
  aprs: CardApr[];
  lastStatementBalance: number | null;
  lastStatementDate: string | null;
  minimumPayment: number | null;
  nextPaymentDueDate: string | null;
  lastPaymentAmount: number | null;
  lastPaymentDate: string | null;
  isOverdue: boolean | null;
  promoAprEndsOn: string | null;
  rewardsBalance: number | null;
  liabilitiesStatus: LiabilitiesStatus;
  manualFields: string[];
  liabilitiesSyncedAt: string | null;
  hasBankData: boolean;
}

export type CardGoal = 'pay_off_debt' | 'cashback' | 'travel' | 'build_credit';
export type ScoreBand = '<580' | '580-669' | '670-739' | '740-799' | '800+';

export interface CardProfileView {
  goal: CardGoal | null;
  annualFeeOk: boolean | null;
  creditScoreBand: ScoreBand | null;
  monthlyDebtBudget: number | null;
  plannedPurchaseAmount: number | null;
  plannedPurchaseNote: string | null;
}
```

- [ ] **Step 2: Write the failing tests**

`apps/web/src/lib/cards/utilization.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { utilization, totalUtilization, utilizationLevel, aprOf } from './utilization';

describe('utilization', () => {
  it('is balance over limit', () => { expect(utilization(300, 1000)).toBeCloseTo(0.3); });
  it('is null without a usable limit', () => {
    expect(utilization(300, null)).toBeNull();
    expect(utilization(300, 0)).toBeNull();
  });
});

describe('totalUtilization', () => {
  it('only counts cards with a limit', () => {
    expect(totalUtilization([
      { balance: 500, creditLimit: 1000 },
      { balance: 1500, creditLimit: 4000 },
      { balance: 9999, creditLimit: null },
    ])).toEqual({ balance: 2000, limit: 5000, ratio: 0.4 });
  });
  it('has no ratio when no card has a limit', () => {
    expect(totalUtilization([{ balance: 10, creditLimit: null }]).ratio).toBeNull();
  });
});

describe('utilizationLevel', () => {
  it.each([[0, 'ok'], [0.299, 'ok'], [0.3, 'watch'], [0.499, 'watch'], [0.5, 'high'], [1.2, 'high']])('%s → %s', (r, level) => {
    expect(utilizationLevel(r as number)).toBe(level);
  });
});

describe('aprOf', () => {
  it('finds the APR of a type', () => {
    const card = { aprs: [{ type: 'purchase' as const, percentage: 24.99, balanceSubjectTo: null, interestCharged: null }] };
    expect(aprOf(card, 'purchase')).toBe(24.99);
    expect(aprOf(card, 'special')).toBeNull();
  });
});
```

`apps/web/src/lib/cards/card-notice.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { cardNotice } from './card-notice';
import type { CardView } from './types';

const base: CardView = {
  accountId: 'a', bankName: 'Chase', accountName: 'Freedom', last4: '1234', balance: 100,
  provider: 'plaid', plaidItemId: 'i', plaidItemStatus: 'active', creditLimit: 1000, officialName: null,
  aprs: [{ type: 'purchase', percentage: 20, balanceSubjectTo: null, interestCharged: null }],
  lastStatementBalance: null, lastStatementDate: null, minimumPayment: null, nextPaymentDueDate: null,
  lastPaymentAmount: null, lastPaymentDate: null, isOverdue: null, promoAprEndsOn: null, rewardsBalance: null,
  liabilitiesStatus: 'synced', manualFields: [], liabilitiesSyncedAt: null, hasBankData: true,
};

describe('cardNotice', () => {
  it('nothing to say for a synced card', () => { expect(cardNotice(base)).toBeNull(); });
  it('a broken bank connection wins', () => {
    expect(cardNotice({ ...base, plaidItemStatus: 'error', liabilitiesStatus: 'not_consented' })?.kind).toBe('reconnect');
  });
  it('asks for consent on older links', () => {
    expect(cardNotice({ ...base, liabilitiesStatus: 'not_consented' })?.kind).toBe('enable');
  });
  it('says data is on the way', () => {
    expect(cardNotice({ ...base, liabilitiesStatus: 'pending' })?.kind).toBe('pending');
  });
  it('asks for details when the bank does not share them and none were typed', () => {
    expect(cardNotice({ ...base, liabilitiesStatus: 'unsupported', aprs: [] })?.kind).toBe('add_details');
    expect(cardNotice({ ...base, provider: 'manual', plaidItemId: null, plaidItemStatus: null, liabilitiesStatus: 'manual', creditLimit: null })?.kind).toBe('add_details');
  });
  it('is quiet once a manual card has APR and limit', () => {
    expect(cardNotice({ ...base, provider: 'manual', plaidItemId: null, plaidItemStatus: null, liabilitiesStatus: 'manual' })).toBeNull();
  });
});
```

`apps/web/src/lib/cards/detail-form.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { formFromCard, formToPatch, type DetailForm } from './detail-form';
import type { CardView } from './types';

const card = {
  creditLimit: 5000, aprs: [
    { type: 'purchase', percentage: 24.99, balanceSubjectTo: 800, interestCharged: 16 },
    { type: 'cash_advance', percentage: 29.99, balanceSubjectTo: null, interestCharged: null },
  ],
  lastStatementBalance: 800, minimumPayment: 35, nextPaymentDueDate: '2026-10-28',
  promoAprEndsOn: null, rewardsBalance: null,
} as unknown as CardView;

const blank: DetailForm = {
  creditLimit: '', purchaseApr: '', promoApr: '', promoAprEndsOn: '',
  lastStatementBalance: '', minimumPayment: '', nextPaymentDueDate: '', rewardsBalance: '',
};

describe('formFromCard', () => {
  it('prefills strings from the card', () => {
    expect(formFromCard(card)).toEqual({ ...blank, creditLimit: '5000', purchaseApr: '24.99', lastStatementBalance: '800', minimumPayment: '35', nextPaymentDueDate: '2026-10-28' });
  });
});

describe('formToPatch', () => {
  it('sends only changed fields, parsing $ and commas', () => {
    const { patch, errors } = formToPatch({ ...formFromCard(card), creditLimit: '$6,500.50' }, card);
    expect(errors).toEqual({});
    expect(patch).toEqual({ creditLimit: 6500.5 });
  });

  it('turns a cleared field into null', () => {
    expect(formToPatch({ ...formFromCard(card), minimumPayment: '  ' }, card).patch).toEqual({ minimumPayment: null });
  });

  it('rebuilds the APR list, keeping APR types the form does not edit', () => {
    const { patch } = formToPatch({ ...formFromCard(card), purchaseApr: '21.5', promoApr: '0', promoAprEndsOn: '2027-06-30' }, card);
    expect(patch.aprs).toEqual([
      { type: 'purchase', percentage: 21.5 },
      { type: 'special', percentage: 0 },
      { type: 'cash_advance', percentage: 29.99 },
    ]);
    expect(patch.promoAprEndsOn).toBe('2027-06-30');
  });

  it.each([
    ['creditLimit', 'abc'],
    ['creditLimit', '-5'],
    ['purchaseApr', '250'],
    ['nextPaymentDueDate', '2026-02-30'],
  ] as const)('flags %s = %s', (field, value) => {
    const { errors, patch } = formToPatch({ ...formFromCard(card), [field]: value }, card);
    expect(errors[field]).toBeTruthy();
    expect(patch).toEqual({});
  });
});
```

- [ ] **Step 3: Add the tests to the web Vitest config and see them fail**

In `apps/web/vitest.config.ts`, append `'src/lib/cards/**/*.test.ts'` to the `include` array.
Run: `npm run test:dashboard -- src/lib/cards` → FAIL (modules missing).

- [ ] **Step 4: Implement `utilization.ts`**

```ts
import type { AprType, CardView } from './types';

export type UtilizationLevel = 'ok' | 'watch' | 'high';

/* Status colors, not chart series. */
export const LEVEL_COLOR: Record<UtilizationLevel, string> = {
  ok: 'var(--color-green)',
  watch: 'var(--color-amber)',
  high: 'var(--color-rose)',
};

export function utilization(balance: number, limit: number | null): number | null {
  if (!limit || limit <= 0) return null;
  return Math.abs(balance) / limit;
}

/* Cards without a known limit are left out of both sides. */
export function totalUtilization(cards: Pick<CardView, 'balance' | 'creditLimit'>[]): { balance: number; limit: number; ratio: number | null } {
  let balance = 0;
  let limit = 0;
  for (const c of cards) {
    if (!c.creditLimit || c.creditLimit <= 0) continue;
    balance += Math.abs(c.balance);
    limit += c.creditLimit;
  }
  return { balance, limit, ratio: limit > 0 ? balance / limit : null };
}

/* Under 30% is the usual guidance for credit scores. */
export function utilizationLevel(ratio: number): UtilizationLevel {
  if (ratio < 0.3) return 'ok';
  if (ratio < 0.5) return 'watch';
  return 'high';
}

export function aprOf(card: Pick<CardView, 'aprs'>, type: AprType): number | null {
  return card.aprs.find((a) => a.type === type)?.percentage ?? null;
}
```

- [ ] **Step 5: Implement `card-notice.ts`**

```ts
import type { CardView } from './types';
import { aprOf } from './utilization';

export type CardNotice = { kind: 'reconnect' | 'enable' | 'pending' | 'add_details'; message: string };

/* The one thing a card tile should ask of the user, most urgent first. */
export function cardNotice(card: CardView): CardNotice | null {
  if (card.provider === 'plaid' && card.plaidItemStatus === 'error') {
    return { kind: 'reconnect', message: 'This bank needs to be reconnected in Settings.' };
  }
  if (card.liabilitiesStatus === 'not_consented') {
    return { kind: 'enable', message: 'Allow Cofre to read this card’s APR, statement and due date.' };
  }
  if (card.liabilitiesStatus === 'pending') {
    return { kind: 'pending', message: 'Your bank is still sending card details.' };
  }
  const missing = aprOf(card, 'purchase') === null || card.creditLimit === null;
  if ((card.liabilitiesStatus === 'unsupported' || card.liabilitiesStatus === 'manual') && missing) {
    return {
      kind: 'add_details',
      message: card.liabilitiesStatus === 'unsupported'
        ? 'Your bank doesn’t share card details — add the APR and limit yourself.'
        : 'Add the APR and limit so Cofre can advise on this card.',
    };
  }
  return null;
}
```

- [ ] **Step 6: Implement `detail-form.ts`**

```ts
import type { CardApr, CardView } from './types';
import { aprOf } from './utilization';

export interface DetailForm {
  creditLimit: string;
  purchaseApr: string;
  promoApr: string;
  promoAprEndsOn: string;
  lastStatementBalance: string;
  minimumPayment: string;
  nextPaymentDueDate: string;
  rewardsBalance: string;
}

type FormErrors = Partial<Record<keyof DetailForm, string>>;

const MONEY: (keyof DetailForm & keyof CardView)[] = ['creditLimit', 'lastStatementBalance', 'minimumPayment', 'rewardsBalance'];
const DATES: (keyof DetailForm & keyof CardView)[] = ['nextPaymentDueDate', 'promoAprEndsOn'];

const str = (v: number | string | null | undefined) => (v === null || v === undefined ? '' : String(v));

export function formFromCard(card: CardView): DetailForm {
  return {
    creditLimit: str(card.creditLimit),
    purchaseApr: str(aprOf(card, 'purchase')),
    promoApr: str(aprOf(card, 'special')),
    promoAprEndsOn: str(card.promoAprEndsOn),
    lastStatementBalance: str(card.lastStatementBalance),
    minimumPayment: str(card.minimumPayment),
    nextPaymentDueDate: str(card.nextPaymentDueDate),
    rewardsBalance: str(card.rewardsBalance),
  };
}

/* "" → null; "$1,200.50" → 1200.5; anything else unparseable → undefined (error). */
function parseNumber(raw: string): number | null | undefined {
  const s = raw.trim().replace(/[$,\s%]/g, '');
  if (s === '') return null;
  if (!/^\d+(\.\d+)?$/.test(s)) return undefined;
  return Number(s);
}

function validDate(s: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return false;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return d.getUTCFullYear() === +m[1] && d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3];
}

/* Builds the PATCH body from the form: only fields that changed, typed for the API.
   Any error → empty patch, so nothing half-valid is sent. */
export function formToPatch(form: DetailForm, card: CardView): { patch: Record<string, unknown>; errors: FormErrors } {
  const initial = formFromCard(card);
  const errors: FormErrors = {};
  const patch: Record<string, unknown> = {};

  for (const f of MONEY) {
    if (form[f].trim() === initial[f]) continue;
    const n = parseNumber(form[f]);
    if (n === undefined) errors[f] = 'Enter an amount like 1200.50';
    else patch[f] = n;
  }
  for (const f of DATES) {
    const v = form[f].trim();
    if (v === initial[f]) continue;
    if (v !== '' && !validDate(v)) errors[f] = 'Pick a valid date';
    else patch[f] = v === '' ? null : v;
  }

  const aprChanged = form.purchaseApr.trim() !== initial.purchaseApr || form.promoApr.trim() !== initial.promoApr;
  if (aprChanged) {
    const aprs: Pick<CardApr, 'type' | 'percentage'>[] = [];
    for (const [field, type] of [['purchaseApr', 'purchase'], ['promoApr', 'special']] as const) {
      const n = parseNumber(form[field]);
      if (n === undefined || (n !== null && n > 100)) errors[field] = 'Enter a rate between 0 and 100';
      else if (n !== null) aprs.push({ type, percentage: n });
    }
    for (const a of card.aprs) {
      if (a.type !== 'purchase' && a.type !== 'special') aprs.push({ type: a.type, percentage: a.percentage });
    }
    patch.aprs = aprs;
  }

  return Object.keys(errors).length > 0 ? { patch: {}, errors } : { patch, errors };
}
```

- [ ] **Step 7: Implement `profile.ts`**

```ts
import type { CardGoal, ScoreBand } from './types';

export const GOAL_LABELS: Record<CardGoal, string> = {
  pay_off_debt: 'Pay off debt',
  cashback: 'Earn cash back',
  travel: 'Earn travel points',
  build_credit: 'Build my credit',
};

export const SCORE_BANDS: { value: ScoreBand; label: string }[] = [
  { value: '<580', label: 'Under 580' },
  { value: '580-669', label: '580–669 (fair)' },
  { value: '670-739', label: '670–739 (good)' },
  { value: '740-799', label: '740–799 (very good)' },
  { value: '800+', label: '800+ (excellent)' },
];
```

- [ ] **Step 8: Run to see them pass**

Run: `npm run test:dashboard -- src/lib/cards` → PASS.

- [ ] **Step 9: Commit**

```bash
git add apps/web/src/lib/cards apps/web/vitest.config.ts
git commit -m "feat(cards): web helpers — utilization, card notices, detail form parsing"
```

---

### Task 7: `/cards` page

**Files:**
- Create: `apps/web/src/app/cards/page.tsx`, `apps/web/src/app/cards/components/TotalUtilization.tsx`, `CardTile.tsx`, `CardDetailDrawer.tsx`, `CardProfileForm.tsx`
- Modify: `apps/web/src/components/Sidebar.tsx`, `apps/web/src/app/settings/plaid-oauth-redirect/page.tsx`

**Interfaces:**
- Consumes: everything in Task 6; HTTP routes from Tasks 4–5.
- Produces: the `/cards` route; sessionStorage handoff mode `plaidLinkMode = 'liabilities'` (with `plaidReconnectItemId`) for the OAuth redirect page.

- [ ] **Step 1: `TotalUtilization.tsx`**

```tsx
'use client';

import { totalUtilization, utilizationLevel, LEVEL_COLOR } from '@/lib/cards/utilization';
import type { CardView } from '@/lib/cards/types';
import { fmt } from '@/app/debts/format';

export default function TotalUtilization({ cards }: { cards: CardView[] }) {
  const { balance, limit, ratio } = totalUtilization(cards);
  if (ratio === null) return null;
  const pct = Math.round(ratio * 100);
  const color = LEVEL_COLOR[utilizationLevel(ratio)];
  return (
    <section className="card-lift rounded-2xl p-5" style={{ background: 'var(--color-surface)', border: '1px solid var(--glass-border)', backdropFilter: 'var(--glass-blur)' }}>
      <div className="flex items-baseline justify-between gap-3 flex-wrap">
        <h2 className="text-sm font-semibold" style={{ color: 'var(--color-text-secondary)' }}>Total utilization</h2>
        <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>${fmt(balance)} of ${fmt(limit)}</p>
      </div>
      <p className="mt-1 text-3xl font-bold tabular-nums" style={{ color }}>{pct}%</p>
      <div className="relative mt-3 h-2.5 rounded-full overflow-hidden" style={{ background: 'var(--color-elevated)' }}
        role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.min(pct, 100)} aria-label="Total credit utilization">
        <div className="h-full rounded-full" style={{ width: `${Math.min(pct, 100)}%`, background: color }} />
        <div className="absolute top-0 bottom-0 w-0.5" style={{ left: '30%', background: 'var(--color-text-muted)' }} aria-hidden="true" />
      </div>
      <p className="mt-2 text-xs" style={{ color: 'var(--color-text-muted)' }}>Keeping it under 30% (the mark) helps your credit score.</p>
    </section>
  );
}
```

- [ ] **Step 2: `CardTile.tsx`**

```tsx
'use client';

import type { CardView } from '@/lib/cards/types';
import { utilization, utilizationLevel, LEVEL_COLOR, aprOf } from '@/lib/cards/utilization';
import { cardNotice } from '@/lib/cards/card-notice';
import { fmt, fmtDate } from '@/app/debts/format';

interface Props {
  card: CardView;
  onOpen: () => void;
  onEnable: () => void;
}

export default function CardTile({ card, onOpen, onEnable }: Props) {
  const ratio = utilization(card.balance, card.creditLimit);
  const color = ratio === null ? 'var(--color-text-muted)' : LEVEL_COLOR[utilizationLevel(ratio)];
  const purchase = aprOf(card, 'purchase');
  const promo = aprOf(card, 'special');
  const notice = cardNotice(card);

  return (
    <article className="card-lift rounded-2xl p-5 flex flex-col gap-3 min-w-0"
      style={{ background: 'var(--color-surface)', border: '1px solid var(--glass-border)', backdropFilter: 'var(--glass-blur)', boxShadow: 'var(--glass-shadow)' }}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-semibold truncate">{card.officialName ?? card.accountName}</h3>
          <p className="text-xs truncate" style={{ color: 'var(--color-text-muted)' }}>
            {card.bankName}{card.last4 ? ` ···· ${card.last4}` : ''}
          </p>
        </div>
        {card.isOverdue && (
          <span className="shrink-0 text-[11px] font-semibold px-2 py-0.5 rounded-full"
            style={{ color: 'var(--color-rose)', border: '1px solid var(--color-rose)' }}>Overdue</span>
        )}
      </div>

      <div>
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-xl font-bold tabular-nums">${fmt(card.balance)}</span>
          <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
            {card.creditLimit ? `of $${fmt(card.creditLimit)}` : 'limit unknown'}
          </span>
        </div>
        {ratio !== null && (
          <div className="mt-2 h-2 rounded-full overflow-hidden" style={{ background: 'var(--color-elevated)' }}
            role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.min(Math.round(ratio * 100), 100)} aria-label="Card utilization">
            <div className="h-full rounded-full" style={{ width: `${Math.min(ratio * 100, 100)}%`, background: color }} />
          </div>
        )}
      </div>

      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
        <div>
          <dt className="text-xs" style={{ color: 'var(--color-text-muted)' }}>Purchase APR</dt>
          <dd className="font-semibold tabular-nums">{purchase === null ? '—' : `${purchase}%`}</dd>
        </div>
        <div>
          <dt className="text-xs" style={{ color: 'var(--color-text-muted)' }}>Promo APR</dt>
          <dd className="font-semibold tabular-nums">
            {promo === null ? '—' : `${promo}%`}
            {promo !== null && card.promoAprEndsOn && <span className="block text-xs font-normal" style={{ color: 'var(--color-text-muted)' }}>until {fmtDate(card.promoAprEndsOn)}</span>}
          </dd>
        </div>
        <div>
          <dt className="text-xs" style={{ color: 'var(--color-text-muted)' }}>Next due</dt>
          <dd className="font-semibold">{card.nextPaymentDueDate ? fmtDate(card.nextPaymentDueDate) : '—'}</dd>
        </div>
        <div>
          <dt className="text-xs" style={{ color: 'var(--color-text-muted)' }}>Minimum</dt>
          <dd className="font-semibold tabular-nums">{card.minimumPayment === null ? '—' : `$${fmt(card.minimumPayment)}`}</dd>
        </div>
      </dl>

      {notice && (
        <div className="rounded-xl px-3 py-2 text-xs" style={{ background: 'var(--color-elevated)', color: 'var(--color-text-secondary)' }}>
          {notice.message}
          {notice.kind === 'enable' && (
            <button onClick={onEnable} className="btn-gold mt-2 block w-full px-3 py-2 rounded-lg text-xs font-semibold">Enable card details</button>
          )}
          {notice.kind === 'add_details' && (
            <button onClick={onOpen} className="mt-2 block font-semibold underline" style={{ color: 'var(--color-primary)' }}>Add details</button>
          )}
        </div>
      )}

      <button onClick={onOpen} className="mt-auto self-start text-sm font-semibold hover:underline" style={{ color: 'var(--color-primary)' }}>
        Edit details
      </button>
    </article>
  );
}
```

- [ ] **Step 3: `CardDetailDrawer.tsx`**

Right-hand panel on md+, full-width bottom sheet on phones.

```tsx
'use client';

import { useState } from 'react';
import { createPortal } from 'react-dom';
import type { CardView } from '@/lib/cards/types';
import { formFromCard, formToPatch, type DetailForm } from '@/lib/cards/detail-form';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3333/api';

const FIELDS: { key: keyof DetailForm; label: string; type: 'text' | 'date'; hint?: string }[] = [
  { key: 'creditLimit', label: 'Credit limit ($)', type: 'text' },
  { key: 'purchaseApr', label: 'Purchase APR (%)', type: 'text' },
  { key: 'promoApr', label: 'Promo APR (%)', type: 'text', hint: 'Intro or balance-transfer rate, if any' },
  { key: 'promoAprEndsOn', label: 'Promo APR ends', type: 'date' },
  { key: 'lastStatementBalance', label: 'Statement balance ($)', type: 'text' },
  { key: 'minimumPayment', label: 'Minimum payment ($)', type: 'text' },
  { key: 'nextPaymentDueDate', label: 'Next due date', type: 'date' },
  { key: 'rewardsBalance', label: 'Rewards balance', type: 'text', hint: 'Points, miles or cash back' },
];

interface Props { card: CardView; onClose: () => void; onSaved: (card: CardView) => void }

export default function CardDetailDrawer({ card, onClose, onSaved }: Props) {
  const [form, setForm] = useState<DetailForm>(() => formFromCard(card));
  const [errors, setErrors] = useState<Partial<Record<keyof DetailForm, string>>>({});
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState('');

  async function send(path: string, init: RequestInit) {
    setSaving(true); setFailed('');
    try {
      const res = await fetch(`${API}/cards/${card.accountId}${path}`, { credentials: 'include', ...init });
      if (!res.ok) throw new Error();
      onSaved(await res.json());
      onClose();
    } catch {
      setFailed('Could not save. Check the values and try again.');
    } finally {
      setSaving(false);
    }
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const { patch, errors: errs } = formToPatch(form, card);
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;
    if (Object.keys(patch).length === 0) { onClose(); return; }
    send('', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch) });
  }

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end md:items-stretch md:justify-end" style={{ background: 'rgba(0,0,0,0.5)' }} onClick={onClose}>
      <form onSubmit={submit} onClick={(e) => e.stopPropagation()}
        className="w-full md:max-w-md max-h-[90dvh] md:max-h-none overflow-y-auto rounded-t-2xl md:rounded-none p-5 flex flex-col gap-4"
        style={{ background: 'var(--popover-bg)', borderLeft: '1px solid var(--color-border)' }}
        aria-label={`Edit ${card.accountName}`}>
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-bold text-lg truncate">{card.officialName ?? card.accountName}</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="p-2 rounded-lg hover:bg-[var(--color-elevated)]">✕</button>
        </div>
        {card.provider === 'plaid' && (
          <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
            Values you type here stay until you choose “Use bank data”. A newer statement from your bank replaces the statement fields.
          </p>
        )}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {FIELDS.map(({ key, label, type, hint }) => (
            <label key={key} className="flex flex-col gap-1 text-sm">
              <span style={{ color: 'var(--color-text-secondary)' }}>
                {label}{card.manualFields.includes(key) ? ' · edited' : ''}
              </span>
              <input type={type} inputMode={type === 'text' ? 'decimal' : undefined} value={form[key]}
                onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                aria-invalid={!!errors[key]}
                className="px-3 py-2 rounded-lg text-sm"
                style={{ background: 'var(--color-elevated)', border: `1px solid ${errors[key] ? 'var(--color-rose)' : 'var(--color-border)'}` }} />
              {errors[key] ? <span className="text-xs" style={{ color: 'var(--color-rose)' }}>{errors[key]}</span>
                : hint ? <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>{hint}</span> : null}
            </label>
          ))}
        </div>
        {failed && <p className="text-sm" style={{ color: 'var(--color-rose)' }}>{failed}</p>}
        <div className="flex flex-wrap gap-2 mt-auto">
          <button type="submit" disabled={saving} className="btn-gold px-4 py-2.5 rounded-xl text-sm font-semibold">{saving ? 'Saving…' : 'Save'}</button>
          {card.provider === 'plaid' && card.hasBankData && card.manualFields.length > 0 && (
            <button type="button" disabled={saving} onClick={() => send('/use-bank-data', { method: 'POST' })}
              className="px-4 py-2.5 rounded-xl text-sm font-semibold" style={{ border: '1px solid var(--color-border)' }}>
              Use bank data
            </button>
          )}
        </div>
      </form>
    </div>,
    document.body,
  );
}
```

- [ ] **Step 4: `CardProfileForm.tsx`**

```tsx
'use client';

import { useEffect, useState } from 'react';
import type { CardGoal, CardProfileView, ScoreBand } from '@/lib/cards/types';
import { GOAL_LABELS, SCORE_BANDS } from '@/lib/cards/profile';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3333/api';

const EMPTY: CardProfileView = { goal: null, annualFeeOk: null, creditScoreBand: null, monthlyDebtBudget: null, plannedPurchaseAmount: null, plannedPurchaseNote: null };

function toAmount(s: string): number | null | undefined {
  const t = s.trim().replace(/[$,\s]/g, '');
  if (t === '') return null;
  return /^\d+(\.\d+)?$/.test(t) ? Number(t) : undefined;
}

export default function CardProfileForm() {
  const [profile, setProfile] = useState<CardProfileView>(EMPTY);
  const [budget, setBudget] = useState('');
  const [purchase, setPurchase] = useState('');
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [open, setOpen] = useState(true);

  useEffect(() => {
    fetch(`${API}/cards/profile`, { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : null))
      .then((p: CardProfileView | null) => {
        if (!p) return;
        setProfile(p);
        setBudget(p.monthlyDebtBudget === null ? '' : String(p.monthlyDebtBudget));
        setPurchase(p.plannedPurchaseAmount === null ? '' : String(p.plannedPurchaseAmount));
        setOpen(!p.goal || !p.creditScoreBand);
      })
      .catch(() => {});
  }, []);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const monthlyDebtBudget = toAmount(budget);
    const plannedPurchaseAmount = toAmount(purchase);
    if (monthlyDebtBudget === undefined || plannedPurchaseAmount === undefined) { setStatus('error'); return; }
    setStatus('saving');
    const res = await fetch(`${API}/cards/profile`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
      body: JSON.stringify({ ...profile, monthlyDebtBudget, plannedPurchaseAmount }),
    }).catch(() => null);
    if (!res?.ok) { setStatus('error'); return; }
    setProfile(await res.json());
    setStatus('saved');
  }

  const inputStyle = { background: 'var(--color-elevated)', border: '1px solid var(--color-border)' };

  return (
    <section className="rounded-2xl p-5" style={{ background: 'var(--color-surface)', border: '1px solid var(--glass-border)', backdropFilter: 'var(--glass-blur)' }}>
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className="w-full flex items-center justify-between gap-3 text-left">
        <span>
          <span className="block font-semibold">Your card goals</span>
          <span className="block text-xs" style={{ color: 'var(--color-text-muted)' }}>Ask Cofre uses these to advise you on cards</span>
        </span>
        <span aria-hidden="true">{open ? '−' : '+'}</span>
      </button>
      {open && (
        <form onSubmit={save} className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
          <label className="flex flex-col gap-1">
            <span style={{ color: 'var(--color-text-secondary)' }}>Main goal</span>
            <select value={profile.goal ?? ''} onChange={(e) => setProfile({ ...profile, goal: (e.target.value || null) as CardGoal | null })}
              className="px-3 py-2 rounded-lg" style={inputStyle}>
              <option value="">Choose…</option>
              {Object.entries(GOAL_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span style={{ color: 'var(--color-text-secondary)' }}>Approximate credit score</span>
            <select value={profile.creditScoreBand ?? ''} onChange={(e) => setProfile({ ...profile, creditScoreBand: (e.target.value || null) as ScoreBand | null })}
              className="px-3 py-2 rounded-lg" style={inputStyle}>
              <option value="">Choose…</option>
              {SCORE_BANDS.map((b) => <option key={b.value} value={b.value}>{b.label}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span style={{ color: 'var(--color-text-secondary)' }}>Annual fee OK?</span>
            <select value={profile.annualFeeOk === null ? '' : String(profile.annualFeeOk)}
              onChange={(e) => setProfile({ ...profile, annualFeeOk: e.target.value === '' ? null : e.target.value === 'true' })}
              className="px-3 py-2 rounded-lg" style={inputStyle}>
              <option value="">Not sure</option>
              <option value="true">Yes, if the rewards are worth it</option>
              <option value="false">No annual fee</option>
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span style={{ color: 'var(--color-text-secondary)' }}>Monthly amount for card payments ($)</span>
            <input value={budget} onChange={(e) => setBudget(e.target.value)} inputMode="decimal" className="px-3 py-2 rounded-lg" style={inputStyle} />
          </label>
          <label className="flex flex-col gap-1">
            <span style={{ color: 'var(--color-text-secondary)' }}>Planned big purchase ($)</span>
            <input value={purchase} onChange={(e) => setPurchase(e.target.value)} inputMode="decimal" className="px-3 py-2 rounded-lg" style={inputStyle} />
          </label>
          <label className="flex flex-col gap-1">
            <span style={{ color: 'var(--color-text-secondary)' }}>What is it?</span>
            <input value={profile.plannedPurchaseNote ?? ''} maxLength={120}
              onChange={(e) => setProfile({ ...profile, plannedPurchaseNote: e.target.value })} className="px-3 py-2 rounded-lg" style={inputStyle} />
          </label>
          <div className="md:col-span-2 flex items-center gap-3">
            <button type="submit" disabled={status === 'saving'} className="btn-gold px-4 py-2.5 rounded-xl font-semibold">
              {status === 'saving' ? 'Saving…' : 'Save goals'}
            </button>
            {status === 'saved' && <span style={{ color: 'var(--color-green)' }}>Saved</span>}
            {status === 'error' && <span style={{ color: 'var(--color-rose)' }}>Amounts must be numbers like 450 or 1200.50</span>}
          </div>
        </form>
      )}
    </section>
  );
}
```

- [ ] **Step 5: `page.tsx`**

```tsx
'use client';

import { useCallback, useEffect, useState } from 'react';
import { usePlaidLink } from 'react-plaid-link';
import Sidebar from '@/components/Sidebar';
import TotalUtilization from './components/TotalUtilization';
import CardTile from './components/CardTile';
import CardDetailDrawer from './components/CardDetailDrawer';
import CardProfileForm from './components/CardProfileForm';
import type { CardView } from '@/lib/cards/types';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3333/api';

export default function CardsPage() {
  const [cards, setCards] = useState<CardView[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<CardView | null>(null);
  const [linkToken, setLinkToken] = useState<string | null>(null);
  const [consentItemId, setConsentItemId] = useState<string | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    fetch(`${API}/cards`, { credentials: 'include' })
      .then((r) => r.json()).then((d) => setCards(Array.isArray(d) ? d : []))
      .catch(() => setError('Could not load your cards.'))
      .finally(() => setLoading(false));
  }, []);
  useEffect(() => { load(); }, [load]);

  const clearHandoff = () => {
    setLinkToken(null); setConsentItemId(null);
    sessionStorage.removeItem('plaidLinkToken');
    sessionStorage.removeItem('plaidLinkMode');
    sessionStorage.removeItem('plaidReconnectItemId');
  };

  async function enable(card: CardView) {
    if (!card.plaidItemId) return;
    setError('');
    const res = await fetch(`${API}/plaid/liabilities-token/${card.plaidItemId}`, { method: 'POST', credentials: 'include' }).catch(() => null);
    if (!res?.ok) { setError('Could not open your bank. Try again in a moment.'); return; }
    const { link_token } = await res.json();
    // Survives the OAuth round trip; see settings/plaid-oauth-redirect.
    sessionStorage.setItem('plaidLinkToken', link_token);
    sessionStorage.setItem('plaidLinkMode', 'liabilities');
    sessionStorage.setItem('plaidReconnectItemId', card.plaidItemId);
    setConsentItemId(card.plaidItemId);
    setLinkToken(link_token);
  }

  const onSuccess = useCallback(async () => {
    if (consentItemId) {
      await fetch(`${API}/plaid/liabilities/${consentItemId}/complete`, { method: 'POST', credentials: 'include' }).catch(() => null);
    }
    clearHandoff();
    load();
  }, [consentItemId, load]);

  const { open, ready } = usePlaidLink({ token: linkToken ?? '', onSuccess, onExit: clearHandoff });
  useEffect(() => { if (linkToken && ready) open(); }, [linkToken, ready, open]);

  return (
    <div className="flex h-dvh overflow-hidden">
      <Sidebar />
      <main className="flex-1 overflow-y-auto pt-14 md:pt-0">
        <div className="p-4 sm:p-6 flex flex-col gap-5">
          <div>
            <h1 className="font-bold tracking-tight" style={{ fontSize: 'clamp(24px, 3vw, 34px)' }}>Credit Cards</h1>
            <p className="mt-1 text-sm" style={{ color: 'var(--color-text-secondary)' }}>APRs, limits and due dates for every card you have</p>
          </div>

          {error && <p className="text-sm" style={{ color: 'var(--color-rose)' }} role="alert">{error}</p>}

          {!loading && cards.length > 0 && <TotalUtilization cards={cards} />}

          {loading ? (
            <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>Loading cards…</p>
          ) : cards.length === 0 ? (
            <div className="rounded-2xl p-6 text-sm" style={{ background: 'var(--color-surface)', border: '1px solid var(--glass-border)' }}>
              No credit cards yet. Connect your card’s bank or add a credit card account in{' '}
              <a href="/settings" className="font-semibold underline" style={{ color: 'var(--color-primary)' }}>Settings</a>.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {cards.map((c) => (
                <CardTile key={c.accountId} card={c} onOpen={() => setEditing(c)} onEnable={() => enable(c)} />
              ))}
            </div>
          )}

          <CardProfileForm />
        </div>

        {editing && (
          <CardDetailDrawer card={editing} onClose={() => setEditing(null)}
            onSaved={(updated) => setCards((prev) => prev.map((c) => (c.accountId === updated.accountId ? updated : c)))} />
        )}
      </main>
    </div>
  );
}
```

- [ ] **Step 6: OAuth redirect handles `liabilities` mode**

In `apps/web/src/app/settings/plaid-oauth-redirect/page.tsx`, inside `onSuccess`, add a branch before `if (mode === 'reconnect')`, and return to `/cards`:

```ts
      if (mode === 'liabilities') {
        const itemId = sessionStorage.getItem('plaidReconnectItemId');
        if (itemId) await fetch(`${API}/plaid/liabilities/${itemId}/complete`, { method: 'POST', credentials: 'include' });
        clearHandoffState();
        router.replace('/cards');
        return;
      }
```

and change `onExit` so a liabilities-mode exit returns to `/cards`:

```ts
    onExit: () => {
      const back = sessionStorage.getItem('plaidLinkMode') === 'liabilities' ? '/cards' : '/settings';
      clearHandoffState();
      router.replace(back);
    },
```

- [ ] **Step 7: Sidebar nav entry**

In `apps/web/src/components/Sidebar.tsx` add after the Debts entry in `NAV`:

```ts
  { label: 'Cards',        href: '/cards',        icon: CardsIcon },
```

and add the icon next to `DebtsIcon`:

```tsx
function CardsIcon() {
  return (
    <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/><path d="M6 15h4"/>
    </svg>
  );
}
```

- [ ] **Step 8: Build and check in the browser**

Run: `npm run build:web` → succeeds with no type errors.
Run `npm run dev:api` and `npm run dev:web`; log in; open http://localhost:3000/cards. Check:
- A sandbox-linked card shows balance, limit, utilization bar, purchase APR, due date and minimum.
- "Edit details" → type `$6,000` in Credit limit → Save → tile shows $6,000.00; the field label says "· edited"; "Use bank data" restores the bank value.
- Type `abc` in Purchase APR → inline error, nothing sent (Network tab shows no PATCH).
- Card goals form saves and survives a reload.
- At 375px wide (devtools device mode): one column, drawer opens as a bottom sheet, no horizontal scroll.
- Sidebar shows "Cards" and highlights it on `/cards`.

- [ ] **Step 9: Commit**

```bash
git add apps/web/src/app/cards apps/web/src/components/Sidebar.tsx apps/web/src/app/settings/plaid-oauth-redirect/page.tsx
git commit -m "feat(cards): /cards page — utilization, card details, manual edits, card goals"
```

---

### Task 8: Docs and final verification

**Files:**
- Modify: `CLAUDE.md`, `docs/superpowers/specs/2026-10-15-credit-card-expert-design.md`

- [ ] **Step 1: CLAUDE.md**

In the API modules table add a row after `auth/`:

```markdown
| `cards/` | Credit card data. `credit_card_details` (one per credit account, created lazily) holds Plaid Liabilities data or hand-entered values; `manualFields` + `detail-merge.ts` decide which wins. `card_profiles` holds the user's card goals. `/api/cards` is open to every plan. |
```

Under the `PLAID_ENV` line in Environment add:

```
                            # Liabilities must be enabled for the Plaid client (dashboard → Products)
                            # or new links skip it and existing banks show "Enable card details"
```

- [ ] **Step 2: Bring the spec in line with what was built**

In the spec's "1. Card data" section:
- Replace the `POST /api/plaid/link-token/liabilities` sentence with: "`POST /api/plaid/liabilities-token/:itemId` returns an update-mode token with `additional_consented_products: [liabilities]`; `POST /api/plaid/liabilities/:itemId/complete` runs the sync after Link succeeds."
- Replace "It runs after transaction sync, on the `DEFAULT_UPDATE` webhook, and right after an update-mode relink." with: "It runs after the initial sync in `confirmExchange`, after a manual sync, after a reconnect or consent, and on the `LIABILITIES/DEFAULT_UPDATE` webhook."
- Replace the backfill sentence ("Manual accounts of type `credit` get a detail row … backfill in the migration") with: "Detail rows are created lazily the first time a credit account is listed or synced (no backfill)."
- Add to the `credit_card_details` table: `manualEditedAt` timestamp, and `plaidData` (last Plaid report, used by "Use bank data"). Note that `aprs`/`plaidData` are `simple-json` and `manualFields` is `simple-array`.
- In the manual-override paragraph add: "A null from Plaid never erases a stored value."
- Replace "Nav entry \"Cards\" next to Accounts." with "Nav entry \"Cards\" after Debts (accounts live in Settings, there is no Accounts nav item)."

- [ ] **Step 3: Full verification**

Run each and confirm:
- `npm run test:api` → all PASS (migrations test runs if local Postgres is up)
- `npm run test:dashboard` → all PASS
- `npm run migration:check` → exits 0
- `npm run build:api` → succeeds
- `npm run build:web` → succeeds

- [ ] **Step 4: Commit (no push)**

```bash
git add CLAUDE.md docs/superpowers/specs/2026-10-15-credit-card-expert-design.md
git commit -m "docs(cards): document the cards module and Liabilities setup"
```

Before the first deploy that includes this work, Liabilities has to be enabled for the production Plaid client in the Plaid dashboard (Products → Liabilities). The owner does that; no code change needed.
