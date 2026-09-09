'use client';

import { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3333/api';

interface CategoryLite { id: string; name: string; icon: string; color: string }
interface AccountLite { id: string; accountName: string; color?: string | null }

interface RecurringRule {
  id: string;
  name: string;
  amount: number | string;
  interval: number;
  unit: 'day' | 'week' | 'month' | 'year';
  dayOfMonth: number | null;
  startDate: string;
  endDate: string | null;
  occurrenceCount: number | null;
  lastRunDate: string | null;
  runCount: number;
  active: boolean;
  category: CategoryLite | null;
  bankAccount: AccountLite | null;
  note: string | null;
}

const glass: React.CSSProperties = {
  background: 'var(--color-surface)',
  backdropFilter: 'var(--glass-blur)',
  WebkitBackdropFilter: 'var(--glass-blur)',
  border: 'var(--glass-border)',
  boxShadow: 'var(--glass-shadow)',
};

const ORDINALS = ['1st','2nd','3rd','4th','5th','6th','7th','8th','9th','10th','11th','12th','13th','14th','15th',
  '16th','17th','18th','19th','20th','21st','22nd','23rd','24th','25th','26th','27th','28th','29th','30th','31st'];

function money(n: number) {
  return `${n < 0 ? '−' : ''}$${Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
}
function fmtDate(d: string) {
  return new Date(`${d}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

/** "Every month on the 1st", "Every 2 weeks". */
function cadence(r: RecurringRule): string {
  const every = r.interval === 1 ? `Every ${r.unit}` : `Every ${r.interval} ${r.unit}s`;
  const monthly = r.unit === 'month' || r.unit === 'year';
  return monthly && r.dayOfMonth ? `${every} on the ${ORDINALS[r.dayOfMonth - 1]}` : every;
}

function endsLabel(r: RecurringRule): string {
  if (r.endDate) return `until ${fmtDate(r.endDate)}`;
  if (r.occurrenceCount) return `${r.runCount} of ${r.occurrenceCount} recorded`;
  return 'no end date';
}

export default function RecurringManager() {
  const [rules, setRules] = useState<RecurringRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [confirm, setConfirm] = useState<RecurringRule | null>(null);
  /** Delete future occurrences too, or leave them as ordinary transactions. */
  const [alsoDeleteFuture, setAlsoDeleteFuture] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`${API}/transactions/recurring`, { credentials: 'include' });
      if (!res.ok) throw new Error();
      const data = await res.json();
      setRules(Array.isArray(data) ? data : []);
    } catch {
      setError('Could not load your recurring payments.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function stopRule(r: RecurringRule) {
    setBusyId(r.id);
    try {
      await fetch(`${API}/transactions/recurring/${r.id}/stop`, { method: 'PATCH', credentials: 'include' });
      await load();
    } finally { setBusyId(null); }
  }

  async function confirmDelete() {
    if (!confirm) return;
    setBusyId(confirm.id);
    try {
      await fetch(`${API}/transactions/recurring/${confirm.id}?deleteFuture=${alsoDeleteFuture}`,
        { method: 'DELETE', credentials: 'include' });
      setConfirm(null);
      await load();
    } finally { setBusyId(null); }
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h3 className="text-base font-bold">Recurring payments</h3>
        <p className="text-xs mt-0.5" style={{ color: 'var(--color-text-muted)' }}>
          Series you set up from Add transaction. Occurrences are recorded as their dates arrive.
        </p>
      </div>

      {loading ? (
        <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>Loading…</p>
      ) : error ? (
        <p className="text-xs" style={{ color: 'var(--color-rose)' }}>{error}</p>
      ) : rules.length === 0 ? (
        <div className="px-4 py-8 rounded-2xl flex flex-col items-center text-center gap-2" style={glass}>
          <span className="text-2xl">🔁</span>
          <p className="text-sm font-semibold">No recurring payments yet</p>
          <p className="text-xs max-w-sm" style={{ color: 'var(--color-text-muted)' }}>
            Turn on “Make it recurring” when adding a transaction and the series will appear here.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {rules.map((r) => {
            const amt = Number(r.amount);
            const accent = r.category?.color ?? (amt >= 0 ? 'var(--color-green)' : 'var(--color-orange)');
            return (
              <div key={r.id} className="flex items-center gap-3 p-3.5 rounded-2xl flex-wrap" style={glass}>
                <span className="w-10 h-10 rounded-xl flex items-center justify-center text-base shrink-0"
                  style={{ background: `color-mix(in srgb, ${accent} 16%, transparent)`, border: `1px solid color-mix(in srgb, ${accent} 30%, transparent)` }}>
                  {r.category?.icon ?? '🔁'}
                </span>

                <div className="flex-1 min-w-40">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-semibold truncate">{r.name}</p>
                    {!r.active && (
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-bold"
                        style={{ background: 'var(--color-elevated)', color: 'var(--color-text-muted)', border: '1px solid var(--color-border)' }}>
                        Stopped
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] mt-0.5" style={{ color: 'var(--color-text-muted)' }}>
                    {cadence(r)} · from {fmtDate(r.startDate)} · {endsLabel(r)}
                    {r.bankAccount ? ` · ${r.bankAccount.accountName}` : ''}
                  </p>
                </div>

                <p className="text-sm font-bold tabular-nums shrink-0"
                  style={{ color: amt >= 0 ? 'var(--color-green)' : 'var(--color-text-primary)' }}>
                  {money(amt)}
                </p>

                <div className="flex items-center gap-1.5 shrink-0">
                  {r.active && (
                    <button type="button" onClick={() => stopRule(r)} disabled={busyId === r.id}
                      className="px-2.5 py-1.5 rounded-lg text-[11px] font-semibold transition-all hover:brightness-125 disabled:opacity-40"
                      style={{ background: 'var(--color-elevated)', border: '1px solid var(--color-border)', color: 'var(--color-text-secondary)' }}>
                      {busyId === r.id ? '…' : 'Stop'}
                    </button>
                  )}
                  <button type="button" onClick={() => { setConfirm(r); setAlsoDeleteFuture(true); }}
                    aria-label={`Delete ${r.name}`}
                    className="w-8 h-8 rounded-lg flex items-center justify-center transition-colors hover:bg-red-500/20"
                    style={{ color: 'var(--color-rose)' }}>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" />
                    </svg>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {confirm && createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}
          onMouseDown={(e) => { if (e.target === e.currentTarget) setConfirm(null); }}>
          <div className="w-full max-w-md rounded-2xl flex flex-col gap-5 p-6"
            style={{ background: 'var(--color-elevated)', border: 'var(--glass-border)', boxShadow: 'var(--glass-shadow)' }}>
            <div>
              <p className="font-bold text-base">Delete “{confirm.name}”?</p>
              <p className="text-xs mt-1.5" style={{ color: 'var(--color-text-muted)' }}>
                This removes the schedule so nothing new is recorded. Occurrences already
                recorded in the past are real spending and are always kept.
              </p>
            </div>

            <label className="flex items-start gap-2.5 cursor-pointer">
              <input type="checkbox" checked={alsoDeleteFuture}
                onChange={(e) => setAlsoDeleteFuture(e.target.checked)}
                className="mt-0.5 w-4 h-4 shrink-0" style={{ accentColor: 'var(--color-rose)' }} />
              <span>
                <span className="block text-xs font-semibold">Also delete future-dated occurrences</span>
                <span className="block text-[11px] mt-0.5" style={{ color: 'var(--color-text-muted)' }}>
                  Leave this off to keep them as ordinary transactions you can edit.
                </span>
              </span>
            </label>

            <div className="flex gap-2 justify-end">
              <button onClick={() => setConfirm(null)}
                className="px-4 py-2 text-sm font-medium rounded-xl transition-colors hover:bg-[var(--color-surface)]"
                style={{ color: 'var(--color-text-secondary)', border: '1px solid var(--color-border)' }}>
                Cancel
              </button>
              <button onClick={confirmDelete} disabled={busyId === confirm.id}
                className="px-4 py-2 text-sm font-semibold rounded-xl transition-all hover:brightness-110 disabled:opacity-40"
                style={{ background: 'color-mix(in srgb, var(--color-rose) 18%, transparent)', border: '1px solid color-mix(in srgb, var(--color-rose) 35%, transparent)', color: 'var(--color-rose)' }}>
                {busyId === confirm.id ? 'Deleting…' : 'Delete schedule'}
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}
