'use client';

import Link from 'next/link';
import { useThemeColors } from '@/components/ThemeProvider';
import Panel, { PanelEmpty } from '@/components/dashboard/Panel';
import type { NetWorthTrendPoint } from '@/lib/dashboard/derive';
import { money } from '../format';

/** Mini trend line: accent line + soft gradient fill, same visual language as the dashboard stat cards. */
function Sparkline({ points, color }: { points: NetWorthTrendPoint[]; color: string }) {
  const values = points.map((p) => p.value);
  if (values.length < 2) return <div className="h-16" />;
  const min = Math.min(...values), max = Math.max(...values);
  const range = max - min || 1;
  const W = 300, H = 64;
  const pts = values.map((v, i) =>
    `${((i / (values.length - 1)) * W).toFixed(2)},${(H - 4 - ((v - min) / range) * (H - 10)).toFixed(2)}`);
  const gid = `nw-spark-${color.replace(/[^a-zA-Z0-9]/g, '')}`;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-16" preserveAspectRatio="none" aria-hidden="true">
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.3" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={`0,${H} ${pts.join(' ')} ${W},${H}`} fill={`url(#${gid})`} />
      <polyline points={pts.join(' ')} fill="none" stroke={color} strokeWidth="2"
        strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      <circle cx={pts[pts.length - 1].split(',')[0]} cy={pts[pts.length - 1].split(',')[1]} r="3.5" fill={color} />
    </svg>
  );
}

interface Props {
  monthNet: number;
  trend: NetWorthTrendPoint[];
  onTrackPct: number | null;
  loading: boolean;
}

export default function MomentumCard({ monthNet, trend, onTrackPct, loading }: Props) {
  const tc = useThemeColors();
  const positive = monthNet >= 0;
  const color = positive ? tc.green : tc.rose;
  const hasTrend = trend.some((p) => p.value !== trend[0]?.value);

  const message = !hasTrend
    ? 'Keep adding to your accounts to start seeing a trend here.'
    : positive
      ? onTrackPct != null && onTrackPct >= 100
        ? "You're ahead of pace — keep it up."
        : 'Your net worth grew this month.'
      : 'Your net worth dipped this month.';

  return (
    <Panel title="Keep the momentum" subtitle={`Last ${trend.length} months`} loading={loading}>
      {trend.length === 0 ? (
        <PanelEmpty message="Not enough history yet to show a trend." />
      ) : (
        <div className="flex flex-col gap-3 flex-1">
          <div>
            <p className="text-3xl font-bold tabular-nums" style={{ color }}>
              {positive ? '+' : ''}{money(monthNet)}
            </p>
            <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>this month&apos;s contribution</p>
          </div>

          <Sparkline points={trend} color={color} />

          <p className="text-sm font-semibold" style={{ color }}>{message}</p>

          <Link href="/settings"
            className="btn-gold mt-auto inline-flex items-center justify-center py-3 rounded-xl text-sm font-semibold no-underline transition-all">
            Update assets
          </Link>
        </div>
      )}
    </Panel>
  );
}
