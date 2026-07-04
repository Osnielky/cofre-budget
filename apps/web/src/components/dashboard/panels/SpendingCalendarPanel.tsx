'use client';

import { useState } from 'react';
import { useThemeColors } from '@/components/ThemeProvider';
import Panel, { PanelEmpty } from '../Panel';
import { fmt } from '../chartTheme';
import type { CalendarCell } from '@/lib/dashboard/derive';

const DOW = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const RAMP_ALPHA = [0, 0.18, 0.38, 0.62, 0.9]; // intensity 0..4 → sky opacity

export default function SpendingCalendarPanel({ cells, monthLabel, loading }: {
  cells: CalendarCell[]; monthLabel: string; loading: boolean;
}) {
  const tc = useThemeColors();
  const [hover, setHover] = useState<CalendarCell | null>(null);
  const empty = !loading && cells.every((c) => c.total === 0);
  return (
    <Panel title="Daily Spending" subtitle={monthLabel} loading={loading}>
      {empty ? <PanelEmpty message="No spending recorded this month." /> : (
        <div className="flex flex-col gap-2">
          <div className="grid grid-cols-7 gap-1 text-center">
            {DOW.map((d, i) => (
              <span key={i} className="text-[9px] font-semibold" style={{ color: 'var(--color-text-muted)' }}>{d}</span>
            ))}
            {cells.map((c, i) => (
              <div key={i}
                onMouseEnter={() => c.day && setHover(c)} onMouseLeave={() => setHover(null)}
                className="aspect-square rounded-md flex items-center justify-center text-[9px] font-medium"
                style={c.day == null ? { opacity: 0 } : {
                  background: c.intensity === 0
                    ? 'color-mix(in srgb, currentColor 4%, transparent)'
                    : `color-mix(in srgb, ${tc.sky} ${RAMP_ALPHA[c.intensity] * 100}%, transparent)`,
                  color: c.intensity >= 3 ? '#0B1020' : 'var(--color-text-secondary)',
                  cursor: c.total > 0 ? 'default' : undefined,
                }}>
                {c.day ?? ''}
              </div>
            ))}
          </div>
          <p className="text-[10px] text-center h-4" style={{ color: 'var(--color-text-muted)' }}>
            {hover && hover.day != null
              ? `${monthLabel.split(' ')[0]} ${hover.day} — $${fmt(hover.total)}`
              : 'Darker = more spent · hover a day'}
          </p>
        </div>
      )}
    </Panel>
  );
}
