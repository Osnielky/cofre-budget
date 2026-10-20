import type React from 'react';

/** Page-level glass card (hero card, trust, FAQ, pricing band). */
export const glassCard: React.CSSProperties = {
  background: 'var(--color-surface)',
  backdropFilter: 'var(--glass-blur)',
  WebkitBackdropFilter: 'var(--glass-blur)',
  border: 'var(--glass-border)',
  boxShadow: 'var(--glass-shadow)',
};

export const tint = (color: string, pct: number) => `color-mix(in srgb, ${color} ${pct}%, transparent)`;

/** Shared width + gutters for every landing section. */
export const container = 'max-w-6xl mx-auto px-4 sm:px-6';

/** Secondary button: quiet, bordered, same height as the primary pill. */
export const quietButton: React.CSSProperties = {
  border: '1px solid var(--color-border)',
  color: 'var(--color-text-primary)',
  background: 'var(--color-elevated)',
};
