'use client';

import { money, pnlColor, panel, type TradingOverview } from '../TradingPerformance';
import { STATUS_LABEL } from '@/lib/projects/trading';

/* The headline strip of a trading project: what trading made, what the user put
   in and took out across every account, and how many accounts are in each state. */
export default function OverviewStrip({ o, winRate, closed, profitFactor }: { o: TradingOverview; winRate: number | null; closed: number; profitFactor: number | null }) {
  const statuses = (['funded', 'active', 'evaluation', 'failed', 'closed'] as const).filter((s) => o.accountsByStatus[s] > 0);
  const tiles = [
    { label: 'Trading P&L', value: money(o.tradingPnl, true), clr: pnlColor(o.tradingPnl), sub: 'realized + income − fees, every account' },
    { label: 'Money in', value: money(o.moneyIn), clr: 'var(--color-rose)', sub: 'deposits, evaluations, resets' },
    { label: 'Money out', value: money(o.moneyOut), clr: 'var(--color-green)', sub: 'withdrawals and payouts' },
    { label: 'Net in pocket', value: money(o.netInPocket, true), clr: pnlColor(o.netInPocket), sub: 'money out − money in' },
    { label: 'Win rate', value: winRate == null ? '—' : `${winRate}%`, clr: 'var(--color-text-primary)', sub: closed ? `${closed} closed${profitFactor != null ? ` · PF ${profitFactor}` : ''}` : 'no closed trades' },
    { label: 'Accounts', value: statuses.map((s) => `${o.accountsByStatus[s]} ${STATUS_LABEL[s].toLowerCase()}`).join(' · ') || 'none yet', clr: 'var(--color-text-primary)', sub: o.passRate != null ? `${o.passRate}% of evaluations passed` : 'add one below' },
  ];
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-3" data-testid="trading-overview-strip">
      {tiles.map((k) => (
        <div key={k.label} className="p-3 min-w-0" style={panel}>
          <p className="text-fine font-semibold uppercase tracking-wider" style={{ color: 'var(--color-text-muted)' }}>{k.label}</p>
          <p className="font-bold text-base mt-1 truncate" style={{ color: k.clr }}>{k.value}</p>
          <p className="text-fine mt-0.5 truncate" style={{ color: 'var(--color-text-muted)' }}>{k.sub}</p>
        </div>
      ))}
    </div>
  );
}
