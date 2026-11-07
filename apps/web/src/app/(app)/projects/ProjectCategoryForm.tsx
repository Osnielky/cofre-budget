'use client';

import { useCallback, useRef, useState } from 'react';
import EmojiPicker from '@/components/EmojiPicker';
import { quickPickIcons } from '@/lib/projects/category-icons';

export interface ProjectCategoryValues { name: string; icon: string; color: string }

interface Props {
  projectType: string;
  /** Swatches offered for the category colour; the first violet-ish one is the default. */
  colors: string[];
  saving: boolean;
  onSubmit: (values: ProjectCategoryValues) => void;
  onCancel: () => void;
}

const fieldStyle: React.CSSProperties = {
  background: 'color-mix(in srgb, var(--color-text-primary) 8%, transparent)',
  border: '1px solid color-mix(in srgb, var(--color-text-primary) 14%, transparent)',
  borderRadius: '10px',
  color: 'var(--color-text-primary)',
};

function Label({ children }: { children: React.ReactNode }) {
  return (
    <span className="block text-[10px] font-bold uppercase tracking-widest mb-1.5" style={{ color: 'var(--color-text-muted)' }}>
      {children}
    </span>
  );
}

/** Add-a-category panel for a project's expense breakdown, with a live preview of the tile it creates. */
export default function ProjectCategoryForm({ projectType, colors, saving, onSubmit, onCancel }: Props) {
  const quickPicks = quickPickIcons(projectType);
  const [name, setName] = useState('');
  const [icon, setIcon] = useState(quickPicks[0]);
  const [color, setColor] = useState(colors[1] ?? colors[0]);
  const [pickerAnchor, setPickerAnchor] = useState<DOMRect | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const trimmed = name.trim();
  const canSubmit = trimmed.length > 0 && !saving;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (canSubmit) onSubmit({ name: trimmed, icon, color });
  }

  // Stable, so the picker doesn't re-bind its outside-click listeners on every keystroke.
  const closePicker = useCallback(() => setPickerAnchor(null), []);

  function togglePicker() {
    setPickerAnchor((open) => (open ? null : triggerRef.current?.getBoundingClientRect() ?? null));
  }

  return (
    <form onSubmit={submit}
      // The picker handles its own Escape; otherwise Escape abandons the form.
      onKeyDown={(e) => { if (e.key === 'Escape' && !pickerAnchor) { e.preventDefault(); onCancel(); } }}
      className="flex flex-col gap-4 p-3 sm:p-4 rounded-xl"
      style={{ background: 'color-mix(in srgb, var(--color-text-primary) 5%, transparent)', border: '1px solid color-mix(in srgb, var(--color-text-primary) 10%, transparent)' }}>

      <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] sm:items-end">
        {/* Same markup as the category tiles below, so this is exactly what gets added. */}
        <div>
          <Label>Preview</Label>
          <div className="flex items-center gap-2.5 p-2.5 rounded-xl" aria-live="polite"
            style={{ background: `${color}10`, border: `1px solid ${color}25` }}>
            <span className="text-lg shrink-0" aria-hidden="true">{icon}</span>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold truncate" style={{ color }}>{trimmed || 'New category'}</p>
              <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>No transactions</p>
            </div>
          </div>
        </div>

        <div>
          <label htmlFor="project-category-name"><Label>Name</Label></label>
          <input id="project-category-name" autoFocus value={name} onChange={(e) => setName(e.target.value)}
            maxLength={40} placeholder="e.g. Oil changes"
            className="w-full px-3 py-2.5 text-sm outline-none" style={fieldStyle} />
        </div>
      </div>

      <div>
        <Label>Icon</Label>
        <div className="flex flex-wrap items-center gap-1.5">
          <button ref={triggerRef} type="button" data-emoji-trigger onClick={togglePicker}
            aria-label="Choose from all icons" aria-expanded={!!pickerAnchor}
            className="h-10 pl-2 pr-3 flex items-center gap-1.5 rounded-xl text-xs font-semibold cursor-pointer hover:brightness-125"
            style={{ ...fieldStyle, borderColor: `${color}66` }}>
            <span className="text-xl leading-none" aria-hidden="true">{icon}</span>
            More…
          </button>
          {quickPicks.map((em) => {
            const selected = em === icon;
            return (
              <button key={em} type="button" onClick={() => setIcon(em)}
                aria-label={`Use ${em}`} aria-pressed={selected}
                className="w-10 h-10 rounded-xl flex items-center justify-center text-xl cursor-pointer transition-colors hover:brightness-125"
                style={{
                  background: selected ? `${color}26` : 'var(--color-elevated)',
                  border: `1.5px solid ${selected ? color : 'transparent'}`,
                }}>
                {em}
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <Label>Color</Label>
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Category color">
          {colors.map((c) => {
            const selected = c === color;
            return (
              <button key={c} type="button" role="radio" aria-checked={selected} aria-label={c}
                onClick={() => setColor(c)}
                className="w-7 h-7 rounded-full flex items-center justify-center cursor-pointer transition-transform hover:scale-110"
                style={{ background: c, outline: selected ? `2px solid ${c}` : 'none', outlineOffset: '2px' }}>
                {selected && (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="m5 12.5 4.5 4.5L19 7.5" />
                  </svg>
                )}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex justify-end gap-2">
        <button type="button" onClick={onCancel}
          className="px-3.5 py-2 text-xs font-semibold rounded-lg cursor-pointer hover:brightness-125"
          style={{ color: 'var(--color-text-secondary)', border: '1px solid color-mix(in srgb, var(--color-text-primary) 12%, transparent)' }}>
          Cancel
        </button>
        <button type="submit" disabled={!canSubmit}
          className="px-3.5 py-2 text-xs font-semibold rounded-lg cursor-pointer hover:brightness-110 disabled:opacity-40 disabled:cursor-not-allowed"
          style={{ background: 'var(--color-card-violet)', color: 'white' }}>
          {saving ? 'Adding…' : 'Add category'}
        </button>
      </div>

      {pickerAnchor && (
        <EmojiPicker value={icon} anchor={pickerAnchor} onPick={setIcon} onClose={closePicker} />
      )}
    </form>
  );
}
