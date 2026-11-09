'use client';

import { useId, type CSSProperties, type ReactNode } from 'react';
import { DELTA_COLOR, clampPct, describeDelta, type DeltaSpec } from '@/lib/ui/statTile';

/* The one stat tile (CLAUDE.md → components/StatTile.tsx). Nine strips used to
   draw their own: five-up with sparklines on the Dashboard, four-up with a
   two-point curve on Transactions, icon-left cards with a progress bar on
   Budgets, headline + fact tiles on Reports, icon tiles on Debts and Cards, and
   uppercase-label tiles on Projects, Settings and the trading strip. This is the
   same frame everywhere:

     [icon]  Label                 ← text-xs secondary; the icon chip from sm, an accent dot on phones
     $12,345.67                    ← 17px / 22px from sm, bold, tabular
     ↑ 12%  vs October · $11,000   ← delta chip (lib/ui/statTile.ts) + muted sub + right-aligned note
     ────────────                  ← optional: sparkline (from sm) or progress bar

   Variants: `size="sm"` is the fact tile (smaller value, no icon chip; Projects,
   Settings, Reports extras, trading); `hero` is the phone hero (chip, bigger value
   and sparkline below sm; the caller spans it two columns); `tone="inset"` nests
   inside a card. The grid, its columns and the data stay with the caller. */

export type StatTrend =
  | { kind: 'spark'; values: number[] }
  | { kind: 'bar'; pct: number; color?: string };

export interface StatTileProps {
  label: string;
  /** Phone-width label; falls back to `label`. */
  shortLabel?: string;
  value: ReactNode;
  /** Colour for the value (a net figure in green or rose); default text-primary. */
  valueTone?: string;
  /** Extra classes on the value (the budgets flash). */
  valueClassName?: string;
  /** Announce value changes (drafts that update as the user edits). */
  live?: boolean;
  /** Muted line under the value. */
  sub?: ReactNode;
  /** Right-aligned note on the sub row ("42% of income"); hidden on phones, where the sub needs the width. */
  right?: ReactNode;
  /** Tints the card, colours the icon chip / dot and the sparkline. */
  accent?: string;
  /** An 18px stroke icon; drawn in the chip from sm (and on phones when `hero`). */
  icon?: ReactNode;
  delta?: DeltaSpec | null;
  deltaTitle?: string;
  trend?: StatTrend | null;
  loading?: boolean;
  size?: 'sm' | 'md';
  hero?: boolean;
  tone?: 'glass' | 'inset';
  /** Hover lift (`.card-lift`). */
  lift?: boolean;
  className?: string;
  'data-testid'?: string;
}

export default function StatTile({
  label, shortLabel, value, valueTone, valueClassName = '', live, sub, right, accent, icon, delta, deltaTitle, trend,
  loading = false, size = 'md', hero = false, tone = 'glass', lift = false, className = '', 'data-testid': testId,
}: StatTileProps) {
  const sm = size === 'sm';
  const chip = loading ? null : describeDelta(delta);
  const showSubRow = loading || chip || sub || right;

  const frame: CSSProperties = tone === 'inset'
    ? {
      background: 'color-mix(in srgb, var(--color-text-primary) 4%, transparent)',
      border: '1px solid color-mix(in srgb, var(--color-text-primary) 8%, transparent)',
    }
    : {
      background: accent
        ? `linear-gradient(140deg, color-mix(in srgb, ${accent} 9%, transparent), var(--color-surface) 60%)`
        : 'var(--color-surface)',
      backdropFilter: 'var(--glass-blur)',
      WebkitBackdropFilter: 'var(--glass-blur)',
      border: 'var(--glass-border)',
      boxShadow: 'var(--glass-shadow)',
    };

  const pad = sm ? 'px-3 py-2.5 sm:px-4 sm:py-3 gap-0.5' : hero ? 'p-4 sm:p-4 gap-1.5 sm:gap-2' : 'p-3 sm:p-4 gap-1.5 sm:gap-2';
  const valueSize = sm
    ? 'text-base sm:text-lg leading-6'
    : hero ? 'text-[26px] sm:text-[22px] leading-7' : 'text-[17px] sm:text-[22px] leading-7';

  return (
    <div data-testid={testId} data-stat-tile={size}
      className={`${lift ? 'card-lift' : ''} rounded-2xl flex flex-col min-w-0 overflow-hidden ${pad} ${className}`}
      style={frame}>
      {/* Label row */}
      <div className="flex items-center gap-2 sm:gap-2.5 min-w-0">
        {icon && !sm && (
          <span className={`${hero ? 'flex' : 'hidden sm:flex'} w-8 h-8 sm:w-9 sm:h-9 rounded-xl items-center justify-center shrink-0`}
            style={{ background: `color-mix(in srgb, ${accent ?? 'var(--color-text-secondary)'} 18%, transparent)`, color: accent ?? 'var(--color-text-secondary)' }}
            aria-hidden="true">
            {icon}
          </span>
        )}
        {accent && !(hero && icon) && (
          <span aria-hidden="true" className={`${icon && !sm ? 'sm:hidden' : ''} w-1.5 h-1.5 rounded-full shrink-0`} style={{ background: accent }} />
        )}
        <span className={`${sm ? 'text-fine' : 'text-xs'} font-medium truncate`} style={{ color: 'var(--color-text-secondary)' }}>
          {shortLabel && shortLabel !== label
            ? <><span className="sm:hidden">{shortLabel}</span><span className="hidden sm:inline">{label}</span></>
            : label}
        </span>
      </div>

      {/* Value */}
      <p className={`${valueSize} font-bold tabular-nums truncate ${valueClassName}`}
        style={valueTone ? { color: valueTone } : undefined} aria-live={live ? 'polite' : undefined}>
        {loading ? <span className={`skel inline-block ${sm ? 'h-4' : 'h-5 sm:h-6'} w-24 max-w-full rounded-md align-middle`} /> : value}
      </p>

      {/* Delta · sub · right */}
      {showSubRow && (
        <p className="flex items-center gap-1.5 text-fine min-w-0">
          {chip && (
            <span className="font-bold tabular-nums whitespace-nowrap shrink-0" style={{ color: DELTA_COLOR[chip.tone] }} title={deltaTitle}>
              {chip.text}
            </span>
          )}
          {loading
            ? <span className="skel inline-block h-3 w-20 rounded" />
            : <>
              {sub && <span className="truncate" style={{ color: 'var(--color-text-muted)' }}>{sub}</span>}
              {right && <span className="hidden sm:inline ml-auto shrink-0 tabular-nums" style={{ color: 'var(--color-text-muted)' }}>{right}</span>}
            </>}
        </p>
      )}

      {/* Trend */}
      {trend?.kind === 'spark' && (
        <div className={`${hero ? '' : 'hidden sm:block'} mt-0.5`}>
          <Sparkline values={loading ? [] : trend.values} color={accent ?? 'var(--color-primary)'} />
        </div>
      )}
      {trend?.kind === 'bar' && (
        <div className="h-1.5 rounded-full overflow-hidden mt-1" style={{ background: 'color-mix(in srgb, var(--color-text-muted) 18%, transparent)' }}
          role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={loading ? undefined : Math.round(clampPct(trend.pct))}>
          {!loading && (
            <div className="h-full rounded-full transition-[width] duration-300"
              style={{ width: `${clampPct(trend.pct)}%`, background: trend.color ?? accent ?? 'var(--color-primary)' }} />
          )}
        </div>
      )}
    </div>
  );
}

/** Accent line with a soft gradient fill. Two points draw a straight line; fewer draw the empty height so the tile never jumps. */
export function Sparkline({ values, color, height = 32 }: { values: number[]; color: string; height?: number }) {
  const gid = useId();
  if (values.length < 2) return <div style={{ height }} aria-hidden="true" />;
  const min = Math.min(...values), max = Math.max(...values);
  const range = max - min || 1;
  const W = 100, H = 28;
  const pts = values.map((v, i) =>
    `${((i / (values.length - 1)) * W).toFixed(2)},${(H - 3 - ((v - min) / range) * (H - 8)).toFixed(2)}`);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height }} preserveAspectRatio="none" aria-hidden="true">
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" style={{ stopColor: color, stopOpacity: 0.28 }} />
          <stop offset="100%" style={{ stopColor: color, stopOpacity: 0 }} />
        </linearGradient>
      </defs>
      <polygon points={`0,${H} ${pts.join(' ')} ${W},${H}`} fill={`url(#${gid})`} />
      <polyline points={pts.join(' ')} fill="none" style={{ stroke: color }} strokeWidth="1.6"
        strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}
