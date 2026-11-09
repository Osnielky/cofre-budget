/* The delta chip every StatTile shows: "↑ 12%" in green or rose, "↓ 1.2 pts",
   "+$120.00". Pure so the rounding and the colour rule are tested once instead of
   in nine strips. Rendering: components/StatTile.tsx. */

export type DeltaUnit = 'percent' | 'pts' | 'money';
export type DeltaTone = 'good' | 'bad' | 'flat';

export interface DeltaSpec {
  /** Percent change, points of change or a money amount; `null` = no comparison exists yet. */
  value: number | null;
  unit?: DeltaUnit;
  /** A drop is the good direction (spending, debt). */
  inverse?: boolean;
  /** Formats a `money` delta; defaults to a signed dollar amount with cents. */
  format?: (n: number) => string;
  /** Show "new" when there is no comparison and "— flat" when nothing changed, instead of hiding the chip. */
  placeholders?: boolean;
}

export interface DeltaChip { text: string; tone: DeltaTone }

const signedMoney = (n: number) =>
  `${n < 0 ? '−' : '+'}$${Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** Percent and points keep one decimal under 10 and none from 10 up: "↑ 3.4%", "↓ 12%". */
export function formatChange(abs: number): string {
  return abs >= 10 ? abs.toFixed(0) : abs.toFixed(1);
}

/** What the chip says and which colour it takes; `null` means no chip. */
export function describeDelta(d: DeltaSpec | null | undefined): DeltaChip | null {
  if (!d) return null;
  const unit = d.unit ?? 'percent';
  if (d.value == null || !Number.isFinite(d.value)) return d.placeholders ? { text: 'new', tone: 'flat' } : null;
  const flat = unit === 'money' ? d.value === 0 : Math.abs(d.value) < 0.5;
  if (flat) return d.placeholders ? { text: '— flat', tone: 'flat' } : null;
  const up = d.value > 0;
  const tone: DeltaTone = (d.inverse ? !up : up) ? 'good' : 'bad';
  if (unit === 'money') return { text: (d.format ?? signedMoney)(d.value), tone };
  const abs = formatChange(Math.abs(d.value));
  return { text: `${up ? '↑' : '↓'} ${abs}${unit === 'pts' ? ' pts' : '%'}`, tone };
}

export const DELTA_COLOR: Record<DeltaTone, string> = {
  good: 'var(--color-green)',
  bad: 'var(--color-rose)',
  flat: 'var(--color-text-muted)',
};

/** A progress bar's width: 0–100, never NaN. */
export function clampPct(pct: number): number {
  if (!Number.isFinite(pct)) return 0;
  return Math.min(100, Math.max(0, pct));
}
