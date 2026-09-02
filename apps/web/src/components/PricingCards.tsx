'use client';

import { useState } from 'react';

type Tier = 'free' | 'pro' | 'elite';
type Interval = 'month' | 'year';

const PRICES: Record<'pro' | 'elite', { month: number; year: number }> = {
  pro: { month: 4.99, year: 47.9 },
  elite: { month: 7.99, year: 76.7 },
};

type FeatureValue = boolean | string;

const FEATURES: { label: string; free: FeatureValue; pro: FeatureValue; elite: FeatureValue }[] = [
  { label: 'Manual accounts & CSV import', free: true, pro: true, elite: true },
  { label: 'Budgets & spending tracking', free: true, pro: true, elite: true },
  { label: 'Debts & loans tracking', free: true, pro: true, elite: true },
  { label: 'Savings goals & net-worth trajectory', free: true, pro: true, elite: true },
  { label: 'Receipt scanning via Gmail', free: true, pro: true, elite: true },
  { label: 'Automatic bank sync (Plaid)', free: false, pro: true, elite: true },
  { label: 'Linked institutions', free: '—', pro: 'Up to 4', elite: 'Unlimited' },
];

const glass: React.CSSProperties = {
  background: 'var(--color-surface)',
  backdropFilter: 'var(--glass-blur)',
  WebkitBackdropFilter: 'var(--glass-blur)',
  border: 'var(--glass-border)',
  boxShadow: 'var(--glass-shadow)',
};

function money(n: number): string {
  return n.toFixed(2);
}

function FeatureRow({ value, label, isLast }: { value: FeatureValue; label: string; isLast: boolean }) {
  return (
    <div
      className="flex items-center justify-between gap-3 py-2.5 text-sm"
      style={{ borderBottom: isLast ? 'none' : '1px solid var(--color-border)' }}
    >
      <span className="flex items-center gap-2" style={{ color: 'var(--color-text-primary)' }}>
        {value === false ? (
          <span aria-hidden style={{ color: 'var(--color-text-muted)' }}>✕</span>
        ) : (
          <span aria-hidden style={{ color: 'var(--color-green)' }}>✓</span>
        )}
        {label}
      </span>
      {typeof value === 'string' && (
        <span className="font-semibold shrink-0" style={{ color: 'var(--color-text-secondary)' }}>{value}</span>
      )}
    </div>
  );
}

function Card({
  name,
  priceMonth,
  priceYear,
  interval,
  isCurrent,
  onSelect,
  ctaLabel,
  featureKey,
}: {
  name: string;
  priceMonth: number;
  priceYear: number;
  interval: Interval;
  isCurrent: boolean;
  onSelect: () => void;
  ctaLabel: string;
  featureKey: 'free' | 'pro' | 'elite';
}) {
  const price = interval === 'month' ? priceMonth : priceYear / 12;
  const yearlySavings = priceMonth * 12 - priceYear;

  return (
    <div
      className="rounded-2xl p-6 flex flex-col"
      style={{
        ...glass,
        border: isCurrent ? '2px solid var(--color-primary)' : glass.border,
      }}
    >
      <h3 className="text-lg font-bold" style={{ color: 'var(--color-text-primary)' }}>{name}</h3>
      <p className="mt-3">
        <span className="text-3xl font-bold" style={{ color: 'var(--color-text-primary)' }}>${money(price)}</span>
        <span className="text-sm font-normal" style={{ color: 'var(--color-text-muted)' }}>/mo</span>
      </p>
      {priceMonth > 0 && (
        <p className="text-xs mt-1" style={{ color: 'var(--color-text-muted)' }}>
          {interval === 'year'
            ? `billed annually · save $${money(yearlySavings)} a year`
            : 'billed monthly'}
        </p>
      )}

      {isCurrent ? (
        <span
          className="w-full mt-6 py-2 rounded-full font-semibold text-center text-sm"
          style={{ background: 'color-mix(in srgb, var(--color-primary) 16%, transparent)', color: 'var(--color-primary)' }}
        >
          Your current plan
        </span>
      ) : (
        <button onClick={onSelect} className="btn-gold w-full mt-6 py-2 rounded-full font-semibold">
          {ctaLabel}
        </button>
      )}

      <div className="mt-6 flex flex-col">
        {FEATURES.map((f, i) => (
          <FeatureRow key={f.label} label={f.label} value={f[featureKey]} isLast={i === FEATURES.length - 1} />
        ))}
      </div>
    </div>
  );
}

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
      <div className="flex items-center justify-center gap-6 mb-10">
        {(['month', 'year'] as Interval[]).map((i) => (
          <label key={i} className="flex items-center gap-2 cursor-pointer select-none">
            <span
              className="w-4 h-4 rounded-full flex items-center justify-center shrink-0"
              style={{ border: `2px solid ${interval === i ? 'var(--color-primary)' : 'var(--color-border)'}` }}
            >
              {interval === i && <span className="w-2 h-2 rounded-full" style={{ background: 'var(--color-primary)' }} />}
            </span>
            <input
              type="radio"
              name="billing-interval"
              className="sr-only"
              checked={interval === i}
              onChange={() => setInterval(i)}
            />
            <span className="text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>
              {i === 'month' ? 'Monthly' : 'Annually'}
            </span>
          </label>
        ))}
        <span
          className="text-xs font-bold px-2.5 py-1 rounded-full"
          style={{ background: 'var(--color-elevated)', color: 'var(--color-text-secondary)', border: '1px solid var(--color-border)' }}
        >
          Save 20%
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card
          name="Free"
          priceMonth={0}
          priceYear={0}
          interval={interval}
          isCurrent={currentTier === 'free'}
          onSelect={onSelectFree}
          ctaLabel="Get started"
          featureKey="free"
        />
        <Card
          name="Pro"
          priceMonth={PRICES.pro.month}
          priceYear={PRICES.pro.year}
          interval={interval}
          isCurrent={currentTier === 'pro'}
          onSelect={() => onSelectPaid('pro', interval)}
          ctaLabel="Start 15-day free trial"
          featureKey="pro"
        />
        <Card
          name="Elite"
          priceMonth={PRICES.elite.month}
          priceYear={PRICES.elite.year}
          interval={interval}
          isCurrent={currentTier === 'elite'}
          onSelect={() => onSelectPaid('elite', interval)}
          ctaLabel="Start 15-day free trial"
          featureKey="elite"
        />
      </div>
    </div>
  );
}
