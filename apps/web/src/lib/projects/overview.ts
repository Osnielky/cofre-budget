/* Numbers for the Projects overview: the portfolio strip across every project
   and the three headline figures each card shows, chosen by project type. Pure.
   Spec: docs/superpowers/specs/2026-10-29-projects-overview-design.md */

export interface OverviewProject {
  id: string;
  type: string;
  status: string;
  purchasePrice: number;
  purchaseDate?: string | null;
  salePrice: number | null;
  expenses: number;
  income: number;
  costBasis: number;
  netGain: number | null;
  roi: number | null;
  txCount: number;
  accounts?: { id: string }[];
  lastActivity?: string | null;
  monthly?: { month: string; net: number }[];
}

/** Realized trading numbers a trading card adds once the performance request lands. */
export interface TradingHeadline { realizedPnl: number; winRate: number | null; closed: number }

export interface Figure {
  label: string;
  value: string;
  /** 'up' / 'down' colour the value green / rose; 'flat' leaves it neutral. */
  tone: 'up' | 'down' | 'flat';
}

export interface PortfolioTotals {
  active: number;
  closed: number;
  costBasis: number;
  income: number;
  expenses: number;
  /** income − expenses over every project (realized sale prices count as income on sold ones). */
  net: number;
}

const cents = (n: number) => Math.round(n * 100) / 100 + 0;
const CLOSED = new Set(['sold', 'terminated']);

export function money(n: number, signed = false): string {
  const abs = Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  if (!signed || n === 0) return `$${abs}`;
  return n < 0 ? `-$${abs}` : `+$${abs}`;
}

const tone = (n: number): Figure['tone'] => (n > 0 ? 'up' : n < 0 ? 'down' : 'flat');

export function portfolioTotals(projects: OverviewProject[]): PortfolioTotals {
  let costBasis = 0, income = 0, expenses = 0, active = 0, closed = 0;
  for (const p of projects) {
    if (CLOSED.has(p.status)) closed += 1; else active += 1;
    costBasis += p.costBasis;
    income += p.income + (p.status === 'sold' && p.salePrice != null ? Number(p.salePrice) : 0);
    expenses += p.expenses + (Number(p.purchasePrice) || 0);
  }
  return { active, closed, costBasis: cents(costBasis), income: cents(income), expenses: cents(expenses), net: cents(income - expenses) };
}

/** The result figure of one project, the same number the card and the strip agree on. */
export function projectNet(p: OverviewProject): number {
  if (p.status === 'sold' && p.netGain != null) return cents(p.netGain);
  return cents(p.income - p.expenses - (Number(p.purchasePrice) || 0));
}

/** Three figures per card: what a vehicle, a business and a trading account each care about. */
export function headlineFigures(p: OverviewProject, trading?: TradingHeadline | null): Figure[] {
  const sold = p.status === 'sold';
  if (p.type === 'trading') {
    const accounts = p.accounts?.length ?? 0;
    if (trading && accounts > 0) {
      return [
        { label: 'Realized P&L', value: money(trading.realizedPnl, true), tone: tone(trading.realizedPnl) },
        { label: 'Win rate', value: trading.winRate == null ? '—' : `${trading.winRate}%`, tone: 'flat' },
        { label: accounts === 1 ? 'Account' : 'Accounts', value: `${accounts} · ${trading.closed} closed`, tone: 'flat' },
      ];
    }
    const net = projectNet(p);
    return [
      { label: 'Net result', value: money(net, true), tone: tone(net) },
      { label: 'Payouts & profits', value: money(p.income), tone: 'flat' },
      { label: accounts > 0 ? (accounts === 1 ? 'Account' : 'Accounts') : 'Costs', value: accounts > 0 ? String(accounts) : money(p.expenses), tone: 'flat' },
    ];
  }
  if (p.type === 'business' || p.type === 'service') {
    const net = projectNet(p);
    const roi = p.costBasis > 0 ? Math.round((net / p.costBasis) * 100) : null;
    return [
      { label: 'Net', value: money(net, true), tone: tone(net) },
      { label: 'Income', value: money(p.income), tone: 'flat' },
      { label: roi == null ? 'Expenses' : 'ROI', value: roi == null ? money(p.expenses) : `${roi >= 0 ? '+' : ''}${roi}%`, tone: roi == null ? 'flat' : tone(roi) },
    ];
  }
  /* Held assets: vehicle, property, other. */
  if (sold && p.netGain != null) {
    return [
      { label: 'Net gain', value: money(p.netGain, true), tone: tone(p.netGain) },
      { label: 'Sold for', value: money(Number(p.salePrice) || 0), tone: 'flat' },
      { label: 'ROI', value: p.roi == null ? '—' : `${p.roi >= 0 ? '+' : ''}${Math.round(p.roi)}%`, tone: p.roi == null ? 'flat' : tone(p.roi) },
    ];
  }
  /* Held and not sold: the result is unknown until the sale, so show how long it has been held
     instead of a "net" that is only the money put in so far. */
  return [
    { label: 'Cost basis', value: money(p.costBasis), tone: 'flat' },
    { label: 'Income', value: p.income > 0 ? money(p.income, true) : '—', tone: p.income > 0 ? 'up' : 'flat' },
    { label: 'Held since', value: p.purchaseDate ? heldSince(p.purchaseDate) : '—', tone: 'flat' },
  ];
}

export function heldSince(date: string): string {
  return new Date(`${date}T12:00:00`).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
}

/** Cumulative net over the trailing months for the card sparkline; empty when nothing moved. */
export function sparklinePoints(monthly: { net: number }[] | undefined): number[] {
  if (!monthly || monthly.length === 0 || monthly.every((m) => m.net === 0)) return [];
  let acc = 0;
  return monthly.map((m) => (acc = cents(acc + m.net)));
}

export function relativeDay(date: string | null | undefined, now = new Date()): string {
  if (!date) return 'No activity yet';
  const d = new Date(`${date}T12:00:00`);
  const days = Math.floor((now.getTime() - d.getTime()) / 86_400_000);
  if (days <= 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 30) return `${days} days ago`;
  if (days < 365) return `${Math.floor(days / 30)} mo ago`;
  return `${Math.floor(days / 365)} yr ago`;
}
