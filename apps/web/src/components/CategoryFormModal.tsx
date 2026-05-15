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
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [emojiPos, setEmojiPos] = useState<{ top: number; left: number } | null>(null);
  const emojiTriggerRef = useRef<HTMLButtonElement>(null);
  const emojiPickerRef  = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!showEmojiPicker) return;
    function onDown(e: MouseEvent) {
      const t = e.target as Node;
      if (!emojiPickerRef.current?.contains(t) && !emojiTriggerRef.current?.contains(t))
        setShowEmojiPicker(false);
    }
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [showEmojiPicker]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const url = editing ? `${API}/categories/${editing.id}` : `${API}/categories`;
      const res = await fetch(url, {
        method: editing ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(form),
      });
      if (!res.ok) return;
      const saved: Category = await res.json();
      onSaved(saved);
    } finally {
      setSaving(false);
    }
  }

  const typeMeta = TYPE_META[form.type] ?? TYPE_META.expense;

  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(6px)' }}
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>

      <form onSubmit={handleSubmit}
        className="w-full max-w-lg flex flex-col gap-5 p-6 rounded-2xl"
        style={{ background: 'rgba(22,22,36,0.98)', border: '1px solid rgba(255,255,255,0.10)', boxShadow: '0 24px 64px rgba(0,0,0,0.7)' }}>

        {/* Header */}
        <div className="flex items-center justify-between">
          <p className="font-bold text-base">{editing ? 'Edit Category' : 'New Category'}</p>
          <div className="flex items-center gap-3">
            {/* Live preview */}
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl"
              style={{ background: `${form.color}18`, border: `1px solid ${form.color}44` }}>
              <span className="text-base">{form.icon}</span>
              <span className="text-sm font-semibold" style={{ color: form.color }}>{form.name || 'Preview'}</span>
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md"
                style={{ background: `${typeMeta.color}20`, color: typeMeta.color }}>{typeMeta.label}</span>
            </div>
            <button type="button" onClick={onClose}
              className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-white/10"
              style={{ color: 'var(--color-text-muted)' }}>
              <CloseIcon />
            </button>
          </div>
        </div>

        {/* Name + Description */}
        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-medium" style={{ color: 'var(--color-text-secondary)' }}>Name</span>
            <input required placeholder="e.g. Groceries" value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              className="px-3 py-2.5 text-sm outline-none" style={inputStyle} />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-medium" style={{ color: 'var(--color-text-secondary)' }}>
              Description <span className="opacity-50">(optional)</span>
            </span>
            <input placeholder="e.g. Restaurants, groceries…" value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              maxLength={100} className="px-3 py-2.5 text-sm outline-none" style={inputStyle} />
          </label>
        </div>

        {/* Type */}
        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-medium" style={{ color: 'var(--color-text-secondary)' }}>Type</span>
          <select value={form.type} onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))}
            className="px-3 py-2.5 text-sm outline-none appearance-none" style={inputStyle}>
            <option value="expense">Expense</option>
            <option value="income">Income</option>
            <option value="both">Both</option>
            <option value="transfer">Transfer</option>
          </select>
          <div className="flex items-start gap-2 px-3 py-2.5 rounded-xl"
            style={{ background: form.type === 'transfer' ? 'rgba(107,107,138,0.12)' : 'rgba(255,255,255,0.03)',
                     border: `1px solid ${form.type === 'transfer' ? 'rgba(107,107,138,0.30)' : 'rgba(255,255,255,0.06)'}` }}>
            <span className="text-sm shrink-0 mt-0.5">{form.type === 'transfer' ? 'ℹ️' : '💡'}</span>
            <p className="text-xs leading-relaxed ml-2" style={{ color: 'var(--color-text-muted)' }}>{TYPE_TIPS[form.type]}</p>
          </div>
        </label>

        {/* Icon + Color */}
        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-medium" style={{ color: 'var(--color-text-secondary)' }}>Icon</span>
            <button ref={emojiTriggerRef} type="button"
              onClick={() => {
                if (!showEmojiPicker && emojiTriggerRef.current) {
                  const r = emojiTriggerRef.current.getBoundingClientRect();
                  const spaceBelow = window.innerHeight - r.bottom - 8;
                  setEmojiPos({ top: spaceBelow > 260 ? r.bottom + 4 : r.top - 264, left: r.left });
                }
                setShowEmojiPicker((v) => !v);
              }}
              className="w-full px-3 py-2.5 text-left flex items-center gap-3 text-sm" style={inputStyle}>
              <span className="text-xl">{form.icon}</span>
              <span style={{ color: 'var(--color-text-muted)' }}>Choose icon</span>
              <span className="ml-auto text-xs" style={{ color: 'var(--color-text-muted)' }}>▾</span>
            </button>
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-medium" style={{ color: 'var(--color-text-secondary)' }}>Color</span>
            <div className="flex flex-wrap items-center gap-2 px-3 py-2.5" style={inputStyle}>
              {PRESET_COLORS.map((c) => (
                <button key={c} type="button" onClick={() => setForm((f) => ({ ...f, color: c }))}
                  className="w-5 h-5 rounded-full transition-transform hover:scale-110 shrink-0"
                  style={{ background: c, outline: form.color === c ? `2px solid ${c}` : 'none', outlineOffset: '2px' }} />
              ))}
            </div>
          </label>
        </div>

        {/* Actions */}
        <div className="flex gap-2 justify-end pt-1">
          <button type="button" onClick={onClose}
            className="px-4 py-2 text-sm font-medium rounded-xl hover:bg-white/10"
            style={{ color: 'var(--color-text-secondary)', border: '1px solid rgba(255,255,255,0.08)' }}>
            Cancel
          </button>
          <button type="submit" disabled={saving}
            className="px-5 py-2 text-sm font-semibold text-white rounded-xl hover:brightness-110 disabled:opacity-60"
            style={{ background: 'var(--color-card-violet)' }}>
            {saving ? 'Saving…' : editing ? 'Save Changes' : 'Add Category'}
          </button>
        </div>
      </form>

      {/* Emoji picker */}
      {showEmojiPicker && emojiPos && (
        <div ref={emojiPickerRef} className="p-3 rounded-xl grid grid-cols-10 gap-1"
          style={{ position: 'fixed', top: emojiPos.top, left: emojiPos.left, width: 360, maxHeight: 340,
                   overflowY: 'auto', zIndex: 9999, background: 'rgba(25,25,40,0.97)',
                   backdropFilter: 'blur(24px)', WebkitBackdropFilter: 'blur(24px)',
                   border: '1px solid rgba(255,255,255,0.12)', boxShadow: '0 12px 40px rgba(0,0,0,0.6)' }}>
          {EMOJI_OPTIONS.map((em) => (
            <button key={em} type="button"
              onClick={() => { setForm((f) => ({ ...f, icon: em })); setShowEmojiPicker(false); }}
              className="w-8 h-8 rounded-lg text-lg flex items-center justify-center hover:bg-white/10"
              style={{ background: form.icon === em ? 'rgba(155,109,255,0.25)' : 'transparent' }}>
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
