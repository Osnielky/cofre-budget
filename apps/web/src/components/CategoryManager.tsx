'use client';

import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import CategoryFormModal, { Category as CatType } from './CategoryFormModal';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3333/api';

type Category = CatType;

const TRANSFER_TIP = "Transfer categories are for transactions that move money between your own accounts — like paying a credit card bill or moving funds to savings. They are excluded from budget calculations and income/expense totals so your reports stay accurate.";

const TYPE_META: Record<string, { label: string; color: string }> = {
  expense:  { label: 'Expense',  color: '#F07A3E' },
  income:   { label: 'Income',   color: '#4FBF7F' },
  both:     { label: 'Both',     color: '#9B6DFF' },
  transfer: { label: 'Transfer', color: '#6B6B8A' },
};

const glass: React.CSSProperties = {
  background: 'rgba(35, 35, 47, 0.50)',
  backdropFilter: 'blur(20px)',
  WebkitBackdropFilter: 'blur(20px)',
  border: '1px solid rgba(255,255,255,0.08)',
  boxShadow: '0 4px 24px rgba(0,0,0,0.3)',
};

export default function CategoryManager() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Category | null>(null);
  const [deletingId, setDeletingId]         = useState<string | null>(null);
  const [confirmCat, setConfirmCat]         = useState<Category | null>(null);
  const [usageCount, setUsageCount]         = useState<number | null>(null);
  const [usageLoading, setUsageLoading]     = useState(false);
  const [deleteAction, setDeleteAction]     = useState<'uncat' | 'reassign'>('uncat');
  const [reassignTarget, setReassignTarget] = useState('');

  useEffect(() => {
    fetch(`${API}/categories`, { credentials: 'include' })
      .then((r) => r.json()).then(setCategories).finally(() => setLoading(false));
  }, []);

  function startCreate() { setEditing(null); setShowForm(true); }
  function startEdit(cat: Category) { setEditing(cat); setShowForm(true); }
  function closeForm() { setShowForm(false); setEditing(null); }

  function handleSaved(saved: Category) {
    setCategories((prev) =>
      editing ? prev.map((c) => (c.id === saved.id ? saved : c)) : [...prev, saved],
    );
    closeForm();
  }

  async function openDeleteConfirm(cat: Category) {
    setConfirmCat(cat);
    setDeleteAction('uncat');
    setReassignTarget('');
    setUsageCount(null);
    setUsageLoading(true);
    const res = await fetch(`${API}/categories/${cat.id}/usage`, { credentials: 'include' });
    const data = await res.json();
    setUsageCount(data.count ?? 0);
    setUsageLoading(false);
  }

  async function confirmDelete() {
    if (!confirmCat) return;
    setDeletingId(confirmCat.id);
    try {
      const qs = deleteAction === 'reassign' && reassignTarget ? `?reassignTo=${reassignTarget}` : '';
      await fetch(`${API}/categories/${confirmCat.id}${qs}`, { method: 'DELETE', credentials: 'include' });
      setCategories((prev) => prev.filter((c) => c.id !== confirmCat.id));
      setConfirmCat(null);
    } finally { setDeletingId(null); }
  }

  const expenseCats  = categories.filter((c) => c.type === 'expense');
  const bothCats     = categories.filter((c) => c.type === 'both');
  const incomeCats   = categories.filter((c) => c.type === 'income');
  const transferCats = categories.filter((c) => c.type === 'transfer');

  return (
    <div className="flex flex-col gap-4">

      {/* Header */}
      <div className="flex items-center justify-between">
        <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
          Organize your transactions with custom categories.
        </p>
        <button onClick={startCreate}
          className="px-4 py-2 text-sm font-semibold text-white rounded-xl transition-all hover:brightness-110"
          style={{ background: 'var(--color-card-violet)' }}>
          + Add Category
        </button>
      </div>

      {/* Add / Edit modal */}
      {showForm && (
        <CategoryFormModal
          editing={editing}
          onClose={closeForm}
          onSaved={handleSaved}
        />
      )}


      {/* 3-column category layout */}
      {loading ? (
        <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>Loading categories…</p>
      ) : categories.length === 0 ? (
        <div className="py-10 flex flex-col items-center gap-2 text-center" style={{ ...glass, borderRadius: 'var(--radius-card)' }}>
          <span className="text-3xl">🏷️</span>
          <p className="text-sm font-medium">No categories yet</p>
          <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>Add your first category to start organizing.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-start">

          {/* ── Expenses column ── */}
          <CategoryColumn
            title="Expenses" color="#F07A3E" icon="💸"
            cats={[...expenseCats, ...bothCats]}

            onEdit={startEdit} onDelete={openDeleteConfirm} deletingId={deletingId}
          />

          {/* ── Income column ── */}
          <CategoryColumn
            title="Income" color="#4FBF7F" icon="💰"
            cats={incomeCats}

            onEdit={startEdit} onDelete={openDeleteConfirm} deletingId={deletingId}
          />

          {/* ── Transfers column ── */}
          <div className="flex flex-col gap-3">
            <CategoryColumn
              title="Transfers" color="#6B6B8A" icon="🔄"
              cats={transferCats}
  
              onEdit={startEdit} onDelete={openDeleteConfirm} deletingId={deletingId}
            />
            {/* Transfer info tip */}
            {transferCats.length > 0 && (
              <div className="flex items-start gap-3 px-4 py-3 rounded-xl"
                style={{ background: 'rgba(107,107,138,0.10)', border: '1px solid rgba(107,107,138,0.25)' }}>
                <span className="text-base shrink-0">ℹ️</span>
                <p className="text-[11px] leading-relaxed" style={{ color: 'var(--color-text-muted)' }}>
                  {TRANSFER_TIP}
                </p>
              </div>
            )}
          </div>

        </div>
      )}

      {/* Delete confirmation modal */}
      {confirmCat && createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}>
          <div className="w-full max-w-md rounded-2xl flex flex-col gap-5 p-6"
            style={{ background: 'rgba(25,25,40,0.97)', border: '1px solid rgba(255,255,255,0.10)', boxShadow: '0 24px 64px rgba(0,0,0,0.7)' }}>

            {/* Header */}
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center text-xl shrink-0"
                style={{ background: `${confirmCat.color}20` }}>
                {confirmCat.icon}
              </div>
              <div>
                <p className="font-bold text-base">Delete "{confirmCat.name}"?</p>
                <p className="text-xs mt-0.5" style={{ color: 'var(--color-text-muted)' }}>
                  This action cannot be undone.
                </p>
              </div>
            </div>

            {/* Usage count */}
            <div className="rounded-xl px-4 py-3 flex items-center gap-3"
              style={{ background: 'rgba(245,200,66,0.07)', border: '1px solid rgba(245,200,66,0.18)' }}>
              <span className="text-lg shrink-0">🏷️</span>
              {usageLoading ? (
                <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>Checking transactions…</p>
              ) : usageCount === 0 ? (
                <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
                  No transactions use this category. Safe to delete.
                </p>
              ) : (
                <p className="text-sm">
                  <span className="font-bold" style={{ color: '#F5C842' }}>{usageCount} transaction{usageCount !== 1 ? 's' : ''}</span>
                  <span style={{ color: 'var(--color-text-muted)' }}> are currently using this category.</span>
                </p>
              )}
            </div>

            {/* What to do with transactions */}
            {!usageLoading && (usageCount ?? 0) > 0 && (
              <div className="flex flex-col gap-2">
                <p className="text-xs font-semibold" style={{ color: 'var(--color-text-secondary)' }}>
                  What should happen to those transactions?
                </p>

                {/* Option 1: leave uncategorized */}
                <label className="flex items-start gap-3 p-3 rounded-xl cursor-pointer transition-colors hover:bg-white/5"
                  style={{ border: `1px solid ${deleteAction === 'uncat' ? 'rgba(155,109,255,0.35)' : 'rgba(255,255,255,0.07)'}`,
                           background: deleteAction === 'uncat' ? 'rgba(155,109,255,0.07)' : 'transparent' }}>
                  <input type="radio" name="deleteAction" value="uncat" checked={deleteAction === 'uncat'}
                    onChange={() => setDeleteAction('uncat')} className="mt-0.5 accent-violet-500" />
                  <div>
                    <p className="text-sm font-semibold">Leave uncategorized</p>
                    <p className="text-xs mt-0.5" style={{ color: 'var(--color-text-muted)' }}>
                      Transactions will appear in the "Uncategorized" filter until you reassign them manually.
                    </p>
                  </div>
                </label>

                {/* Option 2: reassign */}
                <label className="flex items-start gap-3 p-3 rounded-xl cursor-pointer transition-colors hover:bg-white/5"
                  style={{ border: `1px solid ${deleteAction === 'reassign' ? 'rgba(155,109,255,0.35)' : 'rgba(255,255,255,0.07)'}`,
                           background: deleteAction === 'reassign' ? 'rgba(155,109,255,0.07)' : 'transparent' }}>
                  <input type="radio" name="deleteAction" value="reassign" checked={deleteAction === 'reassign'}
                    onChange={() => setDeleteAction('reassign')} className="mt-0.5 accent-violet-500" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold">Reassign to another category</p>
                    <p className="text-xs mt-0.5 mb-2" style={{ color: 'var(--color-text-muted)' }}>
                      All transactions will be moved to the selected category automatically.
                    </p>
                    {deleteAction === 'reassign' && (
                      <select value={reassignTarget} onChange={(e) => setReassignTarget(e.target.value)}
                        className="w-full px-3 py-2 text-sm rounded-lg outline-none appearance-none"
                        style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.12)', color: 'var(--color-text-primary)' }}>
                        <option value="">Select category…</option>
                        {categories.filter((c) => c.id !== confirmCat.id).map((c) => (
                          <option key={c.id} value={c.id}>{c.icon} {c.name}</option>
                        ))}
                      </select>
                    )}
                  </div>
                </label>
              </div>
            )}

            {/* Actions */}
            <div className="flex gap-2 justify-end pt-1">
              <button onClick={() => setConfirmCat(null)}
                className="px-4 py-2 text-sm font-medium rounded-xl transition-colors hover:bg-white/10"
                style={{ color: 'var(--color-text-secondary)', border: '1px solid rgba(255,255,255,0.08)' }}>
                Cancel
              </button>
              <button
                onClick={confirmDelete}
                disabled={deletingId === confirmCat.id || usageLoading || (deleteAction === 'reassign' && !reassignTarget)}
                className="px-4 py-2 text-sm font-semibold rounded-xl transition-all hover:brightness-110 disabled:opacity-40"
                style={{ background: 'rgba(255,107,107,0.18)', border: '1px solid rgba(255,107,107,0.35)', color: '#FF6B6B' }}>
                {deletingId === confirmCat.id ? 'Deleting…' : 'Delete Category'}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

    </div>
  );
}

/* ── CategoryColumn ─────────────────────────────────────────────── */
interface ColProps {
  title: string; color: string; icon: string;
  cats: Category[];
  onEdit: (c: Category) => void;
  onDelete: (c: Category) => void;
  deletingId: string | null;
}
function CategoryColumn({ title, color, icon, cats, onEdit, onDelete, deletingId }: ColProps) {
  const glass: React.CSSProperties = {
    background: 'rgba(35,35,47,0.50)', backdropFilter: 'blur(20px)',
    WebkitBackdropFilter: 'blur(20px)', border: '1px solid rgba(255,255,255,0.08)',
    boxShadow: '0 4px 24px rgba(0,0,0,0.3)',
  };
  return (
    <div className="flex flex-col gap-2">
      {/* Column header */}
      <div className="flex items-center gap-2 px-1 pb-1">
        <span className="text-sm">{icon}</span>
        <span className="text-xs font-bold uppercase tracking-wider" style={{ color }}>{title}</span>
        <span className="text-xs font-semibold rounded-md px-1.5 py-0.5 ml-auto"
          style={{ background: `${color}18`, color }}>{cats.length}</span>
      </div>

      {cats.length === 0 ? (
        <div className="py-6 flex items-center justify-center rounded-xl"
          style={{ border: '1px dashed rgba(255,255,255,0.07)' }}>
          <p className="text-xs" style={{ color: 'var(--color-text-muted)', opacity: 0.5 }}>None yet</p>
        </div>
      ) : (
        <div className="flex flex-col overflow-hidden" style={{ ...glass, borderRadius: 'var(--radius-card)' }}>
          {cats.map((cat, i) => {
            const isBoth = cat.type === 'both';
            return (
              <div key={cat.id}
                className="flex items-center gap-3 px-3 py-2.5 transition-colors hover:bg-white/[0.025] group"
                style={i > 0 ? { borderTop: '1px solid rgba(255,255,255,0.05)' } : {}}>

                {/* Color bar */}
                <div className="w-1 self-stretch rounded-full shrink-0 my-0.5" style={{ background: cat.color }} />

                {/* Icon */}
                <div className="w-8 h-8 rounded-lg flex items-center justify-center text-base shrink-0"
                  style={{ background: `${cat.color}18`, border: `1px solid ${cat.color}28` }}>
                  {cat.icon}
                </div>

                {/* Name + description */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 min-w-0">
                    <p className="text-sm font-semibold truncate">{cat.name}</p>
                    {isBoth && (
                      <span className="text-[9px] font-bold px-1.5 py-0.5 rounded shrink-0"
                        style={{ background: 'rgba(155,109,255,0.15)', color: '#9B6DFF' }}>Both</span>
                    )}
                    {cat.isDefault && (
                      <span className="text-[9px] rounded shrink-0" style={{ color: 'var(--color-text-muted)', opacity: 0.6 }}>Default</span>
                    )}
                  </div>
                  {cat.description && (
                    <p className="text-[11px] truncate mt-0.5" style={{ color: 'var(--color-text-muted)' }}>
                      {cat.description}
                    </p>
                  )}
                </div>

                {/* Actions */}
                <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                  <button onClick={() => onEdit(cat)}
                    className="w-7 h-7 rounded-lg flex items-center justify-center transition-colors hover:bg-white/10"
                    title="Edit" style={{ color: 'var(--color-text-secondary)' }}>
                    <PencilIcon />
                  </button>
                  <button onClick={() => onDelete(cat)} disabled={deletingId === cat.id}
                    className="w-7 h-7 rounded-lg flex items-center justify-center transition-colors hover:bg-red-500/20 disabled:opacity-40"
                    title="Delete">
                    {deletingId === cat.id
                      ? <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>…</span>
                      : <TrashIcon />}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function CloseIcon() {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>;
}

function PencilIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
      style={{ color: '#FF6B6B' }}>
      <polyline points="3 6 5 6 21 6"/>
      <path d="M19 6l-1 14H6L5 6"/>
      <path d="M10 11v6M14 11v6"/>
      <path d="M9 6V4h6v2"/>
    </svg>
  );
}
