'use client';

import Link from 'next/link';
import { useThemeColors } from '@/components/ThemeProvider';
import Panel, { PanelEmpty } from '../Panel';
import { fmt } from '../chartTheme';
import { useNetWorthGoal } from '@/hooks/useNetWorthGoal';

function fmtMonthYear(iso: string) {
  const [y, m] = iso.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
}

export default function NetWorthGoalPanel() {
  const { data, loading } = useNetWorthGoal();
  const tc = useThemeColors();

  const pct = data ? Math.min(100, Math.max(0, (data.current / data.target) * 100)) : 0;

  return (
    <Panel title="Progress to $1M" subtitle="Net worth" loading={loading}>
      {!data ? (
        <PanelEmpty message="Couldn't load your net worth goal." />
      ) : (
        <div className="flex flex-col gap-3">
          <div className="flex items-baseline gap-2">
            <p className="text-2xl font-bold tabular-nums">${fmt(data.current)}</p>
            <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>of $1,000,000</span>
          </div>
          <div className="h-2.5 rounded-full overflow-hidden" style={{ background: 'var(--color-elevated)' }}>
            <div className="h-full rounded-full" style={{ width: `${pct}%`, background: tc.green }} />
          </div>
          <div className="grid grid-cols-3 gap-2 text-center text-xs">
            <div>
              <p className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>Complete</p>
              <p className="font-bold">{pct.toFixed(1)}%</p>
            </div>
            <div>
              <p className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>Target date</p>
              {data.targetDate ? (
                <p className="font-bold">{fmtMonthYear(data.targetDate)}</p>
              ) : (
                <Link href="/goals" className="font-bold underline decoration-dotted underline-offset-2">Set a date</Link>
              )}
            </div>
            <div>
              <p className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>On track</p>
              <p className="font-bold" style={{
                color: data.onTrackPct == null ? 'var(--color-text-muted)' : data.onTrackPct >= 100 ? tc.green : tc.amber,
              }}>
                {data.onTrackPct != null ? `${data.onTrackPct.toFixed(0)}%` : '—'}
              </p>
            </div>
          </div>
          <Link href="/goals" className="text-xs font-semibold text-center underline decoration-dotted underline-offset-2"
            style={{ color: 'var(--color-text-secondary)' }}>
            View details →
          </Link>
        </div>
      )}
    </Panel>
  );
}
