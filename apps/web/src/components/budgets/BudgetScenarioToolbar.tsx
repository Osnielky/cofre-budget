'use client';

import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { formatMoney } from '@/lib/budgets/money';
import type { Plan } from '@/lib/budgets/calculations';
import type { Notice } from '@/hooks/useBudgetScenario';
import { Icon } from './ui';

/** Sticky bar shown while a draft scenario has unsaved changes. */
export function BudgetScenarioToolbar({ plan, saving, onSave, onDiscard }: {
  plan: Plan; saving: boolean; onSave: () => void; onDiscard: () => void;
}) {
  if (plan.modifiedCount === 0) return null;
  const diff = plan.budgetDifferenceCents;
  const impact = plan.savingsImpactCents;
  return (
    <div className="sticky bottom-0 z-30 px-3 sm:px-6 pb-[max(12px,env(safe-area-inset-bottom))] pt-3 pointer-events-none">
      <div role="region" aria-label="Unsaved budget changes"
        className="pointer-events-auto mx-auto max-w-4xl flex flex-wrap items-center gap-x-5 gap-y-2 px-4 py-3 rounded-2xl"
        style={{ background: 'var(--popover-bg, var(--color-elevated))', border: '1px solid color-mix(in srgb, var(--color-violet) 45%, transparent)', boxShadow: '0 12px 40px rgba(0,0,0,0.45)', backdropFilter: 'var(--glass-blur)' }}>
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full animate-pulse" style={{ background: 'var(--color-violet)' }} />
          <span className="text-xs font-bold">Draft scenario</span>
          <span className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>
            {plan.modifiedCount} categor{plan.modifiedCount === 1 ? 'y' : 'ies'} changed
          </span>
        </div>
        <div className="flex items-center gap-4 text-[11px]">
          <span style={{ color: 'var(--color-text-muted)' }}>Budget <strong className="tabular-nums" style={{ color: diff > 0 ? 'var(--color-rose)' : diff < 0 ? 'var(--color-green)' : 'var(--color-text-primary)' }}>{formatMoney(diff, { sign: true })}</strong></span>
          <span style={{ color: 'var(--color-text-muted)' }}>Savings <strong className="tabular-nums" style={{ color: impact > 0 ? 'var(--color-green)' : impact < 0 ? 'var(--color-rose)' : 'var(--color-text-primary)' }}>{formatMoney(impact, { sign: true })}</strong></span>
        </div>
        <div className="flex items-center gap-2 ml-auto w-full sm:w-auto">
          <button type="button" onClick={onDiscard} disabled={saving}
            className="flex-1 sm:flex-none px-4 py-2 rounded-xl text-xs font-semibold hover:bg-[var(--color-surface)] disabled:opacity-50 cursor-pointer"
            style={{ border: '1px solid var(--color-border)', color: 'var(--color-text-secondary)' }}>
            Discard changes
          </button>
          <button type="button" onClick={onSave} disabled={saving}
            className="flex-1 sm:flex-none px-5 py-2 rounded-xl text-xs font-bold text-white hover:brightness-110 disabled:opacity-60 cursor-pointer flex items-center justify-center gap-1.5"
            style={{ background: 'var(--color-violet)' }}>
            {saving ? 'Saving…' : <><Icon name="check" size={13} strokeWidth={2.4} /> Save changes</>}
          </button>
        </div>
      </div>
    </div>
  );
}

export function NoticeToast({ notice, onClose }: { notice: Notice; onClose: () => void }) {
  if (!notice) return null;
  const c = notice.tone === 'success' ? 'var(--color-green)' : 'var(--color-rose)';
  return (
    <div role={notice.tone === 'error' ? 'alert' : 'status'}
      className="fixed top-16 md:top-5 right-4 left-4 sm:left-auto z-[60] sm:max-w-sm flex items-start gap-2.5 px-4 py-3 rounded-xl text-xs"
      style={{ background: 'var(--popover-bg, var(--color-elevated))', border: `1px solid color-mix(in srgb, ${c} 45%, transparent)`, boxShadow: 'var(--glass-shadow)', animation: 'slideUp .2s ease-out' }}>
      <span style={{ color: c }} className="mt-0.5"><Icon name={notice.tone === 'success' ? 'check' : 'alert'} size={14} /></span>
      <p className="flex-1" style={{ color: 'var(--color-text-primary)' }}>{notice.text}</p>
      <button type="button" onClick={onClose} aria-label="Dismiss" className="cursor-pointer" style={{ color: 'var(--color-text-muted)' }}>
        <Icon name="x" size={14} />
      </button>
    </div>
  );
}

export function ConfirmDialog({ open, title, body, confirmLabel, onConfirm, onCancel }: {
  open: boolean; title: string; body: React.ReactNode; confirmLabel: string; onConfirm: () => void; onCancel: () => void;
}) {
  const cancelRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    cancelRef.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onCancel(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onCancel]);
  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(4px)' }}
      onMouseDown={(e) => { if (e.target === e.currentTarget) onCancel(); }}>
      <div role="alertdialog" aria-modal="true" aria-labelledby="confirm-title" className="w-full max-w-sm rounded-2xl p-5 flex flex-col gap-3"
        style={{ background: 'var(--color-elevated)', border: '1px solid var(--color-border)', boxShadow: 'var(--glass-shadow)' }}>
        <p id="confirm-title" className="font-bold text-sm">{title}</p>
        <div className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>{body}</div>
        <div className="flex justify-end gap-2 pt-1">
          <button ref={cancelRef} type="button" onClick={onCancel} className="px-4 py-2 rounded-xl text-xs font-semibold cursor-pointer"
            style={{ border: '1px solid var(--color-border)', color: 'var(--color-text-secondary)' }}>Keep editing</button>
          <button type="button" onClick={onConfirm} className="px-4 py-2 rounded-xl text-xs font-bold text-white cursor-pointer"
            style={{ background: 'var(--color-rose)' }}>{confirmLabel}</button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
