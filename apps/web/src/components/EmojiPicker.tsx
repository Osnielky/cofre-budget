'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';

/** Grouped so the list can be scanned, and so search has something to match on. */
export const EMOJI_GROUPS: { label: string; emojis: string[] }[] = [
  { label: 'Food & drink', emojis: ['🍔','🍕','🍣','🌮','🍜','🥗','🥩','🍱','☕','🧃','🍺','🥤','🍷','🧋','🍦','🧁','🛒','🥦','🍎','🥑','🧀','🥐','🍳','🥘'] },
  { label: 'Transport', emojis: ['🚗','🚕','🏎️','🚙','🚐','🛻','🚌','🚎','✈️','🚂','🚲','🛵','⛽','🛺','🚁','🛳️','🚢','🚀','🛸','🛞','🅿️','🚦','🗺️'] },
  { label: 'Shopping & style', emojis: ['🛍️','👗','👟','👔','👜','💍','🕶️','🧣','🎁','🏷️','🧸'] },
  { label: 'Home & tools', emojis: ['🏠','🏡','🛋️','🪑','🛏️','🚿','🪣','🧹','🧺','🔧','🔨','🪛','🧰','💡','🔌','🖼️','🪞','🔑','🪴','📦','🗑️','📬'] },
  { label: 'Health', emojis: ['💊','🏥','🏃','🧘','🦷','❤️','🧠','🩺','🩹','🩻','🧬','💉','🏋️','🚴','🧗','⛷️','🫀','🫁','🧴','🧼','🪥','🌡️'] },
  { label: 'Fun', emojis: ['🎬','🎮','🎵','🎭','📚','🎨','🎲','🏆','🎯','🎸','🎹','🎺','🎻','🥁','🎤','🎧','🎪','🎠','🎡','🎢','🎟️','🃏','🐾'] },
  { label: 'Work & tech', emojis: ['💻','📱','⌨️','🖥️','📷','📹','💼','📊','📋','📌','🗓️','✏️','📝','🔍','📡','🤖','⌚','📺','📻','🔭','🎓','🔬','🧪','🧲','⚗️','📖','📓'] },
  { label: 'Money', emojis: ['💰','💳','💵','🪙','💎','📈','📉','🏦','🤑','💸'] },
  { label: 'Travel & nature', emojis: ['🏖️','🏕️','🧳','🏔️','🌋','🏝️','🗼','🗽','🏰','🌃','🌆','🌿','🌸','🌺','🌻','🍁','🍄','🌊','⛰️','🌈','☀️','🌙','⭐','❄️','🔥','💧','🌱','✨','⚡','🧧'] },
];

const ALL = EMOJI_GROUPS.flatMap((g) => g.emojis);

interface Props {
  value: string;
  onPick: (emoji: string) => void;
  /** Rect of the trigger, so the panel can be anchored to it. */
  anchor: DOMRect;
  onClose: () => void;
}

/**
 * Emoji picker for category icons.
 *
 * Sized from the viewport rather than fixed, and clamped inside it — the older
 * inline version was a 360px box of 32px cells that ran off screen when its
 * trigger sat low or far right.
 */
export default function EmojiPicker({ value, onPick, anchor, onClose }: Props) {
  const [query, setQuery] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      const t = e.target as HTMLElement;
      if (ref.current?.contains(t) || t.closest('[data-emoji-trigger]')) return;
      onClose();
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } };
    const onScroll = (e: Event) => {
      const t = e.target as Node;
      if (ref.current && (ref.current === t || ref.current.contains(t))) return;
      onClose();
    };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    window.addEventListener('resize', onClose);
    window.addEventListener('scroll', onScroll, true);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', onClose);
      window.removeEventListener('scroll', onScroll, true);
    };
  }, [onClose]);

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return EMOJI_GROUPS;
    const hits = EMOJI_GROUPS
      .map((g) => (g.label.toLowerCase().includes(q) ? g : { ...g, emojis: [] }))
      .filter((g) => g.emojis.length > 0);
    return hits.length ? hits : [];
  }, [query]);

  const pos = useMemo(() => {
    const MARGIN = 12, GAP = 8;
    const vw = window.innerWidth, vh = window.innerHeight;
    const width = Math.round(Math.min(420, vw - MARGIN * 2));
    const height = Math.round(Math.min(440, vh - MARGIN * 2));
    const below = vh - anchor.bottom - GAP - MARGIN;
    const above = anchor.top - GAP - MARGIN;
    const top = below >= Math.min(height, 300)
      ? anchor.bottom + GAP
      : above >= Math.min(height, 300)
        ? anchor.top - GAP - height
        : (vh - height) / 2;
    const left = Math.min(Math.max(MARGIN, anchor.left), vw - width - MARGIN);
    return {
      width, height,
      top: Math.round(Math.min(Math.max(MARGIN, top), Math.max(MARGIN, vh - height - MARGIN))),
      left: Math.round(left),
    };
  }, [anchor]);

  return createPortal(
    <div ref={ref} className="rounded-2xl flex flex-col cat-picker"
      style={{
        position: 'fixed', top: pos.top, left: pos.left, width: pos.width, maxHeight: pos.height,
        zIndex: 10000, background: 'var(--popover-bg)', border: 'var(--glass-border)',
        boxShadow: 'var(--glass-shadow)', overflow: 'hidden',
      }}>
      <div className="p-2.5" style={{ borderBottom: '1px solid var(--color-border)' }}>
        <input autoFocus value={query} onChange={(e) => setQuery(e.target.value)}
          placeholder="Search icons…" aria-label="Search icons"
          className="w-full px-3 py-2 text-sm rounded-xl outline-none"
          style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', color: 'var(--color-text-primary)' }} />
      </div>

      <div className="p-2.5 overflow-y-auto" style={{ overscrollBehavior: 'contain' }}>
        {groups.length === 0 ? (
          <p className="text-xs text-center py-6" style={{ color: 'var(--color-text-muted)' }}>
            No icon groups match “{query}”.
          </p>
        ) : groups.map((g) => (
          <div key={g.label} className="mb-2">
            <p className="text-[10px] font-bold uppercase tracking-widest px-1 pb-1.5"
              style={{ color: 'var(--color-text-muted)' }}>{g.label}</p>
            <div className="grid gap-1" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(44px, 1fr))' }}>
              {g.emojis.map((em) => (
                <button key={em} type="button" onClick={() => { onPick(em); onClose(); }}
                  aria-label={em}
                  className="h-11 rounded-xl flex items-center justify-center transition-colors hover:brightness-125"
                  style={{
                    fontSize: 22,
                    background: value === em ? 'color-mix(in srgb, var(--color-primary) 25%, transparent)' : 'var(--color-elevated)',
                    border: `1px solid ${value === em ? 'color-mix(in srgb, var(--color-primary) 50%, transparent)' : 'transparent'}`,
                  }}>
                  {em}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>,
    document.body,
  );
}

export { ALL as EMOJI_OPTIONS };
