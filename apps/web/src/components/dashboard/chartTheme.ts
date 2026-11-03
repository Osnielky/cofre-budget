import type { ThemeColors } from '@/components/ThemeProvider';
import { ChartTooltipContent } from './ChartTooltipContent';

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
    /* One themed body for every chart: text in the theme's colours, series colour
       as a swatch. recharts' default body colours its text with the series fill
       and falls back to black when there is none (Cell-coloured bars, custom
       shapes, Sankey nodes) — unreadable on dark themes. */
    tooltip: {
      cursor: { fill: 'color-mix(in srgb, currentColor 5%, transparent)' },
      content: ChartTooltipContent,
    } as const,
  };
}
