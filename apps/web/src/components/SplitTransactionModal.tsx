'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  DndContext, MouseSensor, TouchSensor, KeyboardSensor,
  closestCenter, useSensor, useSensors,
  type DragEndEvent, type UniqueIdentifier, type Announcements,
} from '@dnd-kit/core';
import { restrictToParentElement, restrictToVerticalAxis } from '@dnd-kit/modifiers';
import {
  SortableContext, useSortable, verticalListSortingStrategy,
  sortableKeyboardCoordinates,
} from '@dnd-kit/sortable';

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

const NEUTRAL_COLOR = '#5E7095';

/**
 * Rows carry a stable `uid` so dnd-kit (and the category menu) can identify a row
 * across reorders — array indices shift under a sort and would mis-target both.
 * `uid` is local to this component and never reaches the API.
 */
type Row = SplitLine & { uid: string };

let uidSeq = 0;
const nextUid = () => `sl${++uidSeq}`;
const withUid = (l: SplitLine): Row => ({ ...l, uid: nextUid() });

function seedLines(tx: Transaction, absTotal: number, initialLines?: SplitLine[]): Row[] {
  const base: SplitLine[] = initialLines && initialLines.length >= 2
    ? initialLines
    : [
        { categoryId: tx.categoryId ?? '', amount: absTotal.toFixed(2) },
        { categoryId: '', amount: '' },
      ];
  return base.map(withUid);
}

type SortableRender = ReturnType<typeof useSortable>;

/**
 * Hooks can't be called inside `lines.map()`, and extracting a <SplitRow> would mean
 * threading ~15 props. This render-prop shim gets legal hook usage while the row JSX
 * stays in the parent closure.
 */
function Sortable({ id, children }: { id: string; children: (s: SortableRender) => React.ReactNode }) {
  const sortable = useSortable({ id });
  return <>{children(sortable)}</>;
}

export default function SplitTransactionModal({ tx, categories, onSave, onClose, initialLines }: Props) {
  const absTotal = Math.abs(Number(tx.amount));
  const isExpense = Number(tx.amount) < 0;

  const [splitBy, setSplitBy] = useState<'amount' | 'percentage'>('amount');
  const [lines, setLines] = useState<Row[]>(() => seedLines(tx, absTotal, initialLines));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [openPickerUid, setOpenPickerUid] = useState<string | null>(null);
  const [pickerSearch, setPickerSearch] = useState('');
  const [pickerRect, setPickerRect] = useState<DOMRect | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  function togglePicker(uid: string, e: React.MouseEvent<HTMLButtonElement>) {
    if (openPickerUid === uid) { setOpenPickerUid(null); return; }
    setPickerRect(e.currentTarget.getBoundingClientRect());
    setOpenPickerUid(uid);
    setPickerSearch('');
  }

  // Close the category menu on outside-press / scroll / resize.
  useEffect(() => {
    if (openPickerUid === null) return;
    // pointerdown, not mousedown: a touch that starts a drag never synthesizes
    // mousedown, so the menu would otherwise stay open under the moving rows.
    const onDown = (e: PointerEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest('[data-cat-trigger]') || menuRef.current?.contains(t)) return;
      setOpenPickerUid(null);
    };
    const onResize = () => setOpenPickerUid(null);
    // Scrolling the menu's own list must NOT close it — only outside scrolls
    // (which would detach the fixed-positioned menu from its trigger).
    const onScroll = (e: Event) => {
      const t = e.target as Node;
      if (menuRef.current && (menuRef.current === t || menuRef.current.contains(t))) return;
      setOpenPickerUid(null);
    };
    document.addEventListener('pointerdown', onDown);
    window.addEventListener('resize', onResize);
    window.addEventListener('scroll', onScroll, true);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      window.removeEventListener('resize', onResize);
      window.removeEventListener('scroll', onScroll, true);
    };
  }, [openPickerUid]);

  const sensors = useSensors(
    // MouseSensor + TouchSensor rather than PointerSensor: each input needs its own
    // activation constraint (a distance threshold that suits a mouse fights scrolling
    // on touch), and PointerSensor alongside TouchSensor double-fires on touch.
    useSensor(MouseSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates, scrollBehavior: 'auto' }),
  );

  const ids = useMemo(() => lines.map((l) => l.uid), [lines]);

  const allocated = lines.reduce((s, l) => s + (parseFloat(l.amount) || 0), 0);
  const remaining = absTotal - allocated;
  const balanced = Math.abs(remaining) < 0.01;

  function updateLine(idx: number, patch: Partial<SplitLine>) {
    setLines((prev) => prev.map((l, i) => (i === idx ? { ...l, ...patch } : l)));
  }

  function updateAmount(idx: number, amount: string) {
    updateLine(idx, { amount });
  }

  function updatePercentage(idx: number, pctStr: string) {
    const pct = parseFloat(pctStr);
    updateLine(idx, { amount: Number.isFinite(pct) ? ((pct / 100) * absTotal).toFixed(2) : '' });
  }

  function addLine(categoryId = '') {
    const rem = absTotal - lines.reduce((s, l) => s + (parseFloat(l.amount) || 0), 0);
    setLines((prev) => [...prev, withUid({ categoryId, amount: rem > 0.005 ? rem.toFixed(2) : '' })]);
  }

  function removeLine(idx: number) {
    if (lines.length <= 2) return;
    setLines((prev) => prev.filter((_, i) => i !== idx));
  }

  function splitEqually() {
    setLines((prev) => {
      const n = prev.length;
      const base = Math.floor((absTotal / n) * 100) / 100;
      const remainder = Math.round((absTotal - base * n) * 100) / 100;
      return prev.map((l, i) => ({ ...l, amount: (i === n - 1 ? base + remainder : base).toFixed(2) }));
    });
  }

  function resetLines() {
    setLines(seedLines(tx, absTotal, initialLines));
  }

  function reorder(from: number, to: number) {
    if (from === to) return;
    setLines((prev) => {
      const next = [...prev];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
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
  const usedCatIds = new Set(lines.map((l) => l.categoryId).filter(Boolean));
  const suggestions = [...primaryCats, ...secondaryCats].filter((c) => !usedCatIds.has(c.id)).slice(0, 4);

  const statusColor = balanced ? 'var(--color-green)' : remaining < 0 ? 'var(--color-rose)' : 'var(--color-amber)';
  const statusLabel = balanced ? 'Ready to split' : remaining < 0 ? 'Over allocated' : 'Remaining to allocate';

  // dnd-kit's default announcements ("Draggable item 3 was moved over droppable area 1")
  // say nothing useful; name the category and the position instead.
  const screenReaderInstructions = {
    draggable:
      'Press space or enter to pick up this split line. Use the up and down arrow keys to '
      + 'change its position. Press space or enter again to drop it, or escape to cancel.',
  };

  const announcements: Announcements = useMemo(() => {
    const pos = (id: UniqueIdentifier) => lines.findIndex((l) => l.uid === id) + 1;
    const label = (id: UniqueIdentifier) => {
      const l = lines.find((x) => x.uid === id);
      return categories.find((c) => c.id === l?.categoryId)?.name ?? 'Uncategorized';
    };
    return {
      onDragStart: ({ active }) => `Picked up ${label(active.id)} split line, position ${pos(active.id)} of ${lines.length}.`,
      onDragOver: ({ active, over }) => (over ? `${label(active.id)} moved to position ${pos(over.id)} of ${lines.length}.` : undefined),
      onDragEnd: ({ active, over }) => (over
        ? `${label(active.id)} dropped at position ${pos(over.id)} of ${lines.length}.`
        : `${label(active.id)} returned to its original position.`),
      onDragCancel: ({ active }) => `Reorder cancelled. ${label(active.id)} returned to its original position.`,
    };
  }, [lines, categories]);

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(6px)' }}
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="w-full max-w-3xl flex flex-col rounded-2xl"
        style={{
          background: 'var(--color-elevated)',
          border: 'var(--glass-border)',
          boxShadow: 'var(--glass-shadow)',
          maxHeight: '92dvh',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div className="flex flex-wrap items-start gap-x-3 gap-y-2 px-5 sm:px-6 py-4 sm:py-5" style={{ borderBottom: '1px solid var(--color-border)' }}>
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
            style={{ background: 'color-mix(in srgb, var(--color-primary) 15%, transparent)', color: 'var(--color-primary)' }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="6" cy="6" r="3" /><circle cx="6" cy="18" r="3" />
              <path d="M20 4 8.12 15.88M14.47 14.48 20 20M8.12 8.12 12 12" />
            </svg>
          </div>
          <div className="flex-1 basis-40 min-w-0">
            <p className="text-base font-bold" style={{ color: 'var(--color-text-primary)' }}>Split transaction</p>
            <p className="text-sm font-medium truncate" style={{ color: 'var(--color-text-secondary)' }}>{tx.name}</p>
            <p className="text-xs mt-0.5" style={{ color: 'var(--color-text-muted)' }}>Assign this purchase to two or more categories.</p>
          </div>
          <div className="flex items-center gap-2 ml-auto shrink-0">
            <span
              className="text-sm font-bold tabular-nums px-3 py-1.5 rounded-lg"
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
              className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-white/5"
              style={{ color: 'var(--color-text-muted)' }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 6 6 18M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        <div className="flex flex-col gap-4 px-6 py-5 overflow-y-auto flex-1">
          {/* Split-by toggle + actions */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-semibold mr-1" style={{ color: 'var(--color-text-muted)' }}>Split by</span>
              <div className="flex rounded-xl p-1" style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
                {(['amount', 'percentage'] as const).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => setSplitBy(mode)}
                    className="px-3.5 py-1.5 text-xs font-semibold rounded-lg capitalize transition-all"
                    style={
                      splitBy === mode
                        ? { background: 'var(--color-primary)', color: 'white' }
                        : { color: 'var(--color-text-secondary)' }
                    }
                  >
                    {mode}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={splitEqually}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-all hover:brightness-110"
                style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', color: 'var(--color-primary)' }}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 6h18M3 12h10M3 18h14" />
                </svg>
                Split equally
              </button>
              <button
                type="button"
                onClick={resetLines}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-all hover:brightness-110"
                style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', color: 'var(--color-text-secondary)' }}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 12a9 9 0 1 0 3-6.7M3 4v5h5" />
                </svg>
                Reset
              </button>
            </div>
          </div>

          {/* Column headers (desktop only) */}
          <div className="hidden sm:flex items-center gap-2 px-1 text-xs font-semibold" style={{ color: 'var(--color-text-muted)' }}>
            <span className="w-5 shrink-0" />
            <span className="w-9 shrink-0" />
            <span className="flex-1">Category</span>
            <span className="w-28 shrink-0 text-right">Amount</span>
            <span className="w-24 shrink-0 text-right">Percentage</span>
            <span className="w-7 shrink-0" />
          </div>

          {/* Split lines */}
          <DndContext
            id="split-lines"
            sensors={sensors}
            collisionDetection={closestCenter}
            modifiers={[restrictToVerticalAxis, restrictToParentElement]}
            accessibility={{ announcements, screenReaderInstructions }}
            // The category menu is a fixed-positioned portal anchored to a rect captured
            // at click time; any row movement would strand it. Close it before the first
            // transform lands.
            onDragStart={() => setOpenPickerUid(null)}
            onDragEnd={({ active, over }: DragEndEvent) => {
              if (!over || active.id === over.id) return;
              reorder(ids.indexOf(String(active.id)), ids.indexOf(String(over.id)));
            }}
          >
          <SortableContext items={ids} strategy={verticalListSortingStrategy}>
          <div className="flex flex-col gap-2">
            {lines.map((line, idx) => {
              const cat = categories.find((c) => c.id === line.categoryId);
              const pct = absTotal > 0 ? ((parseFloat(line.amount) || 0) / absTotal) * 100 : 0;
              const swatchColor = cat?.color ?? NEUTRAL_COLOR;
              return (
                <Sortable key={line.uid} id={line.uid}>
                {({ setNodeRef, setActivatorNodeRef, attributes, listeners, transform, transition, isDragging, isOver, isSorting }) => (
                <div
                  ref={setNodeRef}
                  data-split-row
                  className="flex flex-wrap sm:flex-nowrap items-center gap-2 px-3 py-2.5 rounded-xl"
                  style={{
                    background: 'var(--color-surface)',
                    border: isOver && !isDragging ? '1px dashed var(--color-primary)' : '1px solid transparent',
                    // restrictToVerticalAxis zeroes x, so the translate is written by hand
                    // rather than pulling in @dnd-kit/utilities for CSS.Translate.
                    transform: transform ? `translate3d(0, ${Math.round(transform.y)}px, 0)` : undefined,
                    // An inline `transition` replaces Tailwind's transition-colors wholesale,
                    // so the sortable transition and the border fade are merged here.
                    transition: [transition, 'background-color 150ms ease, border-color 150ms ease'].filter(Boolean).join(', '),
                    position: 'relative',
                    zIndex: isDragging ? 2 : undefined,
                    opacity: isDragging ? 0.92 : 1,
                    boxShadow: isDragging ? 'var(--glass-shadow)' : undefined,
                    willChange: isSorting ? 'transform' : undefined,
                  }}
                >
                  {/* Drag handle — a real button so it is focusable and keyboard-draggable */}
                  <button
                    type="button"
                    ref={setActivatorNodeRef}
                    data-drag-handle
                    {...attributes}
                    {...listeners}
                    onContextMenu={(e) => e.preventDefault()}
                    aria-label={`Reorder ${cat ? cat.name : 'uncategorized'} split line`}
                    className="w-8 h-9 -ml-1 sm:w-5 sm:h-auto sm:ml-0 shrink-0 flex items-center justify-center rounded-md cursor-grab active:cursor-grabbing"
                    style={{
                      color: 'var(--color-text-muted)',
                      // Load-bearing: scoped to the handle alone so the modal body still
                      // pans with a finger everywhere else.
                      touchAction: 'none',
                      userSelect: 'none',
                      WebkitUserSelect: 'none',
                      WebkitTouchCallout: 'none',
                      outlineColor: 'var(--color-primary)',
                      outlineOffset: 2,
                    }}
                  >
                    <svg width="10" height="16" viewBox="0 0 10 16" fill="currentColor">
                      <circle cx="2" cy="2" r="1.4" /><circle cx="8" cy="2" r="1.4" />
                      <circle cx="2" cy="8" r="1.4" /><circle cx="8" cy="8" r="1.4" />
                      <circle cx="2" cy="14" r="1.4" /><circle cx="8" cy="14" r="1.4" />
                    </svg>
                  </button>

                  {/* Color swatch */}
                  <span
                    className="w-9 h-9 rounded-full flex items-center justify-center text-base shrink-0"
                    style={{ background: `${swatchColor}25`, color: swatchColor }}
                  >
                    {cat ? cat.icon : '?'}
                  </span>

                  {/* Category picker */}
                  <div className="flex-1 min-w-0 relative">
                    <button
                      type="button"
                      data-cat-trigger
                      onClick={(e) => togglePicker(line.uid, e)}
                      className="w-full flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm text-left transition-all hover:brightness-110"
                      style={{ background: 'var(--color-elevated)', border: '1px solid var(--color-border)', color: 'var(--color-text-primary)' }}
                    >
                      <span className="font-medium truncate flex-1">{cat ? cat.name : 'Choose category'}</span>
                      <svg width="8" height="8" viewBox="0 0 12 12" fill="none" style={{ opacity: 0.4, flexShrink: 0 }}>
                        <path d="M2 4l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </button>

                    {openPickerUid === line.uid && (() => {
                      const q = pickerSearch.trim().toLowerCase();
                      const fp = q ? primaryCats.filter((c) => c.name.toLowerCase().includes(q)) : primaryCats;
                      const fs = q ? secondaryCats.filter((c) => c.name.toLowerCase().includes(q)) : secondaryCats;
                      const renderCat = (c: Category) => (
                        <button
                          key={c.id}
                          onClick={() => { updateLine(idx, { categoryId: c.id }); setOpenPickerUid(null); }}
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
                                onClick={() => { updateLine(idx, { categoryId: '' }); setOpenPickerUid(null); }}
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

                  {/* Amount + percentage — share one row on mobile, inline columns on desktop */}
                  <div className="flex items-center gap-2 w-full sm:w-auto order-1 sm:order-none">
                    <div className="flex items-center gap-1 flex-1 sm:flex-none sm:w-28">
                      <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>$</span>
                      <input
                        type="number"
                        inputMode="decimal"
                        min="0"
                        step="0.01"
                        placeholder="0.00"
                        value={line.amount}
                        onChange={(e) => updateAmount(idx, e.target.value)}
                        className="w-full px-2 py-2 text-base sm:text-sm font-semibold outline-none rounded-xl text-right tabular-nums"
                        style={{
                          background: 'var(--color-elevated)',
                          border: splitBy === 'amount' ? '1px solid color-mix(in srgb, var(--color-primary) 40%, transparent)' : '1px solid var(--color-border)',
                          color: 'var(--color-text-primary)',
                        }}
                      />
                    </div>
                    <div className="flex items-center gap-1 flex-1 sm:flex-none sm:w-24">
                      <input
                        type="number"
                        inputMode="decimal"
                        min="0"
                        max="100"
                        step="0.1"
                        placeholder="0.0"
                        value={pct ? (Math.round(pct * 10) / 10).toString() : ''}
                        onChange={(e) => updatePercentage(idx, e.target.value)}
                        className="w-full px-2 py-2 text-base sm:text-sm font-semibold outline-none rounded-xl text-right tabular-nums"
                        style={{
                          background: 'var(--color-elevated)',
                          border: splitBy === 'percentage' ? '1px solid color-mix(in srgb, var(--color-primary) 40%, transparent)' : '1px solid var(--color-border)',
                          color: 'var(--color-text-primary)',
                        }}
                      />
                      <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>%</span>
                    </div>
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
                )}
                </Sortable>
              );
            })}
          </div>
          </SortableContext>
          </DndContext>

          {/* Add another category */}
          <button
            type="button"
            onClick={() => addLine()}
            className="flex items-center justify-center gap-2 px-3 py-3 rounded-xl text-sm font-semibold transition-all hover:brightness-110"
            style={{ border: '1.5px dashed var(--color-border)', color: 'var(--color-primary)' }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 5v14M5 12h14" />
            </svg>
            Add another category
          </button>

          {/* Suggestions */}
          {suggestions.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-semibold" style={{ color: 'var(--color-text-muted)' }}>Suggestions</span>
              {suggestions.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => addLine(c.id)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-all hover:brightness-110"
                  style={{ background: `${c.color}15`, border: `1px solid ${c.color}35`, color: c.color }}
                >
                  <span>{c.icon}</span>{c.name}
                </button>
              ))}
            </div>
          )}

          {/* Allocation summary */}
          <div className="rounded-xl px-4 py-4" style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
            <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
              <span className="text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>Allocation summary</span>
              <span className="flex items-center gap-1.5 text-xs font-bold" style={{ color: statusColor }}>
                <span className="w-4 h-4 rounded-full flex items-center justify-center" style={{ background: `${statusColor}25` }}>
                  {balanced ? '✓' : '!'}
                </span>
                {statusLabel}
              </span>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center gap-4">
              <div className="flex-1 min-w-0">
                <div className="w-full h-2.5 rounded-full overflow-hidden flex" style={{ background: 'var(--color-elevated)' }}>
                  {lines.map((l, i) => {
                    const amt = parseFloat(l.amount) || 0;
                    if (amt <= 0 || absTotal <= 0) return null;
                    const cat = categories.find((c) => c.id === l.categoryId);
                    return (
                      <div key={i} style={{ width: `${(amt / absTotal) * 100}%`, background: cat?.color ?? NEUTRAL_COLOR }} />
                    );
                  })}
                </div>
                <div className="flex flex-wrap gap-x-4 gap-y-1.5 mt-3">
                  {lines.map((l, i) => {
                    const amt = parseFloat(l.amount) || 0;
                    if (amt <= 0) return null;
                    const cat = categories.find((c) => c.id === l.categoryId);
                    const p = absTotal > 0 ? (amt / absTotal) * 100 : 0;
                    return (
                      <span key={i} className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--color-text-secondary)' }}>
                        <span className="w-2 h-2 rounded-full shrink-0" style={{ background: cat?.color ?? NEUTRAL_COLOR }} />
                        {cat ? cat.name : 'Uncategorized'} · ${amt.toFixed(2)} ({p.toFixed(1)}%)
                      </span>
                    );
                  })}
                </div>
              </div>

              <div className="flex sm:flex-col gap-4 sm:gap-1 sm:text-right shrink-0 sm:border-l sm:pl-4" style={{ borderColor: 'var(--color-border)' }}>
                <div>
                  <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>Allocated</p>
                  <p className="text-sm font-bold tabular-nums" style={{ color: 'var(--color-text-primary)' }}>${allocated.toFixed(2)}</p>
                </div>
                <div>
                  <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>Remaining</p>
                  <p className="text-sm font-bold tabular-nums" style={{ color: statusColor }}>${Math.abs(remaining).toFixed(2)}</p>
                </div>
              </div>
            </div>
          </div>

          {error && <p className="text-xs text-center" style={{ color: 'var(--color-rose)' }}>{error}</p>}
        </div>

        {/* Footer */}
        <div className="flex gap-3 px-6 py-4" style={{ borderTop: '1px solid var(--color-border)' }}>
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
            {saving ? 'Splitting…' : 'Save split'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
