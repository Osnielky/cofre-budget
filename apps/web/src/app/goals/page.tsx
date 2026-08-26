'use client';

import Sidebar from '@/components/Sidebar';
import { useNetWorthGoal } from '@/hooks/useNetWorthGoal';
import { useDashboardData } from '@/hooks/useDashboardData';
import { netWorthBreakdown, assetMix, netWorthTrend } from '@/lib/dashboard/derive';
import HeroGoalCard from './components/HeroGoalCard';
import AssetMixCard from './components/AssetMixCard';
import MomentumCard from './components/MomentumCard';

function currentMonth() { return new Date().toISOString().slice(0, 7); }

export default function GoalsPage() {
  const { data: goal, loading: goalLoading, error: goalError, setTargetDate } = useNetWorthGoal();
  const { accounts, debts, yearTx, loading: dataLoading, error: dataError } = useDashboardData();

  const loading = goalLoading || dataLoading;
  const breakdown = netWorthBreakdown(accounts, debts, yearTx, currentMonth());
  const mix = assetMix(accounts, debts);
  const trend = netWorthTrend(breakdown.total, yearTx, new Date(), 6);

  return (
    <div className="flex h-dvh overflow-hidden">
      <Sidebar />
      <main className="flex-1 overflow-y-auto pt-14 md:pt-0">
        <div className="px-6 md:px-8 py-6 flex flex-col gap-6 max-w-6xl">
          <div>
            <h1 className="font-bold tracking-tight" style={{ fontSize: 'clamp(28px, 3vw, 40px)' }}>Road to $1,000,000</h1>
            <p className="mt-2" style={{ color: 'var(--color-text-secondary)' }}>Your path to financial freedom</p>
          </div>

          {goalLoading ? (
            <p style={{ color: 'var(--color-text-muted)' }}>Loading…</p>
          ) : !goal ? (
            <p style={{ color: 'var(--color-rose)' }}>{goalError ?? 'Could not load your net worth goal.'}</p>
          ) : (
            <>
              <HeroGoalCard data={goal} monthNet={breakdown.monthNet} setTargetDate={setTargetDate} />

              {dataError && <p className="text-sm" style={{ color: 'var(--color-rose)' }}>{dataError}</p>}

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
                <AssetMixCard groups={mix} total={breakdown.assets} loading={loading} />
                <MomentumCard monthNet={breakdown.monthNet} trend={trend} onTrackPct={goal.onTrackPct} loading={loading} />
              </div>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
