'use client';

import Link from 'next/link';
import Sidebar from '@/components/Sidebar';
import { useNetWorthGoal } from '@/hooks/useNetWorthGoal';
import { useDashboardData } from '@/hooks/useDashboardData';
import { useNetWorthHistory } from '@/hooks/useNetWorthHistory';
import { netWorthBreakdown } from '@/lib/dashboard/derive';
import JourneyStats from './components/JourneyStats';
import NetWorthHistoryChart from './components/NetWorthHistoryChart';
import WealthJourney from './components/WealthJourney';
import NextStepCard from './components/NextStepCard';

function currentMonth() { return new Date().toISOString().slice(0, 7); }

export default function GoalsPage() {
  const { data: goal, loading: goalLoading, error: goalError, setTargetDate } = useNetWorthGoal();
  const { accounts, debts, yearTx, loading: dataLoading, error: dataError } = useDashboardData();
  const history = useNetWorthHistory();
  const breakdown = netWorthBreakdown(accounts, debts, yearTx, currentMonth());

  return (
    <div className="flex h-dvh overflow-hidden">
      <Sidebar />
      <main className="flex-1 overflow-y-auto pt-14 md:pt-0">
        <div className="px-4 sm:px-6 md:px-8 py-6 flex flex-col gap-5 max-w-7xl">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h1 className="font-bold tracking-tight" style={{ fontSize: 'clamp(26px, 3vw, 38px)' }}>Your road to $1,000,000</h1>
              <p className="mt-1" style={{ color: 'var(--color-text-secondary)' }}>See how far you&rsquo;ve come. Keep building what&rsquo;s next.</p>
            </div>
            <Link href="/settings?tab=banks"
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold"
              style={{ background: 'var(--color-elevated)', border: '1px solid var(--color-border)', color: 'var(--color-text-primary)' }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M21 12a9 9 0 1 1-3-6.7L21 8" /><path d="M21 3v5h-5" />
              </svg>
              Update assets
            </Link>
          </div>

          {goalLoading || dataLoading ? (
            <p style={{ color: 'var(--color-text-muted)' }}>Loading…</p>
          ) : !goal ? (
            <p style={{ color: 'var(--color-rose)' }}>{goalError ?? 'Could not load your net worth goal.'}</p>
          ) : (
            <>
              <JourneyStats netWorth={breakdown.total} monthNet={breakdown.monthNet} />
              {dataError && <p className="text-sm" style={{ color: 'var(--color-rose)' }}>{dataError}</p>}
              <NetWorthHistoryChart points={history.points} loading={history.loading} error={history.error} />
              <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_380px] gap-5 items-start">
                <WealthJourney netWorth={breakdown.total} />
                <NextStepCard netWorth={breakdown.total} targetDate={goal.targetDate} onSetTargetDate={setTargetDate} />
              </div>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
