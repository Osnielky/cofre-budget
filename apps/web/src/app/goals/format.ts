import { fmt } from '@/components/dashboard/chartTheme';

/** Signed currency: -$500.00 (not $-500.00). */
export const money = (n: number) => `${n < 0 ? '-' : ''}$${fmt(Math.abs(n))}`;

export function fmtDate(iso: string) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

/** Compact date for stat chips: "Jun 2040". */
export function fmtDateShort(iso: string) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
}

/** Compact milestone label: 250000 -> "$250K", 1000000 -> "$1M". */
export function milestoneLabel(n: number) {
  if (n >= 1_000_000) return `$${+(n / 1_000_000).toFixed(1)}M`;
  return `$${Math.round(n / 1000)}K`;
}
