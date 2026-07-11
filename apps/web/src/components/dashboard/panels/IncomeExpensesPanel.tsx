'use client';

import { ComposedChart, Bar, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, ReferenceLine } from 'recharts';
import { useThemeColors } from '@/components/ThemeProvider';
import Panel, { Legend, PanelEmpty } from '../Panel';
import { makeChartTheme, fmt } from '../chartTheme';
import type { CashFlowMonth } from '@/lib/dashboard/derive';

const LABELS: Record<string, string> = {
  revPersonal: 'Income', revProject: 'Project income',
  expPersonal: 'Expenses', expProject: 'Project expenses', net: 'Net',
};

const MONTHS_FULL = ['January','February','March','April','May','June','July','August','September','October','November','December'];

/* ── Small stroke icons (24×24 viewBox, house style: see StatCardsRow) ── */
function MiniIcon({ d, size = 16 }: { d: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={d} />
    </svg>
  );
}
const I_TRENDUP   = 'M22 7l-8.5 8.5-5-5L2 17 M16 7h6v6';
const I_BRIEFCASE = 'M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2 M3 9a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z M3 13h18';
const I_WALLET    = 'M21 12V7H5a2 2 0 0 1 0-4h14v4 M3 5v14a2 2 0 0 0 2 2h16v-5 M18 12a2 2 0 0 0 0 4h4v-4Z';
const I_FOLDER    = 'M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z';
const I_CHART     = 'M3 3v16a2 2 0 0 0 2 2h16 M7 14l4-4 3 3 5-6';
const I_BULB      = 'M9 18h6 M10 21h4 M12 3a6 6 0 0 1 3.6 10.8c-.6.5-.6 1.2-.6 2.2h-6c0-1-.02-1.7-.62-2.2A6 6 0 0 1 12 3Z';
const I_BARS_UP   = 'M5 21v-6 M12 21V9 M19 21V3';
const I_BARS_DN   = 'M5 21V3 M12 21V9 M19 21v-6';

function money(n: number) { return `${n < 0 ? '-' : ''}$${fmt(Math.abs(n))}`; }

/* Icon chip: glowing ring in the series color, per the reference design. */
function Chip({ color, d, size = 38 }: { color: string; d: string; size?: number }) {
  return (
    <span className="rounded-full flex items-center justify-center shrink-0"
      style={{
        width: size, height: size, color,
        background: `color-mix(in srgb, ${color} 12%, transparent)`,
        border: `1px solid color-mix(in srgb, ${color} 45%, transparent)`,
        boxShadow: `0 0 12px color-mix(in srgb, ${color} 25%, transparent)`,
      }}>
      <MiniIcon d={d} size={size >= 38 ? 17 : 14} />
    </span>
  );
}

export default function IncomeExpensesPanel({ data, loading }: { data: CashFlowMonth[]; loading: boolean }) {
  const tc = useThemeColors();
  const th = makeChartTheme(tc);
  const sum = (f: (m: CashFlowMonth) => number) => +data.reduce((s, m) => s + f(m), 0).toFixed(2);
  const revPersonal = sum((m) => m.revPersonal), revProject = sum((m) => m.revProject);
  const expPersonal = sum((m) => m.expPersonal), expProject = sum((m) => m.expProject);
  const income = +(revPersonal + revProject).toFixed(2);
  const expenses = +(expPersonal + expProject).toFixed(2);
  const net = +(income - expenses).toFixed(2);
  const months = data.length || 1;
  const empty = !loading && income === 0 && expenses === 0;

  const perMo = (v: number) => `avg ${money(+(v / months).toFixed(2))}/mo`;
  const tiles = [
    { label: 'Total Income',           value: revPersonal, color: tc.green,  icon: I_TRENDUP },
    { label: 'Total Project Income',   value: revProject,  color: tc.sky,    icon: I_BRIEFCASE },
    { label: 'Total Expenses',         value: expPersonal, color: tc.orange, icon: I_WALLET },
    { label: 'Total Project Expenses', value: expProject,  color: tc.amber,  icon: I_FOLDER },
    { label: 'Net Total',              value: net,         color: tc.violet, icon: I_CHART },
  ];

  /* Insight strip: superlative months, derived from the same series. */
  const monthFull = (i: number) => MONTHS_FULL[i] ?? data[i]?.month ?? '';
  const argmax = (f: (m: CashFlowMonth) => number) =>
    data.reduce((best, m, i) => (f(m) > f(data[best]) ? i : best), 0);
  const hiIncomeIdx  = data.length ? argmax((m) => m.revPersonal + m.revProject) : 0;
  const hiExpenseIdx = data.length ? argmax((m) => m.expPersonal + m.expProject) : 0;
  const bestNetIdx   = data.length ? argmax((m) => m.net) : 0;
  const highlights = data.length ? [
    { label: 'Highest Income Month',  color: tc.green,  icon: I_BARS_UP,
      text: `${monthFull(hiIncomeIdx)} – ${money(data[hiIncomeIdx].revPersonal + data[hiIncomeIdx].revProject)}` },
    { label: 'Highest Expense Month', color: tc.orange, icon: I_BARS_DN,
      text: `${monthFull(hiExpenseIdx)} – ${money(data[hiExpenseIdx].expPersonal + data[hiExpenseIdx].expProject)}` },
    { label: 'Best Net Month',        color: tc.violet, icon: I_TRENDUP,
      text: `${monthFull(bestNetIdx)} – ${money(data[bestNetIdx].net)}` },
  ] : [];

  return (
    <Panel colSpan={2} loading={loading}
      title={<><span style={{ color: tc.green }}>Income</span> vs <span style={{ color: tc.orange }}>Expenses</span></>}
      subtitle={`${new Date().getFullYear()} · year to date`}
      legend={<Legend items={[
        { label: 'Income', color: tc.green }, { label: 'Project income', color: tc.sky },
        { label: 'Expenses', color: tc.orange }, { label: 'Project expenses', color: tc.amber },
        { label: 'Net', color: tc.violet, line: true },
      ]} />}>
      {empty ? <PanelEmpty message="No cash-flow activity this year yet." /> : (
        <>
          <p className="text-[10px] font-medium" style={{ color: 'var(--color-text-muted)' }}>Amount (USD)</p>
          <ResponsiveContainer width="100%" height={230}>
            <ComposedChart data={data} barCategoryGap="24%" barGap={2}>
              <defs>
                <linearGradient id="ivxNetFade" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={tc.violet} stopOpacity={0.22} />
                  <stop offset="100%" stopColor={tc.violet} stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid {...th.grid} strokeDasharray="3 6" />
              <XAxis dataKey="month" {...th.xAxis} />
              <YAxis {...th.yAxis} />
              <Tooltip {...th.tooltip}
                formatter={(v: unknown, name: unknown) =>
                  [money(Number(v)), LABELS[String(name)] ?? String(name)]} />
              <ReferenceLine y={0} stroke={tc.border} />
              <Bar dataKey="revPersonal" fill={tc.green}  radius={[3, 3, 0, 0]} />
              <Bar dataKey="revProject"  fill={tc.sky}    radius={[3, 3, 0, 0]} />
              <Bar dataKey="expPersonal" fill={tc.orange} radius={[3, 3, 0, 0]} />
              <Bar dataKey="expProject"  fill={tc.amber}  radius={[3, 3, 0, 0]} />
              <Area type="monotone" dataKey="net" stroke={tc.violet} strokeWidth={2.5}
                fill="url(#ivxNetFade)"
                dot={{ r: 4, fill: tc.violet, stroke: tc.elevated, strokeWidth: 2 }}
                activeDot={{ r: 5, fill: tc.violet, stroke: tc.elevated, strokeWidth: 2 }} />
            </ComposedChart>
          </ResponsiveContainer>

          {/* ── Series totals ── */}
          <div className="grid gap-2.5" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(178px, 1fr))' }}>
            {tiles.map((t) => (
              <div key={t.label} className="flex items-center gap-3 rounded-xl py-2.5 px-3 min-w-0"
                style={{ border: 'var(--glass-border)', background: `color-mix(in srgb, ${t.color} 4%, transparent)` }}>
                <Chip color={t.color} d={t.icon} />
                <div className="min-w-0">
                  <p className="text-[10.5px] truncate" style={{ color: 'var(--color-text-secondary)' }}>{t.label}</p>
                  <p className="text-[14px] font-bold tabular-nums" style={{ color: t.color }}>{money(t.value)}</p>
                  <p className="text-[9.5px] truncate" style={{ color: 'var(--color-text-muted)' }}>{perMo(t.value)}</p>
                </div>
              </div>
            ))}
          </div>

          {/* ── Insight strip ── */}
          <div className="flex flex-wrap items-stretch gap-x-5 gap-y-2.5 rounded-xl py-2.5 px-3.5"
            style={{ border: 'var(--glass-border)', background: 'color-mix(in srgb, var(--color-elevated) 55%, transparent)' }}>
            <div className="flex items-center gap-3 min-w-0 flex-1 basis-64">
              <Chip color={tc.violet} d={I_BULB} size={32} />
              <div className="min-w-0">
                <p className="text-[11px] font-bold">Insight</p>
                <p className="text-[10.5px]" style={{ color: 'var(--color-text-secondary)' }}>
                  {net >= 0 ? <>You&apos;re currently earning <span className="font-bold" style={{ color: tc.green }}>{money(net)}</span> more than you spend.</>
                    : <>You&apos;re currently spending <span className="font-bold" style={{ color: tc.rose }}>{money(-net)}</span> more than you earn.</>}
                </p>
              </div>
            </div>
            {highlights.map((h) => (
              <div key={h.label} className="flex items-center gap-2.5 min-w-0 pl-5"
                style={{ borderLeft: '1px solid var(--color-border)' }}>
                <Chip color={h.color} d={h.icon} size={32} />
                <div className="min-w-0">
                  <p className="text-[10px] truncate" style={{ color: 'var(--color-text-secondary)' }}>{h.label}</p>
                  <p className="text-[12px] font-bold tabular-nums truncate" style={{ color: h.color }}>{h.text}</p>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </Panel>
  );
}
