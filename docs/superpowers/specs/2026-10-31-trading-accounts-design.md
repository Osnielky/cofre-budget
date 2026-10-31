# Trading accounts — design

Date: 2026-10-31 · Status: approved in conversation, not built
Builds on: [trading performance](2026-10-29-trading-performance-design.md),
[projects overview](2026-10-29-projects-overview-design.md)

## Problem

A trading project today has two halves that never meet. The **Performance**
section exists only for brokerage accounts connected through Plaid, and shows
the FIFO engine's result per account. Everything about a prop firm the user is
*not* connected to (Topstep: combines bought with a card, resets, activation
fees, payouts landing in checking) lives only as category totals on the
project (*Prop Firm Evals*, *Prop Firm Payouts*). There is no "Topstep 50K #3"
to click, so the owner cannot answer "what did that account cost me, what did
it pay, is it funded, how is it doing" — and Topstep can have several accounts
bought at once, each with its own story.

The owner asked for: open the trading project and see the metrics of all
trading activity across every account, connected or not; click one account
and see that account's activity and performance; keep loading bank
transactions (payments out, money taken out) onto the project as today; and as
much insight as the data allows.

## Decisions

### 1. An account is the unit of navigation, whatever its source

A trading project **follows** accounts through `project_accounts` (one account
belongs to at most one project). Two kinds:

- **Connected** — a Plaid `investment` account. Rows arrive from Plaid
  Investments; the engine computes performance. Unchanged.
- **Manual** — a `bank_accounts` row of type `investment`, provider `manual`,
  created from the project itself ("+ Add an account you're not connected
  to": firm, name, size, status). Its rows are (a) **money the user attributes
  to it** from other accounts (an eval paid with the card, a payout received
  in checking) and (b) **trades imported from the platform's CSV** (phase B).

No new entity: a Topstep combine is an investment account the project
follows, exactly like Schwab. One manual account per purchased combine or
funded account; a reset or activation fee is a cost on that same account.

`project_accounts` gains the trading metadata (the link row is per project
and account, and only trading projects use it):

| Column | Type | Meaning |
|---|---|---|
| `kind` | `'broker' \| 'prop_firm'` | default `broker` for connected, chosen for manual |
| `status` | `'active' \| 'evaluation' \| 'funded' \| 'failed' \| 'closed'` | `active` for brokers; prop firms start at `evaluation` |
| `firm` | varchar null | "Topstep", "Apex"… (also the manual account's `bankName`) |
| `accountSize` | decimal null | 50000 for a 50K combine |
| `startedAt` / `endedAt` | date null | first money in / status set to failed or closed |
| `notes` | text null | free text |

`PATCH /api/projects/:id/accounts/:accountId` edits them; status changes to
`failed` or `closed` set `endedAt` when empty. `POST /api/projects/:id/accounts`
creates a manual account and its link in one step (validates ownership; the
account is `investment` / `manual` with `bankName = firm`, `accountName =
name`, balance 0).

### 2. Bank transactions are attributed to an account

Linking a checking or card transaction to the project works as today (project
category *Prop Firm Evals*, *Prop Firm Payouts*, …). New: an optional
`transactions.tradingAccountId` (uuid, FK `bank_accounts` ON DELETE SET NULL)
names which of the project's accounts the money belongs to.

- `PATCH /api/transactions/:id/trading-account { accountId | null }` — the
  account must be followed by the transaction's project.
- `PATCH /api/projects/:id/assign-account { transactionIds[], accountId }` —
  bulk, same validation.
- Unlinking a transaction from the project clears it. The existing guard
  stays: a row *on* a followed account is never linked as a project
  transaction (it is already counted).
- Suggestion when linking from the Transactions picker: if the project has
  exactly one open prop-firm account, pre-select it; otherwise leave it
  unassigned and let the project page's "Unassigned" strip collect it.

For a connected account the cash flows are its own contribution and
withdrawal rows (already in the engine). For a manual account the cash flows
are its attributed project transactions: expense rows are **money in** (cost),
income rows are **money out** (payouts).

### 3. Imported trades are rows of kind `closed_trade` (phase B)

Futures P&L needs a contract multiplier the engine does not know (an NQ point
is $20), and the TopstepX / Tradovate exports already give each trade closed:
entry, exit, size, side, P&L, sometimes fees. So an imported trade is **one
transaction row** on the manual account, not a synthesized buy and sell:

| Field | Value |
|---|---|
| `plaidCategory` | `['closed_trade', 'import']` |
| `symbol` / `securityName` | root (`MNQ`, from `^([A-Z]{1,3})[FGHJKMNQUVXZ]\d{1,2}$`) / full contract (`MNQU4`) |
| `quantity` | size, positive long, negative short |
| `price` / `exitPrice` (new, decimal null) | entry / exit |
| `fees` | from the file, 0 when the export has none |
| `date` / `openedAt` (new, date null) | close day (TopstepX `TradeDay` when present) / open day |
| `amount` | net P&L (gross − fees), so the account's cash moves like the platform's |
| `externalId` | `trade_<Id>` when the file has an id, else `trade_<sha1 of contract\|entered\|exited\|size\|pnl>` |
| `source` | `'import'` |
| `name` | `"MNQU4 long 2 @ 18550.25 → 18572.00"` |

`classifyActivity` learns `'closed_trade'`; `computePerformance` adds such rows
straight to the closed-trade list and the statistics, never to a lot. Symbol
summaries count them (open quantity 0). Re-importing dedupes on `externalId`
per user, like CSV import.

Parsing is a pure web library (`lib/trades/parse.ts`, tested) with presets
chosen by header: **TopstepX** (`ContractName, EnteredAt, ExitedAt,
EntryPrice, ExitPrice, Fees, PnL, Size, Type`, optional `Id`, `TradeDay`;
timestamps UTC), **Tradovate Performance** (`buyPrice, sellPrice, pnl,
boughtTimestamp, soldTimestamp`; no fees; side = whichever timestamp is
earlier), and **Generic** (column mapping UI). The preview shows totals,
duplicates (`POST /api/investments/trades/check`) and a time-zone note; the
import posts rows to `POST /api/investments/trades/import { accountId,
trades[] }`, which checks ownership and that the account is manual. Fees:
Tradovate rows import gross and the account view says so.

### 4. Navigation

Two levels inside the trading project. The projects page keeps its selection
in memory today; it gains `?project=<id>` and `?account=<id>` (written with
`router.replace`, read on load, as Reports does) so back and links work and a
card on the dashboard can open one account directly.

**Level 1 — all accounts** (what opens):

```
 Topstep + Schwab                                     [+ Add account] [Edit]
 ┌ Trading P&L ─┐ ┌ Money in ─┐ ┌ Money out ─┐ ┌ Net in pocket ┐ ┌ Win rate ┐ ┌ Accounts ─┐
 │ +$4,210      │ │ $1,950    │ │ $3,400     │ │ +$1,450       │ │ 58% · 312│ │ 2 funded  │
 │ 2 accounts   │ │ evals+dep │ │ payouts+wd │ │ out − in      │ │ PF 1.6   │ │ 1 eval 2 ✗│
 Realized P&L by month (combined)          Money in & out by month
 ┌ Topstep 50K #3 ──────┐ ┌ Topstep 50K #4 ──────┐ ┌ Schwab Individual ───┐
 │ Prop firm · Funded   │ │ Prop firm · Evaluation│ │ Broker · Connected   │
 │ Net cash +$1,850     │ │ Spent $149            │ │ Realized +$2,360     │
 │ Payouts 3 · $2,000   │ │ Payouts —             │ │ Win rate 61%         │
 │ Platform P&L +$3,100 │ │ No trades imported ↗  │ │ 148 closed           │
 │ ▁▂▃▅▆▇  last Oct 28  │ │ ▁▁▁▁▁▁  last Oct 12   │ │ ▂▃▂▅▇▆  last Oct 30  │
 ⚠ 3 project transactions have no account → Assign
 Categories · Linked transactions (as today, each row shows its account chip)
```

- Headline strip: **Trading P&L** (realized + income − fees over every
  account with trades), **Money in** (broker deposits + prop-firm costs),
  **Money out** (broker withdrawals + payouts), **Net in pocket** (out − in),
  **Win rate** with closed trades and profit factor, **Accounts** by status.
- The existing combined monthly realized panel, plus a money in / out by
  month panel (two series, fixed order, green out / rose in — same convention
  and caveat as the cash-flow chart in CLAUDE.md).
- One card per account: name, kind chip, status chip, three figures by kind
  (prop firm: net cash, payouts, platform P&L or "no trades imported";
  broker: realized, win rate, closed), six-month sparkline (realized for
  brokers, cash net for prop firms), last activity, and a hint when data is
  missing. Click → level 2. Sort: funded and active first, then evaluation,
  then failed / closed (dimmed).
- "Unassigned" strip with bulk assign (checkbox list → account select).
- The category grid and linked-transaction list stay below; each linked row
  carries its account chip with an inline "Assign" menu.

**Level 2 — one account** (`?account=`):

- Back bar "← All accounts" with a strip of the other accounts (one-click
  switch), as the projects detail does for projects.
- Header: name, firm, kind, **status** (inline select), size, started /
  ended, notes; actions: **Import trades** (manual), **Sync** (connected →
  Settings), **Edit**, **Remove from project** (never deletes the account).
- KPI tiles and panels from today's `TradingPerformance` for this account
  only, plus the new metrics below. Panels that cannot apply are hidden (open
  positions for an account that only has closed trades).
- "Money in & out" panel: for a connected account the engine's deposits and
  cash-outs; for a manual account the attributed transactions, newest first,
  each with its category, with "Unassign" on hover.
- Full closed-trade list with "Show more" (API `GET
  /api/investments/trades?accountId=&limit=&before=`).

### 5. Metrics

All server side, pure, tested. The web renders.

**Every account with trades** (connected or imported), added to
`PerformanceSummary.trades` / new `stats`:

| Metric | Definition |
|---|---|
| Expectancy | winRate × avgWin − (1 − winRate) × avgLoss, per closed trade |
| Max drawdown | largest peak-to-trough fall of cumulative realized, by trade order; with its dates |
| Streaks | longest run of winning and of losing closed trades; current streak |
| Best / worst day | realized by close date |
| Trades per active day | closed trades ÷ distinct close days |
| Long / short | closed trades and realized by side |
| Average hold | mean of close − open days (rows with `openedAt`; Plaid lots use the lot date) |
| Fees share | fees ÷ gross wins |
| By weekday | realized and count per weekday |

**Prop-firm accounts** (`cash` block, computed from attributed transactions):

| Metric | Definition |
|---|---|
| Spent | expense rows, split by project category (evals, resets, activation, data…) |
| Payouts | income rows: count, total, average, largest, last date |
| Net cash | payouts − spent; ROI = net ÷ spent |
| Cost per payout | spent ÷ payouts count |
| Days to first payout | first payout date − startedAt (or first cost) |
| Days active | today (or endedAt) − startedAt |
| Platform P&L | engine realized when trades exist — labelled "not yours until paid out" |

**Project level** (`combined` + `accounts[]` summary):

| Metric | Definition |
|---|---|
| Pass rate | accounts ever `funded` ÷ prop-firm accounts that left `evaluation` |
| Cost of failed accounts | spent on accounts with status `failed` |
| Payouts per account bought | payouts count ÷ prop-firm accounts |
| Money in / out / net in pocket | brokers' contributions + prop spent / brokers' withdrawals + payouts / difference |

`GET /api/investments/performance?projectId=` returns, per account, the
existing summary plus `meta` (kind, status, firm, size, dates), `cash`, and
`stats`; `combined` adds the project-level block; plus `unassigned: n`.

### 6. Charts and colours

Account cards and strips reuse the Reports / projects-overview primitives.
Identity colours follow the chart palette (green, sky, orange, amber, violet),
never the blue accent. Money in / out by month: green = money to you, rose =
money from you, fixed order, legend and labelled totals (documented
exception, as the dashboard's cash-flow chart). No pie for the status split:
counts in text.

### 7. Phases

- **A — model, attribution, navigation, cash metrics.** Migration
  (`project_accounts` columns, `transactions.tradingAccountId`), create
  manual account from the project, assign / bulk assign, level 1 + level 2
  views, `cash` block and project-level metrics. Topstep becomes navigable
  before any import exists.
- **B — trade import and trade statistics.** `closed_trade` rows
  (`exitPrice`, `openedAt` columns), engine support, parse presets + import
  modal, `stats` block, full trade list.

Each phase gets its own implementation plan.

## Not in scope

Contract multipliers (P&L from raw fills), live prices / unrealized P&L,
Tradovate Cash History for fees, prop-firm rule tracking (allowed drawdown,
profit target), rolling the engine's result into project closure, Plaid trade
rows getting `openedAt`.
