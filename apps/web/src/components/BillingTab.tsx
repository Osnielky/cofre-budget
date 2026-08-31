'use client';

import { useEffect, useState, useCallback } from 'react';
import PricingCards from './PricingCards';
import { useUser } from './UserProvider';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3333/api';

interface SubscriptionInfo {
  tier: 'pro' | 'elite';
  interval: 'month' | 'year';
  status: 'trialing' | 'active' | 'past_due' | 'canceled';
  currentPeriodEnd: string | null;
  trialEnd: string | null;
  cancelAtPeriodEnd: boolean;
}

const glass: React.CSSProperties = {
  background: 'var(--color-surface)',
  backdropFilter: 'var(--glass-blur)',
  WebkitBackdropFilter: 'var(--glass-blur)',
  border: 'var(--glass-border)',
  boxShadow: 'var(--glass-shadow)',
};

function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
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
  return await res.json();
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
  const [sub, setSub] = useState<SubscriptionInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [busy, setBusy] = useState(false);

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
      if (!res.ok) return;
      const { url } = await res.json();
      window.location.href = url;
    } finally {
      setBusy(false);
    }
  }

  async function switchTier(tier: 'pro' | 'elite', interval: 'month' | 'year') {
    setBusy(true);
    try {
      const res = await fetch(`${API}/billing/subscription`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify({ tier, interval }),
      });
      if (res.ok) {
        // Busy stays true (button disabled) for the whole poll, not just a fixed delay,
        // so the UI keeps signalling "still working" until the webhook actually lands.
        const updated = await waitForSubscriptionChange(
          fetchSubscription,
          (s) => s?.tier === tier && s?.interval === interval,
        );
        setSub(updated);
        await refetch();
      }
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
      }
    } finally {
      setBusy(false);
    }
  }

  async function openPortal() {
    const res = await fetch(`${API}/billing/portal-link`, { method: 'POST', credentials: 'include' });
    if (!res.ok) return;
    const { url } = await res.json();
    window.location.href = url;
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
    return (
      <div>
        <h2 className="text-lg font-bold mb-4" style={{ color: 'var(--color-text-primary)' }}>Plan &amp; billing</h2>
        <PricingCards onSelectFree={() => {}} onSelectPaid={startCheckout} currentTier={user?.plan ?? 'free'} />
      </div>
    );
  }

  return (
    <div className="max-w-xl">
      <h2 className="text-lg font-bold mb-4" style={{ color: 'var(--color-text-primary)' }}>Plan &amp; billing</h2>
      <div className="rounded-2xl p-6 space-y-3" style={glass}>
        <p style={{ color: 'var(--color-text-primary)' }}>
          <span className="font-semibold capitalize">{sub.tier}</span> · {sub.interval === 'month' ? 'Monthly' : 'Yearly'}
        </p>
        {sub.status === 'trialing' && (
          <p style={{ color: 'var(--color-text-muted)' }}>Trial ends {fmtDate(sub.trialEnd)}</p>
        )}
        {sub.status === 'past_due' && (
          <p style={{ color: 'var(--color-card-orange)' }}>
            Your last payment failed — update your card to keep your plan active.
          </p>
        )}
        {sub.cancelAtPeriodEnd ? (
          <p style={{ color: 'var(--color-text-muted)' }}>Cancels on {fmtDate(sub.currentPeriodEnd)}</p>
        ) : (
          <p style={{ color: 'var(--color-text-muted)' }}>Renews on {fmtDate(sub.currentPeriodEnd)}</p>
        )}

        <div className="flex flex-wrap gap-2 pt-2">
          {sub.tier === 'pro' && (
            <button disabled={busy} onClick={() => switchTier('elite', sub.interval)} className="btn-gold px-4 py-2 rounded-full text-sm font-semibold">
              Upgrade to Elite
            </button>
          )}
          {sub.tier === 'elite' && (
            <button disabled={busy} onClick={() => switchTier('pro', sub.interval)} className="px-4 py-2 rounded-full text-sm font-semibold" style={{ border: '1px solid var(--color-border)', color: 'var(--color-text-primary)' }}>
              Downgrade to Pro
            </button>
          )}
          <button
            disabled={busy}
            onClick={() => switchTier(sub.tier, sub.interval === 'month' ? 'year' : 'month')}
            className="px-4 py-2 rounded-full text-sm font-semibold"
            style={{ border: '1px solid var(--color-border)', color: 'var(--color-text-primary)' }}
          >
            Switch to {sub.interval === 'month' ? 'yearly (save 20%)' : 'monthly'}
          </button>
          <button disabled={busy} onClick={openPortal} className="px-4 py-2 rounded-full text-sm font-semibold" style={{ border: '1px solid var(--color-border)', color: 'var(--color-text-primary)' }}>
            Update payment method
          </button>
          {!sub.cancelAtPeriodEnd && (
            <button disabled={busy} onClick={cancelPlan} className="px-4 py-2 rounded-full text-sm font-semibold" style={{ color: 'var(--color-card-orange)' }}>
              Cancel plan
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
