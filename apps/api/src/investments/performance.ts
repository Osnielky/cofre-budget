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
  /** Set only on a merged (multi-account) summary: which account the trade was in. */
  account?: string;
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
  /** Set only on a merged (multi-account) summary. */
  account?: string;
  side: 'long' | 'short';
  quantity: number;
  avgCost: number;
  costBasis: number;
  since: string;
}

export interface MonthSummary { month: string; realized: number; income: number; fees: number; closedTrades: number }

/** One deposit into or withdrawal out of the account's cash — the money the owner
    moved, as opposed to what trading made. */
export interface CashFlow {
  date: string;
  kind: 'contribution' | 'withdrawal';
  /** Always positive; `kind` carries the direction. */
  amount: number;
  name: string;
  /** Set only on a merged (multi-account) summary. */
  account?: string;
}

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
    /** Sum of winning / losing closed trades (losses as a positive number); lets summaries merge exactly. */
    grossWin: number;
    grossLoss: number;
    largestWin: ClosedTrade | null;
    largestLoss: ClosedTrade | null;
  };
  bySymbol: SymbolSummary[];
  byMonth: MonthSummary[];
  openPositions: OpenPosition[];
  recentClosed: ClosedTrade[];
  /** Deposits and withdrawals, most recent first, capped at 20. */
  cashFlows: CashFlow[];
}

/** 0 for buys and everything else, 1 for sells — the same-day tie-break. */
const sideRank = (r: ActivityRow) => (Number(r.quantity) || 0) < 0 ? 1 : 0;
const cents = (n: number) => Math.round(n * 100) / 100 + 0; // + 0 turns -0 into 0
const sign = (n: number) => (n < 0 ? -1 : 1);

export function computePerformance(input: ActivityRow[]): PerformanceSummary {
  /* Plaid gives a date, never a time. Same-day rows keep their input order except
     that buys go before sells: with a flat position the round-trip P&L is the same
     either way, and "long" is the right label far more often than "short". */
  const rows = input.map((r, i) => ({ r, i })).sort((a, b) =>
    a.r.date.localeCompare(b.r.date) || sideRank(a.r) - sideRank(b.r) || a.i - b.i).map((x) => x.r);
  const lots = new Map<string, Lot[]>();
  const names = new Map<string, string | null>();
  const symbolStats = new Map<string, { realized: number; closedTrades: number; wins: number }>();
  const months = new Map<string, MonthSummary>();
  const closed: ClosedTrade[] = [];
  const cashFlows: CashFlow[] = [];
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
    if (kind === 'contribution' || kind === 'withdrawal') {
      if (kind === 'contribution') contributions += Math.abs(amt); else withdrawals += Math.abs(amt);
      cashFlows.push({ date: row.date, kind, amount: cents(Math.abs(amt)), name: row.name });
      continue;
    }
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
      profitFactor: grossLoss > 0 ? Math.round((grossWin / grossLoss) * 100) / 100 : null,
      grossWin: cents(grossWin),
      grossLoss: cents(grossLoss),
      largestWin: largest(wins, 'max'),
      largestLoss: largest(losses, 'min'),
    },
    bySymbol,
    byMonth,
    openPositions,
    recentClosed: [...closed].reverse().slice(0, 20),
    cashFlows: cashFlows.reverse().slice(0, 20),
  };
}

/** One summary for several accounts. Lots never cross accounts, so each account is
    computed on its own and the results are added: totals sum, trade stats re-derive
    from the gross sums, symbols and months merge by key, open positions and recent
    closed trades keep their account label. */
export function mergePerformance(parts: { label: string; summary: PerformanceSummary }[]): PerformanceSummary {
  const sums = parts.map((p) => p.summary);
  const sum = (pick: (s: PerformanceSummary) => number) => cents(sums.reduce((acc, s) => acc + pick(s), 0));
  const dates = sums.flatMap((s) => [s.from, s.to]).filter((d): d is string => !!d).sort();

  const closed = sums.reduce((n, s) => n + s.trades.closed, 0);
  const wins = sums.reduce((n, s) => n + s.trades.wins, 0);
  const losses = sums.reduce((n, s) => n + s.trades.losses, 0);
  const grossWin = sum((s) => s.trades.grossWin);
  const grossLoss = sum((s) => s.trades.grossLoss);
  const withLabel = (t: ClosedTrade | null, label: string) => (t ? { ...t, account: label } : null);
  const largestWin = parts.map((p) => withLabel(p.summary.trades.largestWin, p.label)).filter((t): t is ClosedTrade & { account: string } => !!t)
    .reduce<ClosedTrade | null>((best, t) => (!best || t.pnl > best.pnl ? t : best), null);
  const largestLoss = parts.map((p) => withLabel(p.summary.trades.largestLoss, p.label)).filter((t): t is ClosedTrade & { account: string } => !!t)
    .reduce<ClosedTrade | null>((best, t) => (!best || t.pnl < best.pnl ? t : best), null);

  const bySymbolMap = new Map<string, SymbolSummary & { costTimesQty: number }>();
  for (const s of sums) for (const sym of s.bySymbol) {
    const cur = bySymbolMap.get(sym.symbol) ?? { symbol: sym.symbol, name: sym.name, realized: 0, closedTrades: 0, wins: 0, openQuantity: 0, avgCost: null, costBasis: 0, costTimesQty: 0 };
    cur.name ??= sym.name;
    cur.realized += sym.realized; cur.closedTrades += sym.closedTrades; cur.wins += sym.wins;
    cur.openQuantity += sym.openQuantity; cur.costBasis += sym.costBasis;
    bySymbolMap.set(sym.symbol, cur);
  }
  const bySymbol: SymbolSummary[] = [...bySymbolMap.values()].map(({ costTimesQty: _c, ...sym }) => ({
    ...sym, realized: cents(sym.realized), costBasis: cents(sym.costBasis), openQuantity: +sym.openQuantity.toFixed(6),
    avgCost: sym.openQuantity ? cents(sym.costBasis / Math.abs(sym.openQuantity)) : null,
  })).sort((a, b) => Math.abs(b.realized) - Math.abs(a.realized) || b.costBasis - a.costBasis || a.symbol.localeCompare(b.symbol));

  const byMonthMap = new Map<string, MonthSummary>();
  for (const s of sums) for (const m of s.byMonth) {
    const cur = byMonthMap.get(m.month) ?? { month: m.month, realized: 0, income: 0, fees: 0, closedTrades: 0 };
    cur.realized += m.realized; cur.income += m.income; cur.fees += m.fees; cur.closedTrades += m.closedTrades;
    byMonthMap.set(m.month, cur);
  }
  const byMonth = [...byMonthMap.values()].map((m) => ({ ...m, realized: cents(m.realized), income: cents(m.income), fees: cents(m.fees) }))
    .sort((a, b) => a.month.localeCompare(b.month));

  const openPositions = parts.flatMap((p) => p.summary.openPositions.map((pos) => ({ ...pos, account: p.label })))
    .sort((a, b) => b.costBasis - a.costBasis);
  const recentClosed = parts.flatMap((p) => p.summary.recentClosed.map((t) => ({ ...t, account: p.label })))
    .sort((a, b) => b.date.localeCompare(a.date)).slice(0, 20);
  const cashFlows = parts.flatMap((p) => p.summary.cashFlows.map((f) => ({ ...f, account: p.label })))
    .sort((a, b) => b.date.localeCompare(a.date)).slice(0, 20);

  return {
    rows: sums.reduce((n, s) => n + s.rows, 0),
    from: dates[0] ?? null,
    to: dates[dates.length - 1] ?? null,
    realizedPnl: sum((s) => s.realizedPnl),
    fees: sum((s) => s.fees),
    income: sum((s) => s.income),
    contributions: sum((s) => s.contributions),
    withdrawals: sum((s) => s.withdrawals),
    netContributed: sum((s) => s.netContributed),
    netResult: sum((s) => s.netResult),
    trades: {
      total: sums.reduce((n, s) => n + s.trades.total, 0),
      closed, wins, losses,
      winRate: closed ? Math.round((wins / closed) * 1000) / 10 : null,
      avgWin: wins ? cents(grossWin / wins) : null,
      avgLoss: losses ? cents(grossLoss / losses) : null,
      profitFactor: grossLoss > 0 ? Math.round((grossWin / grossLoss) * 100) / 100 : null,
      grossWin, grossLoss, largestWin, largestLoss,
    },
    bySymbol, byMonth, openPositions, recentClosed, cashFlows,
  };
}
