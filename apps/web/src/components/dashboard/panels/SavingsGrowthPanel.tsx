'use client';

import { useState } from 'react';
import { ComposedChart, Area, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, ReferenceLine } from 'recharts';
import { useThemeColors } from '@/components/ThemeProvider';
import Panel, { Legend, PanelEmpty } from '../Panel';
import { makeChartTheme, fmt } from '../chartTheme';
import type { SavingsStats } from '@/lib/dashboard/derive';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3333/api';

export default function SavingsGrowthPanel({ stats, loading, onGoalSaved }: {
  stats: SavingsStats; loading: boolean; onGoalSaved: () => void;
}) {
  const tc = useThemeColors();
  const th = makeChartTheme(tc);
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState('');
  const [saving, setSaving] = useState(false);

  async function saveGoal() {
    const n = Number(value);
    if (!Number.isFinite(n) || n < 0) return;
    setSaving(true);
    try {
      await fetch(`${API}/auth/profile`, {
        method: 'PATCH', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ savingsGoal: n }),
      });
      setEditing(false);
      onGoalSaved();
    } finally { setSaving(false); }
  }

  const hasData = stats.points.some((p) => p.actual !== 0);
  return (
    <Panel title="Savings Growth" subtitle="This year" loading={loading}
      legend={<Legend items={[
        { label: 'Actual', color: tc.green, line: true },
        ...(stats.goal != null ? [{ label: 'Goal', color: tc.textMuted, line: true }] : []),
      ]} />}>
      {!hasData ? <PanelEmpty message="Savings build up here as your monthly income exceeds expenses." /> : (
        <>
          <ResponsiveContainer width="100%" height={150}>
            <ComposedChart data={stats.points}>
              <CartesianGrid {...th.grid} />
              <XAxis dataKey="month" {...th.xAxis} />
              <YAxis {...th.yAxis} />
              <Tooltip {...th.tooltip}
                formatter={(v: unknown, name: unknown) => {
                  const n = Number(v);
                  return [`${n < 0 ? '-' : ''}$${fmt(Math.abs(n))}`, name === 'actual' ? 'Saved' : 'Goal pace'];
                }} />
              <ReferenceLine y={0} stroke={tc.border} />
              <Area type="monotone" dataKey="actual" stroke={tc.green} strokeWidth={2}
                fill={`color-mix(in srgb, ${tc.green} 14%, transparent)`} dot={{ fill: tc.green, r: 2.5, strokeWidth: 0 }} />
              {stats.goal != null && (
                <Line type="monotone" dataKey="goal" stroke={tc.textMuted} strokeWidth={1.5} strokeDasharray="5 4" dot={false} />
              )}
            </ComposedChart>
          </ResponsiveContainer>
          <div className="grid grid-cols-3 gap-2 text-center text-xs">
            <div>
              <p className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>Saved</p>
              <p className="font-bold" style={{ color: stats.current >= 0 ? tc.green : tc.rose }}>
                {stats.current < 0 ? '-' : ''}${fmt(Math.abs(stats.current))}
              </p>
            </div>
            <div>
              <p className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>Goal</p>
              {editing ? (
                <span className="flex items-center gap-1 justify-center">
                  <input autoFocus value={value} onChange={(e) => setValue(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && saveGoal()}
                    className="w-16 px-1 py-0.5 rounded text-xs bg-transparent text-center"
                    style={{ border: 'var(--glass-border)' }} placeholder="15000" inputMode="decimal" />
                  <button onClick={saveGoal} disabled={saving} className="font-bold" style={{ color: tc.green }}>✓</button>
                </span>
              ) : (
                <button className="font-bold underline decoration-dotted underline-offset-2"
                  onClick={() => { setValue(stats.goal != null ? String(stats.goal) : ''); setEditing(true); }}>
                  {stats.goal != null ? `$${fmt(stats.goal)}` : 'Set a goal'}
                </button>
              )}
            </div>
            <div>
              <p className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>On track</p>
              <p className="font-bold" style={{ color: (stats.onTrackPct ?? 0) >= 100 ? tc.green : tc.amber }}>
                {stats.onTrackPct != null ? `${stats.onTrackPct.toFixed(0)}%` : '—'}
              </p>
            </div>
          </div>
        </>
      )}
    </Panel>
  );
}
