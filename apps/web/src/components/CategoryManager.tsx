'use client';

import { useState, useEffect } from 'react';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3333/api';

interface Category {
  id: string;
  name: string;
  icon: string;
  color: string;
  type: string;
  isDefault: boolean;
}

const PRESET_COLORS = ['#9B6DFF','#4FBF7F','#F07A3E','#F5C842','#4BA8D8','#E879A0','#5C5C78','#FF6B6B'];

const EMOJI_OPTIONS = [
  '🍔','🍕','🍣','🥗','☕','🍺','🛒','🥦',
  '🚗','🚕','✈️','🚂','🚲','⛽','🛵','🚌',
  '🛍️','👗','👟','💍','📦','🛋️','🔧','🏠',
  '💊','🏥','🏃','🧘','🦷','❤️','🧠','🩺',
  '🎬','🎮','🎵','🎭','📚','🎨','🎲','🏆',
  '💡','🔌','📡','🌊','🔥','❄️','☀️','🌙',
  '💼','💰','📈','💳','🏦','💎','🪙','💵',
  '📱','💻','⌨️','📷','🎓','✏️','📋','🗓️',
  '✈️','🏖️','🗺️','🏕️','🎡','🎢','🚢','🎠',
  '🐾','🌿','🎁','✨','🔑','🧺','🪴','🧹',
];

const glass: React.CSSProperties = {
  background: 'rgba(35, 35, 47, 0.50)',
  backdropFilter: 'blur(20px)',
  WebkitBackdropFilter: 'blur(20px)',
  border: '1px solid rgba(255,255,255,0.08)',
  boxShadow: '0 4px 24px rgba(0,0,0,0.3)',
};

const inputStyle: React.CSSProperties = {
  background: 'rgba(255,255,255,0.05)',
  border: '1px solid rgba(255,255,255,0.10)',
  borderRadius: 'var(--radius-input)',
  color: 'var(--color-text-primary)',
};

const TYPE_COLORS: Record<string, string> = {
  expense: '#F07A3E',
  income:  '#4FBF7F',
  both:    '#9B6DFF',
};

export default function CategoryManager() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Category | null>(null);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const [form, setForm] = useState({ name: '', icon: '📦', color: PRESET_COLORS[0], type: 'expense' });

  useEffect(() => {
    fetch(`${API}/categories`, { credentials: 'include' })
      .then((r) => r.json())
      .then(setCategories)
      .finally(() => setLoading(false));
  }, []);

  function startCreate() {
    setEditing(null);
    setForm({ name: '', icon: '📦', color: PRESET_COLORS[0], type: 'expense' });
    setShowForm(true);
  }

  function startEdit(cat: Category) {
    setEditing(cat);
    setForm({ name: cat.name, icon: cat.icon, color: cat.color, type: cat.type });
    setShowForm(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const url = editing ? `${API}/categories/${editing.id}` : `${API}/categories`;
    const method = editing ? 'PATCH' : 'POST';
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(form),
    });
    const saved: Category = await res.json();
    setCategories((prev) =>
      editing ? prev.map((c) => (c.id === saved.id ? saved : c)) : [...prev, saved],
    );
    setShowForm(false);
    setEditing(null);
  }

  async function handleDelete(id: string) {
    setDeletingId(id);
    try {
      await fetch(`${API}/categories/${id}`, { method: 'DELETE', credentials: 'include' });
      setCategories((prev) => prev.filter((c) => c.id !== id));
    } finally {
      setDeletingId(null);
    }
  }

  const expenses  = categories.filter((c) => c.type === 'expense');
  const incomes   = categories.filter((c) => c.type === 'income');
  const both      = categories.filter((c) => c.type === 'both');

  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-semibold text-base">Categories</h2>
          <p className="text-xs mt-0.5" style={{ color: 'var(--color-text-muted)' }}>
            Organize your transactions with custom categories.
          </p>
        </div>
        {!showForm && (
          <button onClick={startCreate}
            className="px-4 py-2 text-sm font-semibold text-white rounded-xl transition-all hover:brightness-110"
            style={{ background: 'var(--color-card-violet)' }}>
            + Add Category
          </button>
        )}
      </div>

      {/* Form */}
      {showForm && (
        <form onSubmit={handleSubmit} className="p-5 flex flex-col gap-4" style={{ ...glass, borderRadius: 'var(--radius-card)' }}>
          <p className="font-semibold text-sm">{editing ? 'Edit Category' : 'New Category'}</p>

          <div className="grid grid-cols-2 gap-3">
            {/* Icon picker */}
            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-medium" style={{ color: 'var(--color-text-secondary)' }}>Icon</span>
              <div className="relative">
                <button type="button" onClick={() => setShowEmojiPicker((v) => !v)}
                  className="w-full px-3 py-2.5 text-left flex items-center gap-3 text-sm"
                  style={inputStyle}>
                  <span className="text-xl">{form.icon}</span>
                  <span style={{ color: 'var(--color-text-muted)' }}>Choose icon</span>
                </button>
                {showEmojiPicker && (
                  <div className="absolute z-10 top-full mt-1 left-0 p-3 rounded-xl grid grid-cols-8 gap-1"
                    style={{ ...glass, width: '280px' }}>
                    {EMOJI_OPTIONS.map((e) => (
                      <button key={e} type="button"
                        onClick={() => { setForm((f) => ({ ...f, icon: e })); setShowEmojiPicker(false); }}
                        className="w-8 h-8 rounded-lg text-lg flex items-center justify-center transition-colors hover:bg-white/10"
                        style={{ background: form.icon === e ? 'rgba(155,109,255,0.25)' : 'transparent' }}>
                        {e}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </label>

            {/* Name */}
            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-medium" style={{ color: 'var(--color-text-secondary)' }}>Name</span>
              <input required placeholder="e.g. Groceries" value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                className="px-3 py-2.5 text-sm outline-none" style={inputStyle} />
            </label>

            {/* Type */}
            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-medium" style={{ color: 'var(--color-text-secondary)' }}>Type</span>
              <select value={form.type} onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))}
                className="px-3 py-2.5 text-sm outline-none appearance-none" style={inputStyle}>
                <option value="expense">Expense</option>
                <option value="income">Income</option>
                <option value="both">Both</option>
              </select>
            </label>

            {/* Color */}
            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-medium" style={{ color: 'var(--color-text-secondary)' }}>Color</span>
              <div className="flex items-center gap-2 px-3 py-2" style={{ ...inputStyle, borderRadius: 'var(--radius-input)' }}>
                {PRESET_COLORS.map((c) => (
                  <button key={c} type="button" onClick={() => setForm((f) => ({ ...f, color: c }))}
                    className="w-6 h-6 rounded-full transition-transform hover:scale-110 shrink-0"
                    style={{ background: c, outline: form.color === c ? `2px solid ${c}` : 'none', outlineOffset: '2px' }} />
                ))}
              </div>
            </label>
          </div>

          {/* Preview */}
          <div className="flex items-center gap-3 p-3 rounded-xl" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}>
            <div className="w-10 h-10 rounded-xl flex items-center justify-center text-xl shrink-0"
              style={{ background: `${form.color}22`, border: `1px solid ${form.color}44` }}>
              {form.icon}
            </div>
            <div>
              <p className="font-semibold text-sm">{form.name || 'Category name'}</p>
              <p className="text-xs capitalize" style={{ color: TYPE_COLORS[form.type] }}>{form.type}</p>
            </div>
          </div>

          <div className="flex gap-2 justify-end">
            <button type="button" onClick={() => { setShowForm(false); setEditing(null); }}
              className="px-4 py-2 text-sm font-medium rounded-xl"
              style={{ color: 'var(--color-text-secondary)', border: '1px solid rgba(255,255,255,0.08)' }}>
              Cancel
            </button>
            <button type="submit"
              className="px-4 py-2 text-sm font-semibold text-white rounded-xl hover:brightness-110"
              style={{ background: 'var(--color-card-violet)' }}>
              {editing ? 'Save Changes' : 'Add Category'}
            </button>
          </div>
        </form>
      )}

      {/* Grid */}
      {loading ? (
        <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>Loading categories…</p>
      ) : (
        <div className="flex flex-col gap-5">
          {[
            { label: 'Expense', items: expenses, color: '#F07A3E' },
            { label: 'Income',  items: incomes,  color: '#4FBF7F' },
            { label: 'Both',    items: both,     color: '#9B6DFF' },
          ].filter((g) => g.items.length > 0).map((group) => (
            <div key={group.label}>
              <p className="text-xs font-bold tracking-widest uppercase mb-2 px-1"
                style={{ color: group.color }}>{group.label}</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2">
                {group.items.map((cat) => (
                  <div key={cat.id} className="p-3 flex items-center gap-3 group relative"
                    style={{ ...glass, borderRadius: 'var(--radius-card)' }}>
                    <div className="w-9 h-9 rounded-xl flex items-center justify-center text-lg shrink-0"
                      style={{ background: `${cat.color}22`, border: `1px solid ${cat.color}44` }}>
                      {cat.icon}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold truncate">{cat.name}</p>
                      {cat.isDefault && (
                        <p className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>Default</p>
                      )}
                    </div>
                    {/* Actions — visible on hover */}
                    <div className="absolute right-2 top-1/2 -translate-y-1/2 hidden group-hover:flex gap-1">
                      <button onClick={() => startEdit(cat)}
                        className="w-6 h-6 rounded-md flex items-center justify-center transition-colors hover:bg-white/15"
                        title="Edit">
                        <PencilIcon />
                      </button>
                      <button onClick={() => handleDelete(cat.id)} disabled={deletingId === cat.id}
                        className="w-6 h-6 rounded-md flex items-center justify-center transition-colors hover:bg-red-500/20 disabled:opacity-40"
                        title="Delete">
                        {deletingId === cat.id ? <span className="text-[10px]">…</span> : <TrashIcon />}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function PencilIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--color-text-secondary)' }}>
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--color-text-muted)' }}>
      <polyline points="3 6 5 6 21 6"/>
      <path d="M19 6l-1 14H6L5 6"/>
      <path d="M10 11v6M14 11v6"/>
      <path d="M9 6V4h6v2"/>
    </svg>
  );
}
