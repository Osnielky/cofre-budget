'use client';

import { useId } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, ReferenceLine, LabelList } from 'recharts';
import { useThemeColors } from '@/components/ThemeProvider';
import Panel, { PanelEmpty } from '../Panel';
import { makeChartTheme } from '../chartTheme';
import type { CategoryMonth, TrendGroup } from '@/lib/dashboard/derive';

const money = (n: number) => `$${Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const whole = (n: number) => `$${Math.round(n).toLocaleString('en-US')}`;

const I_WALLET = 'M3 7h15a3 3 0 0 1 3 3v7a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3V7Z M3 7l12-3v3 M16 13.5h.01';
const I_BARS   = 'M5 20V11 M12 20V5 M19 20v-7';
const I_CROWN  = 'M3 8l4 4 5-7 5 7 4-4-2 11H5L3 8Z';
const I_TARGET = 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z M12 12h.01';

function Chip({ color, d, size = 36, children }: { color: string; d?: string; size?: number; children?: React.ReactNode }) {
  return (
    <span className="rounded-xl inline-flex items-center justify-center shrink-0"
      style={{
        width: size, height: size, color,
        background: `color-mix(in srgb, ${color} 14%, transparent)`,
        border: `1px solid color-mix(in srgb, ${color} 35%, transparent)`,
      }}>
      {d ? (
        <svg width={size * 0.5} height={size * 0.5} viewBox="0 0 24 24" fill="none" stroke="currentColor"
          strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={d} /></svg>
      ) : children}
    </span>
  );
}

/** Rounded label pill drawn just right of the plot, at a reference line's height. */
function LinePill({ viewBox, text, color, below }: { viewBox?: { x: number; y: number; width: number }; text: string; color: string; below?: boolean }) {
  if (!viewBox) return null;
  const w = text.length * 6.2 + 18;
  const x = viewBox.x + viewBox.width + 6;
  const y = below ? viewBox.y + 3 : viewBox.y - 21;
  return (
    <g>
      <rect x={x} y={y} width={w} height={18} rx={9} fill={`color-mix(in srgb, ${color} 22%, var(--color-elevated))`} stroke={color} strokeOpacity={0.5} />
      <text x={x + w / 2} y={y + 12.5} textAnchor="middle" fontSize={10.5} fontWeight={700} fill={color}>{text}</text>
    </g>
  );
}

/** One category's spend month by month, with its average and (if set) its budget. */
export default function CategoryTrendPanel({ groups, selectedId, onSelect, data, budget, loading }: {
  groups: TrendGroup[];
  selectedId: string;
  onSelect: (id: string) => void;
  data: CategoryMonth[];
  budget: number | null;
  loading: boolean;
}) {
  const tc = useThemeColors();
  const th = makeChartTheme(tc);
  const gid = useId().replace(/:/g, '');
  const group = groups.find((g) => g.options.some((o) => o.id === selectedId));
  const selected = group?.options.find((o) => o.id === selectedId);
  const project = group?.project ?? null;
  const budgetAmt = budget != null && budget > 0 ? budget : null;

  // The current month is still in progress, so the average uses completed months only.
  const current = data.at(-1);
  const completed = data.slice(0, -1);
  const active = completed.filter((m) => m.value > 0);
  const avg = active.length ? active.reduce((s, m) => s + m.value, 0) / active.length : 0;
  const last = completed.at(-1);
  const delta = last && last.value > 0 && current ? +(((current.value - last.value) / last.value) * 100).toFixed(1) : null;
  const peak = data.reduce<CategoryMonth | undefined>((best, m) => (m.value > 0 && (!best || m.value > best.value) ? m : best), undefined);

  // Red marks a month over budget; with no budget to compare against, it marks the peak.
  const isHot = (m: CategoryMonth) => (budgetAmt != null ? m.value > budgetAmt : m.key === peak?.key);

  const left = budgetAmt != null && current ? budgetAmt - current.value : null;
  const stats = [
    {
      label: 'This month', icon: I_WALLET, color: tc.green,
      value: current ? money(current.value) : '—',
      sub: delta != null ? `${delta > 0 ? '▲' : '▼'} ${Math.abs(delta)}% vs ${last?.month}` : 'so far',
      subColor: delta == null ? undefined : delta > 0 ? tc.rose : tc.green,
    },
    {
      label: 'Monthly avg', icon: I_BARS, color: tc.sky,
      value: avg > 0 ? money(avg) : '—',
      sub: `${active.length} completed month${active.length === 1 ? '' : 's'}`,
    },
    {
      label: 'Peak month', icon: I_CROWN, color: tc.rose,
      value: peak ? money(peak.value) : '—',
      sub: peak ? peak.month : 'no spending yet',
    },
    {
      label: 'Budget', icon: I_TARGET, color: tc.amber,
      value: budgetAmt != null ? money(budgetAmt) : '—',
      sub: left == null || budgetAmt == null ? (project ? 'budgets are personal' : 'no budget set')
        : left >= 0 ? `${money(left)} left (${Math.round((left / budgetAmt) * 100)}%)`
        : `${money(-left)} over`,
      subColor: left != null && left < 0 ? tc.rose : undefined,
    },
  ];

  const accent = project?.color ?? selected?.color ?? tc.green;

  const picker = groups.length > 0 && (
    <select value={selectedId} onChange={(e) => onSelect(e.target.value)} aria-label="Category"
      className="px-3 py-2 rounded-xl text-[12.5px] font-semibold outline-none cursor-pointer max-w-full sm:max-w-64"
      style={{ background: 'var(--color-elevated)', border: '1px solid var(--color-border)', color: 'var(--color-text-primary)' }}>
      {groups.map((g) => (
        <optgroup key={g.project?.id ?? 'personal'} label={g.project ? `📁 ${g.project.name}` : 'Personal'}>
          {g.options.map((o) => <option key={o.id} value={o.id}>{o.icon} {o.name}</option>)}
        </optgroup>
      ))}
    </select>
  );

  const title = (
    <span className="inline-flex items-center gap-3 flex-wrap">
      <Chip color={accent} size={40}><span className="text-lg leading-none">{selected?.icon ?? '📊'}</span></Chip>
      <span>Category Trend</span>
      {project && (
        <span className="text-[10.5px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full"
          style={{ color: project.color, background: `color-mix(in srgb, ${project.color} 14%, transparent)`, border: `1px solid color-mix(in srgb, ${project.color} 40%, transparent)` }}>
          Project
        </span>
      )}
    </span>
  );
  const subtitle = selected
    ? project ? `${selected.name} · ${project.icon} ${project.name} · year to date` : `${selected.name} · year to date`
    : 'Year to date';

  /* Value label above each bar; months with no spending get none (their dot speaks). */
  const renderLabel = (props: { x?: number | string; y?: number | string; width?: number | string; index?: number }) => {
    const m = data[props.index ?? -1];
    if (!m || m.value <= 0) return null;
    // Thin bars (phone widths) only keep the labels that matter: the peak and this month.
    if (Number(props.width) < 30 && m.key !== peak?.key && m.key !== current?.key) return null;
    const x = Number(props.x) + Number(props.width) / 2;
    const y = Number(props.y) - 8;
    const color = isHot(m) ? tc.rose : tc.green;
    return (
      <g>
        {m.key === peak?.key && (
          <g stroke={color} strokeWidth={1.6} strokeLinecap="round">
            <line x1={x} y1={y - 22} x2={x} y2={y - 17} />
            <line x1={x - 9} y1={y - 19} x2={x - 6} y2={y - 15} />
            <line x1={x + 9} y1={y - 19} x2={x + 6} y2={y - 15} />
          </g>
        )}
        <text x={x} y={y} textAnchor="middle" fontSize={11} fontWeight={700} fill={color}>{whole(m.value)}</text>
      </g>
    );
  };

  /* Bars: green gradient, red when hot; a muted dot on the baseline for empty months. */
  const renderBar = (props: unknown) => {
    const { x, y, width, height, index } = props as { x: number; y: number; width: number; height: number; index: number };
    const m = data[index];
    if (!m || m.value <= 0) {
      return <circle cx={x + width / 2} cy={y + height - 1} r={4} fill={tc.textMuted} fillOpacity={0.7} />;
    }
    const r = Math.min(8, width / 2, height);
    return (
      <path fill={`url(#${gid}-${isHot(m) ? 'hot' : 'ok'})`}
        d={`M${x},${y + height} V${y + r} Q${x},${y} ${x + r},${y} H${x + width - r} Q${x + width},${y} ${x + width},${y + r} V${y + height} Z`} />
    );
  };

  const legend = [
    { label: 'Spent', sub: 'Monthly spending', swatch: <span className="block w-3.5 h-3.5 rounded-full" style={{ background: tc.green }} /> },
    { label: 'Budget', sub: budgetAmt != null ? `Monthly budget (${whole(budgetAmt)})` : 'No budget set', swatch: <span className="block w-6" style={{ borderTop: `2px dashed ${tc.amber}` }} /> },
    { label: 'Average', sub: avg > 0 ? `Average monthly spend (${money(avg)})` : 'Needs a completed month', swatch: <span className="block w-6" style={{ borderTop: `2px dashed ${tc.sky}` }} /> },
    { label: 'No data', sub: 'No spending this month', swatch: <span className="block w-3 h-3 rounded-full" style={{ background: tc.textMuted }} /> },
  ];

  return (
    <Panel colSpan={2} title={title} subtitle={subtitle} legend={picker || undefined} loading={loading}>
      {groups.length === 0 ? <PanelEmpty message="No spending this year yet." /> : (
        <div className="@container flex flex-col gap-4 flex-1">
          <div className="grid grid-cols-2 @3xl:grid-cols-4 gap-2.5">
            {stats.map((s) => (
              <div key={s.label} className="rounded-xl p-3 flex items-center gap-3 min-w-0"
                style={{ border: `1px solid color-mix(in srgb, ${s.color} 28%, transparent)`, background: `color-mix(in srgb, ${s.color} 6%, transparent)` }}>
                <span className="hidden @md:inline-flex"><Chip color={s.color} d={s.icon} /></span>
                <div className="min-w-0">
                  <p className="text-[10.5px] truncate" style={{ color: 'var(--color-text-secondary)' }}>{s.label}</p>
                  <p className="text-[15px] font-bold tabular-nums truncate" style={{ color: 'var(--color-text-primary)' }}>{s.value}</p>
                  <p className="text-[10px] font-semibold truncate" style={{ color: s.subColor ?? 'var(--color-text-muted)' }}>{s.sub}</p>
                </div>
              </div>
            ))}
          </div>

          <div className="flex-1 min-h-56 rounded-xl pt-2 pb-1 pl-1" style={{ border: 'var(--glass-border)' }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data} margin={{ top: 34, right: budgetAmt != null || avg > 0 ? 104 : 12, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id={`${gid}-ok`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={tc.green} stopOpacity={0.95} />
                    <stop offset="100%" stopColor={tc.green} stopOpacity={0.45} />
                  </linearGradient>
                  <linearGradient id={`${gid}-hot`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={tc.rose} stopOpacity={0.95} />
                    <stop offset="100%" stopColor={tc.rose} stopOpacity={0.4} />
                  </linearGradient>
                </defs>
                <CartesianGrid {...th.grid} strokeDasharray="3 6" />
                <XAxis dataKey="month" {...th.xAxis} />
                <YAxis {...th.yAxis} />
                <Tooltip {...th.tooltip} formatter={(v: unknown) => [money(Number(v)), selected?.name ?? 'Spent']} />
                <Bar dataKey="value" maxBarSize={44} shape={renderBar} isAnimationActive={false}>
                  <LabelList dataKey="value" content={renderLabel} />
                </Bar>
                {budgetAmt != null && (
                  <ReferenceLine y={budgetAmt} stroke={tc.amber} strokeWidth={1.5} strokeDasharray="7 5" ifOverflow="extendDomain"
                    label={<LinePill text={`Budget ${whole(budgetAmt)}`} color={tc.amber} />} />
                )}
                {avg > 0 && (
                  <ReferenceLine y={avg} stroke={tc.sky} strokeWidth={1.5} strokeDasharray="7 5"
                    label={<LinePill text={`Avg ${whole(avg)}`} color={tc.sky} below />} />
                )}
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="grid grid-cols-2 @3xl:grid-cols-4 gap-3">
            {legend.map((l) => (
              <div key={l.label} className="flex items-start gap-2.5 min-w-0">
                <span className="mt-1.5 shrink-0 w-6 flex items-center justify-center">{l.swatch}</span>
                <div className="min-w-0">
                  <p className="text-[12px] font-semibold" style={{ color: 'var(--color-text-primary)' }}>{l.label}</p>
                  <p className="text-[10.5px] truncate" style={{ color: 'var(--color-text-muted)' }}>{l.sub}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </Panel>
  );
}
