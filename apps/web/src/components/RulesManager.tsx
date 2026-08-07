'use client';

import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3333/api';

interface CategoryLite { id: string; name: string; icon: string; color: string }
interface Rule {
  id: string;
  matchType: 'merchant' | 'name';
  matchValue: string;
  categoryId: string;
  category: CategoryLite | null;
  createdAt: string;
}

const glass: React.CSSProperties = {
  background: 'var(--color-surface)',
  backdropFilter: 'var(--glass-blur)',
  WebkitBackdropFilter: 'var(--glass-blur)',
  border: 'var(--glass-border)',
  boxShadow: 'var(--glass-shadow)',
};

export default function RulesManager() {
  const [rules, setRules] = useState<Rule[]>([]);
  const [categories, setCategories] = useState<CategoryLite[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [editCategoryId, setEditCategoryId] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [confirmRule, setConfirmRule] = useState<Rule | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      fetch(`${API}/categorization-rules`, { credentials: 'include' }).then((r) => r.json()),
      fetch(`${API}/categories`, { credentials: 'include' }).then((r) => r.json()),
    ])
      .then(([rulesData, categoriesData]) => { setRules(rulesData); setCategories(categoriesData); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  function startEdit(rule: Rule) {
    setEditingId(rule.id);
    setEditValue(rule.matchValue);
    setEditCategoryId(rule.categoryId);
    setSaveError('');
  }

  function cancelEdit() {
    setEditingId(null);
    setSaveError('');
  }

  async function saveEdit(rule: Rule) {
    setSaving(true);
    setSaveError('');
    const res = await fetch(`${API}/categorization-rules/${rule.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ matchValue: editValue, categoryId: editCategoryId }),
    });
    setSaving(false);
    if (res.status === 409) { setSaveError('Another rule already matches this text.'); return; }
    if (!res.ok) { setSaveError('Could not save this rule.'); return; }
    const { rule: updated } = await res.json();
    setRules((prev) => prev.map((r) => (r.id === rule.id ? updated : r)));
    setEditingId(null);
  }

  async function confirmDelete() {
    if (!confirmRule) return;
    setDeletingId(confirmRule.id);
    await fetch(`${API}/categorization-rules/${confirmRule.id}`, { method: 'DELETE', credentials: 'include' });
    setRules((prev) => prev.filter((r) => r.id !== confirmRule.id));
    setDeletingId(null);
    setConfirmRule(null);
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
        Rules created from the transactions view — matching uncategorized transactions are categorized automatically.
      </p>

      {loading ? (
        <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>Loading rules…</p>
      ) : rules.length === 0 ? (
        <div className="py-10 flex flex-col items-center gap-2 text-center" style={{ ...glass, borderRadius: 'var(--radius-card)' }}>
          <span className="text-3xl">📌</span>
          <p className="text-sm font-medium">No rules yet</p>
          <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
            Open a transaction's category picker and check "Always categorize as this" to create one.
          </p>
        </div>
      ) : (
        <div className="flex flex-col overflow-hidden" style={{ ...glass, borderRadius: 'var(--radius-card)' }}>
          {rules.map((rule, i) => {
            const cat = rule.category;
            const isEditing = editingId === rule.id;
            return (
              <div key={rule.id} className="flex flex-col gap-2 px-3 py-2.5"
                style={i > 0 ? { borderTop: '1px solid var(--color-border)' } : {}}>
                {isEditing ? (
                  <div className="flex flex-col gap-2 py-1">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-bold uppercase tracking-wider shrink-0"
                        style={{ color: 'var(--color-text-muted)' }}>
                        {rule.matchType === 'merchant' ? 'Merchant' : 'Description'}
                      </span>
                      <input value={editValue} onChange={(e) => setEditValue(e.target.value)}
                        className="flex-1 px-2.5 py-1.5 text-sm rounded-lg outline-none"
                        style={{ background: 'var(--color-elevated)', border: '1px solid var(--color-border)', color: 'var(--color-text-primary)' }} />
                    </div>
                    <select value={editCategoryId} onChange={(e) => setEditCategoryId(e.target.value)}
                      className="px-2.5 py-1.5 text-sm rounded-lg outline-none appearance-none"
                      style={{ background: 'var(--color-elevated)', border: '1px solid var(--color-border)', color: 'var(--color-text-primary)' }}>
                      {categories.map((c) => (
                        <option key={c.id} value={c.id}>{c.icon} {c.name}</option>
                      ))}
                    </select>
                    {saveError && <p className="text-xs" style={{ color: 'var(--color-rose)' }}>{saveError}</p>}
                    <div className="flex gap-2 justify-end">
                      <button onClick={cancelEdit}
                        className="px-3 py-1.5 text-xs font-medium rounded-lg transition-colors hover:bg-[var(--color-elevated)]"
                        style={{ color: 'var(--color-text-secondary)', border: '1px solid var(--color-border)' }}>
                        Cancel
                      </button>
                      <button onClick={() => saveEdit(rule)} disabled={saving || !editValue.trim()}
                        className="px-3 py-1.5 text-xs font-semibold rounded-lg transition-all hover:brightness-110 disabled:opacity-40"
                        style={{ background: 'var(--color-card-violet)', color: '#fff' }}>
                        {saving ? 'Saving…' : 'Save'}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-3 group">
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center text-base shrink-0"
                      style={{ background: cat ? `${cat.color}18` : 'var(--color-elevated)', border: `1px solid ${cat ? `${cat.color}28` : 'var(--color-border)'}` }}>
                      {cat?.icon ?? '❔'}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 min-w-0">
                        <p className="text-sm font-semibold truncate">{rule.matchValue}</p>
                        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded shrink-0 uppercase tracking-wide"
                          style={{ background: 'var(--color-elevated)', color: 'var(--color-text-muted)' }}>
                          {rule.matchType === 'merchant' ? 'Merchant' : 'Description'}
                        </span>
                      </div>
                      <p className="text-[11px] truncate mt-0.5" style={{ color: cat?.color ?? 'var(--color-text-muted)' }}>
                        → {cat?.name ?? 'Unknown category'}
                      </p>
                    </div>
                    <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                      <button onClick={() => startEdit(rule)}
                        className="w-7 h-7 rounded-lg flex items-center justify-center transition-colors hover:bg-[var(--color-elevated)]"
                        title="Edit" style={{ color: 'var(--color-text-secondary)' }}>
                        <PencilIcon />
                      </button>
                      <button onClick={() => setConfirmRule(rule)} disabled={deletingId === rule.id}
                        className="w-7 h-7 rounded-lg flex items-center justify-center transition-colors hover:bg-red-500/20 disabled:opacity-40"
                        title="Delete">
                        {deletingId === rule.id
                          ? <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>…</span>
                          : <TrashIcon />}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {confirmRule && createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}>
          <div className="w-full max-w-md rounded-2xl flex flex-col gap-5 p-6"
            style={{ background: 'var(--color-elevated)', border: 'var(--glass-border)', boxShadow: 'var(--glass-shadow)' }}>
            <div>
              <p className="font-bold text-base">Delete this rule?</p>
              <p className="text-xs mt-1" style={{ color: 'var(--color-text-muted)' }}>
                Transactions already categorized by "{confirmRule.matchValue}" keep their category — this only stops future auto-categorization.
              </p>
            </div>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setConfirmRule(null)}
                className="px-4 py-2 text-sm font-medium rounded-xl transition-colors hover:bg-[var(--color-elevated)]"
                style={{ color: 'var(--color-text-secondary)', border: '1px solid var(--color-border)' }}>
                Cancel
              </button>
              <button onClick={confirmDelete} disabled={deletingId === confirmRule.id}
                className="px-4 py-2 text-sm font-semibold rounded-xl transition-all hover:brightness-110 disabled:opacity-40"
                style={{ background: 'color-mix(in srgb, var(--color-rose) 18%, transparent)', border: '1px solid color-mix(in srgb, var(--color-rose) 35%, transparent)', color: 'var(--color-rose)' }}>
                {deletingId === confirmRule.id ? 'Deleting…' : 'Delete Rule'}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
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
      style={{ color: 'var(--color-rose)' }}>
      <polyline points="3 6 5 6 21 6"/>
      <path d="M19 6l-1 14H6L5 6"/>
      <path d="M10 11v6M14 11v6"/>
      <path d="M9 6V4h6v2"/>
    </svg>
  );
}
