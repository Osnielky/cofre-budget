'use client';

import { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3333/api';

interface ReceiptItem { name: string; quantity: number; unitPrice: number; total: number }
interface ReceiptCandidate {
  id: string; gmailMessageId: string; merchant: string; orderNumber: string | null;
  orderDate: string | null; total: number; currency: string; items: ReceiptItem[];
  rawSubject: string | null; amountDelta: number; source: 'cache' | 'gmail'; linked: boolean;
}

interface Props {
  tx: { id: string; name: string; amount: number; date: string; categoryId: string | null; receiptId: string | null };
  onLinked: () => void; // called after any link/unlink so the page can reload
  onSplitFromItems: (lines: { categoryId: string; amount: string }[]) => void;
  onClose: () => void;
}

const money = (n: number) => `$${Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2 })}`;

export default function FindReceiptModal({ tx, onLinked, onSplitFromItems, onClose }: Props) {
  const [candidates, setCandidates] = useState<ReceiptCandidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<'not_connected' | 'failed' | null>(null);
  const [window_, setWindow] = useState(4);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const search = useCallback(async (days: number) => {
    setLoading(true); setError(null);
    try {
      const res = await fetch(`${API}/transactions/${tx.id}/receipt-candidates?window=${days}`, { credentials: 'include' });
      if (res.status === 409) { setError('not_connected'); setCandidates([]); return; }
      if (!res.ok) { setError('failed'); setCandidates([]); return; }
      const data = await res.json();
      setCandidates(Array.isArray(data) ? data : []);
    } catch { setError('failed'); setCandidates([]); }
    finally { setLoading(false); }
  }, [tx.id]);

  useEffect(() => { search(window_); }, [search, window_]);

  async function setLink(receiptId: string | null) {
    setBusyId(receiptId ?? 'unlink');
    try {
      const res = await fetch(`${API}/transactions/${tx.id}/receipt`, {
        method: 'PATCH', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ receiptId }),
      });
      if (res.ok) onLinked();
    } finally { setBusyId(null); }
  }

  function splitLines(c: ReceiptCandidate) {
    const lines = c.items
      .filter((i) => i.total > 0)
      .map((i, idx) => ({ categoryId: idx === 0 ? (tx.categoryId ?? '') : '', amount: i.total.toFixed(2) }));
    while (lines.length < 2) lines.push({ categoryId: '', amount: '' });
    return lines;
  }

  const gmailSearchUrl =
    `https://mail.google.com/mail/u/0/#search/${encodeURIComponent(`${tx.name.split(/\s+/)[0]} ${money(Number(tx.amount))}`)}`;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.55)' }} onClick={onClose}>
      <div className="w-full max-w-xl max-h-[85vh] flex flex-col rounded-2xl overflow-hidden"
        style={{ background: 'var(--color-elevated)', border: 'var(--glass-border)', boxShadow: 'var(--glass-shadow)' }}
        onClick={(e) => e.stopPropagation()}>

        {/* Header */}
        <div className="flex items-start justify-between px-6 pt-5 pb-3">
          <div>
            <p className="text-base font-bold">Find receipt in email</p>
            <p className="text-xs mt-0.5" style={{ color: 'var(--color-text-muted)' }}>
              {tx.name} · {tx.date} · <span className="font-semibold">{money(Number(tx.amount))}</span>
            </p>
          </div>
          <button onClick={onClose} aria-label="Close" className="text-lg leading-none px-1 cursor-pointer" style={{ color: 'var(--color-text-muted)' }}>×</button>
        </div>

        <div className="px-6 pb-5 overflow-y-auto flex flex-col gap-2.5">
          {loading && <p className="text-sm py-8 text-center" style={{ color: 'var(--color-text-muted)' }}>Searching your email…</p>}

          {!loading && error === 'not_connected' && (
            <div className="text-sm py-6 text-center flex flex-col gap-3" style={{ color: 'var(--color-text-secondary)' }}>
              <p>Gmail is not connected, so Cofre can&apos;t search your inbox.</p>
              <a href="/settings?tab=integrations" className="font-semibold underline" style={{ color: 'var(--color-primary)' }}>
                Connect Gmail in Settings → Integrations
              </a>
            </div>
          )}

          {!loading && error === 'failed' && (
            <p className="text-sm py-8 text-center" style={{ color: 'var(--color-rose)' }}>Search failed — try again in a moment.</p>
          )}

          {!loading && !error && candidates.length === 0 && (
            <div className="text-sm py-6 text-center flex flex-col gap-3" style={{ color: 'var(--color-text-secondary)' }}>
              <p>No receipt emails found within ±{window_} days.</p>
              <div className="flex items-center justify-center gap-3">
                {window_ < 10 && (
                  <button onClick={() => setWindow(10)} className="px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer"
                    style={{ background: 'color-mix(in srgb, var(--color-primary) 12%, transparent)', border: '1px solid color-mix(in srgb, var(--color-primary) 30%, transparent)', color: 'var(--color-primary)' }}>
                    Widen to ±10 days
                  </button>
                )}
                <a href={gmailSearchUrl} target="_blank" rel="noreferrer" className="text-xs font-semibold underline" style={{ color: 'var(--color-text-muted)' }}>
                  Search Gmail manually ↗
                </a>
              </div>
            </div>
          )}

          {!loading && !error && candidates.map((c) => {
            const exact = c.amountDelta === 0;
            const expanded = expandedId === c.id;
            const splittable = c.items.filter((i) => i.total > 0).length >= 2;
            return (
              <div key={c.id} className="rounded-xl px-4 py-3 flex flex-col gap-2"
                style={{ border: c.linked ? '1px solid color-mix(in srgb, var(--color-green) 45%, transparent)' : 'var(--glass-border)', background: 'var(--color-surface)' }}>
                <div className="flex items-center justify-between gap-3 min-w-0">
                  <div className="min-w-0">
                    <p className="text-sm font-bold truncate">
                      {c.merchant}
                      {c.linked && <span className="ml-2 text-[10px] font-semibold px-1.5 py-0.5 rounded" style={{ background: 'color-mix(in srgb, var(--color-green) 15%, transparent)', color: 'var(--color-green)' }}>LINKED</span>}
                    </p>
                    <p className="text-[11px] truncate" style={{ color: 'var(--color-text-muted)' }}>
                      {c.orderDate ?? 'no date'} · {c.rawSubject ?? c.orderNumber ?? c.gmailMessageId}
                    </p>
                  </div>
                  <p className="text-sm font-bold tabular-nums shrink-0" style={{ color: exact ? 'var(--color-green)' : 'var(--color-text-primary)' }}>
                    {money(c.total)}{exact ? ' ✓' : ''}
                  </p>
                </div>

                <div className="flex items-center gap-2 flex-wrap text-[11px] font-semibold">
                  <button onClick={() => setExpandedId(expanded ? null : c.id)} className="px-2 py-1 rounded-lg cursor-pointer"
                    style={{ border: '1px solid var(--color-border)', color: 'var(--color-text-secondary)' }}>
                    {expanded ? 'Hide items' : `Items (${c.items.length})`}
                  </button>
                  {c.linked ? (
                    <button onClick={() => setLink(null)} disabled={busyId !== null} className="px-2 py-1 rounded-lg cursor-pointer disabled:opacity-50"
                      style={{ border: '1px solid var(--color-border)', color: 'var(--color-text-muted)' }}>
                      Unlink
                    </button>
                  ) : (
                    <button onClick={() => setLink(c.id)} disabled={busyId !== null} className="px-2 py-1 rounded-lg cursor-pointer disabled:opacity-50"
                      style={{ background: 'color-mix(in srgb, var(--color-green) 12%, transparent)', border: '1px solid color-mix(in srgb, var(--color-green) 30%, transparent)', color: 'var(--color-green)' }}>
                      {busyId === c.id ? 'Linking…' : 'Link receipt'}
                    </button>
                  )}
                  <button
                    onClick={async () => { if (!c.linked) await setLink(c.id); onSplitFromItems(splitLines(c)); }}
                    disabled={busyId !== null || !splittable}
                    title={splittable ? 'Pre-fill the split modal from these items' : 'Needs at least 2 priced items'}
                    className="px-2 py-1 rounded-lg cursor-pointer disabled:opacity-40"
                    style={{ background: 'color-mix(in srgb, var(--color-violet) 12%, transparent)', border: '1px solid color-mix(in srgb, var(--color-violet) 30%, transparent)', color: 'var(--color-violet)' }}>
                    Split from items
                  </button>
                  <a href={`https://mail.google.com/mail/u/0/#all/${c.gmailMessageId}`} target="_blank" rel="noreferrer"
                    className="px-2 py-1 rounded-lg no-underline" style={{ border: '1px solid var(--color-border)', color: 'var(--color-text-secondary)' }}>
                    Open in Gmail ↗
                  </a>
                </div>

                {expanded && (
                  <div className="flex flex-col gap-1 pt-1" style={{ borderTop: '1px solid var(--color-border)' }}>
                    {c.items.length === 0 && <p className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>No line items parsed.</p>}
                    {c.items.map((it, i) => (
                      <div key={i} className="flex items-center justify-between gap-3 text-[12px]">
                        <span className="truncate" style={{ color: 'var(--color-text-secondary)' }}>{it.quantity > 1 ? `${it.quantity}× ` : ''}{it.name}</span>
                        <span className="tabular-nums shrink-0">{money(it.total)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>,
    document.body,
  );
}
