'use client';

import { useState, useEffect } from 'react';
import Sidebar from '@/components/Sidebar';
import { useThemeColors } from '@/components/ThemeProvider';
import { useNetWorthGoal } from '@/hooks/useNetWorthGoal';
import { netWorthBreakdown } from '@/lib/dashboard/derive';
import type { BankAccount, Debt } from '@/lib/dashboard/types';
import { fmt } from '@/components/dashboard/chartTheme';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3333/api';

function currentMonth() { return new Date().toISOString().slice(0, 7); }
function fmtDate(iso: string) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

const cardStyle: React.CSSProperties = {
  background: 'var(--color-surface)',
  border: 'var(--glass-border)',
  boxShadow: 'var(--glass-shadow)',
};

export default function GoalsPage() {
  const { data, loading, setTargetDate } = useNetWorthGoal();
  const tc = useThemeColors();
  const [accounts, setAccounts] = useState<BankAccount[]>([]);
  const [debts, setDebts] = useState<Debt[]>([]);
  const [editingDate, setEditingDate] = useState(false);
  const [dateValue, setDateValue] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    Promise.all([
      fetch(`${API}/bank-accounts`, { credentials: 'include' }).then((r) => r.json()),
      fetch(`${API}/debts`, { credentials: 'include' }).then((r) => r.json()),
    ]).then(([accs, dbts]) => {
      setAccounts(Array.isArray(accs) ? accs : []);
      setDebts(Array.isArray(dbts) ? dbts : []);
    });
  }, []);

  const breakdown = netWorthBreakdown(accounts, debts, [], currentMonth());
  const pct = data ? Math.min(100, Math.max(0, (data.current / data.target) * 100)) : 0;

  async function saveDate() {
    setSaving(true);
    try {
      await setTargetDate(dateValue || null);
      setEditingDate(false);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex h-dvh overflow-hidden">
      <Sidebar />
      <main className="flex-1 overflow-y-auto pt-14 md:pt-0">
        <div className="px-6 md:px-8 py-6 flex flex-col gap-6 max-w-3xl">
          <div>
            <h1 className="font-bold tracking-tight" style={{ fontSize: 'clamp(28px, 3vw, 40px)' }}>Net Worth Goal</h1>
            <p className="mt-2" style={{ color: 'var(--color-text-secondary)' }}>
              Cofre&apos;s mission: help you reach $1,000,000 in net worth.
            </p>
          </div>

          {loading || !data ? (
            <p style={{ color: 'var(--color-text-muted)' }}>Loading…</p>
          ) : (
            <>
              <div className="card-lift rounded-2xl p-6 flex flex-col gap-4" style={cardStyle}>
                <div className="flex items-baseline gap-2">
                  <p className="text-4xl font-bold tabular-nums">${fmt(data.current)}</p>
                  <span style={{ color: 'var(--color-text-muted)' }}>of $1,000,000</span>
                </div>
                <div className="h-3 rounded-full overflow-hidden" style={{ background: 'var(--color-elevated)' }}>
                  <div className="h-full rounded-full" style={{ width: `${pct}%`, background: tc.green }} />
                </div>
                <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>{pct.toFixed(1)}% of the way there</p>

                <div className="flex items-center gap-3 flex-wrap pt-4" style={{ borderTop: '1px solid var(--color-border)' }}>
                  <span className="text-xs uppercase tracking-wider" style={{ color: 'var(--color-text-muted)' }}>Target date</span>
                  {editingDate ? (
                    <span className="flex items-center gap-2">
                      <input type="date" value={dateValue} onChange={(e) => setDateValue(e.target.value)}
                        className="px-3 py-1.5 text-sm rounded-lg outline-none"
                        style={{ background: 'var(--color-elevated)', border: '1px solid var(--color-border)', color: 'var(--color-text-primary)' }} />
                      <button onClick={saveDate} disabled={saving} className="text-sm font-semibold cursor-pointer" style={{ color: tc.green }}>Save</button>
                      <button onClick={() => setEditingDate(false)} className="text-sm cursor-pointer" style={{ color: 'var(--color-text-muted)' }}>Cancel</button>
                    </span>
                  ) : (
                    <button onClick={() => { setDateValue(data.targetDate ?? ''); setEditingDate(true); }}
                      className="text-sm font-semibold underline decoration-dotted underline-offset-2 cursor-pointer">
                      {data.targetDate ? fmtDate(data.targetDate) : 'Set a target date'}
                    </button>
                  )}
                </div>

                {data.targetDate && (
                  <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
                    {data.onTrackPct == null
                      ? 'Just getting started — check back in a few days to see your pace.'
                      : data.onTrackPct >= 100
                        ? "You're on track to hit $1M by your target date."
                        : "You're currently off pace for your target date."}
                    {data.projectedDate && ` At this rate, you'll reach $1M around ${fmtDate(data.projectedDate)}.`}
                  </p>
                )}
              </div>

              <div className="card-lift rounded-2xl p-6 grid grid-cols-1 sm:grid-cols-2 gap-6" style={cardStyle}>
                <div className="flex flex-col gap-2 min-w-0">
                  <p className="text-xs font-semibold flex justify-between" style={{ color: 'var(--color-text-muted)' }}>
                    Assets <span style={{ color: tc.green }}>${fmt(breakdown.assets)}</span>
                  </p>
                  {breakdown.assetItems.map((it) => (
                    <p key={it.label} className="flex justify-between gap-2 text-sm">
                      <span className="truncate" style={{ color: 'var(--color-text-secondary)' }}>{it.label}</span>
                      <span className="tabular-nums font-semibold shrink-0">${fmt(it.value)}</span>
                    </p>
                  ))}
                </div>
                <div className="flex flex-col gap-2 min-w-0">
                  <p className="text-xs font-semibold flex justify-between" style={{ color: 'var(--color-text-muted)' }}>
                    Liabilities <span style={{ color: tc.rose }}>${fmt(breakdown.liabilities)}</span>
                  </p>
                  {breakdown.liabilityItems.length === 0
                    ? <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>None</p>
                    : breakdown.liabilityItems.map((it) => (
                      <p key={it.label} className="flex justify-between gap-2 text-sm">
                        <span className="truncate" style={{ color: 'var(--color-text-secondary)' }}>{it.label}</span>
                        <span className="tabular-nums font-semibold shrink-0">${fmt(it.value)}</span>
                      </p>
                    ))}
                </div>
              </div>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
