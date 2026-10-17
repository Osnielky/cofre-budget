# Goals Page Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild `/goals` to the "Your road to $1,000,000" mock, with a net-worth-over-time chart backed by daily snapshots plus a labelled estimate for earlier months.

**Architecture:** The API gains a `net_worth_snapshots` table. `GET /net-worth-goal` upserts today's snapshot as a side effect, and a new `GET /net-worth-goal/history` returns real snapshots plus estimated month-end points computed by a pure, tested `buildHistory()`. The web side adds a pure, tested `lib/goals/history.ts` (range filtering, summary, milestone crossings), a chart component, and recomposes the page from restyled existing components.

**Tech Stack:** NestJS 11 + TypeORM (Postgres; sqlite in tests), Next.js 16 / React 19 / Tailwind v4, recharts, Vitest.

**Spec:** `docs/superpowers/specs/2026-10-02-goals-page-redesign-design.md`

## Global Constraints

- Entities and migrations are listed explicitly: add the entity to `apps/api/src/config/entities.ts` and the migration class to `apps/api/src/migrations/index.ts`; `npm run migration:check` must exit 0.
- Snapshot capture failure must not fail the goal request (log and continue).
- The cash-flow rule for estimates: exclude transactions with a `debtId`, a category of type `'transfer'`, or on a tracking account (`isTrackingType`).
- Estimated points are monthly (dated the last day of the month), flagged `estimated: true`, never stored, and always earlier than the first real point.
- Components use theme CSS variables; recharts colours come from `useThemeColors()`. The chart series is green (`colors.green`), never `--color-primary`.
- Copy: header "Your road to $1,000,000" / "See how far you've come. Keep building what's next."; legend "Estimated from your transactions"; empty chart "Your history starts today"; negative net worth level text "Level 0 · Getting started".
- Ranges: 1M · 3M · 6M · YTD · 1Y · All time (default All time). "Change since start" % is hidden when the starting value ≤ 0.
- Removed from the page: Momentum card, Next-moves checklist, Asset mix card. "Update assets" → `/settings?tab=banks`.
- Responsive at 360px, 768px, 1280px; no horizontal page scroll (the ladder may scroll inside its own container).
- Web Vitest uses an explicit `include` list (`apps/web/vitest.config.ts`); new test globs must be added.
- Commit locally after each task; do not push.

## Review Focus

- **A user whose only data is today** (new account, no transactions): history must be exactly one real point and the chart must show the empty state, not crash on a one-point series. Pinned in Task 1 and Task 3.
- **Net worth dipping back below a level** after crossing it: the "$25K reached" marker must appear once, at the first crossing. Pinned in Task 3.
- **Two requests saving today's snapshot at once** (goal + history load in parallel): must not throw a unique-constraint error. Pinned in Task 2 (two concurrent `get()` calls).
- **Another user's snapshots** must never appear in a history response. Pinned in Task 2.
- **YTD in January / ranges with no points inside them**: must still show the latest point rather than an empty chart. Pinned in Task 3.

---

## File structure

| File | Responsibility |
|---|---|
| `apps/api/src/net-worth-goal/net-worth-history.math.ts` (new) | `isCashFlowTx`, `buildHistory` — pure |
| `apps/api/src/net-worth-goal/net-worth-history.math.test.ts` (new) | tests |
| `apps/api/src/net-worth-goal/net-worth-snapshot.entity.ts` (new) | entity |
| `apps/api/src/migrations/<ts>-NetWorthSnapshots.ts` (generated) | migration |
| `apps/api/src/net-worth-goal/net-worth-goal.service.ts` | snapshot upsert in `get()`, new `history()` |
| `apps/api/src/net-worth-goal/net-worth-goal.controller.ts` | `GET history` |
| `apps/api/src/net-worth-goal/net-worth-goal.module.ts` | register repositories |
| `apps/api/src/net-worth-goal/net-worth-goal.history.test.ts` (new) | service tests (sqlite) |
| `apps/web/src/lib/goals/history.ts` (new) + `history.test.ts` | ranges, summary, crossings, labels — pure |
| `apps/web/src/hooks/useNetWorthHistory.ts` (new) | fetch history |
| `apps/web/src/app/goals/components/NetWorthHistoryChart.tsx` (new) | chart card |
| `apps/web/src/app/goals/components/NextStepCard.tsx` (new) | next-step card + planner |
| `apps/web/src/app/goals/components/JourneyStats.tsx`, `WealthJourney.tsx` | restyle |
| `apps/web/src/app/goals/page.tsx` | compose |
| `apps/web/src/app/goals/components/{MomentumCard,NextMove,AssetMixCard}.tsx` | delete |

Paths below are relative to the repo root.

---

### Task 1: History math (API, pure)

**Files:**
- Create: `apps/api/src/net-worth-goal/net-worth-history.math.ts`
- Create: `apps/api/src/net-worth-goal/net-worth-history.math.test.ts`

**Interfaces:**
- Produces: `HistoryPoint { date: string; value: number; estimated: boolean }`, `SnapshotValue { date: string; value: number }`, `CashFlowTx { date: string; amount: number }`, `TxForHistory { date: string; amount: number | string; debtId: string | null; categoryType: string | null; accountType: string | null }`, `isCashFlowTx(t: TxForHistory): boolean`, `buildHistory(input: { snapshots: SnapshotValue[]; today: string; todayValue: number; txs: CashFlowTx[] }): { points: HistoryPoint[]; firstRealDate: string }`.

- [ ] **Step 1: Write the failing tests**

`apps/api/src/net-worth-goal/net-worth-history.math.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { buildHistory, isCashFlowTx } from './net-worth-history.math';

const TODAY = '2026-10-02';

describe('buildHistory', () => {
  it('returns only today when there are no snapshots or transactions', () => {
    const out = buildHistory({ snapshots: [], today: TODAY, todayValue: 1234.5, txs: [] });
    expect(out.points).toEqual([{ date: TODAY, value: 1234.5, estimated: false }]);
    expect(out.firstRealDate).toBe(TODAY);
  });

  it('estimates month-end values back to the earliest transaction month, carrying empty months flat', () => {
    const out = buildHistory({
      snapshots: [], today: TODAY, todayValue: 1000,
      txs: [
        { date: '2026-10-01', amount: 100 },  // this month, before today
        { date: '2026-09-15', amount: 200 },
        { date: '2026-07-10', amount: -50 },
      ],
    });
    expect(out.points).toEqual([
      { date: '2026-07-31', value: 700, estimated: true },
      { date: '2026-08-31', value: 700, estimated: true },  // August had no transactions
      { date: '2026-09-30', value: 900, estimated: true },
      { date: TODAY, value: 1000, estimated: false },
    ]);
  });

  it('anchors estimates on the first real snapshot and ignores later transactions', () => {
    const out = buildHistory({
      snapshots: [{ date: '2026-09-01', value: 500 }], today: TODAY, todayValue: 1000,
      txs: [
        { date: '2026-09-20', amount: 9999 },  // after the first snapshot: real data covers it
        { date: '2026-08-10', amount: 100 },
      ],
    });
    expect(out.points).toEqual([
      { date: '2026-08-31', value: 500, estimated: true },
      { date: '2026-09-01', value: 500, estimated: false },
      { date: TODAY, value: 1000, estimated: false },
    ]);
    expect(out.firstRealDate).toBe('2026-09-01');
  });

  it('never produces an estimated point on or after the first real date', () => {
    const out = buildHistory({
      snapshots: [{ date: '2026-09-30', value: 10 }], today: TODAY, todayValue: 20,
      txs: [{ date: '2026-09-02', amount: 5 }, { date: '2026-06-02', amount: 5 }],
    });
    const firstReal = out.points.find((p) => !p.estimated)!;
    for (const p of out.points.filter((x) => x.estimated)) expect(p.date < firstReal.date).toBe(true);
    expect(out.points.filter((p) => p.date.startsWith('2026-09') && p.estimated)).toHaveLength(0);
  });

  it('keeps negative net worth negative', () => {
    const out = buildHistory({
      snapshots: [], today: TODAY, todayValue: -200,
      txs: [{ date: '2026-09-05', amount: -300 }],
    });
    expect(out.points[0]).toEqual({ date: '2026-09-30', value: -200, estimated: true });
  });

  it("replaces today's stored snapshot with the live value", () => {
    const out = buildHistory({ snapshots: [{ date: TODAY, value: 10 }], today: TODAY, todayValue: 20, txs: [] });
    expect(out.points).toEqual([{ date: TODAY, value: 20, estimated: false }]);
  });

  it('crosses a year boundary', () => {
    const out = buildHistory({
      snapshots: [], today: '2026-01-15', todayValue: 100,
      txs: [{ date: '2025-11-03', amount: 10 }],
    });
    expect(out.points.map((p) => p.date)).toEqual(['2025-11-30', '2025-12-31', '2026-01-15']);
  });
});

describe('isCashFlowTx', () => {
  const base = { date: '2026-09-01', amount: -10, debtId: null, categoryType: 'expense', accountType: 'checking' };
  it('counts an ordinary transaction', () => expect(isCashFlowTx(base)).toBe(true));
  it('ignores transfers', () => expect(isCashFlowTx({ ...base, categoryType: 'transfer' })).toBe(false));
  it('ignores debt payments', () => expect(isCashFlowTx({ ...base, debtId: 'd1' })).toBe(false));
  it('ignores tracking accounts', () => expect(isCashFlowTx({ ...base, accountType: 'investment' })).toBe(false));
  it('counts transactions with no category or account', () =>
    expect(isCashFlowTx({ ...base, categoryType: null, accountType: null })).toBe(true));
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm run test:api -- net-worth-history`
Expected: FAIL — cannot resolve `./net-worth-history.math`.

- [ ] **Step 3: Implement**

`apps/api/src/net-worth-goal/net-worth-history.math.ts`:
```ts
import { isTrackingType } from '../bank-accounts/account-types';

export interface HistoryPoint { date: string; value: number; estimated: boolean }
export interface SnapshotValue { date: string; value: number }
export interface CashFlowTx { date: string; amount: number }
export interface TxForHistory {
  date: string;
  amount: number | string;
  debtId: string | null;
  categoryType: string | null;
  accountType: string | null;
}

/** Same rule as the web's inCashFlow(): transfers, debt payments and
 *  tracking-account activity move money around without changing net worth. */
export function isCashFlowTx(t: TxForHistory): boolean {
  if (t.debtId) return false;
  if (t.categoryType === 'transfer') return false;
  if (t.accountType && isTrackingType(t.accountType)) return false;
  return true;
}

const r2 = (n: number) => Math.round(n * 100) / 100;

function prevMonth(ym: string): string {
  const [y, m] = ym.split('-').map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`;
}

/** Last day of the month `ym` ('YYYY-MM') as YYYY-MM-DD. */
function monthEnd(ym: string): string {
  const [y, m] = ym.split('-').map(Number);
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
}

/**
 * Real snapshots (with today's live value last) plus estimated month-end points
 * for every month from the earliest transaction up to the month before the
 * first real point. Estimates walk backward from the first real value,
 * subtracting each month's net cash flow.
 */
export function buildHistory(input: {
  snapshots: SnapshotValue[];
  today: string;
  todayValue: number;
  txs: CashFlowTx[];
}): { points: HistoryPoint[]; firstRealDate: string } {
  const real = new Map<string, number>();
  for (const s of input.snapshots) if (s.date <= input.today) real.set(s.date, r2(s.value));
  real.set(input.today, r2(input.todayValue));
  const realPoints: HistoryPoint[] = [...real.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([date, value]) => ({ date, value, estimated: false }));

  const first = realPoints[0];
  const anchorMonth = first.date.slice(0, 7);

  // Net of the anchor month up to the first real date, and net per earlier month.
  let anchorNet = 0;
  const netByMonth = new Map<string, number>();
  let earliest: string | null = null;
  for (const t of input.txs) {
    if (t.date > first.date) continue;
    const ym = t.date.slice(0, 7);
    if (ym === anchorMonth) { anchorNet += t.amount; continue; }
    netByMonth.set(ym, (netByMonth.get(ym) ?? 0) + t.amount);
    if (!earliest || ym < earliest) earliest = ym;
  }

  const estimated: HistoryPoint[] = [];
  if (earliest) {
    let ym = prevMonth(anchorMonth);
    let value = first.value - anchorNet;
    while (ym >= earliest) {
      estimated.unshift({ date: monthEnd(ym), value: r2(value), estimated: true });
      value -= netByMonth.get(ym) ?? 0;
      ym = prevMonth(ym);
    }
  }

  return { points: [...estimated, ...realPoints], firstRealDate: first.date };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm run test:api -- net-worth-history`
Expected: all 12 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/net-worth-goal/net-worth-history.math.ts apps/api/src/net-worth-goal/net-worth-history.math.test.ts
git commit -m "feat(api): net-worth history math with month-end estimates"
```

---

### Task 2: Snapshots table, capture, and the history endpoint (API)

**Files:**
- Create: `apps/api/src/net-worth-goal/net-worth-snapshot.entity.ts`
- Modify: `apps/api/src/config/entities.ts`
- Create (generated): `apps/api/src/migrations/<timestamp>-NetWorthSnapshots.ts`
- Modify: `apps/api/src/migrations/index.ts`
- Modify: `apps/api/src/net-worth-goal/net-worth-goal.service.ts`
- Modify: `apps/api/src/net-worth-goal/net-worth-goal.controller.ts`
- Modify: `apps/api/src/net-worth-goal/net-worth-goal.module.ts`
- Create: `apps/api/src/net-worth-goal/net-worth-goal.history.test.ts`

**Interfaces:**
- Consumes: `buildHistory`, `isCashFlowTx`, `HistoryPoint` from Task 1.
- Produces: `GET /api/net-worth-goal/history` → `{ points: HistoryPoint[]; firstRealDate: string }`. Service constructor order: `(users, snapshots, transactions, bankAccounts, debts)`.

- [ ] **Step 1: Entity**

`apps/api/src/net-worth-goal/net-worth-snapshot.entity.ts`:
```ts
import { Entity, PrimaryGeneratedColumn, Column, UpdateDateColumn, Index } from 'typeorm';

/** Net worth on one day for one user. Written when the user's goal is loaded;
 *  the last write of the day wins. */
@Entity('net_worth_snapshots')
@Index(['userId', 'date'], { unique: true })
export class NetWorthSnapshot {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column()
  userId: string;

  @Column({ type: 'date' })
  date: string;

  @Column({ type: 'decimal', precision: 14, scale: 2 })
  value: string;

  @UpdateDateColumn()
  updatedAt: Date;
}
```
In `apps/api/src/config/entities.ts` add `import { NetWorthSnapshot } from '../net-worth-goal/net-worth-snapshot.entity';` and append `NetWorthSnapshot` to the end of the `ENTITIES` array.

- [ ] **Step 2: Generate and register the migration**

Local Postgres must be running with the existing migrations applied (start the API once with `npm run dev:api`, or the baseline is already applied on your dev DB). Then from the repo root:
```bash
npm run migration:generate -- NetWorthSnapshots
```
Open the generated `apps/api/src/migrations/<timestamp>-NetWorthSnapshots.ts`; it must only create `net_worth_snapshots` with its two indexes (if it touches other tables, your local DB had drift — stop and report). Add it to `apps/api/src/migrations/index.ts`:
```ts
import { Baseline1790610365591 } from './1790610365591-Baseline';
import { NetWorthSnapshots<timestamp> } from './<timestamp>-NetWorthSnapshots';

export const MIGRATIONS = [Baseline1790610365591, NetWorthSnapshots<timestamp>];
```
(Use the actual class name and file name the generator produced.) Apply it locally by starting the API once (`migrationsRun` applies pending migrations on boot), stop it, then run `npm run migration:check` — expected: exit 0, "No changes in database schema were found".

- [ ] **Step 3: Write the failing service tests**

`apps/api/src/net-worth-goal/net-worth-goal.history.test.ts`:
```ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { DataSource } from 'typeorm';
import { User } from '../users/user.entity';
import { Transaction } from '../transactions/transaction.entity';
import { Category } from '../categories/category.entity';
import { BankAccount } from '../bank-accounts/bank-account.entity';
import { Project } from '../projects/project.entity';
import { ProjectCategory } from '../projects/project-category.entity';
import { CategorizationRule } from '../categorization-rules/categorization-rule.entity';
import { NetWorthSnapshot } from './net-worth-snapshot.entity';
import { NetWorthGoalService } from './net-worth-goal.service';
import { toDateOnly } from './net-worth-goal.math';

let ds: DataSource;
let userA: User;
let userB: User;

async function makeDataSource() {
  const d = new DataSource({
    type: 'better-sqlite3', database: ':memory:', dropSchema: true,
    entities: [User, Transaction, Category, BankAccount, Project, ProjectCategory, CategorizationRule, NetWorthSnapshot],
    synchronize: true,
  });
  await d.initialize();
  return d;
}

/** Net worth = the stubbed account balance; debts stubbed empty. */
function makeService(balance: number) {
  const bankAccounts = { findAllByUser: vi.fn().mockResolvedValue([{ accountType: 'checking', balance: String(balance) }]) };
  const debts = { findAll: vi.fn().mockResolvedValue([]) };
  return new NetWorthGoalService(
    ds.getRepository(User),
    ds.getRepository(NetWorthSnapshot),
    ds.getRepository(Transaction),
    bankAccounts as any,
    debts as any,
  );
}

beforeEach(async () => {
  ds = await makeDataSource();
  const users = ds.getRepository(User);
  // If User has more required columns, add them here (see users/user.entity.ts).
  userA = await users.save(users.create({ email: 'a@example.com', name: 'A' }));
  userB = await users.save(users.create({ email: 'b@example.com', name: 'B' }));
});

describe('NetWorthGoalService snapshots', () => {
  it('records today when the goal is loaded, last write of the day wins', async () => {
    await makeService(100).get(userA.id);
    await makeService(250).get(userA.id);
    const rows = await ds.getRepository(NetWorthSnapshot).findBy({ userId: userA.id });
    expect(rows).toHaveLength(1);
    expect(rows[0].date).toBe(toDateOnly(new Date()));
    expect(Number(rows[0].value)).toBe(250);
  });

  it('survives two loads at the same moment', async () => {
    const svc = makeService(100);
    await Promise.all([svc.get(userA.id), svc.get(userA.id)]);
    expect(await ds.getRepository(NetWorthSnapshot).countBy({ userId: userA.id })).toBe(1);
  });

  it('still returns the goal when saving the snapshot fails', async () => {
    const svc = makeService(100);
    vi.spyOn(ds.getRepository(NetWorthSnapshot), 'upsert').mockRejectedValueOnce(new Error('db down'));
    await expect(svc.get(userA.id)).resolves.toMatchObject({ current: 100 });
  });

  it("returns only the caller's snapshots in history", async () => {
    const snaps = ds.getRepository(NetWorthSnapshot);
    await snaps.save(snaps.create({ userId: userB.id, date: '2026-01-01', value: '999999.00' }));
    await snaps.save(snaps.create({ userId: userA.id, date: '2026-01-01', value: '10.00' }));
    const out = await makeService(100).history(userA.id);
    expect(out.points.some((p) => p.value === 999999)).toBe(false);
    expect(out.points[0]).toEqual({ date: '2026-01-01', value: 10, estimated: false });
  });

  it('estimates from cash flow only, ignoring transfers', async () => {
    const cats = ds.getRepository(Category);
    const transfer = await cats.save(cats.create({ userId: userA.id, name: 'Transfer', icon: '🔁', color: '#999', type: 'transfer' }));
    const txs = ds.getRepository(Transaction);
    const base = { userId: userA.id, name: 'x', source: 'manual', pending: false, isSplitParent: false };
    await txs.save(txs.create({ ...base, amount: 1, date: '2020-01-10' }));       // earliest month
    await txs.save(txs.create({ ...base, amount: 40, date: '2020-03-10' }));      // cash flow
    await txs.save(txs.create({ ...base, amount: 5000, date: '2020-03-11', categoryRef: transfer })); // ignored
    const out = await makeService(100).history(userA.id);
    // End of Feb = end of Mar (100, no later activity) minus March's cash flow (+40 only).
    const feb = out.points.find((p) => p.date === '2020-02-29');
    expect(feb).toEqual({ date: '2020-02-29', value: 60, estimated: true });
  });
});
```

- [ ] **Step 4: Run to verify it fails**

Run: `npm run test:api -- net-worth-goal.history`
Expected: FAIL — `NetWorthGoalService` has no `history` / wrong constructor.

- [ ] **Step 5: Implement service, controller, module**

`apps/api/src/net-worth-goal/net-worth-goal.service.ts` — update imports and constructor, add `recordSnapshot` and `history`, and call `recordSnapshot` from `get()`:
```ts
import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../users/user.entity';
import { Transaction } from '../transactions/transaction.entity';
import { BankAccountsService } from '../bank-accounts/bank-accounts.service';
import { isLiabilityType } from '../bank-accounts/account-types';
import { DebtsService } from '../debts/debts.service';
import { NET_WORTH_TARGET, computeGoalProgress, toDateOnly } from './net-worth-goal.math';
import { NetWorthSnapshot } from './net-worth-snapshot.entity';
import { buildHistory, isCashFlowTx } from './net-worth-history.math';
```
```ts
@Injectable()
export class NetWorthGoalService {
  private readonly logger = new Logger(NetWorthGoalService.name);

  constructor(
    @InjectRepository(User) private users: Repository<User>,
    @InjectRepository(NetWorthSnapshot) private snapshots: Repository<NetWorthSnapshot>,
    @InjectRepository(Transaction) private transactions: Repository<Transaction>,
    private bankAccounts: BankAccountsService,
    private debts: DebtsService,
  ) {}
```
Add, below `currentNetWorth`:
```ts
  /** Upserts today's snapshot. Never throws: the goal must load even if this write fails. */
  private async recordSnapshot(userId: string, value: number): Promise<void> {
    try {
      await this.snapshots.upsert(
        { userId, date: toDateOnly(new Date()), value: value.toFixed(2) },
        ['userId', 'date'],
      );
    } catch (err) {
      this.logger.warn(`Could not record net worth snapshot: ${(err as Error).message}`);
    }
  }

  async history(userId: string) {
    const current = await this.currentNetWorth(userId);
    await this.recordSnapshot(userId, current);
    const [snaps, txs] = await Promise.all([
      this.snapshots.find({ where: { userId }, order: { date: 'ASC' } }),
      this.transactions.find({
        where: { userId },
        relations: { categoryRef: true, bankAccount: true },
        select: {
          id: true, date: true, amount: true, debtId: true,
          categoryRef: { id: true, type: true },
          bankAccount: { id: true, accountType: true },
        },
      }),
    ]);
    return buildHistory({
      snapshots: snaps.map((s) => ({ date: s.date, value: Number(s.value) })),
      today: toDateOnly(new Date()),
      todayValue: current,
      txs: txs
        .filter((t) => isCashFlowTx({
          date: t.date, amount: t.amount, debtId: t.debtId,
          categoryType: t.categoryRef?.type ?? null, accountType: t.bankAccount?.accountType ?? null,
        }))
        .map((t) => ({ date: t.date, amount: Number(t.amount) })),
    });
  }
```
In `get(userId)`, right after `const current = await this.currentNetWorth(userId);` add:
```ts
    await this.recordSnapshot(userId, current);
```

`apps/api/src/net-worth-goal/net-worth-goal.controller.ts` — add below `get`:
```ts
  @Get('history')
  history(@Request() req: any) {
    return this.service.history(req.user.id);
  }
```

`apps/api/src/net-worth-goal/net-worth-goal.module.ts`:
```ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../users/user.entity';
import { Transaction } from '../transactions/transaction.entity';
import { BankAccountsModule } from '../bank-accounts/bank-accounts.module';
import { DebtsModule } from '../debts/debts.module';
import { NetWorthGoalService } from './net-worth-goal.service';
import { NetWorthGoalController } from './net-worth-goal.controller';
import { NetWorthSnapshot } from './net-worth-snapshot.entity';

@Module({
  imports: [TypeOrmModule.forFeature([User, NetWorthSnapshot, Transaction]), BankAccountsModule, DebtsModule],
  providers: [NetWorthGoalService],
  controllers: [NetWorthGoalController],
  exports: [NetWorthGoalService],
})
export class NetWorthGoalModule {}
```

- [ ] **Step 6: Run tests**

Run: `npm run test:api`
Expected: all suites PASS, including the 5 new service tests and `migrations/migrations.test.ts` (needs local Postgres; it skips itself if unreachable — say which in your report).

- [ ] **Step 7: Smoke-test the endpoint**

Start the API (`npm run dev:api`). With a valid local session cookie (`access_token`), `curl -s -b "access_token=<token>" http://localhost:3333/api/net-worth-goal/history | head -c 400` → JSON with `points` and `firstRealDate`; `curl` without the cookie → 401. Stop the API.

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/net-worth-goal apps/api/src/config/entities.ts apps/api/src/migrations
git commit -m "feat(api): daily net-worth snapshots and history endpoint"
```

---

### Task 3: History helpers (web, pure)

**Files:**
- Create: `apps/web/src/lib/goals/history.ts`
- Create: `apps/web/src/lib/goals/history.test.ts`
- Modify: `apps/web/vitest.config.ts`

**Interfaces:**
- Consumes: `LEVELS`, `Level` from `@/lib/goals/levels`.
- Produces: `HistoryPoint`, `HistoryRange = '1M'|'3M'|'6M'|'YTD'|'1Y'|'ALL'`, `RANGES: { id: HistoryRange; label: string }[]`, `rangeCutoff(range, now): string | null`, `filterRange(points, range, now): HistoryPoint[]`, `rangeSummary(points): RangeSummary | null` with `RangeSummary { start: number; end: number; growth: number; pct: number | null }`, `milestoneCrossings(points): Crossing[]` with `Crossing { level: Level; date: string; value: number }`, `monthLabel(date): string`, `rangeLabel(points): string`.

- [ ] **Step 1: Write the failing tests**

`apps/web/src/lib/goals/history.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { filterRange, rangeCutoff, rangeSummary, milestoneCrossings, rangeLabel, type HistoryPoint } from './history';

const p = (date: string, value: number, estimated = false): HistoryPoint => ({ date, value, estimated });
const NOW = new Date(2026, 9, 15); // 15 Oct 2026, local time

describe('rangeCutoff', () => {
  it('counts months back from today', () => {
    expect(rangeCutoff('1M', NOW)).toBe('2026-09-15');
    expect(rangeCutoff('6M', NOW)).toBe('2026-04-15');
    expect(rangeCutoff('1Y', NOW)).toBe('2025-10-15');
  });
  it('starts YTD on January 1st', () => expect(rangeCutoff('YTD', NOW)).toBe('2026-01-01'));
  it('has no cutoff for all time', () => expect(rangeCutoff('ALL', NOW)).toBeNull());
});

describe('filterRange', () => {
  const pts = [p('2025-05-31', 18250, true), p('2026-03-31', 40000, true), p('2026-10-10', 46000)];
  it('keeps points on or after the cutoff', () => {
    expect(filterRange(pts, '1M', NOW)).toEqual([p('2026-10-10', 46000)]);
    expect(filterRange(pts, 'ALL', NOW)).toEqual(pts);
  });
  it('keeps the estimated flag', () => {
    expect(filterRange(pts, '1Y', NOW)[0].estimated).toBe(true);
  });
  it('falls back to the latest point when nothing is in range (e.g. YTD in early January)', () => {
    const jan = new Date(2027, 0, 2);
    expect(filterRange(pts, 'YTD', jan)).toEqual([p('2026-10-10', 46000)]);
  });
});

describe('rangeSummary', () => {
  it('reports start, end, growth and percent', () => {
    expect(rangeSummary([p('2025-05-31', 18250), p('2026-10-10', 46588.63)]))
      .toEqual({ start: 18250, end: 46588.63, growth: 28338.63, pct: 155.3 });
  });
  it('hides the percent when the start is zero or negative', () => {
    expect(rangeSummary([p('2026-01-31', -500), p('2026-10-10', 1000)])?.pct).toBeNull();
    expect(rangeSummary([p('2026-01-31', 0), p('2026-10-10', 1000)])?.pct).toBeNull();
  });
  it('returns null with no points', () => expect(rangeSummary([])).toBeNull());
});

describe('milestoneCrossings', () => {
  it('marks the first point at or above each threshold', () => {
    const out = milestoneCrossings([p('2025-05-31', 18250), p('2025-08-31', 25100), p('2025-11-30', 30000)]);
    expect(out.map((c) => [c.level.short, c.date])).toEqual([['$25K', '2025-08-31']]);
  });
  it('marks a crossing only once, even after dipping back below', () => {
    const out = milestoneCrossings([p('a1', 24000), p('a2', 26000), p('a3', 23000), p('a4', 27000)]);
    expect(out.filter((c) => c.level.short === '$25K').map((c) => c.date)).toEqual(['a2']);
  });
  it('does not mark levels already passed at the first point', () => {
    expect(milestoneCrossings([p('a1', 12000), p('a2', 13000)])).toEqual([]);
  });
  it('can cross several levels in one step', () => {
    const out = milestoneCrossings([p('a1', 4000), p('a2', 26000)]);
    expect(out.map((c) => c.level.short)).toEqual(['$5K', '$10K', '$25K']);
  });
});

describe('rangeLabel', () => {
  it('spans first to last month', () => expect(rangeLabel([p('2025-05-31', 1), p('2026-10-10', 2)])).toBe('May 2025 – Oct 2026'));
  it('shows one month for a single point', () => expect(rangeLabel([p('2026-10-10', 2)])).toBe('Oct 2026'));
});
```
Add `'src/lib/goals/**/*.test.ts'` to the end of the `include` array in `apps/web/vitest.config.ts`.

- [ ] **Step 2: Run to verify it fails**

Run: `npm run test:dashboard -- history`
Expected: FAIL — cannot resolve `./history`.

- [ ] **Step 3: Implement**

`apps/web/src/lib/goals/history.ts`:
```ts
import { LEVELS, type Level } from './levels';

export interface HistoryPoint { date: string; value: number; estimated: boolean }
export type HistoryRange = '1M' | '3M' | '6M' | 'YTD' | '1Y' | 'ALL';

export const RANGES: { id: HistoryRange; label: string }[] = [
  { id: '1M', label: '1M' }, { id: '3M', label: '3M' }, { id: '6M', label: '6M' },
  { id: 'YTD', label: 'YTD' }, { id: '1Y', label: '1Y' }, { id: 'ALL', label: 'All time' },
];

const MONTHS_BACK: Record<'1M' | '3M' | '6M' | '1Y', number> = { '1M': 1, '3M': 3, '6M': 6, '1Y': 12 };
const pad = (n: number) => String(n).padStart(2, '0');
const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** First date (YYYY-MM-DD) inside the range, or null for all time. */
export function rangeCutoff(range: HistoryRange, now: Date): string | null {
  if (range === 'ALL') return null;
  if (range === 'YTD') return `${now.getFullYear()}-01-01`;
  return ymd(new Date(now.getFullYear(), now.getMonth() - MONTHS_BACK[range], now.getDate()));
}

/** Points inside the range; the latest point alone if none fall inside it. */
export function filterRange(points: HistoryPoint[], range: HistoryRange, now: Date): HistoryPoint[] {
  const cutoff = rangeCutoff(range, now);
  if (!cutoff) return points;
  const kept = points.filter((p) => p.date >= cutoff);
  return kept.length ? kept : points.slice(-1);
}

export interface RangeSummary { start: number; end: number; growth: number; pct: number | null }

export function rangeSummary(points: HistoryPoint[]): RangeSummary | null {
  if (!points.length) return null;
  const start = points[0].value;
  const end = points[points.length - 1].value;
  const growth = Math.round((end - start) * 100) / 100;
  // A percentage of a zero or negative start is meaningless.
  const pct = start > 0 ? Math.round((growth / start) * 1000) / 10 : null;
  return { start, end, growth, pct };
}

export interface Crossing { level: Level; date: string; value: number }

/** The first point at or above each level threshold, counting only real crossings
 *  (the previous point was below). Dips and recoveries don't add a second marker. */
export function milestoneCrossings(points: HistoryPoint[]): Crossing[] {
  const out: Crossing[] = [];
  for (const level of LEVELS) {
    for (let i = 1; i < points.length; i++) {
      if (points[i - 1].value < level.threshold && points[i].value >= level.threshold) {
        out.push({ level, date: points[i].date, value: points[i].value });
        break;
      }
    }
  }
  return out;
}

export function monthLabel(date: string): string {
  return new Date(`${date.slice(0, 10)}T00:00:00`).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
}

export function rangeLabel(points: HistoryPoint[]): string {
  if (!points.length) return '';
  const a = monthLabel(points[0].date);
  const b = monthLabel(points[points.length - 1].date);
  return a === b ? a : `${a} – ${b}`;
}
```
Note: the "dip" test uses non-date strings (`'a1'`…) on purpose — `milestoneCrossings` doesn't parse dates.

- [ ] **Step 4: Run to verify it passes**

Run: `npm run test:dashboard`
Expected: all suites PASS, including the 15 new history tests.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/goals/history.ts apps/web/src/lib/goals/history.test.ts apps/web/vitest.config.ts
git commit -m "feat(web): net-worth history range, summary and milestone helpers"
```

---

### Task 4: History hook and chart (web)

**Files:**
- Create: `apps/web/src/hooks/useNetWorthHistory.ts`
- Create: `apps/web/src/app/goals/components/NetWorthHistoryChart.tsx`

**Interfaces:**
- Consumes: everything from Task 3; `compactMoney` from `@/lib/goals/levels`; `useThemeColors` from `@/components/ThemeProvider`.
- Produces: `useNetWorthHistory(): { points: HistoryPoint[]; loading: boolean; error: string | null }`; default-exported `NetWorthHistoryChart({ points, loading, error })`.

No unit test (recharts render; no component harness). Verified in the browser in Task 5.

- [ ] **Step 1: Hook**

`apps/web/src/hooks/useNetWorthHistory.ts`:
```ts
'use client';

import { useEffect, useState } from 'react';
import type { HistoryPoint } from '@/lib/goals/history';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3333/api';

export function useNetWorthHistory() {
  const [points, setPoints] = useState<HistoryPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`${API}/net-worth-goal/history`, { credentials: 'include' })
      .then((r) => { if (!r.ok) throw new Error('request failed'); return r.json(); })
      .then((body: { points: HistoryPoint[] }) => { if (!cancelled) setPoints(body.points ?? []); })
      .catch(() => { if (!cancelled) setError('Could not load your net worth history.'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  return { points, loading, error };
}
```

- [ ] **Step 2: Chart**

`apps/web/src/app/goals/components/NetWorthHistoryChart.tsx`:
```tsx
'use client';

import { useMemo, useState } from 'react';
import { ComposedChart, Area, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceDot } from 'recharts';
import { useThemeColors } from '@/components/ThemeProvider';
import { compactMoney } from '@/lib/goals/levels';
import {
  RANGES, filterRange, rangeSummary, milestoneCrossings, rangeLabel, monthLabel,
  type HistoryPoint, type HistoryRange,
} from '@/lib/goals/history';

interface Props { points: HistoryPoint[]; loading: boolean; error: string | null }

function money(n: number) {
  return `${n < 0 ? '−' : ''}$${Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

const toTime = (date: string) => new Date(`${date}T00:00:00`).getTime();

interface Row { t: number; date: string; value: number; estimated: boolean; change: number | null; real: number | null; est: number | null }

function TipContent({ active, payload }: { active?: boolean; payload?: { payload: Row }[] }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  const when = d.estimated
    ? monthLabel(d.date)
    : new Date(`${d.date}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  return (
    <div className="rounded-xl px-3 py-2 text-xs"
      style={{ background: 'var(--popover-bg)', border: 'var(--glass-border)', boxShadow: 'var(--glass-shadow)', color: 'var(--color-text-primary)' }}>
      <p className="font-semibold mb-1">{when}{d.estimated && <span style={{ color: 'var(--color-text-muted)' }}> · Estimated</span>}</p>
      <p className="flex justify-between gap-4"><span style={{ color: 'var(--color-text-secondary)' }}>Net worth</span><strong className="tabular-nums">{money(d.value)}</strong></p>
      {d.change !== null && (
        <p className="flex justify-between gap-4"><span style={{ color: 'var(--color-text-secondary)' }}>Change</span>
          <strong className="tabular-nums" style={{ color: d.change >= 0 ? 'var(--color-green)' : 'var(--color-rose)' }}>
            {d.change >= 0 ? '+' : '−'}{money(Math.abs(d.change))}
          </strong>
        </p>
      )}
    </div>
  );
}

export default function NetWorthHistoryChart({ points, loading, error }: Props) {
  const c = useThemeColors();
  const [range, setRange] = useState<HistoryRange>('ALL');

  const visible = useMemo(() => filterRange(points, range, new Date()), [points, range]);
  const data: Row[] = useMemo(() => visible.map((p, i) => ({
    t: toTime(p.date), date: p.date, value: p.value, estimated: p.estimated,
    change: i > 0 ? Math.round((p.value - visible[i - 1].value) * 100) / 100 : null,
    real: p.estimated ? null : p.value,
    // The first real point also carries the dashed series so the two lines meet.
    est: p.estimated || (i > 0 && visible[i - 1].estimated) ? p.value : null,
  })), [visible]);
  const summary = rangeSummary(visible);
  const crossings = milestoneCrossings(visible);
  const hasEstimate = visible.some((p) => p.estimated);
  const first = data[0];
  const last = data[data.length - 1];

  return (
    <section className="rounded-2xl p-4 sm:p-5"
      style={{ background: 'var(--color-surface)', backdropFilter: 'var(--glass-blur)', WebkitBackdropFilter: 'var(--glass-blur)', border: 'var(--glass-border)', boxShadow: 'var(--glass-shadow)' }}>
      <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
        <div>
          <h2 className="text-lg font-bold">Net worth over time</h2>
          <p className="text-xs mt-0.5" style={{ color: 'var(--color-text-muted)' }}>From your first record to today</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex p-1 rounded-xl" style={{ background: 'var(--color-elevated)', border: '1px solid var(--color-border)' }}>
            {RANGES.map((r) => (
              <button key={r.id} type="button" aria-pressed={range === r.id} onClick={() => setRange(r.id)}
                className={`px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer ${range === r.id ? 'btn-gold' : ''}`}
                style={range === r.id ? undefined : { color: 'var(--color-text-secondary)' }}>
                {r.label}
              </button>
            ))}
          </div>
          {visible.length > 0 && (
            <span className="text-xs px-2.5 py-1.5 rounded-lg" style={{ color: 'var(--color-text-secondary)', border: '1px solid var(--color-border)' }}>
              {rangeLabel(visible)}
            </span>
          )}
        </div>
      </div>

      {loading ? (
        <p className="h-64 flex items-center justify-center text-sm" style={{ color: 'var(--color-text-muted)' }}>Loading…</p>
      ) : error ? (
        <p className="h-64 flex items-center justify-center text-sm" style={{ color: 'var(--color-rose)' }}>{error}</p>
      ) : points.length <= 1 ? (
        <div className="h-64 flex flex-col items-center justify-center text-center gap-1">
          <p className="font-semibold">Your history starts today</p>
          <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
            {points[0] ? `${money(points[0].value)} today — come back to watch it grow.` : 'Come back to watch it grow.'}
          </p>
        </div>
      ) : (
        <>
          <div className="h-64 sm:h-72">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={data} margin={{ top: 28, right: 12, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="nw-fill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={c.green} stopOpacity={0.35} />
                    <stop offset="100%" stopColor={c.green} stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke={c.border} vertical={false} />
                <XAxis dataKey="t" type="number" scale="time" domain={['dataMin', 'dataMax']} tickCount={6}
                  tickFormatter={(t: number) => new Date(t).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}
                  tick={{ fill: c.textMuted, fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tickFormatter={(v: number) => compactMoney(v)} width={60}
                  domain={[(min: number) => Math.min(0, min), 'auto']}
                  tick={{ fill: c.textMuted, fontSize: 11 }} axisLine={false} tickLine={false} />
                <Tooltip content={<TipContent />} cursor={{ stroke: c.border }} />
                <Line dataKey="est" stroke={c.green} strokeOpacity={0.6} strokeWidth={2} strokeDasharray="5 5" dot={false} isAnimationActive={false} />
                <Area dataKey="real" stroke={c.green} strokeWidth={2.5} fill="url(#nw-fill)" dot={false} isAnimationActive={false} />
                {crossings.map((x) => (
                  <ReferenceDot key={x.level.n} x={toTime(x.date)} y={x.value} r={5} fill={c.green} stroke={c.textPrimary}
                    label={{ value: `${x.level.short} reached`, position: 'top', fill: c.green, fontSize: 11, fontWeight: 700 }} />
                ))}
                {first && <ReferenceDot x={first.t} y={first.value} r={4} fill={c.textPrimary} stroke={c.green}
                  label={{ value: compactMoney(first.value), position: 'top', fill: c.textSecondary, fontSize: 11 }} />}
                {last && <ReferenceDot x={last.t} y={last.value} r={5} fill={c.textPrimary} stroke={c.green}
                  label={{ value: compactMoney(last.value), position: 'top', fill: c.textSecondary, fontSize: 11 }} />}
              </ComposedChart>
            </ResponsiveContainer>
          </div>

          {hasEstimate && (
            <p className="mt-2 text-xs flex items-center gap-2" style={{ color: 'var(--color-text-muted)' }}>
              <svg width="22" height="6" aria-hidden="true"><line x1="0" y1="3" x2="22" y2="3" stroke={c.green} strokeWidth="2" strokeDasharray="5 4" strokeOpacity="0.6" /></svg>
              Estimated from your transactions
            </p>
          )}

          {summary && (
            <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-3 rounded-xl p-3" style={{ background: 'var(--color-elevated)', border: '1px solid var(--color-border)' }}>
              <div>
                <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>Starting net worth</p>
                <p className="text-lg font-bold tabular-nums">{money(summary.start)}</p>
              </div>
              <div>
                <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>Growth since start</p>
                <p className="text-lg font-bold tabular-nums" style={{ color: summary.growth >= 0 ? 'var(--color-green)' : 'var(--color-rose)' }}>
                  {summary.growth >= 0 ? '+' : '−'}{money(Math.abs(summary.growth))}
                </p>
              </div>
              {summary.pct !== null && (
                <div>
                  <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>Change since start</p>
                  <p className="text-lg font-bold tabular-nums" style={{ color: summary.pct >= 0 ? 'var(--color-green)' : 'var(--color-rose)' }}>
                    {summary.pct >= 0 ? '+' : ''}{summary.pct}%
                  </p>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </section>
  );
}
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit -p apps/web/tsconfig.json 2>&1 | grep -v '^apps/web/.next/'`
Expected: no output (errors under `apps/web/.next/` are stale build artefacts from other branches — ignore them).

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/hooks/useNetWorthHistory.ts apps/web/src/app/goals/components/NetWorthHistoryChart.tsx
git commit -m "feat(web): net worth over time chart with estimated history"
```

---

### Task 5: Page composition, restyles, next-step card (web)

**Files:**
- Create: `apps/web/src/app/goals/components/NextStepCard.tsx`
- Modify: `apps/web/src/app/goals/components/JourneyStats.tsx`
- Modify: `apps/web/src/app/goals/components/WealthJourney.tsx`
- Modify: `apps/web/src/app/goals/page.tsx` (full replacement)
- Delete: `apps/web/src/app/goals/components/MomentumCard.tsx`, `NextMove.tsx`, `AssetMixCard.tsx`

**Interfaces:**
- Consumes: `useNetWorthHistory`, `NetWorthHistoryChart` (Task 4); `useNetWorthGoal` (`{ data, loading, error, setTargetDate }`), `useDashboardData`, `netWorthBreakdown` (existing); `levelProgress` (existing).
- Produces: `NextStepCard({ netWorth: number; targetDate: string | null; onSetTargetDate: (date: string) => void })`.

- [ ] **Step 1: `NextStepCard`**

`apps/web/src/app/goals/components/NextStepCard.tsx`:
```tsx
'use client';

import { useState } from 'react';
import { levelProgress } from '@/lib/goals/levels';

function money(n: number) {
  return `${n < 0 ? '−' : ''}$${Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

interface Props { netWorth: number; targetDate: string | null; onSetTargetDate: (date: string) => void }

export default function NextStepCard({ netWorth, targetDate, onSetTargetDate }: Props) {
  const p = levelProgress(netWorth);
  const [planning, setPlanning] = useState(false);

  return (
    <section className="rounded-2xl p-5 flex flex-col gap-3"
      style={{ background: 'var(--color-surface)', backdropFilter: 'var(--glass-blur)', WebkitBackdropFilter: 'var(--glass-blur)', border: 'var(--glass-border)', boxShadow: 'var(--glass-shadow)' }}>
      <h2 className="text-lg font-bold">Your next step</h2>

      {p.next ? (
        <>
          <p className="flex flex-wrap items-baseline gap-x-2">
            <span className="font-extrabold tabular-nums" style={{ fontSize: 'clamp(26px, 3vw, 32px)' }}>{money(p.toGo)}</span>
            <span className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>until Level {p.next.n} · {p.next.name}</span>
          </p>
          <div>
            <p className="text-xs mb-1.5" style={{ color: 'var(--color-text-muted)' }}>{p.pctThroughLevel.toFixed(1)}% through this level</p>
            <div className="h-2 rounded-full overflow-hidden" style={{ background: 'var(--color-elevated)' }}>
              <div className="h-full rounded-full" style={{ width: `${Math.max(p.pctThroughLevel, 1)}%`, background: 'var(--color-primary)' }} />
            </div>
            <div className="flex justify-between text-[11px] mt-1 tabular-nums" style={{ color: 'var(--color-text-muted)' }}>
              <span>${p.bandFrom.toLocaleString()}</span><span>${p.bandTo.toLocaleString()}</span>
            </div>
          </div>
        </>
      ) : (
        <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>🏆 You reached the million. Every level is behind you.</p>
      )}

      <button type="button" onClick={() => setPlanning((o) => !o)} aria-expanded={planning}
        className="btn-gold w-full py-3 rounded-xl text-sm font-semibold cursor-pointer">
        Plan my next milestone →
      </button>
      <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
        {targetDate
          ? `Target date ${new Date(`${targetDate}T00:00:00`).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}`
          : 'Add a target date to explore your timeline.'}
      </p>
      {planning && (
        <input type="date" defaultValue={targetDate ?? ''} aria-label="Target date"
          onChange={(e) => { if (e.target.value) { onSetTargetDate(e.target.value); setPlanning(false); } }}
          className="w-full px-3 py-2 rounded-xl text-sm outline-none"
          style={{ background: 'var(--color-elevated)', border: '1px solid var(--color-border)', color: 'var(--color-text-primary)', colorScheme: 'dark' }} />
      )}
    </section>
  );
}
```

- [ ] **Step 2: Restyle `JourneyStats`**

In `apps/web/src/app/goals/components/JourneyStats.tsx`:
- In `Card`, change the root `className="flex-1 min-w-56 rounded-2xl p-4"` to `className="rounded-2xl p-4 min-w-0"`.
- In the default export, change the wrapper `<div className="flex gap-3 flex-wrap">` to `<div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">`.
- Change the label `"The million"` to `"Million goal"`.
- Change `'Not started'` to `'Level 0 · Getting started'`.

- [ ] **Step 3: Restyle `WealthJourney`**

In `apps/web/src/app/goals/components/WealthJourney.tsx` (match the mock, which has neither element):
- Delete the `<span className="px-3 py-1.5 rounded-lg text-xs font-semibold shrink-0" …>Current stage · …</span>` element in the header.
- Delete the closing `<p className="text-center text-xs mt-3" …>…Next unlock…</p>` element.
Leave the track, nodes, ✓/padlock/trophy and the "YOU" marker unchanged.

- [ ] **Step 4: Replace `page.tsx`**

`apps/web/src/app/goals/page.tsx`:
```tsx
'use client';

import Link from 'next/link';
import Sidebar from '@/components/Sidebar';
import { useNetWorthGoal } from '@/hooks/useNetWorthGoal';
import { useDashboardData } from '@/hooks/useDashboardData';
import { useNetWorthHistory } from '@/hooks/useNetWorthHistory';
import { netWorthBreakdown } from '@/lib/dashboard/derive';
import JourneyStats from './components/JourneyStats';
import NetWorthHistoryChart from './components/NetWorthHistoryChart';
import WealthJourney from './components/WealthJourney';
import NextStepCard from './components/NextStepCard';

function currentMonth() { return new Date().toISOString().slice(0, 7); }

export default function GoalsPage() {
  const { data: goal, loading: goalLoading, error: goalError, setTargetDate } = useNetWorthGoal();
  const { accounts, debts, yearTx, error: dataError } = useDashboardData();
  const history = useNetWorthHistory();
  const breakdown = netWorthBreakdown(accounts, debts, yearTx, currentMonth());

  return (
    <div className="flex h-dvh overflow-hidden">
      <Sidebar />
      <main className="flex-1 overflow-y-auto pt-14 md:pt-0">
        <div className="px-4 sm:px-6 md:px-8 py-6 flex flex-col gap-5 max-w-7xl">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h1 className="font-bold tracking-tight" style={{ fontSize: 'clamp(26px, 3vw, 38px)' }}>Your road to $1,000,000</h1>
              <p className="mt-1" style={{ color: 'var(--color-text-secondary)' }}>See how far you&rsquo;ve come. Keep building what&rsquo;s next.</p>
            </div>
            <Link href="/settings?tab=banks"
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold"
              style={{ background: 'var(--color-elevated)', border: '1px solid var(--color-border)', color: 'var(--color-text-primary)' }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M21 12a9 9 0 1 1-3-6.7L21 8" /><path d="M21 3v5h-5" />
              </svg>
              Update assets
            </Link>
          </div>

          {goalLoading ? (
            <p style={{ color: 'var(--color-text-muted)' }}>Loading…</p>
          ) : !goal ? (
            <p style={{ color: 'var(--color-rose)' }}>{goalError ?? 'Could not load your net worth goal.'}</p>
          ) : (
            <>
              <JourneyStats netWorth={breakdown.total} monthNet={breakdown.monthNet} />
              {dataError && <p className="text-sm" style={{ color: 'var(--color-rose)' }}>{dataError}</p>}
              <NetWorthHistoryChart points={history.points} loading={history.loading} error={history.error} />
              <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_380px] gap-5 items-start">
                <WealthJourney netWorth={breakdown.total} />
                <NextStepCard netWorth={breakdown.total} targetDate={goal.targetDate} onSetTargetDate={setTargetDate} />
              </div>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
```

- [ ] **Step 5: Delete the removed cards**

```bash
git rm apps/web/src/app/goals/components/MomentumCard.tsx apps/web/src/app/goals/components/NextMove.tsx apps/web/src/app/goals/components/AssetMixCard.tsx
```
Then `grep -rn "MomentumCard\|NextMove\|AssetMixCard" apps/web/src` must print nothing.

- [ ] **Step 6: Type-check and tests**

Run: `npx tsc --noEmit -p apps/web/tsconfig.json 2>&1 | grep -v '^apps/web/.next/'` → no output.
Run: `npm run test:dashboard` → all PASS.

- [ ] **Step 7: Browser check**

Start `npm run dev:api` and `npm run dev:web` in the background (if ports 3000/3333 are taken by other processes, report rather than kill). Sign in locally (or set an `access_token` cookie signed with the local `JWT_SECRET` for an existing local user, `{ sub: <userId>, typ: 'access' }`). Open `http://localhost:3000/goals` and check at **1280×800**, **768×1024** and **360×740**:
- `document.documentElement.scrollWidth > window.innerWidth` is `false`;
- four stat cards (4/2/1 per row); chart renders with range tabs; switching tabs changes the date-range label; the tooltip shows date, net worth and change; dashed segment + "Estimated from your transactions" legend appear if the user has pre-snapshot transactions;
- the ladder scrolls horizontally inside its card on 360px;
- **Plan my next milestone** opens the date input; **Update assets** goes to `/settings?tab=banks`.
Save screenshots to the scratchpad. Stop the servers you started; revert `apps/web/next-env.d.ts` if it changed.

- [ ] **Step 8: Commit**

```bash
git add -A apps/web/src/app/goals
git commit -m "feat(web): goals page redesign — history chart, next step card, mock layout"
```

---

### Task 6: Final verification

**Files:** none (fix forward in the owning task's files).

- [ ] **Step 1:** `npm run test:api && npm run test:dashboard` → all PASS.
- [ ] **Step 2:** `npm run migration:check` → exit 0.
- [ ] **Step 3:** `npm run build:api && npm run build:web` → both succeed.
- [ ] **Step 4:** Report: commits (not pushed), test counts, migration check, build results, screenshots.
