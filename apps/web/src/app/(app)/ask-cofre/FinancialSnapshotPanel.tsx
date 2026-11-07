'use client';

import { AreaChart, Area, ResponsiveContainer } from 'recharts';
import { useThemeColors } from '@/components/ThemeProvider';
import { fmt } from '@/components/dashboard/chartTheme';
import { useDashboardData } from '@/hooks/useDashboardData';
import { netWorthBreakdown, netWorthTrend, monthlyCashFlow, expenseChanges } from '@/lib/dashboard/derive';

function currentMonthKey() { return new Date().toISOString().slice(0, 7); }

function ProgressRing({ pct, color }: { pct: number; color: string }) {
  const size = 64, stroke = 7, r = (size - stroke) / 2, c = 2 * Math.PI * r;
  const clamped = Math.max(0, Math.min(100, pct));
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="shrink-0">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--color-border)" strokeWidth={stroke} />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round"
        strokeDasharray={c} strokeDashoffset={c - (clamped / 100) * c}
        transform={`rotate(-90 ${size / 2} ${size / 2})`} />
    </svg>
  );
}

function SnapshotCard({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-2xl p-4"
      style={{ background: 'var(--color-surface)', backdropFilter: 'var(--glass-blur)', WebkitBackdropFilter: 'var(--glass-blur)', border: 'var(--glass-border)', boxShadow: 'var(--glass-shadow)' }}>
      {children}
    </div>
  );
}

export default function FinancialSnapshotPanel() {
  const tc = useThemeColors();
  const { accounts, debts, budgets, yearTx, loading } = useDashboardData();

  if (loading) {
    return <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>Loading snapshot…</p>;
  }

  const now = new Date();
  const monthKey = currentMonthKey();
  const nw = netWorthBreakdown(accounts, debts, yearTx, monthKey);
  const trend = netWorthTrend(nw.total, yearTx, now).map((p) => ({ month: p.month, value: p.value }));
  const cashFlow = monthlyCashFlow(yearTx, now).at(-1)?.net ?? 0;
  const roadToMillionPct = Math.max(0, Math.min(100, (nw.total / 1_000_000) * 100));
  const trendColor = nw.deltaPct !== null && nw.deltaPct < 0 ? tc.rose : tc.green;

  const topIncrease = expenseChanges(yearTx, monthKey).changes
    .filter((c) => c.delta > 0 && c.pct !== null && c.pct > 0)
    .sort((a, b) => (b.pct ?? 0) - (a.pct ?? 0))[0];

  return (
    <div className="flex flex-col gap-4">
      <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--color-text-muted)' }}>
        Financial Snapshot
      </p>

      <SnapshotCard>
        <div className="flex items-center justify-between mb-1">
          <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>Net Worth</p>
          {nw.deltaPct !== null && (
            <span className="text-[11px] font-semibold" style={{ color: trendColor }}>
              {nw.deltaPct >= 0 ? '+' : ''}{nw.deltaPct}%
            </span>
          )}
        </div>
        <p className="text-2xl font-bold" style={{ color: 'var(--color-text-primary)' }}>${fmt(nw.total)}</p>
        {trend.length > 1 && (
          <div className="h-10 mt-1 -mx-1">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={trend}>
                <defs>
                  <linearGradient id="snapshot-nw-fill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={trendColor} stopOpacity={0.35} />
                    <stop offset="100%" stopColor={trendColor} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <Area type="monotone" dataKey="value" stroke={trendColor} strokeWidth={2} fill="url(#snapshot-nw-fill)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </SnapshotCard>

      <SnapshotCard>
        <div className="flex items-center gap-3">
          <span className="w-9 h-9 rounded-full flex items-center justify-center shrink-0" style={{ background: 'var(--color-card-green)' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round"><path d="M7 14l5-5 3 3 5-6M7 8h13v13"/></svg>
          </span>
          <div>
            <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>Monthly Cash Flow</p>
            <p className="text-lg font-bold" style={{ color: cashFlow >= 0 ? 'var(--color-green)' : 'var(--color-rose)' }}>
              {cashFlow >= 0 ? '+' : '-'}${fmt(Math.abs(cashFlow))}
            </p>
          </div>
        </div>
      </SnapshotCard>

      <SnapshotCard>
        <div className="flex items-center gap-4">
          <ProgressRing pct={roadToMillionPct} color={tc.green} />
          <div className="min-w-0">
            <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>Road to $1M</p>
            <p className="text-2xl font-bold" style={{ color: 'var(--color-text-primary)' }}>{roadToMillionPct.toFixed(1)}%</p>
            <p className="text-[11px] truncate" style={{ color: 'var(--color-text-muted)' }}>${fmt(nw.total)} of $1,000,000</p>
          </div>
        </div>
      </SnapshotCard>

      {topIncrease && (
        <SnapshotCard>
          <div className="flex items-center gap-2 mb-2">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--color-card-amber)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2l2.5 6.5L21 11l-6.5 2.5L12 20l-2.5-6.5L3 11l6.5-2.5L12 2Z"/></svg>
            <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--color-text-muted)' }}>AI Insight</p>
          </div>
          <div className="flex items-center gap-3">
            <span className="w-9 h-9 rounded-full flex items-center justify-center text-base shrink-0"
              style={{ background: `color-mix(in srgb, ${topIncrease.color} 20%, transparent)` }}>
              {topIncrease.icon}
            </span>
            <p className="text-sm" style={{ color: 'var(--color-text-primary)' }}>
              {topIncrease.name} is <span className="font-bold" style={{ color: 'var(--color-card-amber)' }}>{topIncrease.pct}% above</span> your usual spending.
            </p>
          </div>
        </SnapshotCard>
      )}
    </div>
  );
}
