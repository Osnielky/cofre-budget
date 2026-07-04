'use client';

import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3333/api';

export interface Category {
  id: string; name: string; icon: string; color: string;
  type: string; isDefault: boolean; description: string | null;
  isFixed?: boolean;
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
  expense:  { label: 'Expense',  color: 'var(--color-orange)' },
  income:   { label: 'Income',   color: 'var(--color-green)' },
  both:     { label: 'Both',     color: 'var(--color-primary)' },
  transfer: { label: 'Transfer', color: '#6B6B8A' },
};

const TYPE_TIPS: Record<string, string> = {
  expense:  'Used for money going out — groceries, rent, subscriptions, etc.',
  income:   'Used for money coming in — salary, freelance income, refunds, etc.',
  both:     'Can appear on both sides — useful for flexible categories like "Other".',
  transfer: 'Excluded from budget calculations and income/expense totals.',
};

const inputStyle: React.CSSProperties = {
  background: 'var(--color-elevated)',
  border: '1px solid var(--color-border)',
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
    isFixed: editing?.isFixed ?? false,
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
        className="w-full max-w-sm flex flex-col rounded-2xl overflow-hidden"
        style={{ background: 'var(--color-elevated)', border: 'var(--glass-border)', boxShadow: 'var(--glass-shadow)' }}>

        {/* Live preview header */}
        <div className="px-5 pt-5 pb-4 flex items-center justify-between gap-3"
          style={{ borderBottom: '1px solid var(--color-border)' }}>
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center text-xl shrink-0"
              style={{ background: `${form.color}22`, boxShadow: `0 0 0 1px ${form.color}44` }}>
              {form.icon}
            </div>
            <div className="min-w-0">
              <p className="font-bold text-sm truncate" style={{ color: form.name ? form.color : 'var(--color-text-muted)' }}>
                {form.name || 'Category name'}
              </p>
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md"
                style={{ background: `${typeMeta.color}20`, color: typeMeta.color }}>
                {typeMeta.label}
              </span>
            </div>
          </div>
          <button type="button" onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-[var(--color-elevated)] shrink-0"
            style={{ color: 'var(--color-text-muted)' }}>
            <CloseIcon />
          </button>
        </div>

        <div className="flex flex-col gap-4 px-5 py-4">

          {/* Type pill group */}
          <div className="flex flex-col gap-2">
            <span className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'var(--color-text-muted)' }}>Type</span>
            <div className="grid grid-cols-4 gap-1.5 p-1 rounded-xl" style={{ background: 'var(--color-elevated)', border: '1px solid var(--color-border)' }}>
              {Object.entries(TYPE_META).map(([val, meta]) => (
                <button key={val} type="button"
                  onClick={() => setForm((f) => ({ ...f, type: val }))}
                  className="py-1.5 rounded-lg text-xs font-semibold transition-all"
                  style={{
                    background: form.type === val ? `${meta.color}22` : 'transparent',
                    color: form.type === val ? meta.color : 'var(--color-text-muted)',
                    border: form.type === val ? `1px solid ${meta.color}44` : '1px solid transparent',
                  }}>
                  {meta.label}
                </button>
              ))}
            </div>
            <p className="text-[11px] px-0.5" style={{ color: 'var(--color-text-muted)' }}>{TYPE_TIPS[form.type]}</p>
          </div>

          {/* Name */}
          <div className="flex flex-col gap-1.5">
            <span className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'var(--color-text-muted)' }}>Name</span>
            <input required autoFocus placeholder="e.g. Groceries" value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              className="px-3 py-2.5 text-sm outline-none rounded-xl" style={inputStyle} />
          </div>

          {/* Icon + Color */}
          <div className="flex gap-3">
            <div className="flex flex-col gap-1.5 shrink-0">
              <span className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'var(--color-text-muted)' }}>Icon</span>
              <button ref={emojiTriggerRef} type="button"
                onClick={() => {
                  if (!showEmojiPicker && emojiTriggerRef.current) {
                    const r = emojiTriggerRef.current.getBoundingClientRect();
                    const spaceBelow = window.innerHeight - r.bottom - 8;
                    setEmojiPos({ top: spaceBelow > 260 ? r.bottom + 4 : r.top - 264, left: r.left });
                  }
                  setShowEmojiPicker((v) => !v);
                }}
                className="w-16 h-10 rounded-xl flex items-center justify-center gap-1.5 text-xl transition-colors hover:bg-[var(--color-elevated)]"
                style={inputStyle}>
                {form.icon}
                <svg width="8" height="8" viewBox="0 0 12 12" fill="none" style={{ opacity: 0.4, flexShrink: 0 }}>
                  <path d="M2 4l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </button>
            </div>
            <div className="flex flex-col gap-1.5 flex-1 min-w-0">
              <span className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'var(--color-text-muted)' }}>Color</span>
              <div className="flex flex-wrap items-center gap-2 px-3 h-10 rounded-xl" style={inputStyle}>
                {PRESET_COLORS.map((c) => (
                  <button key={c} type="button" onClick={() => setForm((f) => ({ ...f, color: c }))}
                    className="w-4 h-4 rounded-full transition-all hover:scale-110 shrink-0"
                    style={{ background: c, boxShadow: form.color === c ? `0 0 0 2px rgba(0,0,0,0.6), 0 0 0 4px ${c}` : 'none' }} />
                ))}
              </div>
            </div>
          </div>

          {/* Description */}
          <div className="flex flex-col gap-1.5">
            <span className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'var(--color-text-muted)' }}>
              Description <span style={{ opacity: 0.5, fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>(optional)</span>
            </span>
            <input placeholder="e.g. Restaurants, groceries…" value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              maxLength={100} className="px-3 py-2.5 text-sm outline-none rounded-xl" style={inputStyle} />
          </div>

          {(form.type === 'expense' || form.type === 'both') && (
            <label className="flex items-center justify-between gap-3 cursor-pointer">
              <div>
                <p className="text-sm font-medium">Fixed expense</p>
                <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                  Rent, insurance, loan payments — costs that don&apos;t change month to month.
                </p>
              </div>
              <input type="checkbox" checked={form.isFixed}
                onChange={(e) => setForm((f) => ({ ...f, isFixed: e.target.checked }))}
                className="w-4 h-4 accent-[var(--color-card-violet)]" />
            </label>
          )}

        </div>

        {/* Footer */}
        <div className="flex gap-2 justify-end px-5 py-4"
          style={{ borderTop: '1px solid var(--color-border)' }}>
          <button type="button" onClick={onClose}
            className="px-4 py-2 text-sm font-medium rounded-xl hover:bg-[var(--color-elevated)] transition-colors"
            style={{ color: 'var(--color-text-secondary)' }}>
            Cancel
          </button>
          <button type="submit" disabled={saving}
            className="px-5 py-2 text-sm font-semibold text-white rounded-xl hover:brightness-110 disabled:opacity-60 transition-all"
            style={{ background: typeMeta.color }}>
            {saving ? 'Saving…' : editing ? 'Save Changes' : 'Add Category'}
          </button>
        </div>
      </form>

      {/* Emoji picker */}
      {showEmojiPicker && emojiPos && (
        <div ref={emojiPickerRef} className="p-3 rounded-xl grid grid-cols-10 gap-1"
          style={{ position: 'fixed', top: emojiPos.top, left: emojiPos.left, width: 360, maxHeight: 340,
                   overflowY: 'auto', zIndex: 9999, background: 'var(--color-elevated)',
                   backdropFilter: 'var(--glass-blur)', WebkitBackdropFilter: 'var(--glass-blur)',
                   border: 'var(--glass-border)', boxShadow: 'var(--glass-shadow)' }}>
          {EMOJI_OPTIONS.map((em) => (
            <button key={em} type="button"
              onClick={() => { setForm((f) => ({ ...f, icon: em })); setShowEmojiPicker(false); }}
              className="w-8 h-8 rounded-lg text-lg flex items-center justify-center hover:bg-[var(--color-elevated)]"
              style={{ background: form.icon === em ? 'color-mix(in srgb, var(--color-primary) 25%, transparent)' : 'transparent' }}>
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
