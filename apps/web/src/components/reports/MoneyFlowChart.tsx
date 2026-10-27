'use client';

import { Sankey, Tooltip, ResponsiveContainer } from 'recharts';
import { useThemeColors } from '@/components/ThemeProvider';
import { useNarrowScreen } from '@/hooks/useNarrowScreen';
import type { MoneyFlow } from '@/lib/reports/compute';
import { money, compact, Empty } from './ui';

/* Income sources flow into "Cash", which flows out to spending categories and
   to "Saved" (surplus). A deficit appears as a "Savings & credit" source. Node
   colours are the categories' own; links take their source node's colour. */

interface NodeRenderProps { x: number; y: number; width: number; height: number; index: number; payload: { name: string; color?: string; value?: number; kind?: string }; containerWidth?: number }
interface LinkRenderProps { sourceX: number; targetX: number; sourceY: number; targetY: number; sourceControlX: number; targetControlX: number; linkWidth: number; index: number; payload: { source: { color?: string }; target: { color?: string }; value: number } }

export default function MoneyFlowChart({ flow, height }: { flow: MoneyFlow; height?: number }) {
  const tc = useThemeColors();
  /* Phones: tighter label gutters and a smaller font so the whole flow fits 343px
     without sideways scrolling; wider screens get roomy labels. */
  const narrow = useNarrowScreen();
  const gutter = narrow ? { left: 88, right: 96 } : { left: 120, right: 120 };
  const font = narrow ? 10 : 11;
  if (flow.links.length === 0) return <Empty text="No income or spending in this period yet." />;
  /* Tall enough for the busier column: every node needs ~44px for its two-line label. */
  const sources = flow.nodes.filter((n) => n.kind === 'income' || n.kind === 'deficit').length;
  const sinks = flow.nodes.filter((n) => n.kind === 'spend' || n.kind === 'saved').length;
  const h = height ?? Math.max(280, Math.min(600, Math.max(sources, sinks) * 46 + 48));
  const hubIndex = flow.nodes.findIndex((n) => n.kind === 'hub');
  const data = {
    nodes: flow.nodes.map((n) => ({ ...n, color: n.kind === 'hub' ? tc.primary : n.kind === 'saved' ? tc.green : n.kind === 'deficit' ? tc.rose : n.color })),
    links: flow.links,
  };

  const Node = (props: NodeRenderProps) => {
    const { x, y, width, height: hh, payload, containerWidth = 800 } = props;
    const leftSide = x < containerWidth / 2;
    const isHub = payload.kind === 'hub';
    const label = `${payload.name}`;
    const value = compact(payload.value ?? 0);
    const tx = isHub ? x + width / 2 : leftSide ? x - 8 : x + width + 8;
    const anchor = isHub ? 'middle' : leftSide ? 'end' : 'start';
    return (
      <g>
        <rect x={x} y={y} width={width} height={Math.max(hh, 2)} rx={3} fill={payload.color} fillOpacity={0.95} />
        {isHub ? (
          <text x={tx} y={y - 8} textAnchor={anchor} fontSize={font} fontWeight={700} fill={tc.textPrimary}>{label} · {value}</text>
        ) : (
          <>
            <text x={tx} y={y + hh / 2 - 2} textAnchor={anchor} fontSize={font} fontWeight={600} fill={tc.textPrimary}>{label}</text>
            <text x={tx} y={y + hh / 2 + 11} textAnchor={anchor} fontSize={font - 1} fill={tc.textMuted}>{value}</text>
          </>
        )}
      </g>
    );
  };

  const Link = (props: LinkRenderProps) => {
    const { sourceX, targetX, sourceY, targetY, sourceControlX, targetControlX, linkWidth, payload } = props;
    const color = payload.source?.color ?? tc.primary;
    return (
      <path d={`M${sourceX},${sourceY} C${sourceControlX},${sourceY} ${targetControlX},${targetY} ${targetX},${targetY}`}
        fill="none" stroke={color} strokeOpacity={0.32} strokeWidth={Math.max(linkWidth, 1)} />
    );
  };

  return (
    <div className="overflow-x-auto -mx-1 px-1">
      <div style={{ minWidth: narrow ? 330 : 520, height: h }}>
        <ResponsiveContainer width="100%" height="100%">
          <Sankey data={data} nodeWidth={narrow ? 9 : 12} nodePadding={18} iterations={48} linkCurvature={0.5}
            margin={{ top: 24, right: gutter.right, bottom: 20, left: gutter.left }}
            /* recharts types the render props with its own node shape; ours adds `color`/`kind`. */
            node={Node as never}
            link={Link as never}
            sort={false}>
            <Tooltip
              contentStyle={{ background: 'var(--popover-bg)', border: 'var(--glass-border)', borderRadius: 12, fontSize: 12 }}
              formatter={(v: unknown) => [money(Number(v)), 'Amount']} />
          </Sankey>
        </ResponsiveContainer>
      </div>
      {hubIndex >= 0 && (
        <p className="text-[11px] mt-1" style={{ color: 'var(--color-text-muted)' }}>
          {flow.income >= flow.spending
            ? <>You kept <span className="font-semibold" style={{ color: tc.green }}>{money(flow.income - flow.spending)}</span> of {money(flow.income)} earned.</>
            : <>Spending exceeded income by <span className="font-semibold" style={{ color: tc.rose }}>{money(flow.spending - flow.income)}</span>, covered from savings or credit.</>}
        </p>
      )}
    </div>
  );
}
