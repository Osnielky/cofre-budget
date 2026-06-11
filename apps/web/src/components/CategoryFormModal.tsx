'use client';

import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3333/api';

export interface Category {
  id: string; name: string; icon: string; color: string;
  type: string; isDefault: boolean; description: string | null;
}

const PRESET_COLORS = ['#9B6DFF', '#4FBF7F', '#F07A3E', '#F5C842', '#4BA8D8', '#E879A0', '#5C5C78', '#FF6B6B'];

const EMOJI_OPTIONS = [
  '🍔','🍕','🍣','🌮','🍜','🥗','🥩','🍱','☕','🧃','🍺','🥤','🍷','🧋','🍦','🧁',
  '🛒','🥦','🍎','🥑','🧀','🥐','🍳','🥘','🚗','🚕','🏎️','🚙','🚐','🛻','🚌','🚎',
  '✈️','🚂','🚲','🛵','⛽','🛺','🚁','🛳️','🚢','🚀','🛸','🛞','🅿️','🚦','🗺️','🛍️',
  '👗','👟','👔','👜','💍','🕶️','🧣','🏠','🛋️','🪑','🛏️','🚿','🪣','🧹','🧺','🔧',
  '🔨','🪛','🧰','💡','🔌','🖼️','🪞','💊','🏥','🏃','🧘','🦷','❤️','🧠','🩺','🩹',
  '🩻','🧬','💉','🏋️','🚴','🧗','⛷️','🫀','🫁','🧴','🧼','🪥','🌡️','🎬','🎮','🎵',
  '🎭','📚','🎨','🎲','🏆','🎯','🎸','🎹','🎺','🎻','🥁','🎤','🎧','🎪','🎠','🎡',
  '🎢','🎟️','🃏','💻','📱','⌨️','🖥️','📷','📹','💼','📊','📋','📌','🗓️','✏️','📝',
  '🔍','📡','🤖','⌚','📺','📻','🔭','💰','💳','💵','🪙','💎','📈','📉','🏦','🤑',
  '💸','🏷️','🏖️','🏕️','🧳','🏔️','🌋','🏝️','🗼','🗽','🏰','🌃','🌆','🎓','🔬','🧪',
  '🧲','⚗️','📖','📓','🌿','🌸','🌺','🌻','🍁','🍄','🌊','⛰️','🌈','☀️','🌙','⭐',
  '❄️','🔥','💧','🌱','🎁','✨','🔑','🪴','🐾','🧸','📦','🗑️','📬','🧧','🏡','⚡',
];

const TYPE_META: Record<string, { label: string; color: string }> = {
  expense:  { label: 'Expense',  color: '#F07A3E' },
  income:   { label: 'Income',   color: '#4FBF7F' },
  both:     { label: 'Both',     color: '#9B6DFF' },
  transfer: { label: 'Transfer', color: '#6B6B8A' },
};

const TYPE_TIPS: Record<string, string> = {
  expense:  'Used for money going out — groceries, rent, subscriptions, etc.',
  income:   'Used for money coming in — salary, freelance income, refunds, etc.',
  both:     'Can appear on both sides — useful for flexible categories like "Other".',
  transfer: 'Excluded from budget calculations and income/expense totals.',
};

const inputStyle: React.CSSProperties = {
  background: 'rgba(255,255,255,0.05)',
  border: '1px solid rgba(255,255,255,0.10)',
  borderRadius: '10px',
  color: 'var(--color-text-primary)',
};

interface Props {
  editing?: Category | null;
  defaultType?: string;
  onClose: () => void;
  onSaved: (cat: Category) => void;
}

export default function CategoryFormModal({ editing, defaultType = 'expense', onClose, onSaved }: Props) {
  const [form, setForm] = useState({
    name: editing?.name ?? '',
    icon: editing?.icon ?? '📦',
    color: editing?.color ?? PRESET_COLORS[0],
    type: editing?.type ?? defaultType,
    description: editing?.description ?? '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [emojiSearch, setEmojiSearch] = useState('');
  const [emojiPos, setEmojiPos] = useState<{ top: number; left: number } | null>(null);
  const [isDirty, setIsDirty] = useState(false);
  const emojiTriggerRef = useRef<HTMLButtonElement>(null);
  const emojiPickerRef  = useRef<HTMLDivElement>(null);
  const isMobile = typeof window !== 'undefined' && window.innerWidth < 640;

  useEffect(() => {
    if (!showEmojiPicker) return;
    function onDown(e: MouseEvent) {
      const t = e.target as Node;
      if (!emojiPickerRef.current?.contains(t) && !emojiTriggerRef.current?.contains(t))
        setShowEmojiPicker(false);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setShowEmojiPicker(false);
    }
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [showEmojiPicker]);

  const handleFormChange = (updates: Partial<typeof form>) => {
    setForm(f => ({ ...f, ...updates }));
    setIsDirty(true);
    setError(null);
  };

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) {
      setError('Category name is required');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const url = editing ? `${API}/categories/${editing.id}` : `${API}/categories`;
      const res = await fetch(url, {
        method: editing ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(form),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.message || `Failed to ${editing ? 'update' : 'create'} category`);
      }
      const saved: Category = await res.json();
      setIsDirty(false);
      onSaved(saved);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setSaving(false);
    }
  }

  function handleClose() {
    if (isDirty && !confirm('Discard unsaved changes?')) return;
    onClose();
  }

  const typeMeta = TYPE_META[form.type] ?? TYPE_META.expense;

  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(6px)' }}
      onClick={(e) => { if (e.target === e.currentTarget) handleClose(); }}
      role="dialog"
      aria-labelledby="modal-title"
      aria-modal="true">

      <form onSubmit={handleSubmit}
        className="w-full max-w-sm flex flex-col rounded-2xl overflow-hidden"
        style={{ background: 'var(--color-elevated)', border: 'var(--glass-border)', boxShadow: 'var(--glass-shadow)' }}>

        {/* Live preview header */}
        <div className="px-5 pt-5 pb-4 flex items-center justify-between gap-3"
          style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center text-xl shrink-0"
              style={{ background: `${form.color}22`, boxShadow: `0 0 0 1px ${form.color}44` }}
              aria-hidden="true">
              {form.icon}
            </div>
            <div className="min-w-0">
              <p id="modal-title" className="font-bold text-sm truncate" style={{ color: form.name ? form.color : 'var(--color-text-muted)' }}>
                {form.name || 'Category name'}
              </p>
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md"
                style={{ background: `${typeMeta.color}20`, color: typeMeta.color }}>
                {typeMeta.label}
              </span>
            </div>
          </div>
          <button type="button" onClick={handleClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-white/10 shrink-0 transition-colors"
            style={{ color: 'var(--color-text-muted)' }}
            aria-label="Close dialog">
            <CloseIcon />
          </button>
        </div>

        <div className="flex flex-col gap-4 px-5 py-4">

          {/* Error display */}
          {error && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs"
              style={{ background: 'rgba(255,107,107,0.15)', border: '1px solid rgba(255,107,107,0.3)', color: '#FF6B6B' }}
              role="alert">
              <span>⚠️</span>
              <span>{error}</span>
            </div>
          )}

          {/* Type pill group */}
          <div className="flex flex-col gap-2">
            <span className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'var(--color-text-muted)' }}>
              <label htmlFor="type-expense">Type</label>
            </span>
            <div className="grid grid-cols-4 gap-1.5 p-1 rounded-xl" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}>
              {Object.entries(TYPE_META).map(([val, meta]) => (
                <button key={val} type="button"
                  id={`type-${val}`}
                  onClick={() => handleFormChange({ type: val })}
                  className="py-1.5 rounded-lg text-xs font-semibold transition-all hover:brightness-110"
                  style={{
                    background: form.type === val ? `${meta.color}22` : 'transparent',
                    color: form.type === val ? meta.color : 'var(--color-text-muted)',
                    border: form.type === val ? `1px solid ${meta.color}44` : '1px solid transparent',
                  }}
                  aria-pressed={form.type === val}>
                  {meta.label}
                </button>
              ))}
            </div>
            <p className="text-[11px] px-0.5" style={{ color: 'var(--color-text-muted)' }}>{TYPE_TIPS[form.type]}</p>
          </div>

          {/* Name */}
          <div className="flex flex-col gap-1.5">
            <label htmlFor="category-name" className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'var(--color-text-muted)' }}>Name</label>
            <input id="category-name" required autoFocus placeholder="e.g. Groceries" value={form.name} maxLength={50}
              onChange={(e) => handleFormChange({ name: e.target.value })}
              className="px-3 py-2.5 text-sm outline-none rounded-xl" 
              style={inputStyle}
              aria-describedby="name-hint" />
            <span id="name-hint" className="text-xs px-0.5" style={{ color: 'var(--color-text-muted)' }}>
              {form.name.length}/50
            </span>
          </div>

          {/* Icon + Color */}
          <div className="flex gap-3">
            <div className="flex flex-col gap-1.5 shrink-0">
              <label htmlFor="icon-picker" className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'var(--color-text-muted)' }}>Icon</label>
              <button ref={emojiTriggerRef} id="icon-picker" type="button"
                onClick={() => {
                  if (!showEmojiPicker && emojiTriggerRef.current) {
                    const r = emojiTriggerRef.current.getBoundingClientRect();
                    const spaceBelow = window.innerHeight - r.bottom - 8;
                    const pickerHeight = isMobile ? 180 : 340;
                    setEmojiPos({ 
                      top: spaceBelow > pickerHeight ? r.bottom + 4 : Math.max(8, r.top - pickerHeight - 4), 
                      left: isMobile ? Math.max(8, r.left - 160) : r.left 
                    });
                  }
                  setShowEmojiPicker((v) => !v);
                }}
                className="w-16 h-10 rounded-xl flex items-center justify-center gap-1.5 text-xl transition-colors hover:bg-white/10"
                style={inputStyle}
                aria-expanded={showEmojiPicker}
                aria-haspopup="dialog">
                {form.icon}
                <svg width="8" height="8" viewBox="0 0 12 12" fill="none" style={{ opacity: 0.4, flexShrink: 0 }}>
                  <path d="M2 4l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </button>
            </div>
            <div className="flex flex-col gap-1.5 flex-1 min-w-0">
              <fieldset>
                <legend className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'var(--color-text-muted)' }}>Color</legend>
                <div className="flex flex-wrap items-center gap-2 px-3 h-10 rounded-xl mt-1.5" style={inputStyle}>
                  {PRESET_COLORS.map((c) => (
                    <button key={c} type="button" onClick={() => handleFormChange({ color: c })}
                      className="w-4 h-4 rounded-full transition-all hover:scale-110 shrink-0"
                      style={{ background: c, boxShadow: form.color === c ? `0 0 0 2px rgba(0,0,0,0.6), 0 0 0 4px ${c}` : 'none' }}
                      aria-label={`Color ${c}`}
                      aria-pressed={form.color === c} />
                  ))}
                </div>
              </fieldset>
            </div>
          </div>

          {/* Description */}
          <div className="flex flex-col gap-1.5">
            <label htmlFor="category-desc" className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'var(--color-text-muted)' }}>
              Description <span style={{ opacity: 0.5, fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>(optional)</span>
            </label>
            <input id="category-desc" placeholder="e.g. Restaurants, groceries…" value={form.description}
              onChange={(e) => handleFormChange({ description: e.target.value })}
              maxLength={100} className="px-3 py-2.5 text-sm outline-none rounded-xl" 
              style={inputStyle}
              aria-describedby="desc-hint" />
            <span id="desc-hint" className="text-xs px-0.5" style={{ color: 'var(--color-text-muted)' }}>
              {form.description.length}/100
            </span>
          </div>

        </div>

        {/* Footer */}
        <div className="flex gap-2 justify-end px-5 py-4"
          style={{ borderTop: '1px solid rgba(255,255,255,0.07)' }}>
          <button type="button" onClick={handleClose}
            className="px-4 py-2 text-sm font-medium rounded-xl hover:bg-white/10 transition-colors"
            style={{ color: 'var(--color-text-secondary)' }}>
            Cancel
          </button>
          <button type="submit" disabled={saving || !form.name.trim()}
            className="px-5 py-2 text-sm font-semibold text-white rounded-xl hover:brightness-110 disabled:opacity-60 transition-all"
            style={{ background: typeMeta.color }}>
            {saving ? 'Saving…' : editing ? 'Save Changes' : 'Add Category'}
          </button>
        </div>
      </form>

      {/* Emoji picker */}
      {showEmojiPicker && emojiPos && (
        <div ref={emojiPickerRef} 
          className={`p-3 rounded-xl grid gap-1 ${isMobile ? 'grid-cols-8' : 'grid-cols-10'}`}
          style={{ position: 'fixed', top: emojiPos.top, left: emojiPos.left, 
                   width: isMobile ? 300 : 360, maxHeight: isMobile ? 180 : 340,
                   overflowY: 'auto', zIndex: 9999, background: 'var(--color-elevated)',
                   backdropFilter: 'var(--glass-blur)', WebkitBackdropFilter: 'var(--glass-blur)',
                   border: 'var(--glass-border)', boxShadow: 'var(--glass-shadow)' }}
          role="dialog"
          aria-label="Emoji picker">
          {emojiSearch && (
            <input type="text" placeholder="Search emojis…" value={emojiSearch}
              onChange={(e) => setEmojiSearch(e.target.value)}
              className="col-span-full px-2 py-1.5 text-xs rounded-lg outline-none mb-1"
              style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)' }}
              autoFocus />
          )}
          {EMOJI_OPTIONS.map((em) => (
            <button key={em} type="button"
              onClick={() => { handleFormChange({ icon: em }); setShowEmojiPicker(false); setEmojiSearch(''); }}
              className="w-8 h-8 rounded-lg text-lg flex items-center justify-center hover:bg-white/10 transition-colors"
              style={{ background: form.icon === em ? 'rgba(155,109,255,0.25)' : 'transparent' }}
              aria-label={`Select emoji ${em}`}
              aria-pressed={form.icon === em}>
              {em}
            </button>
          ))}
        </div>
      )}
    </div>,
    document.body
  );
}

function CloseIcon() {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>;
}
