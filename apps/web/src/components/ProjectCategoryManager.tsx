'use client';

import { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import EmojiPicker from './EmojiPicker';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3333/api';

const PRESET_COLORS = [
  '#F97316', '#F5C842', '#A855F7', '#38BDF8', '#E879A0', '#22C55E',
  '#818CF8', '#D946EF', '#F43F5E', '#A3E635', '#2DD4BF', '#94A3B8',
];

const PROJECT_TYPES = [
  { value: 'vehicle',  label: 'Vehicle',  icon: '🚗', accent: 'var(--color-sky)' },
  { value: 'property', label: 'Property', icon: '🏠', accent: 'var(--color-green)' },
  { value: 'business', label: 'Business', icon: '💼', accent: 'var(--color-primary)' },
  { value: 'trading',  label: 'Trading',  icon: '📈', accent: 'var(--color-violet)' },
  { value: 'other',    label: 'Other',    icon: '📦', accent: 'var(--color-orange)' },
];

interface ProjectCategory {
  id: string; name: string; icon: string; color: string; order: number; type: string;
  description?: string | null;
}

interface Draft { name: string; icon: string; color: string; type: string; description: string }

const EMPTY_DRAFT: Draft = { name: '', icon: '📦', color: '#9B6DFF', type: 'expense', description: '' };

const inputStyle: React.CSSProperties = {
  background: 'var(--color-elevated)',
  border: '1px solid var(--color-border)',
  borderRadius: '10px',
  color: 'var(--color-text-primary)',
};
const glass: React.CSSProperties = {
  background: 'var(--color-surface)',
  backdropFilter: 'var(--glass-blur)',
  WebkitBackdropFilter: 'var(--glass-blur)',
  border: 'var(--glass-border)',
};

function draftOf(c: ProjectCategory): Draft {
  return { name: c.name, icon: c.icon, color: c.color, type: c.type ?? 'expense', description: c.description ?? '' };
}

function TypePill({ type }: { type: string }) {
  const income = type === 'income';
  const color = income ? 'var(--color-green)' : 'var(--color-orange)';
  return (
    <span className="inline-flex items-center gap-1 text-[11px] font-semibold" style={{ color }}>
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        {income ? <><path d="M7 7l10 10" /><path d="M17 7v10H7" /></> : <><path d="M7 17L17 7" /><path d="M7 7h10v10" /></>}
      </svg>
      {income ? 'Income' : 'Expense'}
    </span>
  );
}

export default function ProjectCategoryManager() {
  const [activeType, setActiveType] = useState('vehicle');
  const [cats, setCats] = useState<ProjectCategory[]>([]);
  const [loading, setLoading] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  /** null = nothing open, 'new' = creating, otherwise the id being edited. */
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [iconAnchor, setIconAnchor] = useState<DOMRect | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<ProjectCategory | null>(null);

  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<'all' | 'expense' | 'income'>('all');

  const typeMeta = PROJECT_TYPES.find((t) => t.value === activeType)!;

  useEffect(() => { loadCats(activeType); }, [activeType]);

  async function loadCats(type: string) {
    setLoading(true);
    setEditing(null);
    try {
      const res = await fetch(`${API}/projects/type-categories?type=${type}`, { credentials: 'include' });
      const data = await res.json();
      setCats(Array.isArray(data) ? data : []);
    } catch { setCats([]); } finally { setLoading(false); }
  }

  async function handleSeed() {
    setSeeding(true);
    try {
      const res = await fetch(`${API}/projects/type-categories/seed`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify({ type: activeType }),
      });
      setCats(await res.json());
    } finally { setSeeding(false); }
  }

  async function save() {
    if (!draft.name.trim()) return;
    setSaving(true);
    try {
      const body = { ...draft, description: draft.description.trim() || null };
      if (editing === 'new') {
        const res = await fetch(`${API}/projects/type-categories`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
          // projectType = the project family; type stays the category's expense|income.
          body: JSON.stringify({ ...body, projectType: activeType }),
        });
        if (!res.ok) return;
        const created: ProjectCategory = await res.json();
        setCats((prev) => [...prev, created]);
      } else if (editing) {
        const res = await fetch(`${API}/projects/type-categories/${editing}`, {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
          body: JSON.stringify(body),
        });
        if (!res.ok) return;
        const updated: ProjectCategory = await res.json();
        setCats((prev) => prev.map((c) => (c.id === editing ? updated : c)));
      }
      setEditing(null);
    } finally { setSaving(false); }
  }

  async function doDelete(cat: ProjectCategory) {
    setDeletingId(cat.id);
    try {
      await fetch(`${API}/projects/type-categories/${cat.id}`, { method: 'DELETE', credentials: 'include' });
      setCats((prev) => prev.filter((c) => c.id !== cat.id));
      setConfirmDelete(null);
      if (editing === cat.id) setEditing(null);
    } finally { setDeletingId(null); }
  }

  const counts = useMemo(() => ({
    all: cats.length,
    expense: cats.filter((c) => (c.type ?? 'expense') !== 'income').length,
    income: cats.filter((c) => c.type === 'income').length,
  }), [cats]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return cats.filter((c) =>
      (!q || c.name.toLowerCase().includes(q))
      && (filter === 'all'
        || (filter === 'income' ? c.type === 'income' : (c.type ?? 'expense') !== 'income')));
  }, [cats, query, filter]);

  const original = editing && editing !== 'new' ? cats.find((c) => c.id === editing) : null;
  const dirty = editing === 'new'
    ? draft.name.trim().length > 0
    : !!original && JSON.stringify(draftOf(original)) !== JSON.stringify(draft);

  function openNew() {
    setDraft({ ...EMPTY_DRAFT, color: PRESET_COLORS[0] });
    setEditing('new');
  }
  function openEdit(c: ProjectCategory) {
    setDraft(draftOf(c));
    setEditing(c.id);
  }

  return (
    <div className="flex flex-col gap-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h3 className="text-xl font-bold">Project categories</h3>
          <p className="text-xs mt-0.5" style={{ color: 'var(--color-text-muted)' }}>
            Organize income and expenses for each project type.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button type="button" onClick={openNew}
            className="px-3.5 py-2 rounded-xl text-sm font-semibold text-white transition-all hover:brightness-110 flex items-center gap-1.5"
            style={{ background: 'var(--color-primary)' }}>
            <span className="text-base leading-none">+</span> New category
          </button>
          <button type="button" onClick={handleSeed} disabled={seeding}
            className="px-3 py-2 rounded-xl text-xs font-semibold transition-all hover:brightness-125 disabled:opacity-50 flex items-center gap-1.5"
            style={{ background: 'var(--color-elevated)', border: '1px solid var(--color-border)', color: 'var(--color-text-secondary)' }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 12a9 9 0 1 0 3-6.7M3 4v5h5" />
            </svg>
            {seeding ? 'Restoring…' : 'Restore defaults'}
          </button>
        </div>
      </div>

      {/* Project type picker — wraps rather than squashing on narrow screens */}
      <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))' }}>
        {PROJECT_TYPES.map((t) => {
          const on = activeType === t.value;
          const n = on ? cats.length : null;
          return (
            <button key={t.value} type="button" onClick={() => setActiveType(t.value)}
              className="flex items-center gap-2.5 px-3 py-3 rounded-2xl text-left transition-all"
              style={{
                background: on ? `color-mix(in srgb, ${t.accent} 14%, var(--color-surface))` : 'var(--color-surface)',
                border: `1px solid ${on ? `color-mix(in srgb, ${t.accent} 50%, transparent)` : 'var(--color-border)'}`,
              }}>
              <span className="w-9 h-9 rounded-xl flex items-center justify-center text-base shrink-0"
                style={{ background: `color-mix(in srgb, ${t.accent} 16%, transparent)` }}>{t.icon}</span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold truncate" style={{ color: on ? t.accent : 'var(--color-text-primary)' }}>{t.label}</span>
                {n !== null && (
                  <span className="block text-[11px]" style={{ color: 'var(--color-text-muted)' }}>
                    {n} categor{n === 1 ? 'y' : 'ies'}
                  </span>
                )}
              </span>
              {on && (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={t.accent} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
                  <path d="M20 6 9 17l-5-5" />
                </svg>
              )}
            </button>
          );
        })}
      </div>

      <p className="flex items-start gap-2 text-[11px]" style={{ color: 'var(--color-text-muted)' }}>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 mt-0.5">
          <path d="M12 2 2 7l10 5 10-5z" /><path d="M2 17l10 5 10-5M2 12l10 5 10-5" />
        </svg>
        Shared across your {typeMeta.label} projects. Updates apply wherever these categories are used.
      </p>

      {/* List + editor. Single column until there is room for both. */}
      <div className="grid grid-cols-1 xl:grid-cols-[1fr_380px] gap-4 items-start">
        <div className="rounded-2xl overflow-hidden" style={glass}>
          <div className="flex flex-col gap-3 px-4 py-3.5" style={{ borderBottom: '1px solid var(--color-border)' }}>
            <div className="flex items-center gap-2 flex-wrap">
              <p className="text-base font-bold">{typeMeta.label} categories</p>
              <span className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>{cats.length} total</span>
              <input value={query} onChange={(e) => setQuery(e.target.value)}
                placeholder="Search categories…" aria-label="Search categories"
                className="ml-auto min-w-36 flex-1 sm:flex-none sm:w-52 px-3 py-2 text-xs outline-none"
                style={inputStyle} />
            </div>
            <div className="flex items-center gap-1.5 flex-wrap">
              {([['all', 'All', counts.all], ['expense', 'Expenses', counts.expense], ['income', 'Income', counts.income]] as const).map(([k, label, n]) => {
                const on = filter === k;
                return (
                  <button key={k} type="button" onClick={() => setFilter(k)}
                    className="px-2.5 py-1.5 rounded-lg text-[11px] font-semibold transition-all flex items-center gap-1.5"
                    style={on
                      ? { background: 'color-mix(in srgb, var(--color-primary) 18%, transparent)', border: '1px solid color-mix(in srgb, var(--color-primary) 45%, transparent)', color: 'var(--color-primary)' }
                      : { background: 'var(--color-elevated)', border: '1px solid var(--color-border)', color: 'var(--color-text-muted)' }}>
                    {label}<span className="tabular-nums" style={{ opacity: 0.75 }}>{n}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Column headers on wide screens only; the rows read fine without them when stacked */}
          <div className="hidden sm:flex items-center gap-3 px-4 py-2 text-[9.5px] font-bold uppercase tracking-wider"
            style={{ background: 'var(--color-elevated)', color: 'var(--color-text-muted)' }}>
            <span className="flex-1">Category</span>
            <span className="w-24">Type</span>
            <span className="w-24 text-right">Actions</span>
          </div>

          <div className="flex flex-col">
            {loading ? (
              <p className="text-xs text-center py-10" style={{ color: 'var(--color-text-muted)' }}>Loading…</p>
            ) : cats.length === 0 ? (
              <div className="px-4 py-10 flex flex-col items-center text-center gap-2">
                <span className="text-2xl">{typeMeta.icon}</span>
                <p className="text-sm font-semibold">No {typeMeta.label.toLowerCase()} categories yet</p>
                <p className="text-xs max-w-xs" style={{ color: 'var(--color-text-muted)' }}>
                  Add one, or restore the defaults for this project type.
                </p>
              </div>
            ) : visible.length === 0 ? (
              <p className="text-xs text-center py-10" style={{ color: 'var(--color-text-muted)' }}>
                Nothing matches {query ? <>“{query}”</> : 'this filter'}.
              </p>
            ) : visible.map((c) => {
              const isEditing = editing === c.id;
              return (
                <div key={c.id}
                  className="flex items-center gap-3 px-4 py-2.5 flex-wrap"
                  style={{
                    borderTop: '1px solid var(--color-border)',
                    background: isEditing ? 'color-mix(in srgb, var(--color-primary) 8%, transparent)' : 'transparent',
                    borderLeft: `3px solid ${isEditing ? 'var(--color-primary)' : 'transparent'}`,
                  }}>
                  <span className="w-9 h-9 rounded-xl flex items-center justify-center text-base shrink-0"
                    style={{ background: `${c.color}22`, border: `1px solid ${c.color}40` }}>{c.icon}</span>
                  <span className="flex-1 min-w-32">
                    <span className="block text-sm font-semibold truncate" style={{ color: c.color }}>{c.name}</span>
                    {c.description && (
                      <span className="block text-[11px] truncate" style={{ color: 'var(--color-text-muted)' }}>{c.description}</span>
                    )}
                  </span>
                  <span className="w-24 shrink-0"><TypePill type={c.type ?? 'expense'} /></span>
                  <span className="w-24 flex items-center justify-end gap-1 shrink-0">
                    <button type="button" onClick={() => openEdit(c)}
                      className="px-2.5 py-1.5 rounded-lg text-[11px] font-semibold transition-all hover:brightness-125"
                      style={isEditing
                        ? { background: 'color-mix(in srgb, var(--color-primary) 20%, transparent)', border: '1px solid color-mix(in srgb, var(--color-primary) 45%, transparent)', color: 'var(--color-primary)' }
                        : { background: 'var(--color-elevated)', border: '1px solid var(--color-border)', color: 'var(--color-text-secondary)' }}>
                      {isEditing ? 'Editing' : 'Edit'}
                    </button>
                    <button type="button" onClick={() => setConfirmDelete(c)}
                      aria-label={`Delete ${c.name}`}
                      className="w-7 h-7 rounded-lg flex items-center justify-center transition-colors hover:bg-red-500/20"
                      style={{ color: 'var(--color-rose)' }}>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" />
                      </svg>
                    </button>
                  </span>
                </div>
              );
            })}
          </div>

          {!editing && cats.length > 0 && (
            <p className="flex items-center gap-2 px-4 py-3 text-[11px]"
              style={{ borderTop: '1px solid var(--color-border)', color: 'var(--color-text-muted)' }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="shrink-0">
                <circle cx="12" cy="12" r="9" /><path d="M12 16v-4M12 8h.01" />
              </svg>
              Select a category to edit its details.
            </p>
          )}
        </div>

        {/* Editor */}
        {editing && (
          <div className="rounded-2xl p-4 flex flex-col gap-3.5" style={glass}>
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-base font-bold flex items-center gap-2">
                  {editing === 'new' ? 'New category' : 'Edit category'}
                  {dirty && (
                    <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold" style={{ color: 'var(--color-amber)' }}>
                      <span className="w-1.5 h-1.5 rounded-full" style={{ background: 'var(--color-amber)' }} />
                      Unsaved changes
                    </span>
                  )}
                </p>
                <p className="text-[11px] mt-0.5" style={{ color: 'var(--color-text-muted)' }}>
                  {typeMeta.label}{editing !== 'new' && original ? ` / ${original.name}` : ''}
                </p>
              </div>
            </div>

            <label className="flex flex-col gap-1.5">
              <span className="text-[11px] font-semibold" style={{ color: 'var(--color-text-secondary)' }}>Category name</span>
              <input value={draft.name} onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
                placeholder="e.g. Mechanic" className="px-3 py-2.5 text-sm outline-none" style={inputStyle} autoFocus />
            </label>

            <label className="flex flex-col gap-1.5">
              <span className="text-[11px] font-semibold" style={{ color: 'var(--color-text-secondary)' }}>Transaction type</span>
              <select value={draft.type} onChange={(e) => setDraft((d) => ({ ...d, type: e.target.value }))}
                className="px-3 py-2.5 text-sm outline-none" style={inputStyle}>
                <option value="expense">Expense</option>
                <option value="income">Income</option>
              </select>
            </label>

            <label className="flex flex-col gap-1.5">
              <span className="text-[11px] font-semibold" style={{ color: 'var(--color-text-secondary)' }}>
                Description <span style={{ color: 'var(--color-text-muted)', fontWeight: 400 }}>Optional</span>
              </span>
              <textarea value={draft.description} rows={2}
                onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))}
                placeholder="What belongs in this category?"
                className="px-3 py-2.5 text-sm outline-none resize-none" style={inputStyle} />
            </label>

            <div className="flex gap-4 flex-wrap">
              <div className="flex flex-col gap-1.5">
                <span className="text-[11px] font-semibold" style={{ color: 'var(--color-text-secondary)' }}>Icon</span>
                <div className="flex items-center gap-2">
                  <span className="w-11 h-11 rounded-xl flex items-center justify-center text-xl shrink-0"
                    style={{ background: `${draft.color}22`, border: `1px solid ${draft.color}40` }}>{draft.icon}</span>
                  <button type="button" data-emoji-trigger
                    onClick={(e) => setIconAnchor(e.currentTarget.getBoundingClientRect())}
                    className="px-3 py-2 rounded-xl text-xs font-semibold transition-all hover:brightness-125"
                    style={{ background: 'var(--color-elevated)', border: '1px solid var(--color-border)', color: 'var(--color-text-secondary)' }}>
                    Choose icon
                  </button>
                </div>
              </div>
              <div className="flex flex-col gap-1.5 min-w-0">
                <span className="text-[11px] font-semibold" style={{ color: 'var(--color-text-secondary)' }}>Color</span>
                <div className="flex gap-1.5 flex-wrap">
                  {PRESET_COLORS.map((col) => (
                    <button key={col} type="button" onClick={() => setDraft((d) => ({ ...d, color: col }))}
                      aria-label={`Color ${col}`}
                      className="w-7 h-7 rounded-full flex items-center justify-center shrink-0"
                      style={{ background: col, border: draft.color === col ? '2px solid var(--color-text-primary)' : '2px solid transparent' }}>
                      {draft.color === col && (
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M20 6 9 17l-5-5" />
                        </svg>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Live preview */}
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest mb-1.5" style={{ color: 'var(--color-text-muted)' }}>Live preview</p>
              <div className="flex items-center gap-3 p-3 rounded-xl" style={{ background: 'var(--color-elevated)', border: '1px solid var(--color-border)' }}>
                <span className="w-10 h-10 rounded-xl flex items-center justify-center text-lg shrink-0"
                  style={{ background: `${draft.color}22`, border: `1px solid ${draft.color}40` }}>{draft.icon}</span>
                <span className="flex-1 min-w-0">
                  <span className="block text-sm font-semibold truncate" style={{ color: draft.color }}>{draft.name || 'Category name'}</span>
                  {draft.description && <span className="block text-[11px] truncate" style={{ color: 'var(--color-text-muted)' }}>{draft.description}</span>}
                </span>
                <span className="shrink-0"><TypePill type={draft.type} /></span>
              </div>
            </div>

            <p className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>
              Applies to all your {typeMeta.label} projects.
            </p>

            <div className="flex items-center gap-2 flex-wrap pt-1" style={{ borderTop: '1px solid var(--color-border)' }}>
              {editing !== 'new' && original && (
                <button type="button" onClick={() => setConfirmDelete(original)}
                  className="mr-auto flex items-center gap-1.5 text-[11px] font-semibold transition-colors hover:brightness-125"
                  style={{ color: 'var(--color-rose)' }}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" />
                  </svg>
                  Delete category
                </button>
              )}
              <button type="button" onClick={() => setEditing(null)}
                className="px-3.5 py-2 rounded-xl text-sm font-medium transition-colors hover:bg-[var(--color-elevated)]"
                style={{ color: 'var(--color-text-secondary)', border: '1px solid var(--color-border)' }}>Cancel</button>
              <button type="button" onClick={save} disabled={saving || !draft.name.trim() || (editing !== 'new' && !dirty)}
                className="px-4 py-2 rounded-xl text-sm font-semibold text-white transition-all hover:brightness-110 disabled:opacity-40"
                style={{ background: 'var(--color-primary)' }}>
                {saving ? 'Saving…' : editing === 'new' ? 'Create category' : 'Save changes'}
              </button>
            </div>
          </div>
        )}
      </div>

      {iconAnchor && (
        <EmojiPicker value={draft.icon} anchor={iconAnchor}
          onPick={(em) => setDraft((d) => ({ ...d, icon: em }))}
          onClose={() => setIconAnchor(null)} />
      )}

      {confirmDelete && createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}
          onMouseDown={(e) => { if (e.target === e.currentTarget) setConfirmDelete(null); }}>
          <div className="w-full max-w-md rounded-2xl flex flex-col gap-5 p-6"
            style={{ background: 'var(--color-elevated)', border: 'var(--glass-border)', boxShadow: 'var(--glass-shadow)' }}>
            <div>
              <p className="font-bold text-base">Delete “{confirmDelete.name}”?</p>
              <p className="text-xs mt-1.5" style={{ color: 'var(--color-text-muted)' }}>
                It is removed from every {typeMeta.label} project. Transactions filed under it keep
                their project but lose this category.
              </p>
            </div>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setConfirmDelete(null)}
                className="px-4 py-2 text-sm font-medium rounded-xl transition-colors hover:bg-[var(--color-surface)]"
                style={{ color: 'var(--color-text-secondary)', border: '1px solid var(--color-border)' }}>Cancel</button>
              <button onClick={() => doDelete(confirmDelete)} disabled={deletingId === confirmDelete.id}
                className="px-4 py-2 text-sm font-semibold rounded-xl transition-all hover:brightness-110 disabled:opacity-40"
                style={{ background: 'color-mix(in srgb, var(--color-rose) 18%, transparent)', border: '1px solid color-mix(in srgb, var(--color-rose) 35%, transparent)', color: 'var(--color-rose)' }}>
                {deletingId === confirmDelete.id ? 'Deleting…' : 'Delete category'}
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}
