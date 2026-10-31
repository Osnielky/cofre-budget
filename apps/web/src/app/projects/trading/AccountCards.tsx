'use client';

import { accountFigures, accountSparkline, accountTitle, lastActivity, sortAccounts, statusTone, KIND_LABEL, STATUS_LABEL } from '@/lib/projects/trading';
import { relativeDay } from '@/lib/projects/overview';
import type { ProjectPerformance } from '../TradingPerformance';

type AccountPerf = ProjectPerformance['accounts'][number];
const TONE = { up: 'var(--color-green)', down: 'var(--color-rose)', flat: 'var(--color-text-primary)', muted: 'var(--color-text-muted)' } as const;

function trailingMonths(n = 6): string[] {
  const now = new Date();
  return Array.from({ length: n }, (_, i) => { const d = new Date(now.getFullYear(), now.getMonth() - (n - 1 - i), 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; });
}

/** One card per followed account; clicking opens that account (level 2). */
export default function AccountCards({ accounts, unassigned, onOpen, onAdd }: { accounts: AccountPerf[]; unassigned: number; onOpen: (id: string) => void; onAdd: () => void }) {
  const months = trailingMonths();
  const list = sortAccounts(accounts);
  return (
    <div className="flex flex-col gap-3" data-testid="account-cards">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-bold" style={{ color: 'var(--color-text-primary)' }}>Accounts</p>
        <button type="button" onClick={onAdd} className="text-[11px] font-semibold px-2.5 py-1.5 rounded-lg hover:brightness-110"
          style={{ color: 'var(--color-primary)', border: '1px solid color-mix(in srgb, var(--color-primary) 30%, transparent)' }}>+ Add account</button>
      </div>
      {list.length === 0 && (
        <p className="text-xs px-4 py-6 text-center rounded-xl" style={{ color: 'var(--color-text-muted)', border: '1px dashed var(--color-border)' }}>
          No accounts yet. Add a connected brokerage or an account you are not connected to (a prop-firm combine), then attribute its payments and payouts to it.
        </p>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
        {list.map((a) => {
          const figures = accountFigures(a);
          const points = accountSparkline(a, months);
          const dim = a.meta.status === 'failed' || a.meta.status === 'closed';
          const hint = a.meta.kind === 'prop_firm' && !a.cash?.rows.length ? 'Nothing attributed yet' : a.meta.kind === 'prop_firm' && a.trades.closed === 0 ? 'No trades imported' : null;
          return (
            <button key={a.account.id} type="button" onClick={() => onOpen(a.account.id)} data-testid="account-card"
              className="text-left flex flex-col gap-3 p-4 rounded-2xl transition-all card-lift"
              style={{ background: 'var(--color-surface)', border: 'var(--glass-border)', boxShadow: 'var(--glass-shadow)', opacity: dim ? 0.6 : 1, cursor: 'pointer' }}>
              <div className="flex items-start gap-3 min-w-0">
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm truncate" style={{ color: 'var(--color-text-primary)' }}>{accountTitle(a)}</p>
                  <div className="flex items-center gap-1.5 mt-1 flex-wrap text-[10px] font-bold">
                    <span className="px-1.5 py-0.5 rounded-md" style={{ background: 'color-mix(in srgb, var(--color-card-sky) 16%, transparent)', color: 'var(--color-card-sky)' }}>
                      {KIND_LABEL[a.meta.kind]}{a.meta.provider === 'plaid' ? ' · Connected' : ''}
                    </span>
                    <span className="px-1.5 py-0.5 rounded-md" style={{ background: `color-mix(in srgb, ${TONE[statusTone(a.meta.status)]} 14%, transparent)`, color: TONE[statusTone(a.meta.status)] }}>
                      {STATUS_LABEL[a.meta.status]}
                    </span>
                    {a.meta.accountSize != null && <span style={{ color: 'var(--color-text-muted)' }}>${Math.round(a.meta.accountSize / 1000)}K</span>}
                  </div>
                </div>
                <Spark points={points} />
              </div>
              <div className="grid grid-cols-3 gap-2">
                {figures.map((f) => (
                  <div key={f.label} className="min-w-0">
                    <p className="text-[10px] truncate" style={{ color: 'var(--color-text-muted)' }}>{f.label}</p>
                    <p className="text-sm font-bold truncate tabular-nums" style={{ color: TONE[f.tone] }}>{f.value}</p>
                  </div>
                ))}
              </div>
              <div className="flex items-center justify-between text-[10px]" style={{ color: 'var(--color-text-muted)' }}>
                <span className="truncate" style={hint ? { color: 'var(--color-amber)' } : undefined}>{hint ?? `${a.trades.closed} closed · ${a.cash ? `${a.cash.rows.length} cash rows` : 'connected'}`}</span>
                <span className="shrink-0 ml-2">{relativeDay(lastActivity(a))}</span>
              </div>
            </button>
          );
        })}
      </div>
      {unassigned > 0 && (
        <p className="text-xs px-3 py-2 rounded-xl" style={{ color: 'var(--color-amber)', background: 'color-mix(in srgb, var(--color-amber) 8%, transparent)', border: '1px solid color-mix(in srgb, var(--color-amber) 25%, transparent)' }}>
          {unassigned} project transaction{unassigned === 1 ? '' : 's'} {unassigned === 1 ? 'has' : 'have'} no account yet — assign them in the list below so each account&apos;s numbers are complete.
        </p>
      )}
    </div>
  );
}

function Spark({ points }: { points: number[] }) {
  const w = 64, h = 26, pad = 2;
  if (points.length < 2) return <div style={{ width: w, height: h }} aria-hidden="true" />;
  const lo = Math.min(0, ...points), hi = Math.max(0, ...points), span = hi - lo || 1;
  const x = (i: number) => pad + (i / (points.length - 1)) * (w - pad * 2);
  const y = (v: number) => h - pad - ((v - lo) / span) * (h - pad * 2);
  const d = points.map((v, i) => `${i ? 'L' : 'M'} ${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(' ');
  const end = points[points.length - 1];
  const stroke = end > 0 ? 'var(--color-green)' : end < 0 ? 'var(--color-rose)' : 'var(--color-text-muted)';
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="shrink-0" aria-hidden="true">
      <line x1={pad} x2={w - pad} y1={y(0)} y2={y(0)} stroke="var(--color-border)" strokeWidth="1" />
      <path d={d} fill="none" stroke={stroke} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
