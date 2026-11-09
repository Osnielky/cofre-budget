'use client';

import { useState } from 'react';
import { money, panel, dateLabel } from '../TradingPerformance';
import type { CashSummary } from '@/lib/projects/trading';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3333/api';

export function CashTiles({ cash, platformPnl, hasTrades }: { cash: CashSummary; platformPnl: number; hasTrades: boolean }) {
  const up = (n: number) => (n > 0 ? 'var(--color-green)' : n < 0 ? 'var(--color-rose)' : 'var(--color-text-secondary)');
  const tiles = [
    { label: 'Spent', value: money(cash.spent), clr: cash.spent ? 'var(--color-rose)' : 'var(--color-text-secondary)', sub: cash.spentByCategory.map((c) => `${c.name} ${money(c.total)}`).join(' · ') || 'evaluations, resets, fees' },
    { label: 'Payouts', value: money(cash.payouts.total), clr: cash.payouts.total ? 'var(--color-green)' : 'var(--color-text-secondary)', sub: cash.payouts.count ? `${cash.payouts.count} · avg ${money(cash.payouts.avg ?? 0)} · last ${dateLabel(cash.payouts.last!)}` : 'none yet' },
    { label: 'Net cash', value: money(cash.netCash, true), clr: up(cash.netCash), sub: cash.roi == null ? 'payouts − spent' : `${cash.roi >= 0 ? '+' : ''}${cash.roi}% on what you spent` },
    { label: 'Cost per payout', value: cash.costPerPayout == null ? '—' : money(cash.costPerPayout), clr: 'var(--color-text-primary)', sub: cash.payouts.count ? 'spent ÷ payouts' : 'no payouts yet' },
    { label: 'Days to first payout', value: cash.daysToFirstPayout == null ? '—' : `${cash.daysToFirstPayout}`, clr: 'var(--color-text-primary)', sub: cash.daysActive == null ? 'set a start date' : `${cash.daysActive} days active` },
    { label: 'Platform P&L', value: hasTrades ? money(platformPnl, true) : '—', clr: hasTrades ? up(platformPnl) : 'var(--color-text-secondary)', sub: hasTrades ? 'not yours until paid out' : 'import trades to see it' },
  ];
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3" data-testid="cash-tiles">
      {tiles.map((k) => (
        <div key={k.label} className="p-3 min-w-0" style={panel}>
          <p className="text-fine font-semibold uppercase tracking-wider" style={{ color: 'var(--color-text-muted)' }}>{k.label}</p>
          <p className="font-bold text-base mt-1 truncate" style={{ color: k.clr }}>{k.value}</p>
          <p className="text-fine mt-0.5 truncate" style={{ color: 'var(--color-text-muted)' }}>{k.sub}</p>
        </div>
      ))}
    </div>
  );
}

/** The attributed transactions, newest first; "Unassign" sends the row back to the project's unassigned pool. */
export function CashRows({ projectId, cash, onChanged }: { projectId: string; cash: CashSummary; onChanged: () => Promise<void> }) {
  const [error, setError] = useState<string | null>(null);
  async function unassign(txId: string) {
    setError(null);
    try {
      const r = await fetch(`${API}/projects/${projectId}/tx/${txId}/account`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ accountId: null }) });
      if (!r.ok) throw new Error('Could not unassign');
      await onChanged();
    } catch (e: unknown) { setError(e instanceof Error ? e.message : 'Could not unassign'); }
  }
  return (
    <div className="p-3 sm:p-4 min-w-0" style={panel} data-testid="cash-rows">
      <div className="flex items-baseline justify-between gap-3 mb-2">
        <p className="text-fine font-semibold uppercase tracking-wider" style={{ color: 'var(--color-text-muted)' }}>Money in & out</p>
        <p className="text-fine hidden sm:block" style={{ color: 'var(--color-text-muted)' }}>What you paid and what you received for this account</p>
      </div>
      {error && <p className="text-xs mb-2" style={{ color: 'var(--color-rose)' }}>{error}</p>}
      {cash.rows.length === 0 ? (
        <p className="text-xs py-3" style={{ color: 'var(--color-text-muted)' }}>Nothing attributed yet. Link the evaluation payment or a payout to the project, then pick this account on the row.</p>
      ) : (
        <ul className="flex flex-col divide-y" style={{ borderColor: 'var(--color-border)' }}>
          {cash.rows.map((r) => {
            const out = r.amount > 0;
            return (
              <li key={r.id} className="flex items-center gap-3 py-2 text-xs group">
                <span className="w-6 h-6 rounded-lg flex items-center justify-center text-fine font-bold shrink-0"
                  style={{ background: `color-mix(in srgb, ${out ? 'var(--color-green)' : 'var(--color-rose)'} 16%, transparent)`, color: out ? 'var(--color-green)' : 'var(--color-rose)' }}>{out ? '↓' : '↑'}</span>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold truncate" style={{ color: 'var(--color-text-primary)' }}>{r.name}</p>
                  <p className="text-fine truncate" style={{ color: 'var(--color-text-muted)' }}>{dateLabel(r.date)}{r.category ? ` · ${r.category.icon} ${r.category.name}` : ''}</p>
                </div>
                <span className="font-bold tabular-nums shrink-0" style={{ color: out ? 'var(--color-green)' : 'var(--color-rose)' }}>{out ? '+' : '-'}{money(Math.abs(r.amount))}</span>
                <button type="button" onClick={() => unassign(r.id)} className="text-fine font-semibold sm:opacity-0 sm:group-hover:opacity-100 focus:opacity-100" style={{ color: 'var(--color-text-muted)' }}>Unassign</button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
