'use client';

import { PLAN_PRICES, TRIAL_DAYS } from '@/lib/plans';
import { cardBrandLabel, daysUntil, trialProgress } from '@/lib/billing/derive';
import type { BillingOverview, SubscriptionInfo } from '@/lib/billing/types';
import { BillingCard, Icon, IconChip, Pill, fmtDate, fmtMoney, outlineBtn, glass } from './ui';

const TIER = { pro: 'Pro', elite: 'Elite' } as const;
const INTERVAL = { month: 'Monthly', year: 'Yearly' } as const;

export interface BillingActions {
  busy: boolean;
  switchTier: (tier: 'pro' | 'elite', interval: 'month' | 'year') => void;
  cancelPlan: () => void;
  resumePlan: () => void;
  openPortal: () => void;
}

/** Wide card: plan name, trial / renewal / cancellation status and the main actions. */
export function CurrentPlanCard({ sub, actions }: { sub: SubscriptionInfo; actions: BillingActions }) {
  const accent = sub.tier === 'elite' ? 'var(--color-amber)' : 'var(--color-primary)';
  const trialing = sub.status === 'trialing' && !!sub.trialEnd;
  const statusLine = sub.status === 'past_due'
    ? { text: 'Your last payment failed — update your card to keep your plan.', color: 'var(--color-rose)' }
    : sub.cancelAtPeriodEnd
      ? { text: `Your ${TIER[sub.tier]} plan is set to end.`, color: 'var(--color-amber)' }
      : trialing
        ? { text: `You're on a ${TRIAL_DAYS}-day free trial of ${TIER[sub.tier]}.`, color: 'var(--color-amber)' }
        : { text: `Your ${TIER[sub.tier]} plan is active.`, color: 'var(--color-green)' };
  const endDate = trialing ? sub.trialEnd : sub.currentPeriodEnd;
  const other = sub.tier === 'pro' ? 'elite' : 'pro';
  const otherInterval = sub.interval === 'month' ? 'year' : 'month';

  return (
    <section className="rounded-2xl p-5 sm:p-6 flex flex-col gap-5 min-w-0 relative overflow-hidden"
      style={{ ...glass, border: `1px solid color-mix(in srgb, ${accent} 45%, transparent)`, background: `linear-gradient(135deg, color-mix(in srgb, ${accent} 16%, var(--color-surface)) 0%, var(--color-surface) 70%)` }}>
      <div className="flex items-start gap-4">
        <IconChip name="crown" color={accent} size={64} />
        <div className="min-w-0">
          <Pill color={accent}>CURRENT PLAN</Pill>
          <h3 className="text-2xl font-bold mt-1.5" style={{ color: 'var(--color-text-primary)' }}>{TIER[sub.tier]} · {INTERVAL[sub.interval]}</h3>
          <p className="text-sm font-semibold mt-0.5" style={{ color: statusLine.color }}>{statusLine.text}</p>
        </div>
      </div>

      <div className="flex flex-col gap-3">
        {trialing && (
          <div className="flex items-start gap-3">
            <span style={{ color: 'var(--color-text-secondary)' }}><Icon name="calendar" /></span>
            <div>
              <p className="text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>Trial ends {fmtDate(sub.trialEnd)}</p>
              <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                {sub.cancelAtPeriodEnd ? "You won't be charged." : "You won't be charged until then."}
              </p>
            </div>
          </div>
        )}
        {sub.cancelAtPeriodEnd ? (
          <div className="flex items-start gap-3">
            <span style={{ color: 'var(--color-amber)' }}><Icon name="xCircle" /></span>
            <div>
              <p className="text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>Ends on {fmtDate(endDate)}</p>
              <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>Your plan stays active until this date, then moves to Basic. Your data is kept.</p>
            </div>
          </div>
        ) : !trialing && (
          <div className="flex items-start gap-3">
            <span style={{ color: 'var(--color-text-secondary)' }}><Icon name="calendar" /></span>
            <div>
              <p className="text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>Renews on {fmtDate(sub.currentPeriodEnd)}</p>
              <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>Billed {sub.interval === 'month' ? 'every month' : 'once a year'} until you cancel.</p>
            </div>
          </div>
        )}
      </div>

      <div className="flex flex-wrap gap-2 mt-auto">
        {sub.cancelAtPeriodEnd ? (
          <button type="button" disabled={actions.busy} onClick={actions.resumePlan}
            className="btn-gold px-4 py-2.5 rounded-xl text-sm font-semibold cursor-pointer disabled:opacity-50">
            Keep my plan
          </button>
        ) : (
          <button type="button" disabled={actions.busy} onClick={() => actions.switchTier(other, sub.interval)}
            className={`${other === 'elite' ? 'btn-gold' : ''} px-4 py-2.5 rounded-xl text-sm font-semibold cursor-pointer disabled:opacity-50`}
            style={other === 'elite' ? undefined : outlineBtn}>
            {other === 'elite' ? 'Upgrade to Elite' : 'Downgrade to Pro'}
          </button>
        )}
        {!sub.cancelAtPeriodEnd && (
          <button type="button" disabled={actions.busy} onClick={() => actions.switchTier(sub.tier, otherInterval)}
            className="px-4 py-2.5 rounded-xl text-sm font-semibold cursor-pointer disabled:opacity-50" style={outlineBtn}>
            {otherInterval === 'year' ? 'Switch to yearly (save 20%)' : 'Switch to monthly'}
          </button>
        )}
        <button type="button" disabled={actions.busy} onClick={actions.openPortal}
          className="px-4 py-2.5 rounded-xl text-sm font-semibold cursor-pointer disabled:opacity-50 inline-flex items-center gap-2" style={outlineBtn}>
          <Icon name="gear" size={15} /> Manage subscription
        </button>
      </div>
      {!sub.cancelAtPeriodEnd && (
        <button type="button" disabled={actions.busy} onClick={actions.cancelPlan}
          className="self-start text-xs font-semibold cursor-pointer hover:underline disabled:opacity-50 -mt-2" style={{ color: 'var(--color-text-muted)' }}>
          Cancel plan
        </button>
      )}
    </section>
  );
}

export function PaymentMethodCard({ overview, actions }: { overview: BillingOverview | null; actions: BillingActions }) {
  const pm = overview?.paymentMethod;
  const a = overview?.billingAddress;
  return (
    <BillingCard title="Payment method"
      action={<button type="button" onClick={actions.openPortal} className="text-xs font-semibold px-3 py-1 rounded-lg cursor-pointer" style={outlineBtn}>Edit</button>}>
      <div className="flex items-center gap-3 rounded-xl p-3" style={{ border: '1px solid var(--color-border)', background: 'var(--color-elevated)' }}>
        <span className="inline-flex items-center justify-center rounded-md px-2 h-8 min-w-12 text-[11px] font-black tracking-wide shrink-0"
          style={{ background: 'var(--color-text-primary)', color: 'var(--color-surface)' }}>
          {pm ? pm.brand.toUpperCase().slice(0, 4) : <Icon name="card" size={16} />}
        </span>
        <div className="min-w-0">
          <p className="text-sm font-semibold truncate" style={{ color: 'var(--color-text-primary)' }}>
            {pm ? `${cardBrandLabel(pm.brand)} ending in ${pm.last4}` : 'No card on file'}
          </p>
          <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
            {pm ? `Expires ${String(pm.expMonth).padStart(2, '0')}/${pm.expYear}` : 'Add one before your next charge'}
          </p>
        </div>
      </div>
      {a && (
        <div className="flex items-start gap-3 text-sm" style={{ color: 'var(--color-text-secondary)' }}>
          <span className="mt-0.5"><Icon name="pin" size={16} /></span>
          <div>
            <p className="font-semibold" style={{ color: 'var(--color-text-primary)' }}>Billing address</p>
            {a.line1 && <p>{a.line1}</p>}
            {a.line2 && <p>{a.line2}</p>}
            <p>{[a.city, [a.state, a.postalCode].filter(Boolean).join(' ')].filter(Boolean).join(', ')}</p>
            {a.country && <p>{a.country}</p>}
          </div>
        </div>
      )}
      <button type="button" onClick={actions.openPortal}
        className="mt-auto w-full py-2.5 rounded-xl text-sm font-semibold cursor-pointer inline-flex items-center justify-center gap-2"
        style={{ border: '1px solid var(--color-primary)', color: 'var(--color-primary)' }}>
        <Icon name="card" size={16} /> {pm ? 'Update payment method' : 'Add payment method'}
      </button>
    </BillingCard>
  );
}

export function BillingSummaryCard({ sub, overview }: { sub: SubscriptionInfo; overview: BillingOverview | null }) {
  const up = overview?.upcoming;
  const list = PLAN_PRICES[sub.tier][sub.interval];
  const nextDate = up?.date ?? (sub.status === 'trialing' ? sub.trialEnd : sub.currentPeriodEnd);
  const row = (label: string, value: string) => (
    <div className="flex items-center justify-between gap-3 text-sm py-1.5">
      <span style={{ color: 'var(--color-text-secondary)' }}>{label}</span>
      <span className="font-semibold tabular-nums" style={{ color: 'var(--color-text-primary)' }}>{value}</span>
    </div>
  );
  return (
    <BillingCard title="Billing summary">
      <div className="flex flex-col">
        {row('Plan', `${TIER[sub.tier]} (${INTERVAL[sub.interval]})`)}
        {row('Base price', fmtMoney(up?.subtotal ?? list, up?.currency))}
        {up && up.tax > 0 && row('Tax', fmtMoney(up.tax, up.currency))}
      </div>
      <div className="mt-auto pt-3" style={{ borderTop: '1px solid var(--color-border)' }}>
        {sub.cancelAtPeriodEnd ? (
          <>
            <p className="text-sm font-bold" style={{ color: 'var(--color-text-primary)' }}>No upcoming charges</p>
            <p className="text-xs mt-1" style={{ color: 'var(--color-text-muted)' }}>Your plan ends on {fmtDate(sub.status === 'trialing' ? sub.trialEnd : sub.currentPeriodEnd)}.</p>
          </>
        ) : (
          <>
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-sm font-bold" style={{ color: 'var(--color-text-primary)' }}>Next charge</span>
              <span className="text-xl font-bold tabular-nums" style={{ color: 'var(--color-text-primary)' }}>{fmtMoney(up?.total ?? list, up?.currency)}</span>
            </div>
            <p className="text-xs mt-1" style={{ color: 'var(--color-text-muted)' }}>On {fmtDate(nextDate)}</p>
          </>
        )}
      </div>
    </BillingCard>
  );
}

/** Trial ring while trialing; otherwise how long until renewal (or until the plan ends). */
export function TrialCard({ sub }: { sub: SubscriptionInfo }) {
  const trialing = sub.status === 'trialing' && !!sub.trialEnd;
  // The ring shows what's left: `usedPct` of it is drawn empty.
  const ring = (usedPct: number, big: string, small: string) => {
    const R = 46, C = 2 * Math.PI * R;
    return (
      <div className="relative w-32 h-32 mx-auto">
        <svg viewBox="0 0 108 108" className="w-full h-full -rotate-90">
          <circle cx="54" cy="54" r={R} fill="none" strokeWidth="8" stroke="color-mix(in srgb, currentColor 8%, transparent)" />
          <circle cx="54" cy="54" r={R} fill="none" strokeWidth="8" stroke="var(--color-sky)" strokeLinecap="round"
            strokeDasharray={C} strokeDashoffset={C * (usedPct / 100)} />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-3xl font-bold tabular-nums" style={{ color: 'var(--color-text-primary)' }}>{big}</span>
          <span className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>{small}</span>
        </div>
      </div>
    );
  };
  const secure = (
    <div className="flex items-start gap-2.5 rounded-xl p-3 mt-auto" style={{ border: '1px solid var(--color-border)', background: 'var(--color-elevated)' }}>
      <span style={{ color: 'var(--color-green)' }}><Icon name="shield" size={20} /></span>
      <div>
        <p className="text-xs font-semibold" style={{ color: 'var(--color-text-primary)' }}>Secure billing powered by Stripe</p>
        <p className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>Your card details are handled by Stripe and never stored by Cofre.</p>
      </div>
    </div>
  );

  if (trialing && sub.trialEnd) {
    const t = trialProgress(sub.trialEnd);
    return (
      <BillingCard title="Trial progress">
        {ring(t.pct, String(t.daysLeft), t.daysLeft === 1 ? 'day left' : 'days left')}
        <div>
          <div className="h-2 rounded-full overflow-hidden" style={{ background: 'var(--color-elevated)' }}>
            <div className="h-full rounded-full" style={{ width: `${t.pct}%`, background: 'var(--color-sky)' }} />
          </div>
          <div className="flex justify-between text-xs mt-1.5" style={{ color: 'var(--color-text-muted)' }}>
            <span>Day {t.dayOfTrial} of {t.totalDays}</span><span>{t.pct}%</span>
          </div>
        </div>
        {secure}
      </BillingCard>
    );
  }
  const end = sub.currentPeriodEnd;
  const left = end ? daysUntil(end) : 0;
  const periodDays = sub.interval === 'month' ? 30 : 365;
  return (
    <BillingCard title={sub.cancelAtPeriodEnd ? 'Access remaining' : 'Next renewal'}>
      {ring(100 - Math.min(100, (left / periodDays) * 100), String(left), left === 1 ? 'day left' : 'days left')}
      <p className="text-xs text-center" style={{ color: 'var(--color-text-muted)' }}>
        {sub.cancelAtPeriodEnd ? `Access ends ${fmtDate(end)}` : `Renews ${fmtDate(end)}`}
      </p>
      {secure}
    </BillingCard>
  );
}
