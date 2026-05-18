'use client';

import { useState, useEffect } from 'react';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3333/api';

const PRESET_COLORS = ['#9B6DFF', '#4FBF7F', '#F07A3E', '#F5C842', '#4BA8D8', '#E879A0'];

const PROJECT_TYPES = [
  { value: 'vehicle',  label: 'Vehicle',  icon: '🚗', accent: '#4BA8D8' },
  { value: 'property', label: 'Property', icon: '🏠', accent: '#4FBF7F' },
  { value: 'business', label: 'Business', icon: '💼', accent: '#9B6DFF' },
  { value: 'other',    label: 'Other',    icon: '📦', accent: '#F07A3E' },
];

interface ProjectCategory {
  id: string; name: string; icon: string; color: string; order: number;
}

const inputStyle: React.CSSProperties = {
  background: 'rgba(255,255,255,0.05)',
  border: '1px solid rgba(255,255,255,0.10)',
  borderRadius: '10px',
  color: 'var(--color-text-primary)',
};

export default function ProjectCategoryManager() {
  const [activeType, setActiveType] = useState('vehicle');
  const [cats, setCats]             = useState<ProjectCategory[]>([]);
  const [loading, setLoading]       = useState(false);
  const [seeding, setSeeding]       = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [editingId, setEditingId]   = useState<string | null>(null);
  const [editForm, setEditForm]     = useState({ name: '', icon: '', color: '' });
  const [saving, setSaving]         = useState(false);

  /* New category form */
  const [showAdd, setShowAdd]   = useState(false);
  const [addForm, setAddForm]   = useState({ name: '', icon: '📦', color: '#9B6DFF' });
  const [addSaving, setAddSaving] = useState(false);

  const typeMeta = PROJECT_TYPES.find((t) => t.value === activeType)!;

  useEffect(() => { loadCats(activeType); }, [activeType]);

  async function loadCats(type: string) {
    setLoading(true);
    try {
      const res = await fetch(`${API}/projects/type-categories?type=${type}`, { credentials: 'include' });
      setCats(await res.json());
    } finally { setLoading(false); }
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

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault(); setAddSaving(true);
    try {
      const res = await fetch(`${API}/projects/type-categories`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify({ ...addForm, type: activeType }),
      });
      if (!res.ok) return;
      const created: ProjectCategory = await res.json();
      setCats((prev) => [...prev, created]);
      setAddForm({ name: '', icon: '📦', color: '#9B6DFF' });
      setShowAdd(false);
    } finally { setAddSaving(false); }
  }

  function startEdit(cat: ProjectCategory) {
    setEditingId(cat.id);
    setEditForm({ name: cat.name, icon: cat.icon, color: cat.color });
  }

  async function handleUpdate(catId: string) {
    setSaving(true);
    try {
      const res = await fetch(`${API}/projects/type-categories/${catId}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify(editForm),
      });
      if (!res.ok) return;
      const updated: ProjectCategory = await res.json();
      setCats((prev) => prev.map((c) => (c.id === catId ? updated : c)));
      setEditingId(null);
    } finally { setSaving(false); }
  }

  async function handleDelete(catId: string) {
    setDeletingId(catId);
    try {
      await fetch(`${API}/projects/type-categories/${catId}`, { method: 'DELETE', credentials: 'include' });
      setCats((prev) => prev.filter((c) => c.id !== catId));
    } finally { setDeletingId(null); }
  }

  return (
    <div className="flex flex-col gap-5 max-w-3xl">
      <div className="flex items-start justify-between gap-4">
        <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
          Manage expense categories per project type. Categories are shared across all projects of the same type.
        </p>
        <button
          onClick={handleSeed} disabled={seeding}
          className="shrink-0 flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-xl hover:brightness-110 disabled:opacity-50"
          style={{ background: 'rgba(155,109,255,0.15)', color: '#9B6DFF', border: '1px solid rgba(155,109,255,0.28)' }}>
          {seeding ? '…' : '✦ Restore defaults'}
        </button>
      </div>

      {/* Type tabs */}
      <div className="flex gap-1 p-1 rounded-xl w-fit" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}>
        {PROJECT_TYPES.map((t) => (
          <button key={t.value} onClick={() => { setActiveType(t.value); setEditingId(null); setShowAdd(false); }}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all"
            style={activeType === t.value
              ? { background: `${t.accent}22`, color: t.accent, border: `1px solid ${t.accent}40` }
              : { color: 'var(--color-text-secondary)', border: '1px solid transparent' }}>
            <span>{t.icon}</span>{t.label}
          </button>
        ))}
      </div>

      {/* Category list */}
      <div className="flex flex-col gap-2 rounded-2xl p-4"
        style={{ background: 'rgba(35,35,47,0.50)', backdropFilter: 'blur(20px)', border: '1px solid rgba(255,255,255,0.08)' }}>

        {loading ? (
          <p className="text-sm py-4 text-center" style={{ color: 'var(--color-text-muted)' }}>Loading…</p>
        ) : cats.length === 0 ? (
          <p className="text-sm py-4 text-center" style={{ color: 'var(--color-text-muted)' }}>
            No categories — click "Restore defaults" or add your own below.
          </p>
        ) : (
          cats.map((cat) => (
            <div key={cat.id}>
              {editingId === cat.id ? (
                /* Inline edit row */
                <div className="flex items-center gap-2 p-2 rounded-xl"
                  style={{ background: 'rgba(255,255,255,0.04)', border: `1px solid ${editForm.color}30` }}>
                  <input value={editForm.icon} onChange={(e) => setEditForm((f) => ({ ...f, icon: e.target.value }))}
                    className="w-9 px-1 py-1.5 text-center text-sm outline-none rounded-lg shrink-0"
                    style={inputStyle} maxLength={2} />
                  <input value={editForm.name} onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))}
                    className="flex-1 px-2.5 py-1.5 text-sm outline-none rounded-lg min-w-0"
                    style={inputStyle} autoFocus />
                  <div className="flex items-center gap-1 shrink-0">
                    {PRESET_COLORS.map((c) => (
                      <button key={c} type="button" onClick={() => setEditForm((f) => ({ ...f, color: c }))}
                        className="w-4 h-4 rounded-full transition-transform hover:scale-110"
                        style={{ background: c, outline: editForm.color === c ? `2px solid ${c}` : 'none', outlineOffset: '1.5px' }} />
                    ))}
                  </div>
                  <button onClick={() => handleUpdate(cat.id)} disabled={saving}
                    className="px-2.5 py-1.5 text-xs font-semibold rounded-lg hover:brightness-110 disabled:opacity-50 shrink-0"
                    style={{ background: typeMeta.accent + '22', color: typeMeta.accent, border: `1px solid ${typeMeta.accent}40` }}>
                    {saving ? '…' : 'Save'}
                  </button>
                  <button onClick={() => setEditingId(null)}
                    className="px-2.5 py-1.5 text-xs rounded-lg hover:bg-white/10 shrink-0"
                    style={{ color: 'var(--color-text-muted)', border: '1px solid rgba(255,255,255,0.08)' }}>
                    Cancel
                  </button>
                </div>
              ) : (
                /* Display row */
                <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl group hover:bg-white/4 transition-colors">
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center text-base shrink-0"
                    style={{ background: `${cat.color}18`, border: `1px solid ${cat.color}25` }}>
                    {cat.icon}
                  </div>
                  <span className="flex-1 text-sm font-medium" style={{ color: cat.color }}>{cat.name}</span>
                  <div className="w-3 h-3 rounded-full shrink-0" style={{ background: cat.color }} />
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button onClick={() => startEdit(cat)}
                      className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-white/10"
                      style={{ color: 'var(--color-text-muted)' }} title="Edit">
                      <EditIcon />
                    </button>
                    <button onClick={() => handleDelete(cat.id)} disabled={deletingId === cat.id}
                      className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-red-500/20 disabled:opacity-40"
                      title="Delete">
                      {deletingId === cat.id ? <span className="text-[10px]">…</span> : <TrashIcon />}
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))
        )}

        {/* Add row */}
        {showAdd ? (
          <form onSubmit={handleAdd}
            className="flex items-center gap-2 p-2 rounded-xl mt-1"
            style={{ background: 'rgba(255,255,255,0.04)', border: `1px solid ${typeMeta.accent}25` }}>
            <input value={addForm.icon} onChange={(e) => setAddForm((f) => ({ ...f, icon: e.target.value }))}
              className="w-9 px-1 py-1.5 text-center text-sm outline-none rounded-lg shrink-0"
              style={inputStyle} maxLength={2} placeholder="📦" />
            <input required value={addForm.name} onChange={(e) => setAddForm((f) => ({ ...f, name: e.target.value }))}
              className="flex-1 px-2.5 py-1.5 text-sm outline-none rounded-lg min-w-0"
              style={inputStyle} placeholder="Category name…" autoFocus />
            <div className="flex items-center gap-1 shrink-0">
              {PRESET_COLORS.map((c) => (
                <button key={c} type="button" onClick={() => setAddForm((f) => ({ ...f, color: c }))}
                  className="w-4 h-4 rounded-full transition-transform hover:scale-110"
                  style={{ background: c, outline: addForm.color === c ? `2px solid ${c}` : 'none', outlineOffset: '1.5px' }} />
              ))}
            </div>
            <button type="submit" disabled={addSaving}
              className="px-2.5 py-1.5 text-xs font-semibold rounded-lg hover:brightness-110 disabled:opacity-50 shrink-0"
              style={{ background: 'var(--color-card-violet)', color: 'white' }}>
              {addSaving ? '…' : 'Add'}
            </button>
            <button type="button" onClick={() => setShowAdd(false)}
              className="px-2.5 py-1.5 text-xs rounded-lg hover:bg-white/10 shrink-0"
              style={{ color: 'var(--color-text-muted)', border: '1px solid rgba(255,255,255,0.08)' }}>
              Cancel
            </button>
          </form>
        ) : (
          <button onClick={() => { setShowAdd(true); setEditingId(null); }}
            className="flex items-center gap-2 px-3 py-2 rounded-xl text-sm hover:bg-white/5 transition-colors mt-1"
            style={{ color: 'var(--color-text-muted)', border: '1px dashed rgba(255,255,255,0.10)' }}>
            <span className="text-base leading-none">+</span> Add category
          </button>
        )}
      </div>
    </div>
  );
}

function EditIcon() {
  return <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>;
}
function TrashIcon() {
  return <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#FF6B6B" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg>;
}
