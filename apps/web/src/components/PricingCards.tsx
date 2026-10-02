'use client';

import { useState } from 'react';
import { PLAN_PRICES, TRIAL_DAYS } from '@/lib/plans';

type Tier = 'free' | 'pro' | 'elite';
type Interval = 'month' | 'year';

/* ── Icons — inline SVG, colored by the caller through currentColor ── */

type IconName =
  | 'wallet' | 'bank' | 'gem' | 'link' | 'infinity' | 'minus' | 'sparkle' | 'check'
  | 'upload' | 'pie' | 'coin-hand' | 'goal' | 'receipt';

function Icon({ name, size = 20 }: { name: IconName; size?: number }) {
  const p = { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.7, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true };
  switch (name) {
    case 'wallet':
      return <svg {...p}><path d="M4 7.5A2.5 2.5 0 0 1 6.5 5H17a2 2 0 0 1 2 2v1" /><rect x="3.5" y="7.5" width="17" height="12" rx="2.5" /><path d="M16 12.5h4.5v3H16a1.5 1.5 0 0 1 0-3Z" /></svg>;
    case 'bank':
      return <svg {...p}><path d="M3.5 9 12 4l8.5 5" /><path d="M5 9.5h14" /><path d="M6.5 10v7M10 10v7M14 10v7M17.5 10v7" /><path d="M4 19.5h16" /></svg>;
    case 'gem':
      return <svg {...p}><path d="M6.5 4.5h11l3.5 5-9 10-9-10 3.5-5Z" /><path d="M3 9.5h18M9.5 4.5 8 9.5l4 10 4-10-1.5-5" /></svg>;
    case 'link':
      return <svg {...p}><path d="M10 14a4 4 0 0 0 5.66 0l3-3a4 4 0 0 0-5.66-5.66l-1 1" /><path d="M14 10a4 4 0 0 0-5.66 0l-3 3a4 4 0 0 0 5.66 5.66l1-1" /></svg>;
    case 'infinity':
      return <svg {...p}><path d="M12 12c-2-2.7-3.6-4-5.5-4a4 4 0 0 0 0 8c1.9 0 3.5-1.3 5.5-4Zm0 0c2 2.7 3.6 4 5.5 4a4 4 0 0 0 0-8c-1.9 0-3.5 1.3-5.5 4Z" /></svg>;
    case 'minus':
      return <svg {...p}><circle cx="12" cy="12" r="8.5" /><path d="M8.5 12h7" /></svg>;
    case 'sparkle':
      return <svg {...p}><path d="M12 3.5 13.8 9l5.7 1.8-5.7 1.9L12 18.5l-1.8-5.8L4.5 10.8 10.2 9 12 3.5Z" /><path d="M19 16.5v3M17.5 18h3" /></svg>;
    case 'check':
      return <svg {...p}><circle cx="12" cy="12" r="8.5" /><path d="m8.5 12.2 2.3 2.3 4.7-4.8" /></svg>;
    case 'upload':
      return <svg {...p}><path d="M4 7.5V17a2.5 2.5 0 0 0 2.5 2.5h11A2.5 2.5 0 0 0 20 17V9.5A2.5 2.5 0 0 0 17.5 7H12l-2-2.5H6.5A2.5 2.5 0 0 0 4 7Z" /><path d="M12 16.5v-6M9.5 13l2.5-2.5 2.5 2.5" /></svg>;
    case 'pie':
      return <svg {...p}><path d="M12 3.5v8.5h8.5A8.5 8.5 0 1 1 12 3.5Z" /><path d="M15 3.8A8.5 8.5 0 0 1 20.2 9H15V3.8Z" /></svg>;
    case 'coin-hand':
      return <svg {...p}><circle cx="14.5" cy="7.5" r="4" /><path d="M14.5 5.8v3.4M13.3 6.5h1.8a.8.8 0 0 1 0 1.6h-1.2a.8.8 0 0 0 0 1.6h1.8" /><path d="M3.5 14.5h3l3.5 1.5h3.5a1.5 1.5 0 0 1 0 3H9" /><path d="M13.5 18.5 18 16a1.5 1.5 0 0 1 1.8 2.3L15 21H6.5l-3-1.5" /></svg>;
    case 'goal':
      return <svg {...p}><path d="M5 20v-5M10 20v-8M15 20v-4" /><path d="M19.5 20V5.5" /><path d="M19.5 5.5 15 7l4.5 2" /></svg>;
    case 'receipt':
      return <svg {...p}><path d="M5 11v8.5h14V11" /><path d="m5 11 7 4.5 7-4.5" /><path d="M7.5 9V4.5h9V9" /><path d="M10 7h4" /></svg>;
  }
}

/* ── Plan definitions: the copy each card shows ── */

/** `unavailable` renders muted and struck through, so the card also reads as a comparison. */
type Feature = { icon: IconName; label: string; unavailable?: boolean };

interface PlanDef {
  tier: Tier;
  name: string;
  tagline: string;
  icon: IconName;
  /** CSS variable for the plan's accent (icon, border, bullet icons). */
  accent: string;
  features: Feature[];
}

const PLANS: PlanDef[] = [
  {
    tier: 'free',
    name: 'Free',
    tagline: 'The essentials to get started',
    icon: 'wallet',
    accent: 'var(--color-card-violet)',
    features: [
      { icon: 'check', label: 'Unlimited manual accounts & CSV import' },
      { icon: 'check', label: 'Transactions with categories, splits & notes' },
      { icon: 'check', label: 'Budgets & spending tracking' },
      { icon: 'check', label: 'Recurring payments' },
      { icon: 'check', label: 'Auto-categorization rules' },
      { icon: 'check', label: 'Projects & assets tracking' },
      { icon: 'check', label: 'Debts & loans tracking' },
      { icon: 'check', label: 'Savings goals & net worth' },
      { icon: 'check', label: 'Receipt scanning via Gmail' },
      { icon: 'minus', label: 'Automatic bank sync with Plaid', unavailable: true },
      { icon: 'minus', label: 'Linked bank institutions', unavailable: true },
      { icon: 'minus', label: 'Ask Cofre AI assistant', unavailable: true },
    ],
  },
  {
    tier: 'pro',
    name: 'Pro',
    tagline: 'Spend less time managing money',
    icon: 'bank',
    accent: 'var(--color-primary)',
    features: [
      { icon: 'bank', label: 'Everything in Free' },
      { icon: 'link', label: 'Automatic bank sync with Plaid' },
      { icon: 'bank', label: 'Up to 4 linked institutions' },
      { icon: 'sparkle', label: 'Ask Cofre AI assistant' },
    ],
  },
  {
    tier: 'elite',
    name: 'Elite',
    tagline: 'Connect your complete financial life',
    icon: 'gem',
    accent: 'var(--color-card-amber)',
    features: [
      { icon: 'bank', label: 'Everything in Pro' },
      { icon: 'link', label: 'Automatic bank sync with Plaid' },
      { icon: 'infinity', label: 'Unlimited linked institutions' },
      { icon: 'sparkle', label: 'Ask Cofre AI assistant' },
    ],
  },
];

const EVERY_PLAN: { icon: IconName; label: string; accent: string }[] = [
  { icon: 'upload', label: 'Manual accounts & CSV import', accent: 'var(--color-card-violet)' },
  { icon: 'pie', label: 'Budgets & spending tracking', accent: 'var(--color-card-sky)' },
  { icon: 'coin-hand', label: 'Debts & loans tracking', accent: 'var(--color-card-green)' },
  { icon: 'goal', label: 'Savings goals & net worth', accent: 'var(--color-card-violet)' },
  { icon: 'receipt', label: 'Receipt scanning via Gmail', accent: 'var(--color-card-red)' },
];

const glass: React.CSSProperties = {
  background: 'var(--color-surface)',
  backdropFilter: 'var(--glass-blur)',
  WebkitBackdropFilter: 'var(--glass-blur)',
  border: 'var(--glass-border)',
  boxShadow: 'var(--glass-shadow)',
};

const tint = (color: string, pct: number) => `color-mix(in srgb, ${color} ${pct}%, transparent)`;

function money(n: number): string {
  return n.toFixed(2);
}

/* ── Pieces ── */

function IntervalToggle({ interval, onChange }: { interval: Interval; onChange: (i: Interval) => void }) {
  return (
    <div
      role="radiogroup"
      aria-label="Billing interval"
      className="inline-flex items-center gap-1 p-1 rounded-full"
      style={{ background: 'var(--color-elevated)', border: '1px solid var(--color-border)' }}
    >
      {(['month', 'year'] as Interval[]).map((i) => {
        const active = interval === i;
        return (
          <button
            key={i}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(i)}
            className={`px-4 sm:px-6 py-2 rounded-full text-sm font-semibold cursor-pointer transition-colors ${active ? 'btn-gold' : ''}`}
            style={active ? undefined : { color: 'var(--color-text-secondary)' }}
          >
            {i === 'month' ? 'Monthly' : 'Annually'}
          </button>
        );
      })}
      <span
        className="ml-1 mr-1 text-xs font-bold px-2.5 py-1 rounded-full whitespace-nowrap"
        style={{ background: tint('var(--color-primary)', 14), color: 'var(--color-primary)', border: `1px solid ${tint('var(--color-primary)', 30)}` }}
      >
        Save 20%
      </span>
    </div>
  );
}

function PlanCard({
  plan,
  interval,
  isCurrent,
  recommended,
  onSelect,
}: {
  plan: PlanDef;
  interval: Interval;
  isCurrent: boolean;
  recommended: boolean;
  onSelect: () => void;
}) {
  const prices = plan.tier === 'free' ? null : PLAN_PRICES[plan.tier];
  const price = !prices ? 0 : interval === 'month' ? prices.month : prices.year / 12;
  const highlighted = plan.tier !== 'free';

  return (
    <div
      className="card-lift relative rounded-2xl p-5 sm:p-6 flex flex-col"
      style={{
        ...glass,
        border: highlighted ? `1.5px solid ${tint(plan.accent, 70)}` : glass.border,
        boxShadow: highlighted ? `0 0 0 1px ${tint(plan.accent, 15)}, 0 10px 40px ${tint(plan.accent, 18)}` : glass.boxShadow,
      }}
    >
      {recommended && (
        <span
          className="absolute -top-3 left-1/2 -translate-x-1/2 text-xs font-bold px-3 py-1 rounded-full whitespace-nowrap"
          style={{ background: plan.accent, color: 'var(--color-base)' }}
        >
          Recommended
        </span>
      )}

      <div className="flex items-start gap-4">
        <span
          className="w-14 h-14 rounded-2xl flex items-center justify-center shrink-0"
          style={{ background: tint(plan.accent, 16), border: `1px solid ${tint(plan.accent, 35)}`, color: plan.accent }}
        >
          <Icon name={plan.icon} size={30} />
        </span>
        <div className="min-w-0">
          <h3 className="text-xl font-bold" style={{ color: 'var(--color-text-primary)' }}>{plan.name}</h3>
          <p className="text-sm mt-0.5" style={{ color: 'var(--color-text-secondary)' }}>{plan.tagline}</p>
        </div>
      </div>

      <p className="mt-6">
        <span className="text-4xl font-bold tracking-tight" style={{ color: 'var(--color-text-primary)' }}>${plan.tier === 'free' ? '0' : money(price)}</span>
        <span className="text-sm ml-1" style={{ color: 'var(--color-text-muted)' }}>/mo</span>
      </p>
      <p className="text-sm mt-1" style={{ color: 'var(--color-text-secondary)' }}>
        {!prices
          ? 'Free forever'
          : interval === 'year'
            ? `Billed annually · save $${money(prices.month * 12 - prices.year)} a year`
            : 'Billed monthly'}
      </p>

      {isCurrent ? (
        <span
          className="w-full mt-6 py-3 rounded-xl font-semibold text-sm flex items-center justify-center gap-2"
          style={{ background: tint('var(--color-primary)', 10), border: '1px solid var(--color-border)', color: 'var(--color-text-secondary)' }}
        >
          <span style={{ color: 'var(--color-primary)' }}><Icon name="check" size={18} /></span>
          Your current plan
        </span>
      ) : (
        <button
          onClick={onSelect}
          className={`${plan.tier === 'elite' ? 'btn-premium' : plan.tier === 'pro' ? 'btn-gold' : ''} w-full mt-6 py-3 rounded-xl font-semibold text-sm flex items-center justify-center gap-2 cursor-pointer`}
          // Free is the quiet option: outlined, so the paid trials carry the emphasis.
          style={plan.tier === 'free' ? { background: 'var(--color-elevated)', border: '1px solid var(--color-border)', color: 'var(--color-text-primary)' } : undefined}
        >
          {plan.tier === 'free' ? 'Get started' : `Start ${TRIAL_DAYS}-day free trial`}
          <span aria-hidden>→</span>
        </button>
      )}

      <div className="mt-6 pt-5 flex flex-col gap-3.5" style={{ borderTop: '1px solid var(--color-border)' }}>
        {plan.features.map((f) => (
          <div key={f.label} className="flex items-center gap-3 text-sm">
            <span className="shrink-0" style={{ color: f.unavailable ? 'var(--color-text-muted)' : plan.accent }}>
              <Icon name={f.icon} size={20} />
            </span>
            {f.unavailable ? (
              <span className="line-through" style={{ color: 'var(--color-text-muted)' }}>
                <span className="sr-only">Not included: </span>{f.label}
              </span>
            ) : (
              <span style={{ color: 'var(--color-text-primary)' }}>{f.label}</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function IncludedInEveryPlan() {
  return (
    <div className="mt-6 rounded-2xl p-5 sm:p-6" style={glass}>
      <h3 className="text-lg font-bold mb-4" style={{ color: 'var(--color-text-primary)' }}>Included in every plan</h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
        {EVERY_PLAN.map((f) => (
          <div
            key={f.label}
            className="flex items-center gap-3 p-2.5 rounded-xl"
            style={{ background: 'var(--color-elevated)', border: '1px solid var(--color-border)' }}
          >
            <span
              className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0"
              style={{ background: tint(f.accent, 16), color: f.accent }}
            >
              <Icon name={f.icon} size={22} />
            </span>
            <span className="text-sm leading-snug" style={{ color: 'var(--color-text-primary)' }}>{f.label}</span>
          </div>
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
      <div className="flex justify-center mb-8">
        <IntervalToggle interval={interval} onChange={setInterval} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 md:gap-5 lg:gap-6">
        {PLANS.map((plan) => (
          <PlanCard
            key={plan.tier}
            plan={plan}
            interval={interval}
            isCurrent={currentTier === plan.tier}
            recommended={plan.tier === 'pro'}
            onSelect={plan.tier === 'free' ? onSelectFree : () => onSelectPaid(plan.tier as 'pro' | 'elite', interval)}
          />
        ))}
      </div>

      <IncludedInEveryPlan />
    </div>
  );
}
