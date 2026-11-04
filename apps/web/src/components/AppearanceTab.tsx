'use client';

import { useRef, type KeyboardEvent } from 'react';
import { THEMES, stepTheme, type Theme } from '@/lib/theme';
import { useTheme } from '@/components/ThemeProvider';

/**
 * Settings → Appearance. A centred radio group of theme cards, each with a
 * miniature of the app painted in that theme's colours so the choice is
 * visible before it is made. Phones get a stacked list (preview · text · check),
 * wider screens a 2 / 4-up grid. Arrow keys move and select like native radios.
 */
export default function AppearanceTab() {
  const { theme: active, setTheme } = useTheme();
  const refs = useRef<Record<string, HTMLButtonElement | null>>({});
  const current = THEMES.find((t) => t.id === active) ?? THEMES[0];

  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    const delta =
      e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 :
      e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
    if (!delta) return;
    e.preventDefault();
    const next = stepTheme(THEMES.map((t) => t.id), active, delta);
    setTheme(next);
    refs.current[next]?.focus();
  };

  return (
    <section className="mx-auto w-full max-w-5xl flex flex-col gap-6 sm:gap-8 sm:py-4">
      <header className="text-center flex flex-col items-center gap-2">
        <span className="text-[11px] font-bold uppercase tracking-[0.18em]" style={{ color: 'var(--color-primary)' }}>
          Appearance
        </span>
        <h2 className="text-xl sm:text-2xl font-bold leading-tight" style={{ color: 'var(--color-text-primary)' }}>
          Pick a look for Cofre
        </h2>
        <p className="text-sm max-w-md" style={{ color: 'var(--color-text-muted)' }}>
          It applies instantly across every page and is remembered on this device.
        </p>
      </header>

      <div role="radiogroup" aria-label="Theme" className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3 sm:gap-4">
        {THEMES.map((t) => (
          <ThemeCard
            key={t.id}
            theme={t}
            selected={t.id === active}
            onSelect={() => setTheme(t.id)}
            onKeyDown={onKeyDown}
            buttonRef={(el) => { refs.current[t.id] = el; }}
          />
        ))}
      </div>

      <p className="text-center text-xs flex items-center justify-center gap-2" style={{ color: 'var(--color-text-muted)' }} aria-live="polite">
        <span aria-hidden="true" className="w-2 h-2 rounded-full" style={{ background: current.preview.accent }} />
        <span>
          Using <strong style={{ color: 'var(--color-text-secondary)' }}>{current.name}</strong> · {current.dark ? 'Dark' : 'Light'} theme
        </span>
      </p>
    </section>
  );
}

function ThemeCard({ theme: t, selected, onSelect, onKeyDown, buttonRef }: {
  theme: Theme;
  selected: boolean;
  onSelect: () => void;
  onKeyDown: (e: KeyboardEvent<HTMLButtonElement>) => void;
  buttonRef: (el: HTMLButtonElement | null) => void;
}) {
  return (
    <button
      ref={buttonRef}
      type="button"
      role="radio"
      aria-checked={selected}
      tabIndex={selected ? 0 : -1}
      onClick={onSelect}
      onKeyDown={onKeyDown}
      className="group relative text-left rounded-2xl p-3 sm:p-3.5 flex flex-row sm:flex-col items-center sm:items-stretch gap-3.5 sm:gap-3 outline-none focus-visible:ring-2 motion-safe:transition-[transform,box-shadow,border-color] motion-safe:duration-200 motion-safe:hover:-translate-y-0.5"
      style={{
        background: 'var(--color-surface)',
        border: selected ? '2px solid var(--color-primary)' : '2px solid transparent',
        outline: selected ? 'none' : '1px solid var(--color-border)',
        outlineOffset: -2,
        boxShadow: selected
          ? '0 0 0 4px color-mix(in srgb, var(--color-primary) 18%, transparent), var(--glass-shadow)'
          : 'var(--glass-shadow)',
      }}>
      <MiniApp theme={t} />

      <div className="flex-1 min-w-0 flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <p className="text-sm font-bold leading-tight truncate" style={{ color: 'var(--color-text-primary)' }}>{t.name}</p>
          <span className="text-[10px] font-semibold px-1.5 py-px rounded-full shrink-0"
            style={{ background: 'color-mix(in srgb, var(--color-text-muted) 14%, transparent)', color: 'var(--color-text-muted)' }}>
            {t.dark ? 'Dark' : 'Light'}
          </span>
        </div>
        <p className="text-xs leading-snug" style={{ color: 'var(--color-text-muted)' }}>{t.description}</p>
      </div>

      <Check selected={selected} />
    </button>
  );
}

/* Selected: filled check. Unselected: hollow ring that brightens on hover. */
function Check({ selected }: { selected: boolean }) {
  return (
    <span aria-hidden="true"
      className="shrink-0 sm:absolute sm:top-3 sm:right-3 w-6 h-6 rounded-full flex items-center justify-center motion-safe:transition-colors"
      style={selected
        ? { background: 'var(--color-primary)', color: 'var(--btn-primary-text, #fff)', boxShadow: '0 2px 8px color-mix(in srgb, var(--color-primary) 50%, transparent)' }
        : { border: '2px solid var(--color-border)', background: 'color-mix(in srgb, var(--color-surface) 70%, transparent)' }}>
      {selected && (
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M5 12l5 5L19 7" />
        </svg>
      )}
    </span>
  );
}

/**
 * A tiny Cofre painted in the theme's preview colours: sidebar rail, a stat
 * card with a headline figure, and a bar chart. Purely decorative.
 */
function MiniApp({ theme: t }: { theme: Theme }) {
  const p = t.preview;
  const bars = [0.45, 0.7, 0.55, 0.9, 0.65, 0.8];
  return (
    <div aria-hidden="true"
      className="relative shrink-0 w-24 h-16 sm:w-full sm:h-auto sm:aspect-[16/10] rounded-xl overflow-hidden flex"
      style={{ background: p.bg, border: `1px solid ${p.border}` }}>
      {/* Sidebar rail */}
      <div className="w-[17%] h-full flex flex-col items-center gap-[7%] pt-[8%]"
        style={{ background: p.surface, borderRight: `1px solid ${p.border}` }}>
        <span className="w-[42%] aspect-square rounded-[30%]" style={{ background: p.accent }} />
        <span className="w-[42%] aspect-square rounded-[30%]" style={{ background: p.textDim, opacity: 0.35 }} />
        <span className="w-[42%] aspect-square rounded-[30%]" style={{ background: p.textDim, opacity: 0.35 }} />
        <span className="w-[42%] aspect-square rounded-[30%]" style={{ background: p.textDim, opacity: 0.35 }} />
      </div>

      <div className="flex-1 flex flex-col gap-[6%] p-[6%]">
        {/* Stat card */}
        <div className="rounded-[10%] px-[8%] py-[5%] flex flex-col gap-[6%]"
          style={{ background: p.surface, border: `1px solid ${p.border}` }}>
          <span className="h-[3px] w-[35%] rounded-full" style={{ background: p.textDim, opacity: 0.6 }} />
          <span className="h-[5px] w-[60%] rounded-full" style={{ background: p.text }} />
        </div>
        {/* Bar chart */}
        <div className="flex-1 flex items-end gap-[5%] px-[4%] pb-[2%]">
          {bars.map((h, i) => (
            <span key={i} className="flex-1 rounded-t-[2px]"
              style={{ height: `${h * 100}%`, background: i % 3 === 2 ? p.accent2 : p.accent, opacity: i % 3 === 1 ? 0.55 : 1 }} />
          ))}
        </div>
        {/* Primary button */}
        <span className="self-end h-[9%] w-[34%] rounded-full" style={{ background: p.accent }} />
      </div>
    </div>
  );
}
