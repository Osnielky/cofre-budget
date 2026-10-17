'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { API } from '@/hooks/useBudgetScenario';

interface MonthSummary { month: string; total: number; count: number }

function monthLabel(m: string) {
  const [y, mo] = m.split('-');
  return new Date(Number(y), Number(mo) - 1).toLocaleString('default', { month: 'long', year: 'numeric' });
}
function fmt(n: number) { return Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2 }); }

/** Copy another month's budget plan into this month (replaces existing budgets). */
export default function ImportPlanModal({ month, onClose, onImported }: { month: string; onClose: () => void; onImported: () => void }) {
  const setImportOpen = (open: boolean) => { if (!open) onClose(); };
  const [importTarget, setImportTarget]   = useState('');
  const [importing, setImporting]         = useState(false);
  const [monthList, setMonthList]         = useState<MonthSummary[]>([]);
  const [loadingMonths, setLoadingMonths] = useState(true);

  useEffect(() => {
    fetch(`${API}/budgets/months`, { credentials: 'include' })
      .then(r => r.json())
      .then((data) => {
        const list: MonthSummary[] = Array.isArray(data) ? data : [];
        setMonthList(list.filter(m => m.month !== month && m.count > 0));
      })
      .catch(() => setMonthList([]))
      .finally(() => setLoadingMonths(false));
  }, [month]);

  async function handleImport() {
    if (!importTarget) return;
    setImporting(true);
    try {
      await fetch(`${API}/budgets/copy`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ fromMonth: importTarget, toMonth: month }),
      });
      onImported();
      onClose();
    } catch { /* ignore */ } finally { setImporting(false); }
  }

  return createPortal(
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
            style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(6px)' }}
            onMouseDown={(e) => { if (e.target === e.currentTarget) setImportOpen(false); }}>
            <div className="w-full max-w-sm flex flex-col rounded-2xl"
              style={{ background: 'var(--color-elevated)', border: '1px solid var(--color-border)', boxShadow: 'var(--glass-shadow)' }}>

              {/* Header */}
              <div className="px-5 py-4 flex items-center justify-between gap-3"
                style={{ borderBottom: '1px solid var(--color-border)' }}>
                <div>
                  <p className="font-bold text-sm">Import budget plan</p>
                  <p className="text-[11px] mt-0.5" style={{ color: 'var(--color-text-muted)' }}>
                    Pick a month to copy into <span style={{ color: 'var(--color-text-primary)', fontWeight: 600 }}>{monthLabel(month)}</span> — replaces existing budgets.
                  </p>
                </div>
                <button type="button" onClick={() => setImportOpen(false)}
                  className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-[var(--color-surface)] shrink-0"
                  style={{ color: 'var(--color-text-muted)' }}>✕</button>
              </div>

              {/* Month list */}
              <div className="px-5 py-4 flex flex-col gap-1.5 max-h-72 overflow-y-auto">
                {loadingMonths ? (
                  <p className="text-xs text-center py-6" style={{ color: 'var(--color-text-muted)' }}>Loading…</p>
                ) : monthList.length === 0 ? (
                  <p className="text-xs text-center py-6" style={{ color: 'var(--color-text-muted)' }}>No other months with budgets found.</p>
                ) : monthList.map(m => {
                  const isSelected = importTarget === m.month;
                  return (
                    <button key={m.month} type="button" onClick={() => setImportTarget(m.month)}
                      className="flex items-center gap-3 px-4 py-3 rounded-xl w-full text-left transition-all"
                      style={isSelected
                        ? { background: 'color-mix(in srgb, var(--color-card-violet) 15%, transparent)', border: '1px solid color-mix(in srgb, var(--color-card-violet) 45%, transparent)' }
                        : { background: 'var(--color-surface)', border: '1px solid var(--color-border)', cursor: 'pointer' }}>
                      <div className="w-4 h-4 rounded-full shrink-0 flex items-center justify-center"
                        style={{ border: isSelected ? '2px solid var(--color-card-violet)' : '2px solid var(--color-border)', background: isSelected ? 'var(--color-card-violet)' : 'transparent' }}>
                        {isSelected && <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold" style={{ color: isSelected ? 'var(--color-card-violet)' : 'var(--color-text-primary)' }}>
                          {monthLabel(m.month)}
                        </p>
                        <p className="text-[10px] mt-0.5" style={{ color: 'var(--color-text-muted)' }}>
                          {m.count} budget{m.count !== 1 ? 's' : ''} set
                        </p>
                      </div>
                      <span className="text-sm font-bold tabular-nums shrink-0"
                        style={{ color: isSelected ? 'var(--color-card-violet)' : 'var(--color-text-primary)' }}>
                        ${fmt(m.total)}
                      </span>
                    </button>
                  );
                })}
              </div>

              {/* Actions */}
              <div className="flex gap-2 justify-end px-5 py-4" style={{ borderTop: '1px solid var(--color-border)' }}>
                <button type="button" onClick={() => setImportOpen(false)}
                  className="px-4 py-2 text-sm font-medium rounded-xl hover:bg-[var(--color-surface)] transition-colors"
                  style={{ color: 'var(--color-text-secondary)', border: '1px solid var(--color-border)' }}>Cancel</button>
                <button type="button" onClick={handleImport} disabled={importing || !importTarget}
                  className="px-5 py-2 text-sm font-semibold text-white rounded-xl hover:brightness-110 transition-all disabled:opacity-40"
                  style={{ background: 'var(--color-card-violet)' }}>
                  {importing ? 'Importing…' : 'Import plan'}
                </button>
              </div>
            </div>
          </div>,
    document.body,
  );
}
