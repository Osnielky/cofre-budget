'use client';

import { useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { useThemeColors } from '@/components/ThemeProvider';
import Panel, { PanelEmpty, Legend } from '@/components/dashboard/Panel';
import { makeChartTheme } from '@/components/dashboard/chartTheme';
import { useAdminTraffic } from '@/hooks/useAdmin';
import { relativeTime } from '@/lib/admin/format';
import type { Counted, ProspectVisit, TrafficSegment } from '@/lib/admin/types';
import { Row } from './AdminStatTiles';

const glass: React.CSSProperties = {
  background: 'var(--color-surface)', backdropFilter: 'var(--glass-blur)', WebkitBackdropFilter: 'var(--glass-blur)',
  border: 'var(--glass-border)', boxShadow: 'var(--glass-shadow)',
};
const day = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
const pct = (n: number, of: number) => (of > 0 ? ` (${Math.round((n / of) * 100)}%)` : '');
const time = (iso: string) => new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
const dateShort = (iso: string) => new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

type SegmentKey = 'prospects' | 'customers';
const SEGMENT_LABEL: Record<SegmentKey, string> = { prospects: 'Prospects', customers: 'Customers' };
const SEGMENT_HINT: Record<SegmentKey, string> = {
  prospects: 'Not signed in, including demo visitors — people who have not created an account.',
  customers: 'Signed in with a real account.',
};

let regionNames: Intl.DisplayNames | null = null;
function countryName(code: string): string {
  try {
    regionNames ??= new Intl.DisplayNames(['en'], { type: 'region' });
    return regionNames.of(code) ?? code;
  } catch { return code; }
}
const flag = (code: string) => (/^[A-Z]{2}$/.test(code) ? String.fromCodePoint(...[...code].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65)) : '');
const DEVICE_LABEL: Record<string, string> = { desktop: 'Desktop', mobile: 'Phone', tablet: 'Tablet', unknown: 'Unknown' };

/** Who visits, split into prospects and customers; prospects get a non-identifying profile and their recent visits. */
export default function TrafficPanel({ refreshKey }: { refreshKey: number }) {
  const { data: t, error } = useAdminTraffic(refreshKey);
  const tc = useThemeColors();
  const th = makeChartTheme(tc);
  const [segment, setSegment] = useState<SegmentKey>('prospects');

  if (error) {
    return <p className="text-sm" style={{ color: 'var(--color-rose)' }}>{error}</p>;
  }
  if (!t) return <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>Loading traffic…</p>;

  const s: TrafficSegment = t.segments[segment];
  const tiles = segment === 'prospects'
    ? [
      { label: 'Prospects today', value: s.visitors.today, sub: `${s.visits.today} page views` },
      { label: 'Prospects (7 days)', value: s.visitors.d7, sub: `${s.visits.d7} page views` },
      { label: 'Prospects (30 days)', value: s.visitors.d30, sub: `${s.visits.d30} page views` },
      { label: 'Demo starts (30 days)', value: t.funnel.demoStarts, sub: `${t.funnel.landingVisitors} landing visitors` },
      { label: 'Signups (30 days)', value: t.funnel.signups, sub: `vs ${t.funnel.landingVisitors.toLocaleString()} landing visitors` },
      { label: 'Trial starts (30 days)', value: t.funnel.trialStarts, sub: `from ${t.funnel.signups} signups` },
    ]
    : [
      { label: 'Customers today', value: s.visitors.today, sub: `${s.visits.today} page views` },
      { label: 'Customers (7 days)', value: s.visitors.d7, sub: `${s.visits.d7} page views` },
      { label: 'Customers (30 days)', value: s.visitors.d30, sub: `${s.visits.d30} page views` },
      { label: 'All visitors (30 days)', value: t.visitors.d30, sub: `${t.visits.d30} page views` },
      { label: 'Signups (30 days)', value: t.funnel.signups, sub: 'new real accounts' },
      { label: 'Paying customers', value: t.funnel.paying, sub: `active or past due · ${t.funnel.trialStarts} trials started this month` },
    ];
  const chart = s.daily.map((d) => ({ ...d, label: day(d.date) }));
  const total30 = t.split.anonymous + t.split.signedIn + t.split.demo;
  const p = t.prospects.profile;

  const segBtn = (k: SegmentKey) => (
    <button key={k} type="button" onClick={() => setSegment(k)} title={SEGMENT_HINT[k]}
      className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer"
      style={segment === k
        ? { background: 'color-mix(in srgb, var(--color-primary) 16%, transparent)', border: '1px solid color-mix(in srgb, var(--color-primary) 35%, transparent)', color: 'var(--color-primary)' }
        : { background: 'transparent', border: '1px solid var(--color-border)', color: 'var(--color-text-muted)' }}>
      {SEGMENT_LABEL[k]}
    </button>
  );

  return (
    <section aria-labelledby="traffic-heading" className="flex flex-col gap-5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3 flex-wrap">
          <h2 id="traffic-heading" className="text-lg font-semibold">Traffic</h2>
          <div className="flex items-center gap-1.5">{segBtn('prospects')}{segBtn('customers')}</div>
          <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>{SEGMENT_HINT[segment]}</span>
        </div>
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
          <Panel title={`${SEGMENT_LABEL[segment]} per day`} subtitle="Last 30 days" legend={<Legend items={[{ label: 'Visitors', color: tc.sky }, { label: 'Page views', color: tc.violet }]} />}>
            {s.visits.d30 === 0 ? <PanelEmpty message={`No ${SEGMENT_LABEL[segment].toLowerCase()} counted yet.`} /> : (
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
        <Panel title="Top pages" subtitle={`${SEGMENT_LABEL[segment]}, last 30 days`}>
          {s.topPages.length === 0 ? <PanelEmpty message="Nothing yet." /> : (
            <div className="flex flex-col">
              {s.topPages.map((x) => <Row key={x.path} label={x.path} value={`${x.visitors.toLocaleString()} · ${x.visits.toLocaleString()} views`} />)}
            </div>
          )}
        </Panel>
        <div className="flex flex-col gap-5 min-w-0">
          <Panel title="Where they come from" subtitle={`${SEGMENT_LABEL[segment]}, referrers, last 30 days`}>
            {s.topReferrers.length === 0 ? <PanelEmpty message="Only direct visits so far." /> : (
              <div className="flex flex-col">
                {s.topReferrers.map((r) => <Row key={r.host} label={r.host} value={r.visits.toLocaleString()} />)}
              </div>
            )}
          </Panel>
          <Panel title="Who is browsing" subtitle="All page views, last 30 days">
            <div className="flex flex-col">
              <Row label="Not signed in" value={`${t.split.anonymous.toLocaleString()}${pct(t.split.anonymous, total30)}`} />
              <Row label="Signed in" value={`${t.split.signedIn.toLocaleString()}${pct(t.split.signedIn, total30)}`} />
              <Row label="In the demo" value={`${t.split.demo.toLocaleString()}${pct(t.split.demo, total30)}`} />
            </div>
          </Panel>
        </div>
      </div>

      {segment === 'prospects' && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
            <Panel title="Where they are" subtitle="Countries, then cities · prospect visitors, last 30 days">
              {p.countries.length === 0 ? <PanelEmpty message={p.unknownLocation ? `${p.unknownLocation} visitors, location unknown.` : 'Nothing yet.'} /> : (
                <div className="flex flex-col">
                  {p.countries.map((c) => <Row key={c.country} label={`${flag(c.country)} ${countryName(c.country)}`} value={c.visitors.toLocaleString()} />)}
                  {p.unknownLocation > 0 && <Row label="Unknown" value={p.unknownLocation.toLocaleString()} />}
                  {p.cities.length > 0 && <div className="my-1.5" style={{ borderTop: '1px solid var(--color-border)' }} />}
                  {p.cities.map((c) => <Row key={`${c.label}-${c.country}`} label={`${c.label}, ${c.country}`} value={c.visitors.toLocaleString()} />)}
                </div>
              )}
            </Panel>
            <Panel title="Devices & browsers" subtitle="Prospect visitors, last 30 days">
              <div className="flex flex-col">
                {buckets(p.devices.map((d) => ({ ...d, label: DEVICE_LABEL[d.label] ?? d.label })))}
                <div className="my-1.5" style={{ borderTop: '1px solid var(--color-border)' }} />
                {buckets(p.browsers)}
                <div className="my-1.5" style={{ borderTop: '1px solid var(--color-border)' }} />
                {buckets(p.os)}
              </div>
            </Panel>
            <div className="flex flex-col gap-5 min-w-0">
              <Panel title="Campaigns" subtitle="utm tags on the landing link, last 30 days">
                {p.campaigns.length === 0 ? <PanelEmpty message="No tagged links yet. Add ?utm_source=…&utm_campaign=… to links you share." /> : (
                  <div className="flex flex-col">
                    {p.campaigns.map((c, i) => <Row key={i} label={[c.source, c.medium, c.campaign].filter(Boolean).join(' / ')} value={c.visitors.toLocaleString()} />)}
                  </div>
                )}
              </Panel>
              <Panel title="Landing pages & languages" subtitle="First page of a visit · browser language">
                <div className="flex flex-col">
                  {p.landingPages.length === 0 ? <PanelEmpty message="Nothing yet." /> : p.landingPages.map((x) => <Row key={x.path} label={x.path} value={x.visitors.toLocaleString()} />)}
                  {p.languages.length > 0 && <div className="my-1.5" style={{ borderTop: '1px solid var(--color-border)' }} />}
                  {buckets(p.languages)}
                </div>
              </Panel>
            </div>
          </div>

          <Panel title="Recent prospect visits" subtitle="One row per visitor per day, newest first. Nothing here identifies a person: location is derived from the address at the time of the visit, which is not kept.">
            {t.prospects.recent.length === 0 ? <PanelEmpty message="No prospect visits yet." /> : <RecentVisits visits={t.prospects.recent} />}
          </Panel>
          <p className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>Location data: GeoLite2 by MaxMind, looked up offline inside Cofre&rsquo;s API.</p>
        </>
      )}
    </section>
  );
}

function buckets(items: Counted[]) {
  const total = items.reduce((s, i) => s + i.visitors, 0);
  return items.map((i) => <Row key={i.label} label={i.label} value={`${i.visitors.toLocaleString()}${pct(i.visitors, total)}`} />);
}

function RecentVisits({ visits }: { visits: ProspectVisit[] }) {
  return (
    <ul className="flex flex-col">
      {visits.map((v, i) => (
        <li key={`${v.date}-${i}`} className="py-2.5 flex flex-col md:flex-row md:items-start gap-1 md:gap-4 text-sm" style={{ borderTop: i === 0 ? undefined : '1px solid var(--color-border)' }}>
          <div className="md:w-44 shrink-0">
            <p className="font-semibold tabular-nums" title={`${v.firstSeen} → ${v.lastSeen}`}>{dateShort(v.firstSeen)} · {time(v.firstSeen)}</p>
            <p className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>{relativeTime(v.lastSeen)} · {v.views} page{v.views === 1 ? '' : 's'}{v.minutes > 0 ? ` · ${v.minutes} min` : ''}{v.isDemo ? ' · demo' : ''}</p>
          </div>
          <div className="md:w-56 shrink-0 min-w-0">
            <p className="truncate">{v.country ? `${flag(v.country)} ${v.city ? `${v.city}, ` : ''}${countryName(v.country)}` : 'Location unknown'}</p>
            <p className="text-[11px] truncate" style={{ color: 'var(--color-text-muted)' }}>
              {[v.device ? DEVICE_LABEL[v.device] ?? v.device : null, v.browser, v.os, v.language].filter(Boolean).join(' · ')}
            </p>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs tabular-nums break-words" style={{ color: 'var(--color-text-secondary)' }}>{v.pages.join(' → ')}</p>
            {(v.referrerHost || v.campaign) && (
              <p className="text-[11px] truncate" style={{ color: 'var(--color-text-muted)' }}>
                {v.referrerHost ? `from ${v.referrerHost}` : 'direct'}{v.campaign ? ` · campaign ${v.campaign}` : ''}
              </p>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}
