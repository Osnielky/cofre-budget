/* Trading performance from an investment account's rows. Pure: no I/O, no
   dates from the clock. Spec: docs/superpowers/specs/2026-10-29-trading-performance-design.md

   Lots are matched FIFO per symbol. A sell past the long position opens a short
   lot; a buy past the short position opens a long one. A trade's fees are split pro
   rata between what it opens (into the lot's cost per unit) and what it closes (off
   the realized result). Security transfers (Plaid type `transfer`: transfers in and
   out, splits, mergers, spin-offs) move lots at the reported price and never
   realize anything. Everything is rounded to cents only at the end. */

export interface ActivityRow {
  date: string;
  /** Cofre sign: money into the account's cash is positive. */
  amount: number;
  /** Plaid type / subtype (`plaidCategory[0]` / `[1]`); null for non-Plaid rows. */
  type: string | null;
  subtype: string | null;
  symbol: string | null;
  securityName: string | null;
  /** Plaid's sign: positive buys, negative sells. */
  quantity: number | null;
  price: number | null;
  fees: number | null;
  name: string;
}

export type ActivityKind = 'trade' | 'security_transfer' | 'contribution' | 'withdrawal' | 'income' | 'fee' | 'other';

const TRADE_TYPES = new Set(['buy', 'sell']);

/** What a row means to the account, from Plaid's type and subtype. */
export function classifyActivity(row: Pick<ActivityRow, 'type' | 'subtype' | 'quantity' | 'symbol'>): ActivityKind {
  const type = (row.type ?? '').toLowerCase();
  const sub = (row.subtype ?? '').toLowerCase();
  if (TRADE_TYPES.has(type)) return 'trade';
  if (type === 'transfer') return row.quantity && row.symbol ? 'security_transfer' : (sub.includes('withdraw') ? 'withdrawal' : 'contribution');
  if (type === 'fee') return 'fee';
  if (type === 'cash') {
    if (/deposit|contribution/.test(sub)) return 'contribution';
    if (/withdraw|distribution/.test(sub)) return 'withdrawal';
    if (/dividend|interest|capital gain|gain/.test(sub)) return 'income';
    if (/fee|tax|expense/.test(sub)) return 'fee';
  }
  return 'other';
}

interface Lot { qty: number; cost: number; date: string }

export interface ClosedTrade {
  date: string;
  symbol: string;
  side: 'long' | 'short';
  quantity: number;
  /** Average entry and exit per unit, fees excluded. */
  entry: number;
  exit: number;
  fees: number;
  /** Net of this trade's closing fees and the opening fees baked into the lots. */
  pnl: number;
}

export interface SymbolSummary {
  symbol: string;
  name: string | null;
  realized: number;
  closedTrades: number;
  wins: number;
  openQuantity: number;
  avgCost: number | null;
  costBasis: number;
}

export interface OpenPosition {
  symbol: string;
  name: string | null;
  side: 'long' | 'short';
  quantity: number;
  avgCost: number;
  costBasis: number;
  since: string;
}

export interface MonthSummary { month: string; realized: number; income: number; fees: number; closedTrades: number }

export interface PerformanceSummary {
  rows: number;
  from: string | null;
  to: string | null;
  realizedPnl: number;
  /** Standalone fee rows (account, management, margin, tax). Trade commissions are inside realizedPnl. */
  fees: number;
  /** Dividends, interest and distributed gains. */
  income: number;
  contributions: number;
  withdrawals: number;
  netContributed: number;
  /** realizedPnl + income − fees: what the account made, before unrealized moves. */
  netResult: number;
  trades: {
    total: number;
    closed: number;
    wins: number;
    losses: number;
    winRate: number | null;
    avgWin: number | null;
    avgLoss: number | null;
    profitFactor: number | null;
    largestWin: ClosedTrade | null;
    largestLoss: ClosedTrade | null;
  };
  bySymbol: SymbolSummary[];
  byMonth: MonthSummary[];
  openPositions: OpenPosition[];
  recentClosed: ClosedTrade[];
}

const cents = (n: number) => Math.round(n * 100) / 100;
const sign = (n: number) => (n < 0 ? -1 : 1);

export function computePerformance(input: ActivityRow[]): PerformanceSummary {
  const rows = [...input].sort((a, b) => a.date.localeCompare(b.date));
  const lots = new Map<string, Lot[]>();
  const names = new Map<string, string | null>();
  const symbolStats = new Map<string, { realized: number; closedTrades: number; wins: number }>();
  const months = new Map<string, MonthSummary>();
  const closed: ClosedTrade[] = [];
  let realizedPnl = 0, fees = 0, income = 0, contributions = 0, withdrawals = 0, tradeRows = 0;

  const month = (date: string) => {
    const key = date.slice(0, 7);
    let m = months.get(key);
    if (!m) { m = { month: key, realized: 0, income: 0, fees: 0, closedTrades: 0 }; months.set(key, m); }
    return m;
  };
  const stats = (symbol: string) => {
    let s = symbolStats.get(symbol);
    if (!s) { s = { realized: 0, closedTrades: 0, wins: 0 }; symbolStats.set(symbol, s); }
    return s;
  };

  for (const row of rows) {
    const kind = classifyActivity(row);
    const amt = Number(row.amount) || 0;
    if (kind === 'contribution') { contributions += Math.abs(amt); continue; }
    if (kind === 'withdrawal') { withdrawals += Math.abs(amt); continue; }
    if (kind === 'income') { income += amt; month(row.date).income += amt; continue; }
    if (kind === 'fee') { const f = Math.abs(amt); fees += f; month(row.date).fees += f; continue; }
    if (kind === 'other') continue;

    const symbol = row.symbol;
    const qty = Number(row.quantity) || 0;
    if (!symbol || !qty) {
      /* A trade with no symbol or quantity cannot move a lot; its cash effect is
         still a result of trading, so count it as realized. */
      if (kind === 'trade') { tradeRows += 1; realizedPnl += amt; month(row.date).realized += amt; }
      continue;
    }
    if (!names.has(symbol)) names.set(symbol, row.securityName ?? null);
    const price = Number(row.price) || Math.abs(amt) / Math.abs(qty);
    const rowFees = kind === 'trade' ? Math.abs(Number(row.fees) || 0) : 0;
    const book = lots.get(symbol) ?? [];
    lots.set(symbol, book);

    let remaining = qty;
    let closedQty = 0, closedCost = 0, closedProceeds = 0;
    let lotSide: 'long' | 'short' = 'long';
    let openedFirst: string | null = null;
    while (remaining !== 0 && book.length > 0 && sign(book[0].qty) !== sign(remaining)) {
      const lot = book[0];
      const take = Math.min(Math.abs(remaining), Math.abs(lot.qty));
      lotSide = lot.qty > 0 ? 'long' : 'short';
      openedFirst ??= lot.date;
      closedQty += take;
      closedCost += lot.cost * take;
      closedProceeds += price * take;
      lot.qty -= sign(lot.qty) * take;
      remaining -= sign(remaining) * take;
      if (Math.abs(lot.qty) < 1e-9) book.shift();
    }
    const openFraction = Math.abs(remaining) / Math.abs(qty);
    if (remaining !== 0) {
      /* Opening fees raise a long's cost per unit and lower a short's credit per unit. */
      const perUnitFees = (rowFees * openFraction) / Math.abs(remaining);
      book.push({ qty: remaining, cost: remaining > 0 ? price + perUnitFees : price - perUnitFees, date: row.date });
    }
    if (kind === 'trade') tradeRows += 1;
    if (closedQty > 0 && kind === 'trade') {
      const closingFees = rowFees * (1 - openFraction);
      const gross = lotSide === 'long' ? closedProceeds - closedCost : closedCost - closedProceeds;
      const pnl = gross - closingFees;
      const trade: ClosedTrade = {
        date: row.date, symbol, side: lotSide, quantity: closedQty,
        entry: cents(closedCost / closedQty), exit: cents(closedProceeds / closedQty),
        fees: cents(closingFees), pnl: cents(pnl),
      };
      closed.push(trade);
      realizedPnl += pnl;
      const s = stats(symbol);
      s.realized += pnl; s.closedTrades += 1; if (pnl > 0) s.wins += 1;
      const m = month(row.date);
      m.realized += pnl; m.closedTrades += 1;
    }
    /* A security transfer out just removes lots (handled above); nothing realized. */
    void openedFirst;
  }

  const wins = closed.filter((t) => t.pnl > 0);
  const losses = closed.filter((t) => t.pnl < 0);
  const grossWin = wins.reduce((s, t) => s + t.pnl, 0);
  const grossLoss = -losses.reduce((s, t) => s + t.pnl, 0);

  const openPositions: OpenPosition[] = [];
  for (const [symbol, book] of lots) {
    const qty = book.reduce((s, l) => s + l.qty, 0);
    if (Math.abs(qty) < 1e-9) continue;
    const cost = book.reduce((s, l) => s + l.cost * l.qty, 0);
    openPositions.push({
      symbol, name: names.get(symbol) ?? null, side: qty > 0 ? 'long' : 'short',
      quantity: +Math.abs(qty).toFixed(6), avgCost: cents(cost / qty), costBasis: cents(Math.abs(cost)),
      since: book[0].date,
    });
  }
  openPositions.sort((a, b) => b.costBasis - a.costBasis);

  const bySymbol: SymbolSummary[] = [];
  const symbols = new Set([...symbolStats.keys(), ...openPositions.map((p) => p.symbol)]);
  for (const symbol of symbols) {
    const s = symbolStats.get(symbol) ?? { realized: 0, closedTrades: 0, wins: 0 };
    const pos = openPositions.find((p) => p.symbol === symbol);
    bySymbol.push({
      symbol, name: names.get(symbol) ?? null, realized: cents(s.realized), closedTrades: s.closedTrades, wins: s.wins,
      openQuantity: pos ? (pos.side === 'long' ? pos.quantity : -pos.quantity) : 0,
      avgCost: pos ? pos.avgCost : null, costBasis: pos ? pos.costBasis : 0,
    });
  }
  bySymbol.sort((a, b) => Math.abs(b.realized) - Math.abs(a.realized) || b.costBasis - a.costBasis || a.symbol.localeCompare(b.symbol));

  const byMonth = [...months.values()]
    .map((m) => ({ ...m, realized: cents(m.realized), income: cents(m.income), fees: cents(m.fees) }))
    .sort((a, b) => a.month.localeCompare(b.month));

  const largest = (list: ClosedTrade[], pick: 'max' | 'min') =>
    list.length === 0 ? null : list.reduce((best, t) => (pick === 'max' ? t.pnl > best.pnl : t.pnl < best.pnl) ? t : best);

  return {
    rows: rows.length,
    from: rows[0]?.date ?? null,
    to: rows[rows.length - 1]?.date ?? null,
    realizedPnl: cents(realizedPnl),
    fees: cents(fees),
    income: cents(income),
    contributions: cents(contributions),
    withdrawals: cents(withdrawals),
    netContributed: cents(contributions - withdrawals),
    netResult: cents(realizedPnl + income - fees),
    trades: {
      total: tradeRows,
      closed: closed.length,
      wins: wins.length,
      losses: losses.length,
      winRate: closed.length ? Math.round((wins.length / closed.length) * 1000) / 10 : null,
      avgWin: wins.length ? cents(grossWin / wins.length) : null,
      avgLoss: losses.length ? cents(grossLoss / losses.length) : null,
      profitFactor: grossLoss > 0 ? Math.round((grossWin / grossLoss) * 100) / 100 : (grossWin > 0 ? null : null),
      largestWin: largest(wins, 'max'),
      largestLoss: largest(losses, 'min'),
    },
    bySymbol,
    byMonth,
    openPositions,
    recentClosed: [...closed].reverse().slice(0, 20),
  };
}
