'use client';

/* Animated figures on NumberFlow: digits roll to the new value instead of snapping, which
   is what makes a balance feel live when the user switches card, month or account.
   Honours the OS "reduce motion" preference on its own. Wrap several in <MoneyGroup> so
   they animate in step. Reusable anywhere `$${fmt(n)}` is rendered today. */

import NumberFlow, { NumberFlowGroup, type Format } from '@number-flow/react';

const USD: Format = { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 };
const USD_WHOLE: Format = { style: 'currency', currency: 'USD', maximumFractionDigits: 0 };
const PERCENT: Format = { style: 'percent', maximumFractionDigits: 0 };
const PLAIN: Format = { maximumFractionDigits: 2 };

interface MoneyProps {
  value: number | string;
  /** Drop the cents (stat tiles, big heroes). */
  whole?: boolean;
  /** Show the sign in front: +$12.00 / −$8.50. Default shows the absolute amount. */
  signed?: boolean;
  className?: string;
}

/* API numerics arrive as strings on some rows (Postgres `numeric`), so every figure is coerced. */
const num = (v: number | string | null | undefined) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };

export function Money({ value, whole = false, signed = false, className }: MoneyProps) {
  const n = num(value);
  return (
    <NumberFlow className={className} value={signed ? n : Math.abs(n)} format={whole ? USD_WHOLE : USD}
      locales="en-US" prefix={signed && n > 0 ? '+' : undefined} />
  );
}

/** `ratio` is 0–1 (0.14 → "14%"). */
export function Percent({ ratio, className }: { ratio: number; className?: string }) {
  return <NumberFlow className={className} value={num(ratio)} format={PERCENT} locales="en-US" />;
}

/** A bare number with an optional unit: `<Num value={24.99} suffix="%" />`. */
export function Num({ value, suffix, className }: { value: number; suffix?: string; className?: string }) {
  return <NumberFlow className={className} value={num(value)} format={PLAIN} locales="en-US" suffix={suffix} />;
}

export const MoneyGroup = NumberFlowGroup;
