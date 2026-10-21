import { describe, it, expect } from 'vitest';
import { netWorthMix } from './mix';
import type { NetWorthBreakdown } from '@/lib/dashboard/derive';

const item = (label: string, value: number, color = '#123456') => ({ label, value, color });

function breakdown(assetItems: NetWorthBreakdown['assetItems'], liabilityItems: NetWorthBreakdown['liabilityItems'] = []): NetWorthBreakdown {
  const assets = assetItems.reduce((s, i) => s + i.value, 0);
  const liabilities = liabilityItems.reduce((s, i) => s + i.value, 0);
  return { total: assets - liabilities, assets, liabilities, assetItems, liabilityItems, deltaPct: null, monthNet: 0 };
}

describe('netWorthMix', () => {
  it('lists asset accounts largest first with their share of all assets', () => {
    const mix = netWorthMix(breakdown([item('Checking', 2500), item('Brokerage', 6000), item('Cash', 1500)]));
    expect(mix.assets.map((s) => s.label)).toEqual(['Brokerage', 'Checking', 'Cash']);
    expect(mix.assets.map((s) => s.pct)).toEqual([60, 25, 15]);
    expect(mix.assetTotal).toBe(10000);
  });

  it('folds two or more slices under 3% into Other', () => {
    const mix = netWorthMix(breakdown([item('Brokerage', 9600), item('Cash', 150), item('Venmo', 100), item('Coins', 150)]));
    expect(mix.assets.map((s) => s.label)).toEqual(['Brokerage', 'Other']);
    const other = mix.assets[1];
    expect(other.id).toBe('other');
    expect(other.value).toBe(400);
    expect(other.pct).toBe(4);
    expect(other.members).toEqual(['Cash', 'Coins', 'Venmo']);
  });

  it('keeps a single small slice as itself', () => {
    const mix = netWorthMix(breakdown([item('Brokerage', 9800), item('Cash', 200)]));
    expect(mix.assets.map((s) => s.label)).toEqual(['Brokerage', 'Cash']);
  });

  it('counts an overdrawn asset account as something that subtracts', () => {
    const mix = netWorthMix(breakdown([item('Savings', 5000), item('Checking', -300)], [item('Visa', 700)]));
    expect(mix.assets.map((s) => s.label)).toEqual(['Savings']);
    expect(mix.liabilities.map((s) => [s.label, s.value])).toEqual([['Visa', 700], ['Checking', 300]]);
    expect(mix.liabilityTotal).toBe(1000);
    expect(mix.net).toBe(4000);
  });

  it('gives liabilities as a share of assets, or null without assets', () => {
    const mix = netWorthMix(breakdown([item('Savings', 8000)], [item('Car loan', 2000)]));
    expect(mix.liabilityShare).toBe(25);
    expect(mix.liabilities[0].pct).toBe(25);
    expect(netWorthMix(breakdown([], [item('Car loan', 2000)])).liabilityShare).toBeNull();
  });
});
