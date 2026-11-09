'use client';

import PageHeader, { HeaderAction } from '@/components/PageHeader';
import { Stagger, StaggerItem } from '@/components/motion/stagger';
import { useNetWorthGoal } from '@/hooks/useNetWorthGoal';
import { useDashboardData } from '@/hooks/useDashboardData';
import { useNetWorthHistory } from '@/hooks/useNetWorthHistory';
import { netWorthBreakdown } from '@/lib/dashboard/derive';
import GoalsHero from './components/GoalsHero';
import NetWorthHistoryChart from './components/NetWorthHistoryChart';
import WealthJourney from './components/WealthJourney';
import NextStepCard from './components/NextStepCard';
import MilestonesCard from './components/MilestonesCard';
import NetWorthMixCard from './components/NetWorthMixCard';

function currentMonth() { return new Date().toISOString().slice(0, 7); }

export default function GoalsPage() {
  const { data: goal, loading: goalLoading, error: goalError, setTargetDate } = useNetWorthGoal();
  const { accounts, debts, yearTx, loading: dataLoading, error: dataError } = useDashboardData();
  const history = useNetWorthHistory();
  const breakdown = netWorthBreakdown(accounts, debts, yearTx, currentMonth());

  return (
    <div className="contents">
      <main className="flex-1 min-w-0 overflow-y-auto pt-14 md:pt-0">
        {/* No width cap: on wide screens the chart row grows a third column (milestones). */}
        <Stagger className="px-4 sm:px-6 md:px-8 2xl:px-10 py-5 sm:py-6 flex flex-col gap-5">
          <StaggerItem>
            <PageHeader title="Your road to $1,000,000" subtitle={<>See how far you&rsquo;ve come. Keep building what&rsquo;s next.</>}
              actions={<HeaderAction href="/settings?tab=banks" label="Update assets"
                icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M21 12a9 9 0 1 1-3-6.7L21 8" /><path d="M21 3v5h-5" /></svg>} />} />
          </StaggerItem>

          {goalLoading || dataLoading ? (
            <div className="flex flex-col gap-5" aria-busy="true">
              <div className="h-56 rounded-3xl animate-pulse" style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }} />
              <div className="h-80 rounded-3xl animate-pulse" style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }} />
            </div>
          ) : !goal ? (
            <p style={{ color: 'var(--color-rose)' }}>{goalError ?? 'Could not load your net worth goal.'}</p>
          ) : (
            <>
              <StaggerItem><GoalsHero netWorth={breakdown.total} monthNet={breakdown.monthNet} /></StaggerItem>
              {dataError && <p className="text-sm" style={{ color: 'var(--color-rose)' }}>{dataError}</p>}
              {/* Two columns from xl, balanced by height: chart + wide net-worth mix on the left,
                  next step + milestones on the right. Stacked below xl. */}
              {/* Below xl the column wrappers dissolve (`contents`) so the cards stack in reading
                  order: chart, next step, mix, milestones. Each cell rises in its turn. */}
              <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_380px] gap-5 items-start">
                <div className="contents xl:flex xl:flex-col xl:gap-5 xl:min-w-0">
                  <StaggerItem className="order-1 xl:order-none min-w-0"><NetWorthHistoryChart points={history.points} loading={history.loading} error={history.error} /></StaggerItem>
                  <StaggerItem className="order-3 xl:order-none min-w-0"><NetWorthMixCard breakdown={breakdown} /></StaggerItem>
                </div>
                <div className="contents xl:flex xl:flex-col xl:gap-5 xl:min-w-0">
                  <StaggerItem className="order-2 xl:order-none min-w-0"><NextStepCard netWorth={breakdown.total} history={history.points} targetDate={goal.targetDate} onSetTargetDate={setTargetDate} /></StaggerItem>
                  <StaggerItem className="order-4 xl:order-none min-w-0"><MilestonesCard netWorth={breakdown.total} history={history.points} /></StaggerItem>
                </div>
              </div>
              <StaggerItem><WealthJourney netWorth={breakdown.total} /></StaggerItem>
            </>
          )}
        </Stagger>
      </main>
    </div>
  );
}
