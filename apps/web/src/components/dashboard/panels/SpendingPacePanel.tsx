'use client';

import { useThemeColors } from '@/components/ThemeProvider';
import Panel, { PanelEmpty } from '../Panel';
import { fmt } from '../chartTheme';
import type { PaceStats } from '@/lib/dashboard/derive';

function Ring({ pct, color, label, sub }: { pct: number; color: string; label: string; sub: string }) {
  const R = 34, C = 2 * Math.PI * R;
  const clamped = Math.min(100, Math.max(0, pct));
  return (
    <div className="flex flex-col items-center gap-1">
      <div className="relative w-24 h-24">
        <svg viewBox="0 0 84 84" className="w-full h-full -rotate-90">
          <circle cx="42" cy="42" r={R} fill="none" strokeWidth="7"
            stroke="color-mix(in srgb, currentColor 8%, transparent)" />
          <circle cx="42" cy="42" r={R} fill="none" strokeWidth="7" stroke={color}
            strokeLinecap="round" strokeDasharray={C} strokeDashoffset={C * (1 - clamped / 100)} />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-lg font-bold tabular-nums">{pct.toFixed(0)}%</span>
        </div>
      </div>
      <p className="text-[10px] font-semibold" style={{ color: 'var(--color-text-secondary)' }}>{label}</p>
      <p className="text-[9px] -mt-1" style={{ color: 'var(--color-text-muted)' }}>{sub}</p>
    </div>
  );
}

export default function SpendingPacePanel({ pace, loading }: { pace: PaceStats; loading: boolean }) {
  const tc = useThemeColors();
  if (!loading && !pace.hasBudgets) {
    return (
      <Panel title="Spending Pace" subtitle="This month" loading={loading}>
        <PanelEmpty message="Set budgets to see whether your spending pace will stay under them." />
      </Panel>
    );
  }
  const over = pace.overBy > 0;
  return (
    <Panel title="Spending Pace" subtitle="This month" loading={loading}>
      <div className="flex items-center justify-around">
        <Ring pct={pace.monthPct} color={tc.sky} label="of the month" sub="elapsed" />
        <Ring pct={pace.budgetPct} color={pace.budgetPct > pace.monthPct ? tc.amber : tc.violet} label="of the budget" sub="spent" />
      </div>
      <div className="flex items-start gap-2 rounded-xl p-3 text-xs" style={{ border: 'var(--glass-border)' }}>
        <span aria-hidden="true">{over ? '⚠️' : '✓'}</span>
        <p style={{ color: 'var(--color-text-secondary)' }}>
          At your current pace you&apos;ll {over ? 'exceed' : 'finish under'} your monthly budget by{' '}
          <span className="font-bold" style={{ color: over ? tc.rose : tc.green }}>${fmt(Math.abs(pace.overBy))}</span>.
        </p>
      </div>
    </Panel>
  );
}
