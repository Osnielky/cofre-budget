import type { ThemeColors } from '@/components/ThemeProvider';

/** $1,234.56 */
export function fmt(n: number) { return n.toLocaleString('en-US', { minimumFractionDigits: 2 }); }

/** Compact axis money: -$12k / $850 */
export function fmtAxis(v: number) {
  const sign = v < 0 ? '-' : '';
  const a = Math.abs(v);
  return `${sign}$${a >= 1000 ? `${(a / 1000).toFixed(0)}k` : a}`;
}

export function makeChartTheme(tc: ThemeColors) {
  return {
    xAxis: { tick: { fill: tc.textMuted, fontSize: 10 }, axisLine: false, tickLine: false } as const,
    yAxis: {
      tick: { fill: tc.textMuted, fontSize: 10 }, axisLine: false, tickLine: false,
      width: 44, tickFormatter: fmtAxis,
    } as const,
    grid: { vertical: false, stroke: tc.border } as const,
    tooltip: {
      cursor: { fill: 'color-mix(in srgb, currentColor 5%, transparent)' },
      contentStyle: { background: 'var(--color-elevated)', border: 'var(--glass-border)', borderRadius: 12, fontSize: 12 },
      labelStyle: { color: tc.textPrimary, fontWeight: 700, marginBottom: 4 },
    } as const,
  };
}
