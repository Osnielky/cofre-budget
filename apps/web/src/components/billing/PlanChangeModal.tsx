'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import type { BillingOverview, PlanChangePreview } from '@/lib/billing/types';
import { describePlanChange, planLabel } from '@/lib/billing/planChange';
import { Icon, fmtDate, fmtMoney, outlineBtn } from './ui';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3333/api';

export interface PlanChangeTarget { tier: 'pro' | 'elite'; interval: 'month' | 'year' }
export type PlanChangeResult = { kind: 'upgrade' | 'downgrade'; effectiveAt: string };

/**
 * The checkout-style step before any plan change: what is charged today, how
 * that figure comes about, what happens afterwards, which method pays, and the
 * no-refund policy — then one confirm button. Nothing is sent to Stripe until
 * that button is pressed.
 */
export default function PlanChangeModal({ target, overview, onClose, onDone }: {
  target: PlanChangeTarget;
  overview: BillingOverview | null;
  onClose: () => void;
  onDone: (result: PlanChangeResult) => void;
}) {
  const [preview, setPreview] = useState<PlanChangePreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState<PlanChangeResult | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${API}/billing/subscription/preview`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
          body: JSON.stringify(target),
        });
        const body = await res.json().catch(() => null);
        if (!res.ok) throw new Error(typeof body?.message === 'string' ? body.message : 'Could not work out the cost of this change.');
        if (!cancelled) setPreview(body);
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      }
    })();
    return () => { cancelled = true; };
  }, [target]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !submitting) onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose, submitting]);

  async function confirm() {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`${API}/billing/subscription`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify(target),
      });
      const body = await res.json().catch(() => null);
      if (res.status === 403 && body?.code === 'DEMO_READ_ONLY') throw new Error('Billing is not available in the demo.');
      if (!res.ok) throw new Error(typeof body?.message === 'string' ? body.message : 'The change did not go through. Nothing was charged.');
      setDone(body);
      onDone(body);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  const copy = preview ? describePlanChange(preview, overview?.paymentMethod ?? null, { money: fmtMoney, date: fmtDate }) : null;
  const pending = overview?.pendingChange ?? null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4"
      style={{ background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(6px)' }}
      onMouseDown={(e) => { if (e.target === e.currentTarget && !submitting) onClose(); }}>
      <div role="dialog" aria-modal="true" aria-labelledby="plan-change-title"
        className="w-full sm:max-w-md max-h-[92dvh] flex flex-col rounded-t-2xl sm:rounded-2xl overflow-hidden"
        style={{ background: 'var(--color-elevated)', border: 'var(--glass-border)', boxShadow: 'var(--glass-shadow)' }}>

        <div className="px-5 sm:px-6 py-4 flex items-start justify-between gap-3" style={{ borderBottom: '1px solid var(--color-border)' }}>
          <div>
            <p className="text-fine font-bold uppercase tracking-[0.14em]" style={{ color: 'var(--color-primary)' }}>Plan change</p>
            <h2 id="plan-change-title" className="text-lg font-bold leading-tight" style={{ color: 'var(--color-text-primary)' }}>
              {done ? (done.kind === 'upgrade' ? `You're on ${planLabel(target)}` : 'Switch scheduled') : copy?.title ?? `Switch to ${planLabel(target)}`}
            </h2>
          </div>
          <button type="button" onClick={onClose} disabled={submitting} aria-label="Close"
            className="w-8 h-8 rounded-lg flex items-center justify-center cursor-pointer disabled:opacity-50"
            style={{ color: 'var(--color-text-muted)', background: 'color-mix(in srgb, currentColor 8%, transparent)' }}>
            <Icon name="xCircle" size={18} />
          </button>
        </div>

        <div className="px-5 sm:px-6 py-5 overflow-y-auto flex flex-col gap-4">
          {done ? (
            <Done result={done} target={target} />
          ) : !preview || !copy ? (
            error
              ? <p className="text-sm" style={{ color: 'var(--color-rose)' }}>{error}</p>
              : <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>Working out what this costs…</p>
          ) : (
            <>
              {/* Today's figure */}
              <div className="rounded-xl p-4 flex items-baseline justify-between gap-3"
                style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
                <span className="text-sm font-bold" style={{ color: 'var(--color-text-primary)' }}>{copy.chargeNow.label}</span>
                <span className="text-2xl font-bold tabular-nums" style={{ color: copy.chargeNow.amount > 0 ? 'var(--color-text-primary)' : 'var(--color-green)' }}>
                  {fmtMoney(copy.chargeNow.amount, copy.chargeNow.currency)}
                </span>
              </div>
              <ul className="flex flex-col gap-1.5 -mt-1">
                {copy.breakdown.map((line) => (
                  <li key={line} className="text-xs leading-snug flex gap-2" style={{ color: 'var(--color-text-secondary)' }}>
                    <span aria-hidden="true" className="shrink-0" style={{ color: 'var(--color-text-muted)' }}>·</span>{line}
                  </li>
                ))}
              </ul>

              {/* From → to */}
              <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 text-center">
                <PlanTile label="Now" plan={preview.from} currency={preview.currency} muted />
                <span style={{ color: 'var(--color-text-muted)' }}><Icon name="arrow" size={18} /></span>
                <PlanTile label={preview.kind === 'downgrade' ? `From ${fmtDate(preview.effectiveAt)}` : 'From today'} plan={preview.to} currency={preview.currency} />
              </div>

              <div>
                <p className="text-xs font-bold mb-1.5" style={{ color: 'var(--color-text-primary)' }}>What happens</p>
                <ul className="flex flex-col gap-1.5">
                  {copy.afterwards.map((line) => (
                    <li key={line} className="text-xs leading-snug flex gap-2" style={{ color: 'var(--color-text-secondary)' }}>
                      <span className="shrink-0 mt-px" style={{ color: 'var(--color-green)' }}><Icon name="check" size={13} /></span>{line}
                    </li>
                  ))}
                  {pending && (
                    <li className="text-xs leading-snug flex gap-2" style={{ color: 'var(--color-amber)' }}>
                      <span className="shrink-0 mt-px"><Icon name="xCircle" size={13} /></span>
                      This replaces the switch to {planLabel(pending)} you scheduled for {fmtDate(pending.effectiveAt)}.
                    </li>
                  )}
                </ul>
              </div>

              <p className="text-xs leading-snug flex gap-2 rounded-xl p-3"
                style={copy.payment.blocking
                  ? { background: 'color-mix(in srgb, var(--color-amber) 14%, transparent)', color: 'var(--color-amber)' }
                  : { background: 'var(--color-surface)', color: 'var(--color-text-secondary)' }}>
                <span className="shrink-0 mt-px"><Icon name="card" size={14} /></span>{copy.payment.text}
              </p>

              <p className="text-fine leading-snug" style={{ color: 'var(--color-text-muted)' }}>
                {copy.policy} By confirming you agree to our <a href="/terms" target="_blank" rel="noopener noreferrer" className="underline" style={{ color: 'var(--color-text-secondary)' }}>Terms</a>.
                We&rsquo;ll email you a confirmation.
              </p>

              {error && <p className="text-xs font-semibold" style={{ color: 'var(--color-rose)' }}>{error}</p>}
            </>
          )}
        </div>

        <div className="px-5 sm:px-6 py-4 flex flex-col-reverse sm:flex-row sm:justify-end gap-2" style={{ borderTop: '1px solid var(--color-border)' }}>
          {done ? (
            <button type="button" onClick={onClose} className="btn-gold px-4 py-2.5 rounded-xl text-sm font-semibold cursor-pointer">Done</button>
          ) : (
            <>
              <button type="button" onClick={onClose} disabled={submitting} className="px-4 py-2.5 rounded-xl text-sm font-semibold cursor-pointer disabled:opacity-50" style={outlineBtn}>
                Keep {preview ? planLabel(preview.from) : 'current plan'}
              </button>
              <button type="button" onClick={confirm} disabled={!copy || copy.payment.blocking || submitting}
                className="btn-gold px-4 py-2.5 rounded-xl text-sm font-semibold cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed">
                {submitting ? 'Working…' : copy?.confirmLabel ?? 'Confirm'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}

function PlanTile({ label, plan, currency, muted }: { label: string; plan: PlanChangePreview['from']; currency: string; muted?: boolean }) {
  return (
    <div className="rounded-xl p-3" style={{ background: 'var(--color-surface)', border: `1px solid ${muted ? 'var(--color-border)' : 'var(--color-primary)'}`, opacity: muted ? 0.8 : 1 }}>
      <p className="text-fine font-bold uppercase tracking-wide" style={{ color: 'var(--color-text-muted)' }}>{label}</p>
      <p className="text-sm font-bold mt-0.5" style={{ color: 'var(--color-text-primary)' }}>{planLabel(plan)}</p>
      <p className="text-xs tabular-nums" style={{ color: 'var(--color-text-secondary)' }}>{fmtMoney(plan.amount, currency)} / {plan.interval}</p>
    </div>
  );
}

function Done({ result, target }: { result: PlanChangeResult; target: PlanChangeTarget }) {
  return (
    <div className="flex flex-col items-center text-center gap-2 py-2">
      <span className="inline-flex items-center justify-center w-12 h-12 rounded-full" style={{ background: 'color-mix(in srgb, var(--color-green) 16%, transparent)', color: 'var(--color-green)' }}>
        <Icon name="check" size={24} />
      </span>
      <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
        {result.kind === 'upgrade'
          ? `${planLabel(target)} is active now. The receipt and details are in your email.`
          : `You switch to ${planLabel(target)} on ${fmtDate(result.effectiveAt)}. Until then nothing changes — the details are in your email.`}
      </p>
    </div>
  );
}
