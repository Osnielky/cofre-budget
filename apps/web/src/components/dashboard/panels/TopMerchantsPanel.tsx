'use client';

import { useThemeColors } from '@/components/ThemeProvider';
import Panel, { PanelEmpty } from '../Panel';
import { fmt } from '../chartTheme';
import type { MerchantSlice } from '@/lib/dashboard/derive';

export default function TopMerchantsPanel({ merchants, loading }: { merchants: MerchantSlice[]; loading: boolean }) {
  const tc = useThemeColors();
  const max = merchants[0]?.total || 1;
  return (
    <Panel title="Top Merchants" subtitle="This month" loading={loading}>
      {merchants.length === 0 ? <PanelEmpty message="No purchases recorded this month." /> : (
        <ul className="flex flex-col gap-2.5">
          {merchants.map((m) => (
            <li key={m.name} className="flex items-center gap-2 text-xs">
              <span className="w-24 truncate shrink-0" style={{ color: 'var(--color-text-secondary)' }}>{m.name}</span>
              <div className="flex-1 h-3 rounded-md overflow-hidden" style={{ background: 'color-mix(in srgb, currentColor 6%, transparent)' }}>
                <div className="h-full rounded-md" style={{ width: `${(m.total / max) * 100}%`, background: tc.violet, opacity: 0.85 }} />
              </div>
              <span className="font-semibold tabular-nums w-16 text-right">${fmt(m.total)}</span>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
