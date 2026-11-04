import type { CSSProperties } from 'react';

/* Glass panel used by every section on /cards — theme variables only. */
export const PANEL: CSSProperties = {
  background: 'var(--color-surface)',
  border: 'var(--glass-border)',
  backdropFilter: 'var(--glass-blur)',
  WebkitBackdropFilter: 'var(--glass-blur)',
  boxShadow: 'var(--glass-shadow)',
};

export const MUTED: CSSProperties = { color: 'var(--color-text-muted)' };
