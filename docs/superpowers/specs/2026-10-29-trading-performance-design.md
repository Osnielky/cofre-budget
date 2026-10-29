# Trading performance — design (phase 1)

Date: 2026-10-29
Status: built (phase 1: structured trades, performance engine, project ↔ account link)

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
   insert and update, so "Re-download full history" backfills rows synced before.
   The note stays as the human line.

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

3. **A trading project links to an account.** `projects.bankAccountId` (nullable;
   migration `ProjectBankAccount`), settable from the project form on Trading
   projects, validated to be the user's own `investment` account. A linked project
   gets a **Performance** section on its detail: KPI tiles (realized P&L, win rate,
   dividends & interest, fees, net contributed), realized P&L by month (bars), by
   symbol, open positions and recent closed trades. The project's existing manual
   side (platform subscriptions, prop-firm evaluations paid from checking) is
   unchanged, and nothing in the account needs a category: tracking-account rows
   never did.

## Not in phase 1

- Unrealized P&L / current value (Plaid Holdings, $0.18 per Item per month; Elite).
- Broker CSV import with presets (Schwab, Fidelity, Robinhood, IBKR, Tradovate).
- Options and futures multipliers; wash sales; broker lot methods other than FIFO
  (import the broker's realized-gain report instead).
- Rolling the engine's result into the project's closure P&L.
- An Investments page for investors without a project (the Trades tab is the
  holding place).
