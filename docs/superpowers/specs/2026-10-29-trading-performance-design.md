# Trading performance — design (phase 1)

Date: 2026-10-29
Status: built (phase 1: structured trades, performance engine, project ↔ accounts link with per-account and combined views)

## Problem

Plaid Investments now delivers every brokerage operation (buys, sells, dividends,
deposits, fees) with symbol, quantity, price and fees, but Cofre kept that as a
sentence in the transaction note. Traders and investors want to know how their
account is doing — realized P&L, win rate, what each ticker made, what is still open —
and the owner wants trading treated like any other side hustle: a project with a
result. Cash in and out of the account stays in the ledger for categorizing; the
analysis is what was missing.

## Decision

1. **Store trades structured.** Five nullable columns on `transactions`
   (migration `InvestmentActivityFields`): `symbol` (ticker or security name
   fallback, ≤ 32), `securityName`, `quantity` (signed, Plaid's convention:
   positive buys, negative sells), `price`, `fees`. `plaidCategory = [type, subtype]`
   keeps the Plaid type. `investments.mapper.ts` fills them; the sync writes them on
   insert and update. Rows synced before the columns existed have no symbol, and the
   engine would count those trades as plain cash; so `syncInvestments` pulls the full
   730-day window whenever an account still has buy / sell rows without a symbol, and
   one ordinary Sync heals them. The note stays as the human line.

2. **One engine, server side, pure.** `investments/performance.ts` turns an account's
   rows into a `PerformanceSummary`. Lots are matched **FIFO** per symbol; a sell
   beyond the long position opens a short lot, a buy beyond the short position opens
   a long one. Fees on a trade are split pro rata: the part that opens a lot goes into
   its cost per share, the part that closes one comes off the realized result.
   Security transfers (Plaid type `transfer`: transfers in/out, splits, mergers) move
   lots at the reported price without realizing anything. Cash rows are classified
   by subtype: contribution / withdrawal / income (dividend, interest, capital gain) /
   fee (type `fee`, or `cash` fee, tax, expense) / other.

   Output: realized P&L, standalone fees, income, contributions, withdrawals, net
   contributed, `netResult` (realized + income − fees), trade stats (closed, wins,
   losses, win rate, average win / loss, profit factor, largest win / loss), by symbol,
   by month, open positions (quantity, average cost, cost basis), the last closed
   trades. No current prices, so no unrealized P&L yet (needs Plaid Holdings, a
   follow-up). `GET /api/investments/performance?accountId=` (JWT, user scoped)
   returns it; the web only renders.

3. **A trading project follows one or more accounts.** A trader may hold a Schwab
   brokerage, a futures prop-firm account and a Webull margin account at once, so the
   link is a table, `project_accounts` (projectId, bankAccountId, unique per account:
   an account feeds at most one project; rows go with the project or the account).
   The project form on Trading projects shows a checklist of the user's `investment`
   accounts; the API validates ownership and type and refuses an account another
   project already follows. `ProjectWithStats.accounts` lists them in link order.

   **Each account is analysed on its own** — lots never cross accounts — and the
   project shows the combined result: `mergePerformance()` adds totals, re-derives
   the trade statistics from gross win / loss sums, merges symbols and months, and
   labels open positions, recent closed trades and the largest win / loss with their
   account. `GET /api/investments/performance?projectId=` returns `{ project,
   accounts: [per-account summary], combined }`; `?accountId=` still returns one.

   The project detail's **Performance** section opens on *All accounts* and has a
   tab per account (each with its realized P&L), then KPI tiles (realized P&L, win
   rate, dividends & interest, fees, net contributed), realized P&L by month (bars),
   by symbol, open positions and recent closed trades; in the combined view the
   positions and trades carry an account label. The project's existing manual side
   (platform subscriptions, prop-firm evaluations paid from checking) is unchanged,
   and nothing in the account needs a category: tracking-account rows never did.

   Same-day rows: Plaid gives a date, never a time, so within a day buys are
   processed before sells (a flat-position round trip has the same P&L either way,
   and "long" is the right label far more often than "short"); otherwise input order
   (`createdAt`) is kept.

## Deposits, cash-outs and the project categories (2026-10-30)

The owner moved $900 from Schwab to checking, linked it in the transfer dialog as
"Gains from investing", and expected to see it under the trading project — that is
how the pre-Plaid trading project worked (link the payout to a *Payouts & profits*
category). With a followed account the project already has the money: the
Investments feed carries every deposit and withdrawal, and the profit is in the
closed trades. Filing the arrival under a project category would count it twice.

- **`cashFlows`** on `PerformanceSummary`: every contribution / withdrawal row
  (`date`, `kind`, positive `amount`, `name`), newest first, capped at 20; merged
  summaries label each with its account. The Performance section replaces the
  single *Net contributed* tile with **Deposited** (net in the account as the
  sub-line) and **Cashed out** (date of the last one), and adds a **Deposits &
  cash-outs** panel ("your own money moving — not profit, not a cost").
- **Guard.** `ProjectsService.linkTransaction` rejects (400) a transaction that
  sits on an account the project follows, or whose `transferAccountId` is one, with
  a message naming the project and account. The Transactions picker mirrors it
  (`lib/projects/followed.ts` → `followedAccountFor`): the project's row in the
  Projects list carries an *already tracked* tag, the drill-down shows "Already in
  this project" with the explanation instead of its categories, and the one-click
  project suggestion never offers that project. A project that does **not** follow
  the account (a prop firm paying to checking) still takes the row — that is what
  the categories are for.
- The transfer kind still decides what the budget sees: *Putting money into savings*
  / *Taking money out of savings* / *Gains from investing*. Rule of thumb for the
  owner: money marked as gains should stay below the project's realized P&L.

## Realized P&L by month (2026-10-30)

The first version drew one bar per reported month with no values, skipped the
months without activity and left most of a wide screen empty. Now
(`lib/investments/monthly.ts`, pure, tested; drawn by `MonthlyPanel` in
`TradingPerformance.tsx`):

- **Continuous timeline.** `monthSeries()` fills every month between the first and
  last reported one (zero bar, muted label) and carries the cumulative realized total
  from the first month of history. The chart shows the last 12 months (6 on phones).
- **Bars with values.** Green up / rose down, labelled with short signed money once a
  month slot is at least 46px wide; the axis shows the month and its closed-trade
  count. Positive and negative regions split the plot height in proportion to the
  largest month on each side (a losing month is never a sliver), each keeping 14px
  for its labels so nothing runs into the axis text.
- **Cumulative curve** (sky, its own scale inside the plot) with a dot per month and
  the running total at the end, hidden when it would collide with the last bar's
  label. Hover any month for realized, closed trades and the cumulative total.
- **Figures** beside the chart (below it under `xl`): best and worst month, green
  months out of active months, average month, the current year so far, all time
  since the first month. They always read the last 12 months regardless of screen
  width.

## Not in phase 1

- Unrealized P&L / current value (Plaid Holdings, $0.18 per Item per month; Elite).
- Broker CSV import with presets (Schwab, Fidelity, Robinhood, IBKR, Tradovate).
- Options and futures multipliers; wash sales; broker lot methods other than FIFO
  (import the broker's realized-gain report instead).
- Rolling the engine's result into the project's closure P&L.
- An Investments page for investors without a project (the Trades tab is the
  holding place).
