'use client';

import StatTile from '@/components/StatTile';
import { money, pnlColor, type TradingOverview } from '../TradingPerformance';
import { STATUS_LABEL } from '@/lib/projects/trading';

/* The headline strip of a trading project: what trading made, what the user put
   in and took out across every account, and how many accounts are in each state.
   Shared StatTile in its small, inset tone — the strip sits inside the project card. */
export default function OverviewStrip({ o, winRate, closed, profitFactor }: { o: TradingOverview; winRate: number | null; closed: number; profitFactor: number | null }) {
  const statuses = (['funded', 'active', 'evaluation', 'failed', 'closed'] as const).filter((s) => o.accountsByStatus[s] > 0);
  const tiles = [
    { label: 'Trading P&L', value: money(o.tradingPnl, true), clr: pnlColor(o.tradingPnl), sub: 'realized + income − fees, every account' },
    { label: 'Money in', value: money(o.moneyIn), clr: 'var(--color-rose)', sub: 'deposits, evaluations, resets' },
    { label: 'Money out', value: money(o.moneyOut), clr: 'var(--color-green)', sub: 'withdrawals and payouts' },
    { label: 'Net in pocket', value: money(o.netInPocket, true), clr: pnlColor(o.netInPocket), sub: 'money out − money in' },
    { label: 'Win rate', value: winRate == null ? '—' : `${winRate}%`, clr: undefined, sub: closed ? `${closed} closed${profitFactor != null ? ` · PF ${profitFactor}` : ''}` : 'no closed trades' },
    { label: 'Accounts', value: statuses.map((s) => `${o.accountsByStatus[s]} ${STATUS_LABEL[s].toLowerCase()}`).join(' · ') || 'none yet', clr: undefined, sub: o.passRate != null ? `${o.passRate}% of evaluations passed` : 'add one below' },
  ];
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-2.5 sm:gap-3" data-testid="trading-overview-strip">
      {tiles.map((k) => <StatTile key={k.label} size="sm" tone="inset" label={k.label} value={k.value} valueTone={k.clr} sub={k.sub} />)}
    </div>
  );
}
