'use client';

import { useState } from 'react';
import { useThemeColors } from '@/components/ThemeProvider';
import type { NetWorthGoal } from '@/hooks/useNetWorthGoal';
import { money, fmtDate, fmtDateShort, milestoneLabel } from '../format';

const MILESTONE_FRACTIONS = [0.25, 0.5, 0.75, 1];

function Icon({ d }: { d: string }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={d} />
    </svg>
  );
}
const ICON_WALLET = 'M21 12V7H5a2 2 0 0 1 0-4h14v4 M3 5v14a2 2 0 0 0 2 2h16v-5 M18 12a2 2 0 0 0 0 4h4v-4Z';
const ICON_TRENDUP = 'M22 7l-8.5 8.5-5-5L2 17 M16 7h6v6';
const ICON_TRENDDN = 'M22 17l-8.5-8.5-5 5L2 7 M16 17h6v-6';
const ICON_CALENDAR = 'M8 2v4 M16 2v4 M3 10h18 M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z';

function StatChip({ icon, label, value, accent }: { icon: string; label: string; value: string; accent: string }) {
  return (
    <div className="flex items-center gap-3 min-w-0">
      <span className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0"
        style={{ background: `color-mix(in srgb, ${accent} 16%, transparent)`, color: accent }}>
        <Icon d={icon} />
      </span>
      <div className="min-w-0">
        <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>{label}</p>
        <p className="text-lg font-bold tabular-nums truncate">{value}</p>
      </div>
    </div>
  );
}

interface Props {
  data: NetWorthGoal;
  monthNet: number;
  setTargetDate: (targetDate: string | null) => Promise<boolean>;
}

export default function HeroGoalCard({ data, monthNet, setTargetDate }: Props) {
  const tc = useThemeColors();
  const [editingDate, setEditingDate] = useState(false);
  const [dateValue, setDateValue] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const pct = Math.min(100, Math.max(0, (data.current / data.target) * 100));
  const remaining = Math.max(0, data.target - data.current);
  const estDate = data.projectedDate ?? data.targetDate;

  async function saveDate() {
    setSaving(true);
    try {
      const ok = await setTargetDate(dateValue || null);
      if (ok) {
        setSaveError(null);
        setEditingDate(false);
      } else {
        setSaveError("Couldn't save your target date. Please try again.");
      }
    } catch {
      setSaveError("Couldn't save your target date. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="card-lift rounded-2xl p-6 flex flex-col gap-5"
      style={{ background: 'var(--color-surface)', border: 'var(--glass-border)', boxShadow: 'var(--glass-shadow)' }}>
      <div className="flex flex-col gap-3">
        <div className="flex items-baseline gap-2 flex-wrap">
          <p className="text-4xl font-bold tabular-nums">{money(data.current)}</p>
          <span style={{ color: 'var(--color-text-muted)' }}>of {money(data.target)}</span>
        </div>

        <div className="hidden sm:flex justify-between text-[10px] font-semibold px-0.5"
          style={{ color: 'var(--color-text-muted)' }}>
          {MILESTONE_FRACTIONS.map((f) => <span key={f}>{milestoneLabel(data.target * f)}</span>)}
        </div>
        <div className="relative h-3 rounded-full overflow-hidden" style={{ background: 'var(--color-elevated)' }}>
          <div className="h-full rounded-full transition-all"
            style={{ width: `${pct}%`, background: `linear-gradient(90deg, ${tc.sky}, ${tc.green})` }} />
          {MILESTONE_FRACTIONS.slice(0, -1).map((f) => (
            <span key={f} className="absolute top-0 bottom-0 w-px opacity-60"
              style={{ left: `${f * 100}%`, background: 'var(--color-surface)' }} />
          ))}
        </div>
        <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>{pct.toFixed(1)}% of the way there</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 pt-4" style={{ borderTop: '1px solid var(--color-border)' }}>
        <StatChip icon={ICON_WALLET} label="Remaining" value={money(remaining)} accent={tc.sky} />
        <StatChip icon={monthNet >= 0 ? ICON_TRENDUP : ICON_TRENDDN} label="This month"
          value={`${monthNet >= 0 ? '+' : ''}${money(monthNet)}`} accent={monthNet >= 0 ? tc.green : tc.rose} />
        <StatChip icon={ICON_CALENDAR} label="Est. goal date" value={estDate ? fmtDateShort(estDate) : '—'} accent={tc.violet} />
      </div>

      <div className="flex items-center gap-3 flex-wrap pt-1">
        <span className="text-xs uppercase tracking-wider" style={{ color: 'var(--color-text-muted)' }}>Target date</span>
        {editingDate ? (
          <span className="flex items-center gap-2">
            <input type="date" value={dateValue} onChange={(e) => setDateValue(e.target.value)}
              aria-label="Target date"
              className="px-3 py-1.5 text-sm rounded-lg outline-none"
              style={{ background: 'var(--color-elevated)', border: '1px solid var(--color-border)', color: 'var(--color-text-primary)' }} />
            <button onClick={saveDate} disabled={saving} className="text-sm font-semibold cursor-pointer" style={{ color: tc.green }}>Save</button>
            <button onClick={() => { setEditingDate(false); setSaveError(null); }} className="text-sm cursor-pointer" style={{ color: 'var(--color-text-muted)' }}>Cancel</button>
          </span>
        ) : (
          <button onClick={() => { setDateValue(data.targetDate ?? ''); setSaveError(null); setEditingDate(true); }}
            className="text-sm font-semibold underline decoration-dotted underline-offset-2 cursor-pointer">
            {data.targetDate ? fmtDate(data.targetDate) : 'Set a target date'}
          </button>
        )}
      </div>
      {saveError && <p className="text-sm" style={{ color: 'var(--color-rose)' }}>{saveError}</p>}

      {data.targetDate && (
        <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
          {data.onTrackPct == null
            ? 'Just getting started — check back in a few days to see your pace.'
            : data.onTrackPct >= 100
              ? "You're on track to hit $1M by your target date."
              : "You're currently off pace for your target date."}
          {data.projectedDate && ` At this rate, you'll reach $1M around ${fmtDate(data.projectedDate)}.`}
        </p>
      )}
    </div>
  );
}
