/* Brokerage trades: rows the Plaid Investments product writes with
   `plaidCategory = [type, subtype]` where the type is `buy` or `sell`
   (subtypes: buy, buy to cover, sell, sell short, …). A trade moves money
   between the cash and the holdings of one investment account — it never
   changes net worth on its own and never needs a category — so the
   Transactions page keeps trades out of All / Expenses / Income and shows
   them on their own Trades tab. Cash activity on the same account (deposits,
   withdrawals, dividends, interest, fees) is not a trade and stays in the
   ledger, where it can be linked or categorized.

   Plaid's Transactions feed uses a different taxonomy (`['Food and Drink',
   'Restaurants']`, …) whose top level is never `buy` / `sell`, so the type
   alone identifies a trade. The API's Ask Cofre tool applies the same rule in
   SQL (`ai-read-tools.service.ts`). */

export const TRADE_TYPES: ReadonlySet<string> = new Set(['buy', 'sell']);

export interface TradeLike {
  amount: number | string;
  plaidCategory?: string[] | null;
}

export function isTrade(t: TradeLike): boolean {
  const type = t.plaidCategory?.[0];
  return typeof type === 'string' && TRADE_TYPES.has(type.toLowerCase());
}

export function splitTrades<T extends TradeLike>(rows: T[]): { ledger: T[]; trades: T[] } {
  const ledger: T[] = [];
  const trades: T[] = [];
  for (const r of rows) (isTrade(r) ? trades : ledger).push(r);
  return { ledger, trades };
}

export interface TradeSummary {
  count: number;
  /** Cash spent on buys (positive number). */
  bought: number;
  /** Cash received from sells (positive number). */
  sold: number;
  /** sold − bought: what the trades returned to cash, net. */
  net: number;
}

/** Totals for the Trades tab header. Amounts follow the app's sign rule
    (money into the account's cash is positive), so buys are negative rows. */
export function summarizeTrades(trades: TradeLike[]): TradeSummary {
  let bought = 0, sold = 0;
  for (const t of trades) {
    const a = Number(t.amount);
    if (a < 0) bought += -a; else sold += a;
  }
  return { count: trades.length, bought: +bought.toFixed(2), sold: +sold.toFixed(2), net: +(sold - bought).toFixed(2) };
}
