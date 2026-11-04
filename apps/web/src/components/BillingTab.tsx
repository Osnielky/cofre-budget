'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import PricingCards from './PricingCards';
import { useUser } from './UserProvider';
import type { BillingOverview, SubscriptionInfo } from '@/lib/billing/types';
import { portalReturnNotice, pastDueSummary } from '@/lib/billing/derive';
import { fmtDate, fmtMoney } from './billing/ui';
import { CurrentPlanCard, PaymentMethodCard, BillingSummaryCard, TrialCard, type BillingActions } from './billing/TopCards';
import { InvoicesCard, ComparePlansCard, IncludedCard, YearlyBanner, BillingHelpCard } from './billing/LowerCards';
import PlanChangeModal, { type PlanChangeTarget } from './billing/PlanChangeModal';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3333/api';

/** Card, next charge and invoices from Stripe. Best effort: null hides those details. */
async function fetchOverview(): Promise<BillingOverview | null> {
  const res = await fetch(`${API}/billing/overview`, { credentials: 'include' }).catch(() => null);
  return res?.ok ? res.json() : null;
}

/**
 * Throws on a non-OK response instead of returning `null` — a genuinely absent
 * subscription (Free-tier user) is a 200 with a `null` body, so `null` here always
 * means "confirmed no subscription," never "the request failed." Callers must not
 * collapse those two cases, or a transient fetch failure gets misread as "no
 * subscription" and silently offers to start a brand-new one (see BillingTab's load()).
 */
async function fetchSubscription(): Promise<SubscriptionInfo | null> {
  const res = await fetch(`${API}/billing/subscription`, { credentials: 'include' });
  if (!res.ok) throw new Error(`Failed to fetch subscription (${res.status})`);
  // A genuinely absent subscription is a 200 with an EMPTY body (NestJS serializes a
  // controller returning `null` that way), not the JSON literal `null` — res.json()
  // throws a SyntaxError on an empty body, which the caller would otherwise misread
  // as a fetch failure. Read as text first and only parse if non-empty.
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

/**
 * Stripe webhooks land asynchronously, so a subscription we just created/changed
 * server-side may not be reflected yet on the first read straight after our own
 * request resolves. Poll a bounded number of times instead of trusting a single
 * fixed delay — always terminates (max ~6s total) and returns whatever the last
 * fetch was even if `check` never passes, so the UI never hangs indefinitely.
 * A transient fetch error during an early attempt is treated as "not ready yet"
 * and retried; only a failure on the very last attempt propagates to the caller.
 */
async function waitForSubscriptionChange(
  fetchSub: () => Promise<SubscriptionInfo | null>,
  check: (sub: SubscriptionInfo | null) => boolean,
  maxAttempts = 5,
  delayMs = 1200,
): Promise<SubscriptionInfo | null> {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const sub = await fetchSub();
      if (check(sub)) return sub;
    } catch {
      // transient — keep retrying until the final attempt below, which is allowed to throw
    }
    if (i < maxAttempts - 1) await new Promise((r) => setTimeout(r, delayMs));
  }
  return fetchSub();
}

export default function BillingTab() {
  const { user, refetch } = useUser();
  // refetch is a new function each render; read it through a ref so load() stays stable.
  const refetchRef = useRef(refetch);
  refetchRef.current = refetch;
  const [sub, setSub] = useState<SubscriptionInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [busy, setBusy] = useState(false);
  const [overview, setOverview] = useState<BillingOverview | null>(null);
  const reloadOverview = useCallback(() => { fetchOverview().then(setOverview); }, []);
  const [portal, setPortal] = useState<{ opening: boolean; error: string | null }>({ opening: false, error: null });
  // True on the page load that Stripe's payment-method page returns to (?portal=return);
  // the param is stripped right away so a refresh does not repeat the notice.
  const [returnedFromPortal, setReturnedFromPortal] = useState(false);
  useEffect(() => {
    const url = new URL(window.location.href);
    if (url.searchParams.get('portal') !== 'return') return;
    setReturnedFromPortal(true);
    url.searchParams.delete('portal');
    window.history.replaceState(null, '', url.toString());
  }, []);
  // After a failed charge: collect the overdue invoice now and bring the plan back.
  const [recovery, setRecovery] = useState<BillingActions['recovery']>({ paying: false, notice: null });
  const retryPayment = useCallback(async (afterPortal = false) => {
    setRecovery({ paying: true, notice: null });
    try {
      const res = await fetch(`${API}/billing/pay-overdue`, { method: 'POST', credentials: 'include' });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(typeof body?.message === 'string' ? body.message : 'The payment could not be taken.');
      if (body.paid) {
        setRecovery({ paying: false, notice: { tone: 'good', text: `${afterPortal ? 'Payment method saved and the ' : 'The '}overdue ${fmtMoney(body.amount, body.currency)} went through — your plan is active again.` } });
        try { setSub(await fetchSubscription()); } catch { /* keep */ }
        await refetchRef.current();
      } else {
        setRecovery({ paying: false, notice: { tone: 'warn', text: body.message } });
      }
      reloadOverview();
    } catch (e) {
      setRecovery({ paying: false, notice: { tone: 'warn', text: (e as Error).message } });
    }
  }, [reloadOverview]);

  const autoRetried = useRef(false);
  useEffect(() => {
    if (!returnedFromPortal || autoRetried.current || !sub || sub.status !== 'past_due' || !overview?.paymentMethod) return;
    autoRetried.current = true;
    retryPayment(true);
  }, [returnedFromPortal, sub, overview, retryPayment]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      // Landing here from Stripe Checkout's success_url (?checkout=success — see
      // settings/page.tsx's tab-restore effect, which routes us onto this tab):
      // the confirming webhook may not have landed yet, so poll for a subscription
      // to appear instead of a single fetch that would otherwise still show the
      // Free-tier PricingCards right after a successful payment.
      const isCheckoutSuccess = new URLSearchParams(window.location.search).get('checkout') === 'success';
      const result = isCheckoutSuccess
        ? await waitForSubscriptionChange(fetchSubscription, (s) => s !== null)
        : await fetchSubscription();
      setSub(result);
      setLoadError(false);
      if (result && result.status !== 'canceled') fetchOverview().then(setOverview);
      // The plan lives on the user (sidebar badge, Ask Cofre, Connect Bank), so
      // reload it too — otherwise the app still says "Basic" until a page refresh.
      if (isCheckoutSuccess && result) refetchRef.current();
    } catch {
      // A genuinely absent subscription resolves above (as `null`) — landing here means
      // the fetch itself failed. Keep whatever `sub` we last had and show an error state
      // instead of falling through to the "no subscription" PricingCards view, which
      // would look like an invitation to start a second subscription.
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function startCheckout(tier: 'pro' | 'elite', interval: 'month' | 'year') {
    setBusy(true);
    try {
      const res = await fetch(`${API}/billing/checkout`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify({ tier, interval }),
      });
      if (res.status === 403) {
        const body = await res.json().catch(() => null);
        if (body?.code === 'DEMO_READ_ONLY') { window.alert('Billing is not available in the demo. Create a free account to subscribe.'); return; }
      }
      if (!res.ok) return;
      const { url } = await res.json();
      window.location.href = url;
    } finally {
      setBusy(false);
    }
  }

  // Any plan switch goes through the confirmation dialog: preview first, Stripe only on confirm.
  const [planChange, setPlanChange] = useState<PlanChangeTarget | null>(null);
  function switchTier(tier: 'pro' | 'elite', interval: 'month' | 'year') {
    setPlanChange({ tier, interval });
  }
  async function onPlanChanged() {
    // An upgrade is saved from Stripe's response before the request returns; a
    // downgrade only adds a pending change, which the overview reads live.
    try { setSub(await fetchSubscription()); } catch { /* keep what we have */ }
    await refetch();
    reloadOverview();
  }

  async function cancelPendingChange() {
    setBusy(true);
    try {
      const res = await fetch(`${API}/billing/subscription/pending-change/cancel`, { method: 'POST', credentials: 'include' });
      if (res.ok) reloadOverview();
    } finally {
      setBusy(false);
    }
  }

  async function cancelPlan() {
    if (!confirm('Cancel your subscription? You’ll keep access until the end of the current billing period.')) return;
    setBusy(true);
    try {
      const res = await fetch(`${API}/billing/cancel`, { method: 'POST', credentials: 'include' });
      if (res.ok) {
        const updated = await waitForSubscriptionChange(fetchSubscription, (s) => s?.cancelAtPeriodEnd === true);
        setSub(updated);
        reloadOverview();
      }
    } finally {
      setBusy(false);
    }
  }

  async function resumePlan() {
    setBusy(true);
    try {
      const res = await fetch(`${API}/billing/resume`, { method: 'POST', credentials: 'include' });
      if (res.ok) {
        const updated = await waitForSubscriptionChange(fetchSubscription, (s) => s?.cancelAtPeriodEnd === false);
        setSub(updated);
        reloadOverview();
      }
    } finally {
      setBusy(false);
    }
  }

  async function openPortal(flow?: 'payment_method') {
    setPortal({ opening: true, error: null });
    try {
      const res = await fetch(`${API}/billing/portal-link`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify(flow ? { flow } : {}),
      });
      if (!res.ok) throw new Error(String(res.status));
      const { url } = await res.json();
      window.location.href = url;
      // Stay "opening" while the browser leaves the page.
    } catch {
      setPortal({ opening: false, error: 'Couldn’t open Stripe just now. Try again in a moment.' });
    }
  }

  if (loading) return null;

  if (loadError) {
    return (
      <div>
        <h2 className="text-lg font-bold mb-4" style={{ color: 'var(--color-text-primary)' }}>Plan &amp; billing</h2>
        <p style={{ color: 'var(--color-card-orange)' }}>
          Couldn&apos;t load your billing info — try refreshing the page.
        </p>
      </div>
    );
  }

  // A canceled subscription's row is kept for history (see BillingService.syncFromStripeSubscription)
  // but User.plan has already reset to 'free' — treat it the same as "no subscription" so a
  // churned customer sees the resubscribe CTAs instead of management buttons for a dead subscription.
  if (!sub || sub.status === 'canceled') {
    const plan = user?.plan ?? 'free';
    return (
      <div>
        <div className="flex flex-wrap items-start justify-between gap-4 mb-8">
          <div>
            <h2 className="text-2xl sm:text-3xl font-bold" style={{ color: 'var(--color-text-primary)' }}>Plan &amp; billing</h2>
            <p className="mt-1 text-sm sm:text-base" style={{ color: 'var(--color-text-secondary)' }}>Choose the right plan for your financial life</p>
          </div>
          <span
            className="inline-flex items-center gap-2.5 px-4 py-2.5 rounded-full text-sm"
            style={{ background: 'var(--color-elevated)', border: '1px solid var(--color-border)', color: 'var(--color-text-secondary)' }}
          >
            <span className="w-2.5 h-2.5 rounded-full" style={{ background: 'var(--color-primary)' }} />
            Current plan: <span className="font-bold capitalize" style={{ color: 'var(--color-text-primary)' }}>{plan}</span>
          </span>
        </div>
        <PricingCards onSelectFree={() => {}} onSelectPaid={startCheckout} currentTier={plan} />
      </div>
    );
  }

  const actions: BillingActions = { busy, switchTier, cancelPlan, resumePlan, cancelPendingChange, retryPayment: () => retryPayment(false), recovery, openPortal, portal };
  // The overview is read live from Stripe on this load, so it already reflects the trip.
  // Past due + a method now on file: collect the overdue invoice right away (see the effect below).
  const portalNotice = returnedFromPortal && overview && !(sub.status === 'past_due' && overview.paymentMethod)
    ? portalReturnNotice(overview.paymentMethod, sub.status) : null;
  // One story for every card when a payment is unpaid: paused (plan already free) or still inside the grace window.
  const pastDue = pastDueSummary(sub, user?.plan ?? 'free', overview, { money: fmtMoney, date: fmtDate });
  return (
    <div className="flex flex-col gap-5">
      <div>
        <h2 className="text-2xl font-bold" style={{ color: 'var(--color-text-primary)' }}>Billing &amp; Subscription</h2>
        <p className="mt-1 text-sm" style={{ color: 'var(--color-text-secondary)' }}>Manage your plan, payment method and billing details.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-[1.9fr_1fr_1fr_1fr] gap-4">
        <div className="md:col-span-2 xl:col-span-1 flex flex-col [&>*]:flex-1 min-w-0"><CurrentPlanCard sub={sub} pastDue={pastDue} pendingChange={overview?.pendingChange ?? null} hasPaymentMethod={!!overview?.paymentMethod} actions={actions} /></div>
        <PaymentMethodCard overview={overview} sub={sub} notice={portalNotice} actions={actions} />
        <BillingSummaryCard sub={sub} overview={overview} pastDue={pastDue} />
        <div className="md:col-span-2 xl:col-span-1 flex flex-col [&>*]:flex-1 min-w-0"><TrialCard sub={sub} pastDue={pastDue} /></div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-[1.3fr_1fr_1fr] gap-4">
        <div className="md:col-span-2 xl:col-span-1 flex flex-col [&>*]:flex-1 min-w-0"><InvoicesCard overview={overview} actions={actions} /></div>
        <ComparePlansCard sub={sub} actions={actions} />
        <IncludedCard sub={sub} />
      </div>

      <div className={`grid grid-cols-1 gap-4 ${sub.interval === 'month' ? 'xl:grid-cols-[2.2fr_1fr]' : ''}`}>
        {sub.interval === 'month' && <YearlyBanner sub={sub} actions={actions} />}
        <BillingHelpCard actions={actions} />
      </div>

      {planChange && (
        <PlanChangeModal target={planChange} overview={overview} onClose={() => setPlanChange(null)} onDone={onPlanChanged} />
      )}
    </div>
  );
}
