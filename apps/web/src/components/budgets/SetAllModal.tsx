'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import type { Category } from '@/lib/dashboard/types';
import { API } from '@/hooks/useBudgetScenario';
import { parseMoneyInput } from '@/lib/budgets/money';
import { saveBudgetBatch, type BatchItemPayload } from '@/lib/budgets/persist';

function monthLabel(m: string) {
  const [y, mo] = m.split('-');
  return new Date(Number(y), Number(mo) - 1).toLocaleString('default', { month: 'long', year: 'numeric' });
}
function fmt(n: number) { return Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2 }); }

/** Set every expense category's budget in one table. Prefilled from the plan as
    currently shown (unsaved drafts included); saves atomically via PUT /budgets/batch. */
export default function SetAllModal({ month, categories, current, onClose, onSaved }: {
  month: string; categories: Category[];
  /** categoryId → budget id (null if none yet) and the amount shown on the page, in dollars */
  current: Map<string, { budgetId: string | null; amount: number }>;
  onClose: () => void; onSaved: (saved: number) => void;
}) {
  const [setAllRows, setSetAllRows] = useState(() => categories
    .filter((c) => c.type !== 'income' && c.type !== 'transfer')
    .map((c) => {
      const cur = current.get(c.id);
      return { categoryId: c.id, amount: cur && (cur.budgetId || cur.amount > 0) ? String(cur.amount) : '' };
    }));
  const [setAllAvgs, setSetAllAvgs]     = useState<Record<string, number>>({});
  const [setAllSaving, setSetAllSaving] = useState(false);
  const [error, setError]               = useState<string | null>(null);
  const setSetAllOpen = (open: boolean) => { if (!open) onClose(); };

  useEffect(() => {
    fetch(`${API}/budgets/category-averages?months=3`, { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : {}))
      .then((d) => setSetAllAvgs(d && typeof d === 'object' ? (d as Record<string, number>) : {}))
      .catch(() => undefined);
  }, []);

  function setRowAmount(categoryId: string, amount: string) {
    setSetAllRows((rows) => rows.map((r) => (r.categoryId === categoryId ? { ...r, amount } : r)));
  }

  function fillAllFromAverage() {
    setSetAllRows((rows) => rows.map((r) => {
      const avg = setAllAvgs[r.categoryId];
      return avg && avg > 0 ? { ...r, amount: String(Math.round(avg)) } : r;
    }));
  }

  async function saveAllBudgets() {
    setError(null);
    const items: BatchItemPayload[] = [];
    for (const r of setAllRows) {
      if (r.amount.trim() === '') continue;
      const p = parseMoneyInput(r.amount);
      if (!p.ok) {
        setError(`${categories.find((c) => c.id === r.categoryId)?.name ?? 'Category'}: ${p.error}`);
        return;
      }
      const cur = current.get(r.categoryId);
      items.push(cur?.budgetId ? { id: cur.budgetId, amount: p.cents / 100 } : { categoryId: r.categoryId, amount: p.cents / 100 });
    }
    setSetAllSaving(true);
    const res = await saveBudgetBatch(API, { month, items });
    setSetAllSaving(false);
    if (!res.ok) { setError(res.error); return; }
    onSaved(res.saved);
    onClose();
  }

  return createPortal(
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
            style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(6px)' }}
            onMouseDown={(e) => { if (e.target === e.currentTarget && !setAllSaving) setSetAllOpen(false); }}>
            <div className="w-full max-w-2xl flex flex-col rounded-2xl overflow-hidden"
              style={{ background: 'var(--color-elevated)', border: 'var(--glass-border)', boxShadow: 'var(--glass-shadow)', maxHeight: '88vh' }}>

              {/* Header */}
              <div className="px-5 py-4" style={{ borderBottom: '1px solid var(--color-border)' }}>
                <p className="font-bold text-sm" style={{ color: 'var(--color-text-primary)' }}>Set monthly budgets</p>
                <p className="text-xs mt-0.5" style={{ color: 'var(--color-text-muted)' }}>
                  {monthLabel(month)} · set every category at once. “Avg” is your typical spend over the last 3 months.
                </p>
              </div>

              {/* Toolbar */}
              <div className="flex items-center justify-between px-5 py-3" style={{ borderBottom: '1px solid var(--color-border)' }}>
                <button type="button" onClick={fillAllFromAverage}
                  className="px-3 py-1.5 text-xs font-semibold rounded-lg transition-all hover:brightness-110 flex items-center gap-1.5"
                  style={{ background: 'color-mix(in srgb, var(--color-card-violet) 16%, transparent)', color: 'var(--color-card-violet)', border: '1px solid color-mix(in srgb, var(--color-card-violet) 30%, transparent)' }}>
                  ✨ Fill all from average
                </button>
                <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                  Budgeted&nbsp;
                  <strong className="tabular-nums" style={{ color: 'var(--color-text-primary)' }}>
                    ${fmt(setAllRows.reduce((s, r) => s + (parseFloat(r.amount) || 0), 0))}
                  </strong>
                </span>
              </div>

              {/* Rows */}
              <div className="overflow-y-auto px-2 py-2" style={{ flex: 1 }}>
                {setAllRows.length === 0 ? (
                  <p className="text-xs text-center py-10" style={{ color: 'var(--color-text-muted)' }}>
                    No expense categories yet. Create categories first in Settings.
                  </p>
                ) : setAllRows.map((row) => {
                  const cat = categories.find((c) => c.id === row.categoryId);
                  const avg = setAllAvgs[row.categoryId];
                  const c   = cat?.color || 'var(--color-card-violet)';
                  return (
                    <div key={row.categoryId} className="flex items-center gap-3 px-3 py-2 rounded-xl transition-colors hover:bg-[var(--color-surface)]">
                      <span className="w-8 h-8 rounded-lg flex items-center justify-center text-base shrink-0"
                        style={{ background: `color-mix(in srgb, ${c} 18%, transparent)`, border: `1px solid color-mix(in srgb, ${c} 30%, transparent)` }}>
                        {cat?.icon || '📁'}
                      </span>
                      <span className="flex-1 min-w-0 text-sm font-medium truncate" style={{ color: 'var(--color-text-primary)' }}>
                        {cat?.name || 'Category'}
                      </span>
                      <button type="button"
                        onClick={() => { if (avg && avg > 0) setRowAmount(row.categoryId, String(Math.round(avg))); }}
                        disabled={!avg || avg <= 0}
                        title={avg && avg > 0 ? 'Use this average' : 'No recent spending'}
                        className="text-[11px] tabular-nums px-2 py-1 rounded-md transition-colors disabled:cursor-default hover:bg-[var(--color-elevated)]"
                        style={{ color: 'var(--color-text-muted)' }}>
                        {avg != null && avg > 0 ? `avg $${fmt(avg)}` : '—'}
                      </button>
                      <div className="flex items-center gap-1 shrink-0 px-2 rounded-lg"
                        style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
                        <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>$</span>
                        <input value={row.amount} inputMode="decimal" placeholder="0"
                          onChange={(e) => setRowAmount(row.categoryId, e.target.value.replace(/[^0-9.]/g, ''))}
                          className="w-20 py-1.5 text-sm text-right tabular-nums bg-transparent outline-none"
                          style={{ color: 'var(--color-text-primary)' }} />
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Actions */}
              {error && (
                <p role="alert" className="px-5 pt-3 text-xs font-medium" style={{ color: 'var(--color-rose)', borderTop: '1px solid var(--color-border)' }}>{error}</p>
              )}
              <div className="flex gap-2 justify-end px-5 py-4" style={{ borderTop: error ? undefined : '1px solid var(--color-border)' }}>
                <button type="button" onClick={() => setSetAllOpen(false)} disabled={setAllSaving}
                  className="px-4 py-2 text-sm font-medium rounded-xl hover:bg-[var(--color-surface)] transition-colors disabled:opacity-50"
                  style={{ color: 'var(--color-text-secondary)', border: '1px solid var(--color-border)' }}>Cancel</button>
                <button type="button" onClick={saveAllBudgets} disabled={setAllSaving}
                  className="px-5 py-2 text-sm font-semibold text-white rounded-xl hover:brightness-110 transition-all disabled:opacity-50"
                  style={{ background: 'var(--color-card-violet)' }}>
                  {setAllSaving ? 'Saving…' : 'Save all'}
                </button>
              </div>
            </div>
          </div>,
    document.body,
  );
}
