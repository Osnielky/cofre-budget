'use client';

import { useThemeColors } from '@/components/ThemeProvider';
import { fmt } from './chartTheme';

/* ── Icons (stroke paths, 24×24 viewBox) ── */
function StatIcon({ d }: { d: string }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={d} />
    </svg>
  );
}
const ICON_WALLET  = 'M21 12V7H5a2 2 0 0 1 0-4h14v4 M3 5v14a2 2 0 0 0 2 2h16v-5 M18 12a2 2 0 0 0 0 4h4v-4Z';
const ICON_TRENDUP = 'M22 7l-8.5 8.5-5-5L2 17 M16 7h6v6';
const ICON_TRENDDN = 'M22 17l-8.5-8.5-5 5L2 7 M16 17h6v-6';
const ICON_SAVINGS = 'M19 5c-1.5 0-2.8 1.4-3 2-3.5-1.5-11-.3-11 5 0 1.8 0 3 2 4.5V20h4v-2h3v2h4v-4c1-.5 1.7-1 2-2h2v-4h-2c0-1-.5-1.5-1-2V5z M2 9v1c0 1.1.9 2 2 2h1';
const ICON_BUDGET  = 'M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2 M9 5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v0a2 2 0 0 1-2 2h-2a2 2 0 0 1-2-2Z M9 13l2 2 4-4';

/* ── Mini sparkline: accent line + soft gradient fill ── */
function Sparkline({ values, color }: { values: number[]; color: string }) {
  if (values.length < 2) return <div className="h-8" />;
  const min = Math.min(...values), max = Math.max(...values);
  const range = max - min || 1;
  const W = 100, H = 28;
  const pts = values.map((v, i) =>
    `${((i / (values.length - 1)) * W).toFixed(2)},${(H - 3 - ((v - min) / range) * (H - 8)).toFixed(2)}`);
  const gid = `spark-${color.replace(/[^a-zA-Z0-9]/g, '')}`;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-8" preserveAspectRatio="none" aria-hidden="true">
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.28" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={`0,${H} ${pts.join(' ')} ${W},${H}`} fill={`url(#${gid})`} />
      <polyline points={pts.join(' ')} fill="none" stroke={color} strokeWidth="1.6"
        strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

export interface StatCardDef {
  label: string;
  value: string;
  delta: number | null;          // % vs last month; null hides the badge
  inverseDelta?: boolean;        // true = a drop is good (expenses)
  sub: string;                   // muted line next to / instead of the delta
  accent: string;                // card + sparkline color
  icon: 'wallet' | 'trendup' | 'trenddn' | 'savings' | 'budget';
  spark: number[];               // sparkline series
}

const ICONS: Record<StatCardDef['icon'], string> = {
  wallet: ICON_WALLET, trendup: ICON_TRENDUP, trenddn: ICON_TRENDDN,
  savings: ICON_SAVINGS, budget: ICON_BUDGET,
};

export default function StatCardsRow({ cards, loading }: { cards: StatCardDef[]; loading: boolean }) {
  const tc = useThemeColors();
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-4">
      {cards.map((c) => {
        const good = c.delta == null ? true : (c.inverseDelta ? c.delta < 0 : c.delta > 0);
        const deltaTone = good ? tc.green : tc.rose;
        return (
          <div key={c.label}
            className="p-4 flex flex-col gap-2.5 rounded-2xl min-w-0 cursor-default select-none overflow-hidden"
            style={{
              background: `linear-gradient(140deg, color-mix(in srgb, ${c.accent} 9%, transparent), var(--color-surface) 60%)`,
              backdropFilter: 'var(--glass-blur)',
              WebkitBackdropFilter: 'var(--glass-blur)',
              border: 'var(--glass-border)',
              boxShadow: 'var(--glass-shadow)',
            }}>
            <div className="flex items-center gap-2.5 min-w-0">
              <span className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                style={{ background: `color-mix(in srgb, ${c.accent} 18%, transparent)`, color: c.accent }}>
                <StatIcon d={ICONS[c.icon]} />
              </span>
              <span className="text-xs font-medium truncate" style={{ color: 'var(--color-text-secondary)' }}>{c.label}</span>
            </div>
            <p className="text-[22px] leading-7 font-bold tabular-nums truncate">
              {loading ? <span className="opacity-30">—</span> : c.value}
            </p>
            <p className="flex items-center gap-1.5 text-[11px] min-w-0">
              {!loading && c.delta != null && Math.abs(c.delta) >= 0.5 && (
                <span className="font-bold shrink-0" style={{ color: deltaTone }}>
                  {c.delta > 0 ? '↑' : '↓'} {Math.abs(c.delta).toFixed(1)}%
                </span>
              )}
              <span className="truncate" style={{ color: 'var(--color-text-muted)' }}>{c.sub}</span>
            </p>
            <Sparkline values={loading ? [] : c.spark} color={c.accent} />
          </div>
        );
      })}
    </div>
  );
}
