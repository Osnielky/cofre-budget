'use client';

import { useCallback, useEffect, useState } from 'react';
import { MonthlyPanel, type ProjectPerformance } from '../TradingPerformance';
import OverviewStrip from './OverviewStrip';
import MoneyInOutPanel from './MoneyInOutPanel';
import AccountCards from './AccountCards';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3333/api';

export interface TradingSectionProject { id: string; name: string }

/* The trading project's account navigation. Level 1 (no accountId): the overview
   strip, combined monthly P&L, money in & out, and one card per account. Level 2
   (accountId): that account alone — see AccountView (Task 9). Fetches
   /investments/performance once per project and after any change. */
export default function TradingAccountsSection({ project, accountId, onSelectAccount, onProjectChanged, onEditProject, onAddAccount, refreshKey = 0 }: {
  project: TradingSectionProject; accountId: string | null; onSelectAccount: (id: string | null) => void;
  onProjectChanged: () => Promise<void>; onEditProject: () => void; onAddAccount: () => void; refreshKey?: number;
}) {
  const [data, setData] = useState<ProjectPerformance | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const r = await fetch(`${API}/investments/performance?projectId=${encodeURIComponent(project.id)}`, { credentials: 'include' });
      if (!r.ok) throw new Error(`${r.status}`);
      setData(await r.json());
    } catch { setError('Could not load performance'); }
  }, [project.id]);

  useEffect(() => { setData(null); load(); }, [load, refreshKey]);

  // Unknown account id (removed, or a stale link): fall back to the overview.
  // In an effect, never during render — a parent state update mid-render is a React error.
  const current = data && accountId ? data.accounts.find((a) => a.account.id === accountId) ?? null : null;
  useEffect(() => {
    if (data && accountId && !current) onSelectAccount(null);
  }, [data, accountId, current, onSelectAccount]);

  if (error) return <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>{error}.</p>;
  if (!data) return <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>Loading accounts…</p>;

  if (!current) {
    return (
      <section className="flex flex-col gap-4" data-testid="trading-accounts">
        <OverviewStrip o={data.overview} winRate={data.combined.trades.winRate} closed={data.combined.trades.closed} profitFactor={data.combined.trades.profitFactor} />
        {data.combined.byMonth.length > 0 && <MonthlyPanel months={data.combined.byMonth} />}
        <MoneyInOutPanel months={data.overview.byMonth} />
        <AccountCards accounts={data.accounts} unassigned={data.unassigned} onOpen={onSelectAccount} onAdd={onAddAccount} />
      </section>
    );
  }
  return null; // Task 9 renders the account view here
}
