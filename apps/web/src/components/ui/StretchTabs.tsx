'use client';

import { useRef, type ReactNode } from 'react';
import { useStretchIndicator } from './useStretchIndicator';

/* The app's one tab strip. A row of pills in an elevated frame; the active pill
   is a single highlight that stretches from tab to tab (useStretchIndicator)
   instead of each button painting its own background. Theme variables only.

   Replaces the inline strips that used to live on Transactions, Cards, Reports,
   Budgets, Projects and the chart range pickers. Form choices inside modals
   (Expense / Income, Amount / Percentage…) are not tabs and still render their
   own buttons. */

export type TabTone = 'primary' | 'amber' | 'rose' | 'violet' | 'green';

export type StretchTabItem<T extends string> = {
  id: T;
  label: ReactNode;
  /** Small count after the label; `null` hides it. */
  count?: number | string | null;
  icon?: ReactNode;
  /** Colour of the highlight and text while this tab is active. Default primary. */
  tone?: TabTone;
  /** Extra classes on the button, e.g. `sm:hidden` for a phone-only tab. */
  className?: string;
  title?: string;
  ariaLabel?: string;
};

type Props<T extends string> = {
  items: readonly StretchTabItem<T>[];
  value: T;
  onChange: (id: T) => void;
  /** `tablist` (default) for views, `radiogroup` for a setting, `group` for a chart range. */
  role?: 'tablist' | 'radiogroup' | 'group';
  ariaLabel?: string;
  size?: 'xs' | 'sm' | 'md';
  /** Draw the elevated frame around the row (default). `false` for a bare row inside another control. */
  frame?: boolean;
  /** Stretch (default) or slide both edges together. */
  stretch?: boolean;
  className?: string;
  /** Extra classes on every button. */
  itemClassName?: string;
};

const SIZES = {
  xs: 'px-2 py-1 text-fine rounded-md',
  sm: 'px-3 py-1.5 text-xs rounded-lg',
  md: 'px-3.5 py-2 text-[13px] rounded-lg',
} as const;
const TONE: Record<TabTone, string> = {
  primary: 'var(--color-primary)', amber: 'var(--color-amber)', rose: 'var(--color-rose)', violet: 'var(--color-violet)', green: 'var(--color-green)',
};

export function StretchTabs<T extends string>({
  items, value, onChange, role = 'tablist', ariaLabel, size = 'sm', frame = true, stretch = true, className = '', itemClassName = '',
}: Props<T>) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const indicatorRef = useStretchIndicator(wrapRef, value, { stretch });
  const active = items.find((i) => i.id === value);
  const tone = TONE[active?.tone ?? 'primary'];
  const itemRole = role === 'tablist' ? 'tab' : role === 'radiogroup' ? 'radio' : undefined;
  const pad = size === 'xs' ? 'p-0.5 rounded-lg' : 'p-1 rounded-xl';
  const radius = size === 'xs' ? 'rounded-md' : 'rounded-lg';

  return (
    <div role={role} aria-label={ariaLabel}
      className={`flex max-w-full overflow-x-auto [scrollbar-width:none] ${pad} ${className}`}
      style={frame ? { background: 'var(--color-elevated)', border: '1px solid var(--color-border)' } : undefined}>
      <div ref={wrapRef} className="relative flex gap-1 min-w-max">
        <span ref={indicatorRef} aria-hidden="true"
          className={`absolute top-0 bottom-0 pointer-events-none ${radius}`}
          style={{
            opacity: 0,
            background: `color-mix(in srgb, ${tone} 20%, transparent)`,
            boxShadow: `inset 0 0 0 1px color-mix(in srgb, ${tone} 40%, transparent)`,
            transition: 'background-color .25s ease, box-shadow .25s ease',
          }} />
        {items.map((it) => {
          const on = it.id === value;
          const itTone = TONE[it.tone ?? 'primary'];
          return (
            <button key={it.id} type="button" data-tab-key={it.id} role={itemRole}
              aria-selected={itemRole === 'tab' ? on : undefined}
              aria-checked={itemRole === 'radio' ? on : undefined}
              aria-pressed={itemRole == null ? on : undefined}
              aria-label={it.ariaLabel} title={it.title}
              onClick={() => onChange(it.id)}
              className={`relative z-[1] flex items-center gap-1.5 font-semibold whitespace-nowrap shrink-0 cursor-pointer ${SIZES[size]} ${it.className ?? ''} ${itemClassName}`}
              style={{
                color: on ? itTone : it.tone && it.tone !== 'primary' ? itTone : 'var(--color-text-secondary)',
                border: '1px solid transparent',
                transition: 'color .22s ease',
              }}>
              {it.icon}
              {it.label}
              {it.count != null && <span className="opacity-50 tabular-nums">{it.count}</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default StretchTabs;
