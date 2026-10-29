'use client';

import { useEffect, useState } from 'react';
import { isClosed } from '@/lib/projects/closure';
import { headlineFigures, money, portfolioTotals, relativeDay, sparklinePoints, type OverviewProject, type TradingHeadline } from '@/lib/projects/overview';

/* The Projects landing: a strip of totals across every project and one card per
   project with the three figures its type cares about, a six-month sparkline and
   when it last moved. Clicking a card opens the full-width detail (page.tsx).
   Trading cards ask /investments/performance once per project for realized
   figures; the engine lives on the API. Spec: docs/superpowers/specs/2026-10-29-projects-overview-design.md */

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3333/api';

export interface OverviewCardProject extends OverviewProject {
  name: string;
  icon: string;
  color: string | null;
  imageUrl?: string | null;
  description?: string | null;
}

interface Props {
  projects: OverviewCardProject[];
  loading: boolean;
  showClosed: boolean;
  onToggleClosed: () => void;
  onOpen: (id: string) => void;
  onCreate: () => void;
  typeLabel: (type: string) => string;
}

const TONE: Record<'up' | 'down' | 'flat', string> = { up: 'var(--color-green)', down: 'var(--color-rose)', flat: 'var(--color-text-primary)' };

const glass: React.CSSProperties = {
  background: 'var(--color-surface)',
  backdropFilter: 'var(--glass-blur)',
  WebkitBackdropFilter: 'var(--glass-blur)',
  border: 'var(--glass-border)',
  boxShadow: 'var(--glass-shadow)',
};

/* One performance request per trading project, shared across re-renders. */
const tradingCache = new Map<string, Promise<TradingHeadline | null>>();
function useTradingHeadline(p: OverviewCardProject): TradingHeadline | null {
  const [value, setValue] = useState<TradingHeadline | null>(null);
  const wanted = p.type === 'trading' && (p.accounts?.length ?? 0) > 0;
  useEffect(() => {
    if (!wanted) return;
    let cancelled = false;
    let req = tradingCache.get(p.id);
    if (!req) {
      req = fetch(`${API}/investments/performance?projectId=${encodeURIComponent(p.id)}`, { credentials: 'include' })
        .then(async (r) => {
          if (!r.ok) return null;
          const d = await r.json();
          return { realizedPnl: d.combined.realizedPnl, winRate: d.combined.trades.winRate, closed: d.combined.trades.closed } as TradingHeadline;
        })
        .catch(() => null);
      tradingCache.set(p.id, req);
    }
    req.then((v) => { if (!cancelled) setValue(v); });
    return () => { cancelled = true; };
  }, [p.id, wanted]);
  return wanted ? value : null;
}
/** Call after a project changes so its card re-fetches. */
export function invalidateTradingHeadline(projectId: string) { tradingCache.delete(projectId); }

export default function ProjectsOverview({ projects, loading, showClosed, onToggleClosed, onOpen, onCreate, typeLabel }: Props) {
  const totals = portfolioTotals(projects);
  const visible = [...projects]
    .filter((p) => showClosed || !isClosed(p.status))
    .sort((a, b) => Number(isClosed(a.status)) - Number(isClosed(b.status)) || (b.lastActivity ?? '').localeCompare(a.lastActivity ?? ''));

  return (
    <div className="px-3 sm:px-6 py-4 sm:py-5 flex flex-col gap-4 sm:gap-5" data-testid="projects-overview">
      {/* Portfolio strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
        {[
          { label: 'Projects', value: `${totals.active} active`, sub: totals.closed ? `${totals.closed} closed` : 'none closed', clr: 'var(--color-text-primary)' },
          { label: 'Cost basis', value: money(totals.costBasis), sub: 'across every project', clr: 'var(--color-card-violet)' },
          { label: 'Income', value: money(totals.income), sub: 'sales, payouts, revenue', clr: 'var(--color-green)' },
          { label: 'Net', value: money(totals.net, true), sub: 'income minus every cost', clr: totals.net > 0 ? 'var(--color-green)' : totals.net < 0 ? 'var(--color-rose)' : 'var(--color-text-primary)' },
        ].map((k) => (
          <div key={k.label} className="px-3 sm:px-4 py-3" style={{ ...glass, borderRadius: 'var(--radius-card)' }}>
            <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--color-text-muted)' }}>{k.label}</p>
            <p className="font-bold text-lg sm:text-xl mt-0.5 truncate tabular-nums" style={{ color: k.clr }}>{k.value}</p>
            <p className="text-[10px] truncate" style={{ color: 'var(--color-text-muted)' }}>{k.sub}</p>
          </div>
        ))}
      </div>

      {loading && <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>Loading…</p>}

      {!loading && projects.length === 0 && (
        <div className="flex flex-col items-center gap-3 text-center py-16 px-4" style={{ ...glass, borderRadius: 'var(--radius-card)' }}>
          <span className="text-5xl opacity-25">📦</span>
          <p className="font-semibold text-sm">No projects yet</p>
          <p className="text-xs max-w-xs" style={{ color: 'var(--color-text-muted)' }}>Track a car flip, a rental, a side business or a trading account — cost basis, income and the result.</p>
          <button onClick={onCreate} className="mt-1 px-4 py-2 text-xs font-semibold text-white rounded-xl hover:brightness-110" style={{ background: 'var(--color-card-violet)' }}>
            Create first project
          </button>
        </div>
      )}

      {/* Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-3 sm:gap-4">
        {visible.map((p) => <ProjectCard key={p.id} p={p} onOpen={onOpen} typeLabel={typeLabel} />)}
      </div>

      {projects.some((p) => isClosed(p.status)) && (
        <button type="button" onClick={onToggleClosed} aria-pressed={showClosed}
          className="self-start flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold cursor-pointer transition-colors hover:bg-[color-mix(in_srgb,currentColor_6%,transparent)]"
          style={{ border: '1px dashed var(--color-border)', color: 'var(--color-text-secondary)' }}>
          {showClosed ? 'Hide sold & terminated' : `Show sold & terminated (${projects.filter((p) => isClosed(p.status)).length})`}
        </button>
      )}
    </div>
  );
}

function ProjectCard({ p, onOpen, typeLabel }: { p: OverviewCardProject; onOpen: (id: string) => void; typeLabel: (t: string) => string }) {
  const color = p.color || '#9B6DFF';
  const sold = p.status === 'sold';
  const closed = isClosed(p.status);
  const trading = useTradingHeadline(p);
  const figures = headlineFigures(p, trading);
  const points = sparklinePoints(p.monthly);

  return (
    <button type="button" onClick={() => onOpen(p.id)} data-testid="project-card"
      className="text-left flex flex-col gap-3 p-4 transition-all duration-150 card-lift"
      style={{
        ...glass, borderRadius: 'var(--radius-card)', cursor: 'pointer',
        background: `linear-gradient(135deg, ${color}14 0%, var(--color-surface) 60%)`,
        opacity: closed ? 0.65 : 1,
      }}>
      <div className="flex items-center gap-3 min-w-0">
        <div className="w-11 h-11 rounded-xl flex items-center justify-center text-xl shrink-0 overflow-hidden"
          style={{ background: `${color}25`, border: `1px solid ${color}40` }}>
          {p.imageUrl ? <img src={p.imageUrl} alt="" className="w-full h-full object-cover" /> : p.icon}
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sm truncate" style={{ color: 'var(--color-text-primary)' }}>{p.name}</p>
          <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md" style={{ background: `${color}20`, color, border: `1px solid ${color}35` }}>{typeLabel(p.type)}</span>
            <span className="text-[10px] font-semibold" style={{ color: sold ? 'var(--color-green)' : closed ? 'var(--color-text-muted)' : 'var(--color-amber)' }}>
              {sold ? '✓ Sold' : closed ? '■ Terminated' : '● Active'}
            </span>
            {p.type === 'trading' && (p.accounts?.length ?? 0) > 0 && (
              <span className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>· {p.accounts!.length} account{p.accounts!.length === 1 ? '' : 's'}</span>
            )}
          </div>
        </div>
        <Sparkline points={points} color={color} />
      </div>

      <div className="grid grid-cols-3 gap-2">
        {figures.map((f) => (
          <div key={f.label} className="min-w-0">
            <p className="text-[10px] truncate" style={{ color: 'var(--color-text-muted)' }}>{f.label}</p>
            <p className="text-sm font-bold truncate tabular-nums" style={{ color: TONE[f.tone] }}>{f.value}</p>
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between text-[10px]" style={{ color: 'var(--color-text-muted)' }}>
        <span className="truncate">{p.txCount} transaction{p.txCount === 1 ? '' : 's'}{p.description ? ` · ${p.description}` : ''}</span>
        <span className="shrink-0 ml-2">{relativeDay(p.lastActivity)}</span>
      </div>
    </button>
  );
}

/* Six-month cumulative net. Green when it ends above where it started, rose below. */
function Sparkline({ points, color }: { points: number[]; color: string }) {
  const w = 64, h = 26, pad = 2;
  if (points.length < 2) return <div style={{ width: w, height: h }} aria-hidden="true" />;
  const lo = Math.min(0, ...points), hi = Math.max(0, ...points);
  const span = hi - lo || 1;
  const x = (i: number) => pad + (i / (points.length - 1)) * (w - pad * 2);
  const y = (v: number) => h - pad - ((v - lo) / span) * (h - pad * 2);
  const d = points.map((v, i) => `${i ? 'L' : 'M'} ${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(' ');
  const end = points[points.length - 1];
  const stroke = end > 0 ? 'var(--color-green)' : end < 0 ? 'var(--color-rose)' : color;
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="shrink-0" aria-hidden="true">
      <line x1={pad} x2={w - pad} y1={y(0)} y2={y(0)} stroke="var(--color-border)" strokeWidth="1" />
      <path d={d} fill="none" stroke={stroke} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={x(points.length - 1)} cy={y(end)} r="2" fill={stroke} />
    </svg>
  );
}
