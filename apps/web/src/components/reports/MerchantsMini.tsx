'use client';

import type { MerchantRow } from '@/lib/reports/compute';
import { money, Delta, Empty } from './ui';

/** The handful of merchants (or income sources) that mattered most this period, with how that changed. */
export default function MerchantsMini({ rows, total, limit = 6, dir = 'expense' }: { rows: MerchantRow[]; total: number; limit?: number; dir?: 'income' | 'expense' }) {
  const top = rows.slice(0, limit);
  if (top.length === 0) return <Empty text={dir === 'income' ? 'No income sources in this period.' : 'No merchants in this period.'} />;
  const max = top[0].total || 1;
  return (
    <ul className="flex flex-col gap-2">
      {top.map((m) => (
        <li key={m.name} className="flex flex-col gap-1 min-w-0">
          <div className="flex items-center justify-between gap-2 text-[12.5px]">
            <span className="truncate flex items-center gap-1.5 min-w-0" style={{ color: 'var(--color-text-primary)' }}>
              <span className="truncate font-semibold">{m.name}</span>
              {m.isNew && <span className="text-fine font-bold px-1 py-0.5 rounded shrink-0" style={{ background: 'color-mix(in srgb, var(--color-card-sky) 16%, transparent)', color: 'var(--color-card-sky)' }}>NEW</span>}
            </span>
            <span className="tabular-nums font-bold shrink-0">{money(m.total)}</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: 'color-mix(in srgb, var(--color-text-muted) 14%, transparent)' }}>
              <div className="h-full rounded-full" style={{ width: `${(m.total / max) * 100}%`, background: dir === 'income' ? 'var(--color-green)' : 'var(--color-card-orange)' }} />
            </div>
            <span className="text-fine tabular-nums w-9 text-right shrink-0" style={{ color: 'var(--color-text-muted)' }}>{total > 0 ? `${Math.round((m.total / total) * 100)}%` : ''}</span>
            <span className="text-fine tabular-nums w-8 text-right shrink-0" style={{ color: 'var(--color-text-muted)' }}>×{m.count}</span>
            <Delta value={m.delta} inverse={dir === 'expense'} className="w-14 justify-end" />
          </div>
        </li>
      ))}
    </ul>
  );
}
