'use client';

import { useState } from 'react';

type Tier = 'free' | 'pro' | 'elite';
type Interval = 'month' | 'year';

const PRICES: Record<'pro' | 'elite', { month: number; year: number }> = {
  pro: { month: 4.99, year: 47.9 },
  elite: { month: 7.99, year: 76.7 },
};

const FEATURES: { label: string; free: boolean; pro: boolean; elite: boolean }[] = [
  { label: 'Manual accounts & CSV import', free: true, pro: true, elite: true },
  { label: 'Budgets, debts/loans, goals, net worth', free: true, pro: true, elite: true },
  { label: 'Automatic bank sync (Plaid)', free: false, pro: true, elite: true },
  { label: 'Up to 4 linked institutions', free: false, pro: true, elite: true },
  { label: 'Unlimited linked institutions', free: false, pro: false, elite: true },
];

const glass: React.CSSProperties = {
  background: 'var(--color-surface)',
  backdropFilter: 'var(--glass-blur)',
  WebkitBackdropFilter: 'var(--glass-blur)',
  border: 'var(--glass-border)',
  boxShadow: 'var(--glass-shadow)',
};

export default function PricingCards({
  onSelectFree,
  onSelectPaid,
  currentTier,
}: {
  onSelectFree: () => void;
  onSelectPaid: (tier: 'pro' | 'elite', interval: Interval) => void;
  currentTier?: Tier;
}) {
  const [interval, setInterval] = useState<Interval>('month');

  return (
    <div>
      <div className="flex justify-center mb-8">
        <div className="inline-flex rounded-full p-1" style={glass}>
          {(['month', 'year'] as Interval[]).map((i) => (
            <button
              key={i}
              onClick={() => setInterval(i)}
              className="px-4 py-1.5 rounded-full text-sm font-semibold transition-colors"
              style={interval === i
                ? { background: 'var(--color-primary)', color: '#fff' }
                : { color: 'var(--color-text-muted)' }}
            >
              {i === 'month' ? 'Monthly' : 'Yearly — save 20%'}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="rounded-2xl p-6" style={glass}>
          <h3 className="text-lg font-bold" style={{ color: 'var(--color-text-primary)' }}>Free</h3>
          <p className="text-3xl font-bold mt-2" style={{ color: 'var(--color-text-primary)' }}>$0</p>
          <button
            onClick={onSelectFree}
            disabled={currentTier === 'free'}
            className="btn-gold w-full mt-6 py-2 rounded-full font-semibold disabled:opacity-50"
          >
            {currentTier === 'free' ? 'Current plan' : 'Get started'}
          </button>
        </div>

        {(['pro', 'elite'] as const).map((tier) => (
          <div key={tier} className="rounded-2xl p-6" style={glass}>
            <h3 className="text-lg font-bold capitalize" style={{ color: 'var(--color-text-primary)' }}>{tier}</h3>
            <p className="text-3xl font-bold mt-2" style={{ color: 'var(--color-text-primary)' }}>
              ${PRICES[tier][interval].toFixed(2)}
              <span className="text-sm font-normal" style={{ color: 'var(--color-text-muted)' }}>
                /{interval === 'month' ? 'mo' : 'yr'}
              </span>
            </p>
            <button
              onClick={() => onSelectPaid(tier, interval)}
              disabled={currentTier === tier}
              className="btn-gold w-full mt-6 py-2 rounded-full font-semibold disabled:opacity-50"
            >
              {currentTier === tier ? 'Current plan' : 'Start 7-day free trial'}
            </button>
          </div>
        ))}
      </div>

      <div className="mt-10 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr style={{ color: 'var(--color-text-muted)' }}>
              <th className="text-left py-2">Feature</th>
              <th className="py-2">Free</th>
              <th className="py-2">Pro</th>
              <th className="py-2">Elite</th>
            </tr>
          </thead>
          <tbody>
            {FEATURES.map((f) => (
              <tr key={f.label} style={{ borderTop: '1px solid var(--color-border)' }}>
                <td className="py-2" style={{ color: 'var(--color-text-primary)' }}>{f.label}</td>
                <td className="text-center py-2">{f.free ? '✓' : '—'}</td>
                <td className="text-center py-2">{f.pro ? '✓' : '—'}</td>
                <td className="text-center py-2">{f.elite ? '✓' : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
