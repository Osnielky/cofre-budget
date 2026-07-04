'use client';

import { useThemeColors } from '@/components/ThemeProvider';
import Panel from '../Panel';
import { fmt } from '../chartTheme';
import type { NetWorthBreakdown } from '@/lib/dashboard/derive';

export default function NetWorthPanel({ data, loading }: { data: NetWorthBreakdown; loading: boolean }) {
  const tc = useThemeColors();
  const gross = data.assets + data.liabilities;
  return (
    <Panel title="Net Worth" subtitle="Current" loading={loading}>
      <div className="flex items-baseline gap-2">
        <p className="text-2xl font-bold tabular-nums">{data.total < 0 ? '-' : ''}${fmt(Math.abs(data.total))}</p>
        {data.deltaPct != null && (
          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md"
            style={{
              color: data.deltaPct >= 0 ? tc.green : tc.rose,
              background: `color-mix(in srgb, ${data.deltaPct >= 0 ? tc.green : tc.rose} 14%, transparent)`,
            }}>
            {data.deltaPct >= 0 ? '↑' : '↓'}{Math.abs(data.deltaPct).toFixed(1)}% ≈ vs last month
          </span>
        )}
      </div>
      {gross > 0 && (
        <div className="flex h-2.5 rounded-full overflow-hidden gap-0.5">
          <div style={{ width: `${(data.assets / gross) * 100}%`, background: tc.green }} />
          <div style={{ width: `${(data.liabilities / gross) * 100}%`, background: tc.rose }} />
        </div>
      )}
      <div className="grid grid-cols-2 gap-3 text-xs">
        {[{ label: 'Assets', total: data.assets, items: data.assetItems, color: tc.green },
          { label: 'Liabilities', total: data.liabilities, items: data.liabilityItems, color: tc.rose }].map((col) => (
          <div key={col.label} className="flex flex-col gap-1.5 min-w-0">
            <p className="text-[10px] font-semibold flex justify-between" style={{ color: 'var(--color-text-muted)' }}>
              {col.label} <span style={{ color: col.color }}>${fmt(col.total)}</span>
            </p>
            {col.items.slice(0, 4).map((it) => (
              <p key={it.label} className="flex justify-between gap-1">
                <span className="truncate" style={{ color: 'var(--color-text-secondary)' }}>{it.label}</span>
                <span className="tabular-nums font-semibold shrink-0">${fmt(it.value)}</span>
              </p>
            ))}
            {col.items.length === 0 && <p style={{ color: 'var(--color-text-muted)' }}>None</p>}
          </div>
        ))}
      </div>
    </Panel>
  );
}
