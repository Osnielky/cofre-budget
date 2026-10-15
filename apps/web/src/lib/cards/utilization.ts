import type { AprType, CardView } from './types';

export type UtilizationLevel = 'ok' | 'watch' | 'high';

/* Status colors, not chart series. */
export const LEVEL_COLOR: Record<UtilizationLevel, string> = {
  ok: 'var(--color-green)',
  watch: 'var(--color-amber)',
  high: 'var(--color-rose)',
};

export function utilization(balance: number, limit: number | null): number | null {
  if (!limit || limit <= 0) return null;
  return Math.abs(balance) / limit;
}

/* Cards without a known limit are left out of both sides. */
export function totalUtilization(cards: Pick<CardView, 'balance' | 'creditLimit'>[]): { balance: number; limit: number; ratio: number | null } {
  let balance = 0;
  let limit = 0;
  for (const c of cards) {
    if (!c.creditLimit || c.creditLimit <= 0) continue;
    balance += Math.abs(c.balance);
    limit += c.creditLimit;
  }
  return { balance, limit, ratio: limit > 0 ? balance / limit : null };
}

/* Under 30% is the usual guidance for credit scores. */
export function utilizationLevel(ratio: number): UtilizationLevel {
  if (ratio < 0.3) return 'ok';
  if (ratio < 0.5) return 'watch';
  return 'high';
}

export function aprOf(card: Pick<CardView, 'aprs'>, type: AprType): number | null {
  return card.aprs.find((a) => a.type === type)?.percentage ?? null;
}
