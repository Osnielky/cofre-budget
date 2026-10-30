'use client';

import { useState } from 'react';
import { ComposedChart, Bar, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { useThemeColors } from '@/components/ThemeProvider';
import Panel, { PanelEmpty, Legend } from '@/components/dashboard/Panel';
import { makeChartTheme } from '@/components/dashboard/chartTheme';
import { useAdminTraffic } from '@/hooks/useAdmin';
import { relativeTime } from '@/lib/admin/format';
import type { Counted, ProspectVisit, TrafficSegment } from '@/lib/admin/types';
import { busiest, classifyReferrer, engagementHint, funnelSteps, hourLabel, localActivity, movingAverage, pageKind, PAGE_KIND_LABEL, REFERRER_KIND_LABEL, weekOverWeek, WEEKDAYS, type ReferrerKind } from '@/lib/admin/traffic';
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
  const wow = weekOverWeek(s.daily);
  const wowText = wow.deltaPct == null ? `${s.visits.d7} views · none the week before` : `${s.visits.d7} views · ${wow.deltaPct >= 0 ? '▲' : '▼'} ${Math.abs(wow.deltaPct)}% vs last week (${wow.lastWeek})`;
  const tiles = segment === 'prospects'
    ? [
      { label: 'Prospects today', value: s.visitors.today, sub: `${s.visits.today} page views` },
      { label: 'Prospects (7 days)', value: s.visitors.d7, sub: wowText },
      { label: 'Prospects (30 days)', value: s.visitors.d30, sub: `${s.visits.d30} page views` },
      { label: 'Demo starts (30 days)', value: t.funnel.demoStarts, sub: `${t.funnel.landingVisitors} landing visitors` },
      { label: 'Signups (30 days)', value: t.funnel.signups, sub: `vs ${t.funnel.landingVisitors.toLocaleString()} landing visitors` },
      { label: 'Trial starts (30 days)', value: t.funnel.trialStarts, sub: `from ${t.funnel.signups} signups` },
    ]
    : [
      { label: 'Customers today', value: s.visitors.today, sub: `${s.visits.today} page views` },
      { label: 'Customers (7 days)', value: s.visitors.d7, sub: wowText },
      { label: 'Customers (30 days)', value: s.visitors.d30, sub: `${s.visits.d30} page views` },
      { label: 'All visitors (30 days)', value: t.visitors.d30, sub: `${t.visits.d30} page views` },
      { label: 'Signups (30 days)', value: t.funnel.signups, sub: 'new real accounts' },
      { label: 'Paying customers', value: t.funnel.paying, sub: `active or past due · ${t.funnel.trialStarts} trials started this month` },
    ];
  const avg = movingAverage(s.daily.map((d) => d.visitors));
  const chart = s.daily.map((d, i) => ({ ...d, label: day(d.date), avg: avg[i] }));
  const steps = funnelSteps(t.funnel);
  const local = localActivity(s.activity ?? [], -new Date().getTimezoneOffset() / 60);
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

      <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-4">
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
          <Panel title={`${SEGMENT_LABEL[segment]} per day`}
            subtitle={`Last 30 days · this week ${wow.thisWeek} visitors${wow.deltaPct == null ? '' : `, ${wow.deltaPct >= 0 ? 'up' : 'down'} ${Math.abs(wow.deltaPct)}% on the week before`} · ${s.engagement?.avgPages ?? 0} page${(s.engagement?.avgPages ?? 0) === 1 ? '' : 's'} per visitor`}
            legend={<Legend items={[{ label: 'Visitors', color: tc.sky }, { label: 'Page views', color: tc.violet }, { label: '7-day average', color: tc.amber, line: true }]} />}>
            {s.visits.d30 === 0 ? <PanelEmpty message={`No ${SEGMENT_LABEL[segment].toLowerCase()} counted yet.`} /> : (
              <div className="flex-1 min-h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={chart}>
                    <CartesianGrid {...th.grid} strokeDasharray="3 6" />
                    <XAxis dataKey="label" {...th.xAxis} interval="preserveStartEnd" />
                    <YAxis {...th.yAxis} tickFormatter={(v: number) => String(v)} allowDecimals={false} width={32} />
                    <Tooltip {...th.tooltip} formatter={(v: unknown, name: unknown) => [String(v), name === 'visitors' ? 'Visitors' : name === 'avg' ? '7-day average' : 'Page views']} />
                    <Bar dataKey="visits" fill={tc.violet} radius={[6, 6, 0, 0]} maxBarSize={18} opacity={0.5} />
                    <Bar dataKey="visitors" fill={tc.sky} radius={[6, 6, 0, 0]} maxBarSize={18} />
                    <Line type="monotone" dataKey="avg" stroke={tc.amber} strokeWidth={2} strokeDasharray="4 3" dot={false} activeDot={{ r: 3 }} />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            )}
          </Panel>
        </div>
        <Panel title="Top pages" subtitle={`${SEGMENT_LABEL[segment]}, last 30 days · visitors, then views`}>
          {s.topPages.length === 0 ? <PanelEmpty message="Nothing yet." /> : <PageRows pages={s.topPages} prospects={segment === 'prospects'} />}
        </Panel>
        <div className="flex flex-col gap-5 min-w-0">
          <Panel title="Where they come from" subtitle={`${SEGMENT_LABEL[segment]}, how visits started, last 30 days`}>
            <ReferrerRows referrers={s.topReferrers} entries={s.entries ?? { direct: 0, referred: 0 }} />
          </Panel>
          {segment === 'prospects' && (
            <Panel title="Who is browsing" subtitle="All page views, last 30 days">
              <div className="flex flex-col">
                <Row label="Not signed in" value={`${t.split.anonymous.toLocaleString()}${pct(t.split.anonymous, total30)}`} />
                <Row label="Signed in" value={`${t.split.signedIn.toLocaleString()}${pct(t.split.signedIn, total30)}`} />
                <Row label="In the demo" value={`${t.split.demo.toLocaleString()}${pct(t.split.demo, total30)}`} />
              </div>
            </Panel>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-5">
        {segment === 'prospects' ? (
          <div className="md:col-span-2 min-w-0 flex flex-col [&>*]:flex-1">
            <Panel title="From visitor to customer" subtitle="Last 30 days · each step as a share of the landing page and of the step before">
              <FunnelRows steps={steps} />
            </Panel>
          </div>
        ) : (
          <div className="md:col-span-2 min-w-0 flex flex-col [&>*]:flex-1">
            <Panel title="Who is browsing" subtitle="All page views, last 30 days">
              <div className="flex flex-col">
                <Row label="Not signed in" value={`${t.split.anonymous.toLocaleString()}${pct(t.split.anonymous, total30)}`} />
                <Row label="Signed in" value={`${t.split.signedIn.toLocaleString()}${pct(t.split.signedIn, total30)}`} />
                <Row label="In the demo" value={`${t.split.demo.toLocaleString()}${pct(t.split.demo, total30)}`} />
              </div>
            </Panel>
          </div>
        )}
        <Panel title="How deep they go" subtitle={`${SEGMENT_LABEL[segment]}, last 30 days`}>
          <EngagementRows s={s} prospects={segment === 'prospects'} />
        </Panel>
        <Panel title="When they visit" subtitle={`${SEGMENT_LABEL[segment]}, page views by hour and weekday · your time zone`}>
          <ActivityStrips byHour={local.byHour} byWeekday={local.byWeekday} total={local.total} color={segment === 'prospects' ? tc.sky : tc.green} />
        </Panel>
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

const KIND_COLOR: Record<ReferrerKind, string> = {
  search: 'var(--color-green)', social: 'var(--color-card-violet)', ai: 'var(--color-card-sky)', own: 'var(--color-amber)', crawler: 'var(--color-rose)', other: 'var(--color-text-muted)',
};
function Tag({ children, color }: { children: React.ReactNode; color: string }) {
  return (
    <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded shrink-0"
      style={{ background: `color-mix(in srgb, ${color} 14%, transparent)`, color }}>{children}</span>
  );
}
function ShareBar({ share, color }: { share: number; color: string }) {
  return (
    <div className="h-1 rounded-full w-full overflow-hidden" style={{ background: 'color-mix(in srgb, var(--color-text-primary) 6%, transparent)' }}>
      <div className="h-full rounded-full" style={{ width: `${Math.max(2, Math.round(share * 100))}%`, background: color, opacity: 0.8 }} />
    </div>
  );
}

/** Pages with a share bar on visitors, a kind tag and how many views each visitor took. */
function PageRows({ pages, prospects }: { pages: TrafficSegment['topPages']; prospects: boolean }) {
  const max = Math.max(1, ...pages.map((p) => p.visitors));
  const KIND_TONE = { landing: 'var(--color-primary)', public: 'var(--color-green)', demo: 'var(--color-card-sky)', auth: 'var(--color-amber)', app: 'var(--color-text-muted)' } as const;
  return (
    <div className="flex flex-col">
      {pages.map((x) => {
        const kind = pageKind(x.path);
        const perVisitor = x.visitors ? Math.round((x.visits / x.visitors) * 10) / 10 : 0;
        return (
          <div key={x.path} className="py-2 flex flex-col gap-1" style={{ borderBottom: '1px solid var(--color-border)' }}>
            <div className="flex items-center justify-between gap-3 text-sm">
              <span className="flex items-center gap-2 min-w-0">
                <span className="truncate" style={{ color: 'var(--color-text-secondary)' }}>{x.path}</span>
                {prospects && <Tag color={KIND_TONE[kind]}>{PAGE_KIND_LABEL[kind]}</Tag>}
              </span>
              <span className="font-semibold tabular-nums shrink-0">{x.visitors.toLocaleString()} <span className="font-normal" style={{ color: 'var(--color-text-muted)' }}>· {x.visits.toLocaleString()} views{perVisitor > 1.2 ? ` · ${perVisitor}/visitor` : ''}</span></span>
            </div>
            <ShareBar share={x.visitors / max} color={prospects ? KIND_TONE[kind] : 'var(--color-green)'} />
          </div>
        );
      })}
    </div>
  );
}

/** Direct entries first, then each referrer with what kind of place it is. */
function ReferrerRows({ referrers, entries }: { referrers: TrafficSegment['topReferrers']; entries: { direct: number; referred: number } }) {
  const total = entries.direct + entries.referred;
  if (total === 0 && referrers.length === 0) return <PanelEmpty message="Nothing yet." />;
  const merged = new Map<string, { host: string; visits: number; kind: ReferrerKind }>();
  for (const r of referrers) {
    const c = classifyReferrer(r.host);
    const cur = merged.get(c.label);
    if (cur) cur.visits += r.visits; else merged.set(c.label, { host: r.host, visits: r.visits, kind: c.kind });
  }
  const rows = [...merged.entries()].map(([label, r]) => ({ label, ...r })).sort((a, b) => b.visits - a.visits);
  return (
    <div className="flex flex-col">
      <div className="flex items-center justify-between gap-3 py-1.5 text-sm" style={{ borderBottom: '1px solid var(--color-border)' }}>
        <span className="flex items-center gap-2 min-w-0">
          <span style={{ color: 'var(--color-text-secondary)' }}>Direct</span>
          <span className="text-[11px] truncate" style={{ color: 'var(--color-text-muted)' }}>typed, bookmark, untagged link</span>
        </span>
        <span className="font-semibold tabular-nums shrink-0">{entries.direct.toLocaleString()}{pct(entries.direct, total)}</span>
      </div>
      {rows.map((r) => (
        <div key={r.label} className="flex items-center justify-between gap-3 py-1.5 text-sm" style={{ borderBottom: '1px solid var(--color-border)' }}>
          <span className="flex items-center gap-2 min-w-0">
            <span className="truncate" style={{ color: 'var(--color-text-secondary)' }} title={r.host}>{r.label}</span>
            <Tag color={KIND_COLOR[r.kind]}>{REFERRER_KIND_LABEL[r.kind]}</Tag>
          </span>
          <span className="font-semibold tabular-nums shrink-0">{r.visits.toLocaleString()}</span>
        </div>
      ))}
      {rows.some((r) => r.kind === 'own' || r.kind === 'crawler') && (
        <p className="text-[11px] mt-2" style={{ color: 'var(--color-text-muted)' }}>
          "Your own URL" is the Cloud Run service address — you, or a script, not a prospect. Crawlers that pass the user-agent filter still show up here.
        </p>
      )}
    </div>
  );
}

function FunnelRows({ steps }: { steps: ReturnType<typeof funnelSteps> }) {
  const top = steps[0]?.value ?? 0;
  if (top === 0 && steps.every((s) => s.value === 0)) return <PanelEmpty message="No landing-page visitors yet." />;
  const tone = ['var(--color-primary)', 'var(--color-card-sky)', 'var(--color-green)', 'var(--color-card-violet)', 'var(--color-amber)'];
  return (
    <div className="flex flex-col gap-2.5">
      {steps.map((st, i) => (
        <div key={st.key} className="grid items-center gap-x-3 gap-y-1" style={{ gridTemplateColumns: 'minmax(0, 11rem) minmax(0, 1fr) auto' }}>
          <div className="min-w-0 col-span-2 sm:col-span-1">
            <p className="text-sm sm:truncate" style={{ color: 'var(--color-text-secondary)' }}>{st.label}</p>
            <p className="text-[10px] truncate hidden sm:block" style={{ color: 'var(--color-text-muted)' }}>{st.hint}</p>
          </div>
          <div className="h-5 rounded-md overflow-hidden col-span-2 sm:col-span-1 order-last sm:order-none" style={{ background: 'color-mix(in srgb, var(--color-text-primary) 5%, transparent)' }}>
            <div className="h-full rounded-md" style={{ width: `${top > 0 ? Math.max(st.value > 0 ? 1.5 : 0, (st.value / top) * 100) : 0}%`, background: tone[i], opacity: 0.85 }} />
          </div>
          <div className="text-right sm:min-w-[7.5rem]">
            <p className="text-sm font-semibold tabular-nums">{st.value.toLocaleString()}</p>
            <p className="text-[10px] tabular-nums" style={{ color: 'var(--color-text-muted)' }}>
              {i === 0 ? '100%' : st.ofPrevious == null ? (st.ofTop == null ? '—' : `${st.ofTop}% of landing`) : `${st.ofPrevious}% of previous · ${st.ofTop ?? 0}% of landing`}
            </p>
          </div>
        </div>
      ))}
      <p className="text-[11px] mt-1" style={{ color: 'var(--color-text-muted)' }}>
        The first two steps count visitor-days on the page; signups and trials come from the accounts table, so one person can appear in both halves.
      </p>
    </div>
  );
}

function EngagementRows({ s, prospects }: { s: TrafficSegment; prospects: boolean }) {
  const e = s.engagement ?? { visitorDays: 0, singlePage: 0, avgPages: 0 };
  const entries = s.entries ?? { direct: 0, referred: 0 };
  const explore = e.visitorDays - e.singlePage;
  return (
    <div className="flex flex-col">
      <Row label="Pages per visitor" value={e.avgPages.toLocaleString()} />
      <Row label="Left after one page" value={`${e.singlePage.toLocaleString()}${pct(e.singlePage, e.visitorDays)}`} tone={e.visitorDays >= 20 && e.singlePage / e.visitorDays >= 0.8 ? 'var(--color-amber)' : undefined} />
      <Row label="Saw two or more pages" value={`${explore.toLocaleString()}${pct(explore, e.visitorDays)}`} />
      <Row label="Arrived from a link" value={`${entries.referred.toLocaleString()}${pct(entries.referred, entries.direct + entries.referred)}`} />
      {prospects && <p className="text-xs mt-3 leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>{engagementHint(e, entries)}</p>}
    </div>
  );
}

/** Two small bar strips: 24 hours and 7 weekdays, in the viewer's zone. */
function ActivityStrips({ byHour, byWeekday, total, color }: { byHour: number[]; byWeekday: number[]; total: number; color: string }) {
  if (total === 0) return <PanelEmpty message="Nothing yet." />;
  const hMax = Math.max(1, ...byHour), dMax = Math.max(1, ...byWeekday);
  const peak = busiest(byHour, byWeekday);
  return (
    <div className="flex flex-col gap-3">
      <div>
        <div className="flex items-end gap-[2px] h-14" aria-hidden="true">
          {byHour.map((n, h) => (
            <div key={h} className="flex-1 rounded-t" title={`${hourLabel(h)}: ${n}`} style={{ height: `${Math.max(n ? 6 : 2, (n / hMax) * 100)}%`, background: color, opacity: n ? 0.85 : 0.2 }} />
          ))}
        </div>
        <div className="flex justify-between text-[9px] mt-1" style={{ color: 'var(--color-text-muted)' }}>
          {[0, 6, 12, 18].map((h) => <span key={h}>{hourLabel(h)}</span>)}<span>11pm</span>
        </div>
      </div>
      <div>
        <div className="flex items-end gap-1.5 h-10" aria-hidden="true">
          {byWeekday.map((n, d) => (
            <div key={d} className="flex-1 rounded-t" title={`${WEEKDAYS[d]}: ${n}`} style={{ height: `${Math.max(n ? 8 : 3, (n / dMax) * 100)}%`, background: color, opacity: n ? 0.85 : 0.2 }} />
          ))}
        </div>
        <div className="grid grid-cols-7 text-[9px] text-center mt-1" style={{ color: 'var(--color-text-muted)' }}>
          {WEEKDAYS.map((d) => <span key={d}>{d[0]}</span>)}
        </div>
      </div>
      {peak && <p className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>Busiest: <strong>{peak}</strong> · {total.toLocaleString()} views</p>}
    </div>
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
