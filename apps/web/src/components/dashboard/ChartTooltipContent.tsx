'use client';

import type { CSSProperties, ReactNode } from 'react';
import type { TooltipContentProps, TooltipPayloadEntry } from 'recharts';

/* The one tooltip body every recharts chart uses (wired through
   `makeChartTheme().tooltip.content`).

   Why not recharts' default body: it colours each line with the series'
   `fill` / `stroke` and falls back to hard black when a series has none —
   bars coloured per <Cell> or drawn by a custom shape, Sankey nodes — which
   is unreadable on every dark theme. Here the text is always the theme's
   text colour and the series colour becomes a swatch, so identity survives
   without ever deciding the text colour. Honours the chart's `formatter`,
   `labelFormatter` and `itemSorter` like the default body does. */

const BOX: CSSProperties = {
  background: 'var(--popover-bg)',
  border: 'var(--glass-border)',
  boxShadow: 'var(--glass-shadow)',
  borderRadius: 12,
  padding: '8px 12px',
  fontSize: 12,
  lineHeight: 1.35,
  color: 'var(--color-text-primary)',
  whiteSpace: 'nowrap',
};

const LABEL: CSSProperties = { margin: '0 0 4px', fontWeight: 700, color: 'var(--color-text-primary)' };
const ROW: CSSProperties = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '2px 0' };
const NAME: CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 6, color: 'var(--color-text-secondary)' };
const VALUE: CSSProperties = { fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: 'var(--color-text-primary)' };

function swatch(color: string | undefined): CSSProperties {
  return { width: 8, height: 8, borderRadius: 999, flex: 'none', backgroundColor: color };
}

function isText(v: unknown): v is string | number {
  return (typeof v === 'string' && v !== '') || typeof v === 'number';
}

function sortItems(payload: ReadonlyArray<TooltipPayloadEntry>, sorter: TooltipContentProps['itemSorter']) {
  if (sorter == null) return [...payload];
  const key = typeof sorter === 'function'
    ? sorter
    : (e: TooltipPayloadEntry) => (e as unknown as Record<string, unknown>)[sorter];
  return [...payload].sort((a, b) => {
    const ka = key(a), kb = key(b);
    return ka == null || kb == null ? 0 : ka < kb ? -1 : ka > kb ? 1 : 0;
  });
}

export function ChartTooltipContent(props: TooltipContentProps) {
  const { active, payload, label, formatter, labelFormatter, itemSorter } = props;
  if (!active || !payload?.length) return null;

  const rows: ReactNode[] = [];
  sortItems(payload, itemSorter).forEach((entry, i) => {
    let value: ReactNode = entry.value;
    let name: ReactNode = entry.name;
    const fmt = entry.formatter ?? formatter;
    if (fmt) {
      const out = fmt(entry.value, entry.name, entry, i, payload);
      if (Array.isArray(out)) [value, name] = out;
      else if (out != null) value = out;
      else return;
    }
    const key = `${String(entry.dataKey ?? entry.name ?? i)}-${i}`;
    rows.push(
      <div key={key} style={ROW} className="recharts-tooltip-item">
        {isText(name) && (
          <span style={NAME}>
            {entry.color && <span aria-hidden="true" style={swatch(entry.color)} />}
            {name}
          </span>
        )}
        <span style={VALUE}>{value}{entry.unit ?? ''}</span>
      </div>,
    );
  });
  if (!rows.length) return null;

  const title = labelFormatter && label != null ? labelFormatter(label, payload) : label;
  return (
    <div style={BOX} className="recharts-default-tooltip">
      {isText(title) && <p style={LABEL}>{title}</p>}
      {rows}
    </div>
  );
}
