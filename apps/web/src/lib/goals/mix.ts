import type { NetWorthBreakdown, NetWorthItem } from '@/lib/dashboard/derive';

export interface MixSlice {
  id: string;
  label: string;
  value: number;
  /** Share of all assets, in percent (one decimal). Liabilities are also measured against assets. */
  pct: number;
  color: string;
  /** Labels folded into an "Other" slice. */
  members?: string[];
}

export interface NetWorthMix {
  /** What adds up, largest first. */
  assets: MixSlice[];
  /** What subtracts, largest first (includes overdrawn asset accounts). */
  liabilities: MixSlice[];
  assetTotal: number;
  liabilityTotal: number;
  net: number;
  /** Liabilities as a percentage of assets; null when there are no assets. */
  liabilityShare: number | null;
}

const OTHER_BELOW_PCT = 3;
const r2 = (n: number) => +n.toFixed(2);
const pctOf = (value: number, total: number) => (total > 0 ? +((value / total) * 100).toFixed(1) : 0);

function slicesOf(items: NetWorthItem[], total: number, prefix: string): MixSlice[] {
  return [...items]
    .sort((a, b) => b.value - a.value || a.label.localeCompare(b.label))
    .map((i, n) => ({ id: `${prefix}-${n}`, label: i.label, value: r2(i.value), pct: pctOf(i.value, total), color: i.color }));
}

/**
 * Turns the dashboard's net-worth breakdown into donut-ready slices: assets
 * largest first with their share of all assets, small slices folded into
 * "Other", and everything that subtracts (liability accounts, debts owed,
 * overdrawn asset accounts) listed against the asset total.
 */
export function netWorthMix(b: NetWorthBreakdown): NetWorthMix {
  const positive = b.assetItems.filter((i) => i.value > 0);
  const overdrawn = b.assetItems.filter((i) => i.value < 0).map((i) => ({ ...i, value: Math.abs(i.value) }));
  const assetTotal = r2(positive.reduce((s, i) => s + i.value, 0));
  const liabilityTotal = r2([...b.liabilityItems, ...overdrawn].reduce((s, i) => s + i.value, 0));

  let assets = slicesOf(positive, assetTotal, 'asset');
  const small = assets.filter((s) => s.pct < OTHER_BELOW_PCT);
  if (small.length >= 2) {
    const value = r2(small.reduce((s, i) => s + i.value, 0));
    assets = [
      ...assets.filter((s) => s.pct >= OTHER_BELOW_PCT),
      { id: 'other', label: 'Other', value, pct: pctOf(value, assetTotal), color: '#6B6B8A', members: small.map((s) => s.label).sort() },
    ];
  }

  return {
    assets,
    liabilities: slicesOf([...b.liabilityItems, ...overdrawn], assetTotal, 'liability'),
    assetTotal,
    liabilityTotal,
    net: r2(assetTotal - liabilityTotal),
    liabilityShare: assetTotal > 0 ? pctOf(liabilityTotal, assetTotal) : null,
  };
}
