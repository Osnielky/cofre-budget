'use client';

import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { useThemeColors } from '@/components/ThemeProvider';
import Panel, { PanelEmpty, Legend } from '@/components/dashboard/Panel';
import { makeChartTheme } from '@/components/dashboard/chartTheme';
import { useAdminTraffic } from '@/hooks/useAdmin';
import { Row } from './AdminStatTiles';

const glass: React.CSSProperties = {
  background: 'var(--color-surface)', backdropFilter: 'var(--glass-blur)', WebkitBackdropFilter: 'var(--glass-blur)',
  border: 'var(--glass-border)', boxShadow: 'var(--glass-shadow)',
};
const day = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
const pct = (n: number, of: number) => (of > 0 ? ` (${Math.round((n / of) * 100)}%)` : '');

/** Who visits: page views and daily unique visitors, where they come from, what they open, and the demo funnel. */
export default function TrafficPanel({ refreshKey }: { refreshKey: number }) {
  const { data: t, error } = useAdminTraffic(refreshKey);
  const tc = useThemeColors();
  const th = makeChartTheme(tc);

  if (error) {
    return <p className="text-sm" style={{ color: 'var(--color-rose)' }}>{error}</p>;
  }
  if (!t) return <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>Loading traffic…</p>;

  const tiles = [
    { label: 'Visitors today', value: t.visitors.today, sub: `${t.visits.today} page views` },
    { label: 'Visitors (7 days)', value: t.visitors.d7, sub: `${t.visits.d7} page views` },
    { label: 'Visitors (30 days)', value: t.visitors.d30, sub: `${t.visits.d30} page views` },
    { label: 'Demo starts (30 days)', value: t.funnel.demoStarts, sub: `${t.funnel.landingVisitors} landing visitors` },
    { label: 'Signups (30 days)', value: t.funnel.signups, sub: `vs ${t.funnel.landingVisitors.toLocaleString()} landing visitors` },
  ];
  const chart = t.daily.map((d) => ({ ...d, label: day(d.date) }));
  const total30 = t.split.anonymous + t.split.signedIn + t.split.demo;

  return (
    <section aria-labelledby="traffic-heading" className="flex flex-col gap-5">
      <div className="flex items-baseline justify-between gap-3 flex-wrap">
        <h2 id="traffic-heading" className="text-lg font-semibold">Traffic</h2>
        <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
          Counted by Cofre itself, no cookies. A visitor is one browser per day; kept {t.retentionDays} days.
        </p>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 gap-4">
        {tiles.map((x) => (
          <div key={x.label} className="card-lift rounded-2xl p-5 min-w-0" style={glass}>
            <p className="text-xs truncate" style={{ color: 'var(--color-text-secondary)' }}>{x.label}</p>
            <p className="text-2xl font-bold tabular-nums mt-1 truncate">{x.value.toLocaleString()}</p>
            <p className="text-[11px] mt-0.5 truncate" style={{ color: 'var(--color-text-muted)' }}>{x.sub}</p>
          </div>
        ))}
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-5">
        <div className="md:col-span-2 min-w-0 flex flex-col [&>*]:flex-1">
          <Panel title="Visitors per day" subtitle="Last 30 days" legend={<Legend items={[{ label: 'Visitors', color: tc.sky }, { label: 'Page views', color: tc.violet }]} />}>
            {t.visits.d30 === 0 ? <PanelEmpty message="No visits counted yet. Counting starts with this deploy." /> : (
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chart}>
                    <CartesianGrid {...th.grid} strokeDasharray="3 6" />
                    <XAxis dataKey="label" {...th.xAxis} interval="preserveStartEnd" />
                    <YAxis {...th.yAxis} tickFormatter={(v: number) => String(v)} allowDecimals={false} width={32} />
                    <Tooltip {...th.tooltip} formatter={(v: unknown, name: unknown) => [String(v), name === 'visitors' ? 'Visitors' : 'Page views']} />
                    <Bar dataKey="visits" fill={tc.violet} radius={[6, 6, 0, 0]} maxBarSize={18} opacity={0.5} />
                    <Bar dataKey="visitors" fill={tc.sky} radius={[6, 6, 0, 0]} maxBarSize={18} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </Panel>
        </div>
        <Panel title="Top pages" subtitle="Last 30 days">
          {t.topPages.length === 0 ? <PanelEmpty message="Nothing yet." /> : (
            <div className="flex flex-col">
              {t.topPages.map((p) => <Row key={p.path} label={p.path} value={`${p.visitors.toLocaleString()} · ${p.visits.toLocaleString()} views`} />)}
            </div>
          )}
        </Panel>
        <div className="flex flex-col gap-5 min-w-0">
          <Panel title="Where visitors come from" subtitle="Referrers, last 30 days">
            {t.topReferrers.length === 0 ? <PanelEmpty message="Only direct visits so far." /> : (
              <div className="flex flex-col">
                {t.topReferrers.map((r) => <Row key={r.host} label={r.host} value={r.visits.toLocaleString()} />)}
              </div>
            )}
          </Panel>
          <Panel title="Who is browsing" subtitle="Page views, last 30 days">
            <div className="flex flex-col">
              <Row label="Not signed in" value={`${t.split.anonymous.toLocaleString()}${pct(t.split.anonymous, total30)}`} />
              <Row label="Signed in" value={`${t.split.signedIn.toLocaleString()}${pct(t.split.signedIn, total30)}`} />
              <Row label="In the demo" value={`${t.split.demo.toLocaleString()}${pct(t.split.demo, total30)}`} />
            </div>
          </Panel>
        </div>
      </div>
    </section>
  );
}
