'use client';

/* App-wide sheet on Vaul: a bottom sheet the user drags to dismiss on phones, a side panel
   from `md` (or force one with `side`). Theme variables only. Use it for anything that was
   a hand-made drawer or bottom sheet: edit forms, filters, pickers. */

import { type ReactNode } from 'react';
import { Drawer } from 'vaul';
import { useNarrowScreen } from '@/hooks/useNarrowScreen';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  /** One sentence read by screen readers under the title; shown when `showDescription`. */
  description?: string;
  showDescription?: boolean;
  side?: 'auto' | 'bottom' | 'right';
  children: ReactNode;
  /** Extra classes on the panel (width on the side variant, padding…). */
  className?: string;
}

export default function Sheet({ open, onOpenChange, title, description, showDescription = false, side = 'auto', children, className }: Props) {
  const narrow = useNarrowScreen();
  const direction = side === 'auto' ? (narrow ? 'bottom' : 'right') : side;
  const bottom = direction === 'bottom';
  return (
    <Drawer.Root open={open} onOpenChange={onOpenChange} direction={direction} shouldScaleBackground={false} repositionInputs={false}>
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 z-50" style={{ background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(2px)' }} />
        <Drawer.Content
          className={`fixed z-50 flex flex-col outline-none ${bottom
            ? 'inset-x-0 bottom-0 max-h-[92dvh] rounded-t-3xl'
            : 'inset-y-0 right-0 w-full max-w-md'} ${className ?? ''}`}
          style={{ background: 'var(--popover-bg)', borderLeft: bottom ? undefined : '1px solid var(--color-border)',
            borderTop: bottom ? '1px solid var(--color-border)' : undefined, boxShadow: 'var(--glass-shadow)' }}>
          {bottom && (
            <Drawer.Handle className="mt-3 mb-1 !w-12 !h-1.5 !rounded-full" style={{ background: 'var(--color-border)' }} />
          )}
          <div className="flex items-center justify-between gap-3 px-5 pt-4 pb-2">
            <Drawer.Title className="font-bold text-lg truncate">{title}</Drawer.Title>
            <Drawer.Close aria-label="Close" className="p-2 -mr-2 rounded-lg hover:bg-[var(--color-elevated)]">✕</Drawer.Close>
          </div>
          <Drawer.Description className={showDescription ? 'px-5 pb-2 text-xs' : 'sr-only'} style={{ color: 'var(--color-text-muted)' }}>
            {description ?? title}
          </Drawer.Description>
          <div className="flex-1 overflow-y-auto px-5 pb-5">{children}</div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
