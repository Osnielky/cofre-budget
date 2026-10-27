'use client';

import { useMemo, useState } from 'react';
import { useThemeColors } from '@/components/ThemeProvider';
import type { MerchantRow } from '@/lib/reports/compute';
import { money, Delta, Spark, Empty } from './ui';

/** Searchable merchant ranking: total, count, average, change, monthly sparkline, New badge. Rows on phones, a table from md. */
export default function MerchantsTable({ rows, monthsCount, prevLabel }: { rows: MerchantRow[]; monthsCount: number; prevLabel: string }) {
  const tc = useThemeColors();
  const [q, setQ] = useState('');
  const [limit, setLimit] = useState(25);
  const filtered = useMemo(() => { const s = q.trim().toLowerCase(); return s ? rows.filter((r) => r.name.toLowerCase().includes(s)) : rows; }, [rows, q]);
  const visible = filtered.slice(0, limit);
  const total = rows.reduce((s, r) => s + r.total, 0);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2 flex-wrap">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search merchants" aria-label="Search merchants"
          className="px-3 py-2 text-sm rounded-xl outline-none w-full sm:w-64"
          style={{ background: 'var(--color-elevated)', border: '1px solid var(--color-border)', color: 'var(--color-text-primary)' }} />
        <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>{rows.length} merchants · {rows.filter((r) => r.isNew).length} new vs {prevLabel}</p>
      </div>
      {visible.length === 0 ? <Empty text="No merchants match." /> : (
        <>
          {/* md+: table */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-[12.5px]">
              <thead>
                <tr className="text-[10.5px] uppercase tracking-wider text-left" style={{ color: 'var(--color-text-muted)' }}>
                  <th className="py-2 pr-3 font-semibold">Merchant</th>
                  <th className="py-2 px-3 font-semibold text-right">Transactions</th>
                  <th className="py-2 px-3 font-semibold text-right">Average</th>
                  <th className="py-2 px-3 font-semibold text-right">Total</th>
                  <th className="py-2 px-3 font-semibold text-right">Share</th>
                  <th className="py-2 px-3 font-semibold text-right">vs previous</th>
                  {monthsCount > 1 && <th className="py-2 pl-3 font-semibold w-28">Trend</th>}
                </tr>
              </thead>
              <tbody>
                {visible.map((r) => (
                  <tr key={r.name} style={{ borderTop: '1px solid var(--color-border)' }}>
                    <td className="py-2 pr-3 font-semibold truncate max-w-[16rem]" style={{ color: 'var(--color-text-primary)' }}>
                      {r.name}{r.isNew && <span className="ml-2 text-[10px] font-bold px-1.5 py-0.5 rounded-md" style={{ background: `color-mix(in srgb, ${tc.sky} 14%, transparent)`, color: tc.sky }}>New</span>}
                    </td>
                    <td className="py-2 px-3 text-right tabular-nums" style={{ color: 'var(--color-text-secondary)' }}>{r.count}</td>
                    <td className="py-2 px-3 text-right tabular-nums" style={{ color: 'var(--color-text-secondary)' }}>{money(r.avg)}</td>
                    <td className="py-2 px-3 text-right tabular-nums font-bold">{money(r.total)}</td>
                    <td className="py-2 px-3 text-right tabular-nums" style={{ color: 'var(--color-text-muted)' }}>{total > 0 ? `${((r.total / total) * 100).toFixed(1)}%` : '—'}</td>
                    <td className="py-2 px-3 text-right"><Delta value={r.delta} inverse /></td>
                    {monthsCount > 1 && <td className="py-2 pl-3"><Spark values={r.series} color={tc.orange} height={22} /></td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {/* phones: rows */}
          <ul className="md:hidden flex flex-col">
            {visible.map((r, i) => (
              <li key={r.name} className="flex items-center gap-3 py-2.5" style={i > 0 ? { borderTop: '1px solid var(--color-border)' } : undefined}>
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-semibold truncate" style={{ color: 'var(--color-text-primary)' }}>
                    {r.name}{r.isNew && <span className="ml-2 text-[10px] font-bold px-1.5 py-0.5 rounded-md" style={{ background: `color-mix(in srgb, ${tc.sky} 14%, transparent)`, color: tc.sky }}>New</span>}
                  </p>
                  <p className="text-[10.5px]" style={{ color: 'var(--color-text-muted)' }}>{r.count} × avg {money(r.avg)} · <Delta value={r.delta} inverse /></p>
                </div>
                {monthsCount > 1 && <div className="w-16 shrink-0"><Spark values={r.series} color={tc.orange} height={20} /></div>}
                <p className="text-[13px] font-bold tabular-nums shrink-0">{money(r.total)}</p>
              </li>
            ))}
          </ul>
          {filtered.length > limit && (
            <button type="button" onClick={() => setLimit((n) => n + 25)} className="self-start text-xs font-semibold cursor-pointer" style={{ color: 'var(--color-primary)' }}>
              Show more ({filtered.length - limit} left)
            </button>
          )}
        </>
      )}
    </div>
  );
}
