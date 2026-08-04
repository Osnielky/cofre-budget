'use client';

import { ComposedChart, Area, Line, XAxis, YAxis, ReferenceLine, ResponsiveContainer, Tooltip } from 'recharts';
import { useThemeColors } from '@/components/ThemeProvider';
import { makeChartTheme, fmtAxis } from '@/components/dashboard/chartTheme';
import { daysInMonth, dayOfMonth, elapsedPct } from '@/lib/budgets/derive';
import type { BurnPoint } from '@/lib/budgets/derive';

function fmt(n: number) { return Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2 }); }
function money(n: number) { return `${n < 0 ? '−' : ''}$${fmt(n)}`; }
const MONTHS_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

interface BurnChartProps {
  month: string; now: Date;
  series: BurnPoint[];
  totalBudget: number;
  overallPct: number;
  totalProjected: number;
}

export default function BurnChart({ month, now, series, totalBudget, overallPct, totalProjected }: BurnChartProps) {
  const tc = useThemeColors();
  const th = makeChartTheme(tc);
  const din = daysInMonth(month);
  const today = dayOfMonth(month, now);
  const [, mo] = month.split('-').map(Number);
  const monthName = MONTHS_SHORT[mo - 1];
  const elapsed = elapsedPct(month, now);
  const todayActual = series.length ? series[series.length - 1].cumulative : 0;

  const data = Array.from({ length: din }, (_, i) => {
    const day = i + 1;
    const point = series.find((p) => p.day === day);
    const evenPace = +((totalBudget * day) / din).toFixed(2);
    let projected: number | undefined;
    if (day === today) projected = todayActual;
    else if (day > today && today > 0) {
      const span = din - today;
      projected = span > 0 ? +(todayActual + ((totalProjected - todayActual) * (day - today)) / span).toFixed(2) : undefined;
    }
    return { day, actual: point?.cumulative, evenPace, projected };
  });

  const hot = Math.round(overallPct - elapsed);
  const projectedDelta = +(totalProjected - totalBudget).toFixed(2);
  const ticks = [...new Set([1, 8, 15, today, din].filter((d) => d >= 1 && d <= din))].sort((a, b) => a - b);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between flex-wrap gap-1">
        <p className="text-sm font-semibold">Burn against the month</p>
        <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
          {elapsed}% of {monthName} gone,{' '}
          <span style={{ color: hot > 0 ? 'var(--color-amber)' : 'var(--color-green)', fontWeight: 700 }}>{overallPct}% of the budget used</span>
          {' — '}{hot > 0 ? `running ${hot} points hot` : hot < 0 ? `running ${Math.abs(hot)} points under pace` : 'right on pace'}
        </p>
      </div>

      <ResponsiveContainer width="100%" height={190}>
        <ComposedChart data={data} margin={{ top: 4, right: 8, left: -8, bottom: 0 }}>
          <defs>
            <linearGradient id="burnFade" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={tc.orange} stopOpacity={0.28} />
              <stop offset="95%" stopColor={tc.orange} stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <XAxis dataKey="day" type="number" domain={[1, din]} ticks={ticks} {...th.xAxis}
            tickFormatter={(d: number) => d === today ? 'today' : `${monthName} ${d}`} />
          <YAxis {...th.yAxis} tickFormatter={fmtAxis} />
          <Tooltip {...th.tooltip}
            labelFormatter={(d: unknown) => `${monthName} ${d}`}
            formatter={(v: unknown, name: unknown) => [
              v == null ? '—' : money(Number(v)),
              name === 'actual' ? 'Actual spend' : name === 'evenPace' ? 'Even pace' : 'Projected',
            ]} />
          <ReferenceLine x={today} stroke={tc.border}
            label={{ value: 'today', position: 'insideTopRight', fill: tc.textMuted, fontSize: 10, fontWeight: 700 }} />
          <Line dataKey="evenPace" stroke={tc.textMuted} strokeWidth={1.5} strokeDasharray="3 5" dot={false} isAnimationActive={false} />
          <Line dataKey="projected" stroke={tc.rose} strokeWidth={1.5} strokeDasharray="3 5" dot={false} connectNulls={false} isAnimationActive={false} />
          <Area dataKey="actual" stroke={tc.orange} strokeWidth={2.5} fill="url(#burnFade)" dot={false} connectNulls={false} />
        </ComposedChart>
      </ResponsiveContainer>

      <div className="flex items-center gap-4 flex-wrap text-[10.5px] font-semibold" style={{ color: 'var(--color-text-secondary)' }}>
        <span className="flex items-center gap-1.5"><span className="w-4 h-0.5 rounded-full" style={{ background: tc.orange }} /> Actual spend</span>
        <span className="flex items-center gap-1.5"><span className="w-4 h-0.5 rounded-full" style={{ background: tc.textMuted, opacity: 0.6 }} /> Even pace</span>
        <span className="flex items-center gap-1.5">
          <span className="w-4 h-0.5 rounded-full" style={{ background: tc.rose }} />
          Projected — ends {money(Math.abs(projectedDelta))} {projectedDelta >= 0 ? 'over' : 'under'}
        </span>
      </div>
    </div>
  );
}
