'use client';

import { useState } from 'react';

import Sidebar from '@/components/Sidebar';
import { useNetWorthGoal } from '@/hooks/useNetWorthGoal';
import { useDashboardData } from '@/hooks/useDashboardData';
import { netWorthBreakdown, assetMix, netWorthTrend } from '@/lib/dashboard/derive';
import AssetMixCard from './components/AssetMixCard';
import MomentumCard from './components/MomentumCard';
import WealthJourney from './components/WealthJourney';
import JourneyStats from './components/JourneyStats';
import NextMove, { type MoveItem } from './components/NextMove';

function currentMonth() { return new Date().toISOString().slice(0, 7); }

export default function GoalsPage() {
  const { data: goal, loading: goalLoading, error: goalError, setTargetDate } = useNetWorthGoal();
  const { accounts, debts, yearTx, loading: dataLoading, error: dataError } = useDashboardData();

  const [planOpen, setPlanOpen] = useState(false);
  const loading = goalLoading || dataLoading;
  const breakdown = netWorthBreakdown(accounts, debts, yearTx, currentMonth());
  const mix = assetMix(accounts, debts);
  const trend = netWorthTrend(breakdown.total, yearTx, new Date(), 6);

  // Each step is derived from real state, so the list reflects what is actually
  // outstanding rather than a fixed checklist.
  const negativeAccount = accounts.find((a) => Number(a.balance) < 0);
  const moves: MoveItem[] = [
    { label: "Review this month's spending", done: breakdown.monthNet >= 0, action: { label: 'Review', href: '/transactions' } },
    { label: 'Set your monthly savings plan', done: !!goal?.targetDate, action: { label: 'Set amount', href: '/budgets' } },
    ...(negativeAccount
      ? [{ label: `Check your negative ${negativeAccount.accountName} balance`, done: false, warn: true, action: { label: 'Review', href: '/dashboard' } }]
      : []),
  ];

  return (
    <div className="flex h-dvh overflow-hidden">
      <Sidebar />
      <main className="flex-1 overflow-y-auto pt-14 md:pt-0">
        <div className="px-6 md:px-8 py-6 flex flex-col gap-5 max-w-7xl">
          <div>
            <h1 className="font-bold tracking-tight" style={{ fontSize: 'clamp(26px, 3vw, 38px)' }}>Your road to $1,000,000</h1>
            <p className="mt-1" style={{ color: 'var(--color-text-secondary)' }}>Build your wealth. One level at a time.</p>
          </div>

          {goalLoading ? (
            <p style={{ color: 'var(--color-text-muted)' }}>Loading…</p>
          ) : !goal ? (
            <p style={{ color: 'var(--color-rose)' }}>{goalError ?? 'Could not load your net worth goal.'}</p>
          ) : (
            <>
              <JourneyStats netWorth={breakdown.total} monthNet={breakdown.monthNet} />

              <WealthJourney netWorth={breakdown.total} />

              {dataError && <p className="text-sm" style={{ color: 'var(--color-rose)' }}>{dataError}</p>}

              <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-5 items-start">
                <MomentumCard monthNet={breakdown.monthNet} trend={trend} onTrackPct={goal.onTrackPct} loading={loading} />
                <NextMove netWorth={breakdown.total} items={moves}
                  onPlan={() => setPlanOpen((o) => !o)}
                  planNote={goal.targetDate
                    ? `Target date ${new Date(`${goal.targetDate}T00:00:00`).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}`
                    : 'Add a target date to explore your timeline.'}
                  plan={planOpen ? (
                    <div className="flex items-center gap-2">
                      <input type="date" defaultValue={goal.targetDate ?? ''} aria-label="Target date"
                        onChange={(e) => { if (e.target.value) { setTargetDate(e.target.value); setPlanOpen(false); } }}
                        className="flex-1 min-w-0 px-3 py-2 rounded-xl text-sm outline-none"
                        style={{ background: 'var(--color-elevated)', border: '1px solid var(--color-border)', color: 'var(--color-text-primary)', colorScheme: 'dark' }} />
                    </div>
                  ) : null} />
              </div>

              <AssetMixCard groups={mix} total={breakdown.assets} loading={loading} />
            </>
          )}
        </div>
      </main>
    </div>
  );
}
