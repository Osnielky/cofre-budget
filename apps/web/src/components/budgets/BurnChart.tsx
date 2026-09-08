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
  const overSpend = +(todayActual - totalBudget).toFixed(2);
  const monthLabel = new Date(Number(month.slice(0, 4)), mo - 1)
    .toLocaleString('default', { month: 'long', year: 'numeric' });
  const projectedDelta = +(totalProjected - totalBudget).toFixed(2);
  const ticks = [...new Set([1, 8, 15, today, din].filter((d) => d >= 1 && d <= din))].sort((a, b) => a - b);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <p className="text-base font-bold">Spending pace</p>
          <p className="text-xs mt-0.5" style={{ color: 'var(--color-text-muted)' }}>
            Actual vs. planned spending for {monthLabel}.
          </p>
        </div>
        <div className="min-w-52 flex-1 max-w-sm">
          <p className="text-sm font-bold text-right">
            <span style={{ color: hot > 0 ? 'var(--color-amber)' : 'var(--color-green)' }}>{overallPct}%</span>
            <span style={{ color: 'var(--color-text-secondary)', fontWeight: 500 }}> of budget used</span>
          </p>
          {/* Green → amber → red, with a marker at the current burn. */}
          <div className="relative h-2 rounded-full mt-1.5" style={{
            background: 'linear-gradient(90deg, var(--color-green) 0%, var(--color-amber) 55%, var(--color-rose) 100%)',
          }}>
            <span className="absolute top-1/2 w-0.5 h-3.5 rounded-full"
              style={{ left: `${Math.min(Math.max(overallPct, 0), 100)}%`, transform: 'translate(-50%, -50%)', background: '#FFFFFF' }} />
          </div>
          <p className="text-[11px] mt-1.5 text-right" style={{ color: 'var(--color-text-muted)' }}>
            {overSpend > 0
              ? <span style={{ color: 'var(--color-rose)' }}>{money(overSpend)} over plan</span>
              : <span style={{ color: 'var(--color-green)' }}>{money(Math.abs(overSpend))} under plan</span>}
            {' · '}
            {hot > 0 ? `${hot} points above target` : hot < 0 ? `${Math.abs(hot)} points below target` : 'right on pace'}
          </p>
        </div>
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
        <span className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full" style={{ background: tc.orange }} /> Actual spend
          <span className="tabular-nums" style={{ color: 'var(--color-text-primary)' }}>{money(todayActual)}</span>
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-4 h-0.5 rounded-full" style={{ background: tc.textMuted, opacity: 0.6 }} /> Planned pace
          <span className="tabular-nums" style={{ color: 'var(--color-text-primary)' }}>{money(totalBudget)}</span>
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-4 h-0.5 rounded-full" style={{ background: tc.rose }} />
          Projected — ends {money(Math.abs(projectedDelta))} {projectedDelta >= 0 ? 'over' : 'under'}
        </span>
      </div>
    </div>
  );
}
