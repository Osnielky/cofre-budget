'use client';

import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3333/api';

interface Category { id: string; name: string; icon: string; color: string; type: string }
interface Transaction {
  id: string; name: string; amount: number; date: string;
  categoryId: string | null; bankAccountId: string;
  parentId: string | null; isSplitParent: boolean;
}

interface SplitLine { categoryId: string; amount: string }

interface Props {
  tx: Transaction;
  categories: Category[];
  onSave: (children: Transaction[]) => void;
  onClose: () => void;
  /** Optional pre-seeded lines (e.g. from a linked receipt's items). Used as-is when ≥ 2 lines. */
  initialLines?: SplitLine[];
}

export default function SplitTransactionModal({ tx, categories, onSave, onClose, initialLines }: Props) {
  const absTotal = Math.abs(Number(tx.amount));
  const isExpense = Number(tx.amount) < 0;

  const [lines, setLines] = useState<SplitLine[]>(
    initialLines && initialLines.length >= 2
      ? initialLines
      : [
          { categoryId: tx.categoryId ?? '', amount: absTotal.toFixed(2) },
          { categoryId: '', amount: '' },
        ],
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [openPickerIdx, setOpenPickerIdx] = useState<number | null>(null);
  const [pickerSearch, setPickerSearch] = useState('');
  const [pickerRect, setPickerRect] = useState<DOMRect | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  function togglePicker(idx: number, e: React.MouseEvent<HTMLButtonElement>) {
    if (openPickerIdx === idx) { setOpenPickerIdx(null); return; }
    setPickerRect(e.currentTarget.getBoundingClientRect());
    setOpenPickerIdx(idx);
    setPickerSearch('');
  }

  // Close the category menu on outside-click / scroll / resize.
  useEffect(() => {
    if (openPickerIdx === null) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest('[data-cat-trigger]') || menuRef.current?.contains(t)) return;
      setOpenPickerIdx(null);
    };
    const onResize = () => setOpenPickerIdx(null);
    // Scrolling the menu's own list must NOT close it — only outside scrolls
    // (which would detach the fixed-positioned menu from its trigger).
    const onScroll = (e: Event) => {
      const t = e.target as Node;
      if (menuRef.current && (menuRef.current === t || menuRef.current.contains(t))) return;
      setOpenPickerIdx(null);
    };
    document.addEventListener('mousedown', onDown);
    window.addEventListener('resize', onResize);
    window.addEventListener('scroll', onScroll, true);
    return () => {
      document.removeEventListener('mousedown', onDown);
      window.removeEventListener('resize', onResize);
      window.removeEventListener('scroll', onScroll, true);
    };
  }, [openPickerIdx]);

  const allocated = lines.reduce((s, l) => s + (parseFloat(l.amount) || 0), 0);
  const remaining = absTotal - allocated;
  const balanced = Math.abs(remaining) < 0.01;

  function updateLine(idx: number, patch: Partial<SplitLine>) {
    setLines((prev) => prev.map((l, i) => (i === idx ? { ...l, ...patch } : l)));
  }

  function addLine() {
    const rem = absTotal - lines.reduce((s, l) => s + (parseFloat(l.amount) || 0), 0);
    setLines((prev) => [...prev, { categoryId: '', amount: rem > 0.005 ? rem.toFixed(2) : '' }]);
  }

  function removeLine(idx: number) {
    if (lines.length <= 2) return;
    setLines((prev) => prev.filter((_, i) => i !== idx));
  }

  async function handleSave() {
    setError('');
    if (!balanced) { setError('Amounts must sum to the transaction total.'); return; }
    setSaving(true);
    try {
      const res = await fetch(`${API}/transactions/${tx.id}/split`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          splits: lines.map((l) => ({
            categoryId: l.categoryId || null,
            amount: parseFloat(l.amount),
          })),
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setError((err as any).message ?? 'Failed to split transaction.');
        return;
      }
      const children: Transaction[] = await res.json();
      onSave(children);
    } finally {
      setSaving(false);
    }
  }

  const primaryCats = categories.filter(
    (c) => c.type === (isExpense ? 'expense' : 'income') || c.type === 'both',
  );
  const secondaryCats = categories.filter(
    (c) => c.type !== (isExpense ? 'expense' : 'income') && c.type !== 'both' && c.type !== 'transfer',
  );

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(6px)' }}
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="w-full max-w-xl flex flex-col rounded-2xl"
        style={{
          background: 'var(--color-elevated)',
          border: 'var(--glass-border)',
          boxShadow: 'var(--glass-shadow)',
          maxHeight: '90dvh',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-4" style={{ borderBottom: '1px solid var(--color-border)' }}>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-bold uppercase tracking-widest mb-0.5" style={{ color: 'var(--color-primary)' }}>
              ✂ Split Transaction
            </p>
            <p className="text-sm font-semibold truncate">{tx.name}</p>
          </div>
          <span
            className="text-sm font-bold tabular-nums px-2.5 py-1 rounded-lg shrink-0"
            style={{
              background: isExpense
                ? 'color-mix(in srgb, var(--color-orange) 15%, transparent)'
                : 'color-mix(in srgb, var(--color-green) 15%, transparent)',
              color: isExpense ? 'var(--color-orange)' : 'var(--color-green)',
            }}
          >
            {isExpense ? '-' : '+'}${absTotal.toFixed(2)}
          </span>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-[var(--color-elevated)] shrink-0"
            style={{ color: 'var(--color-text-muted)' }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Split lines */}
        <div className="flex flex-col gap-2 px-5 py-4 overflow-y-auto flex-1">
          {lines.map((line, idx) => {
            const cat = categories.find((c) => c.id === line.categoryId);
            return (
              <div key={idx} className="flex items-center gap-2">
                {/* Category picker */}
                <div className="flex-1 relative">
                  <button
                    type="button"
                    data-cat-trigger
                    onClick={(e) => togglePicker(idx, e)}
                    className="w-full flex items-center gap-2 px-3 py-3 rounded-xl text-sm text-left transition-all hover:brightness-110"
                    style={
                      cat
                        ? { background: `${cat.color}18`, border: `1px solid ${cat.color}35`, color: cat.color }
                        : { background: 'var(--color-surface)', border: '1px solid var(--color-border)', color: 'var(--color-text-muted)' }
                    }
                  >
                    {cat ? (
                      <><span>{cat.icon}</span><span className="font-medium truncate flex-1">{cat.name}</span></>
                    ) : (
                      <span className="flex-1">Category (optional)</span>
                    )}
                    <svg width="8" height="8" viewBox="0 0 12 12" fill="none" style={{ opacity: 0.4, flexShrink: 0 }}>
                      <path d="M2 4l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </button>

                  {openPickerIdx === idx && (() => {
                    const q = pickerSearch.trim().toLowerCase();
                    const fp = q ? primaryCats.filter((c) => c.name.toLowerCase().includes(q)) : primaryCats;
                    const fs = q ? secondaryCats.filter((c) => c.name.toLowerCase().includes(q)) : secondaryCats;
                    const renderCat = (c: Category) => (
                      <button
                        key={c.id}
                        onClick={() => { updateLine(idx, { categoryId: c.id }); setOpenPickerIdx(null); }}
                        className="w-full flex items-center gap-2.5 px-3 py-2.5 text-sm transition-colors hover:bg-[var(--color-elevated)]"
                        style={line.categoryId === c.id ? { background: `${c.color}15` } : {}}
                      >
                        <span className="w-6 h-6 rounded-lg flex items-center justify-center text-base shrink-0" style={{ background: `${c.color}20` }}>{c.icon}</span>
                        <span className="font-medium flex-1 text-left" style={{ color: line.categoryId === c.id ? c.color : 'var(--color-text-primary)' }}>{c.name}</span>
                        {line.categoryId === c.id && <span style={{ color: c.color }}>✓</span>}
                      </button>
                    );
                    if (!pickerRect) return null;
                    const DROP_MAX = 340;
                    const openUp = pickerRect.bottom + DROP_MAX > window.innerHeight
                      && pickerRect.top > window.innerHeight - pickerRect.bottom;
                    return createPortal(
                      <div
                        ref={menuRef}
                        className="fixed z-[60] rounded-xl flex flex-col"
                        style={{
                          left: pickerRect.left,
                          width: pickerRect.width,
                          top: openUp ? undefined : pickerRect.bottom + 4,
                          bottom: openUp ? window.innerHeight - pickerRect.top + 4 : undefined,
                          background: 'var(--popover-bg)',
                          border: 'var(--glass-border)',
                          boxShadow: 'var(--glass-shadow)',
                          maxHeight: DROP_MAX,
                          overflow: 'hidden',
                        }}
                      >
                        {/* Search */}
                        <div className="p-2" style={{ borderBottom: '1px solid var(--color-border)' }}>
                          <input
                            autoFocus
                            value={pickerSearch}
                            onChange={(e) => setPickerSearch(e.target.value)}
                            placeholder="Search categories…"
                            className="w-full px-3 py-2 text-sm rounded-lg outline-none"
                            style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', color: 'var(--color-text-primary)' }}
                          />
                        </div>

                        <div className="py-1 overflow-y-auto" style={{ overscrollBehavior: 'contain' }}>
                          {cat && !q && (
                            <button
                              onClick={() => { updateLine(idx, { categoryId: '' }); setOpenPickerIdx(null); }}
                              className="w-full flex items-center gap-2 px-3 py-2.5 text-sm transition-colors hover:bg-[var(--color-elevated)]"
                              style={{ color: 'var(--color-rose)' }}
                            >
                              <span>✕</span><span>Remove</span>
                            </button>
                          )}
                          {fp.map(renderCat)}
                          {fs.length > 0 && (
                            <>
                              <div style={{ borderTop: '1px solid var(--color-border)', margin: '4px 0' }} />
                              {fs.map(renderCat)}
                            </>
                          )}
                          {fp.length === 0 && fs.length === 0 && (
                            <p className="px-3 py-4 text-xs text-center" style={{ color: 'var(--color-text-muted)' }}>No categories match “{pickerSearch}”.</p>
                          )}
                        </div>
                      </div>,
                      document.body,
                    );
                  })()}
                </div>

                {/* Amount input */}
                <div className="flex items-center gap-1 shrink-0">
                  <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>$</span>
                  <input
                    type="number"
                    min="0.01"
                    step="0.01"
                    placeholder="0.00"
                    value={line.amount}
                    onChange={(e) => updateLine(idx, { amount: e.target.value })}
                    className="w-24 px-2 py-2 text-sm font-semibold outline-none rounded-xl text-right tabular-nums"
                    style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', color: 'var(--color-text-primary)' }}
                  />
                </div>

                {/* Remove button */}
                <button
                  type="button"
                  onClick={() => removeLine(idx)}
                  disabled={lines.length <= 2}
                  className="w-7 h-7 rounded-lg flex items-center justify-center transition-colors hover:bg-red-500/20 disabled:opacity-0 shrink-0"
                  style={{ color: 'var(--color-rose)' }}
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M18 6 6 18M6 6l12 12" />
                  </svg>
                </button>
              </div>
            );
          })}

          {/* Remaining indicator */}
          <div
            className="flex items-center justify-between px-3 py-2 rounded-xl mt-1"
            style={{
              background: balanced
                ? 'color-mix(in srgb, var(--color-green) 8%, transparent)'
                : remaining < 0
                ? 'color-mix(in srgb, var(--color-rose) 8%, transparent)'
                : 'var(--color-surface)',
              border: `1px solid ${
                balanced
                  ? 'color-mix(in srgb, var(--color-green) 25%, transparent)'
                  : remaining < 0
                  ? 'color-mix(in srgb, var(--color-rose) 25%, transparent)'
                  : 'var(--color-border)'
              }`,
            }}
          >
            <span className="text-xs font-semibold" style={{ color: 'var(--color-text-muted)' }}>
              {balanced ? '✓ Balanced' : 'Remaining'}
            </span>
            <span
              className="text-sm font-bold tabular-nums"
              style={{ color: balanced ? 'var(--color-green)' : remaining < 0 ? 'var(--color-rose)' : 'var(--color-text-primary)' }}
            >
              {balanced ? '$0.00' : `$${Math.abs(remaining).toFixed(2)}${remaining < 0 ? ' over' : ''}`}
            </span>
          </div>

          {/* Add piece */}
          <button
            type="button"
            onClick={addLine}
            className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold transition-all hover:brightness-110 mt-1"
            style={{
              background: 'color-mix(in srgb, var(--color-primary) 10%, transparent)',
              border: '1px solid color-mix(in srgb, var(--color-primary) 25%, transparent)',
              color: 'var(--color-primary)',
            }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 5v14M5 12h14" />
            </svg>
            Add piece
          </button>

          {error && <p className="text-xs text-center mt-1" style={{ color: 'var(--color-rose)' }}>{error}</p>}
        </div>

        {/* Footer */}
        <div className="flex gap-3 px-5 py-4" style={{ borderTop: '1px solid var(--color-border)' }}>
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-2.5 text-sm font-semibold rounded-xl transition-all hover:brightness-110"
            style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', color: 'var(--color-text-muted)' }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={!balanced || saving}
            className="flex-1 py-2.5 text-sm font-bold rounded-xl transition-all hover:brightness-110 disabled:opacity-40"
            style={{ background: 'var(--color-primary)', color: 'white' }}
          >
            {saving ? 'Splitting…' : 'Split transaction'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
