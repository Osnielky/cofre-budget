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

/* Accent per card position, from the theme's card accents (not issuer colors). */
export const CARD_ACCENTS = [
  'var(--color-card-sky)',
  'var(--color-card-violet)',
  'var(--color-card-green)',
  'var(--color-card-orange)',
  'var(--color-card-amber)',
];
