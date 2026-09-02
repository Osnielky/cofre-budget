'use client';

import { useState } from 'react';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3333/api';

interface SuggestedMatch {
  id: string;
  accountName: string;
  lastTransactionDate: string | null;
}

export interface PreviewAccount {
  plaidAccountId: string;
  name: string;
  mask: string | null;
  subtype: string;
  balance: number;
  currency: string;
  suggestedMatch: SuggestedMatch | null;
}

export interface PreviewExchangeResult {
  plaidItemId: string;
  institutionName: string;
  hasManualAccounts: boolean;
  accounts: PreviewAccount[];
}

interface ManualAccount {
  id: string;
  bankName: string;
  accountName: string;
}

interface Decision {
  action: 'new' | 'merge';
  mergeIntoAccountId: string;
  cutoverDate: string;
}

interface Props {
  plaidItemId: string;
  institutionName: string;
  plaidAccounts: PreviewAccount[];
  manualAccounts: ManualAccount[];
  onClose: () => void;
  onDone: (newAccounts: any[]) => void;
}

/* Shown after connecting a bank, only when the user has at least one manual account —
   lets them upgrade an existing manual "Bank of America Checking" in place instead of
   ending up with a duplicate card once the same account is also Plaid-connected. */
export default function PlaidMergeReviewModal({
  plaidItemId, institutionName, plaidAccounts, manualAccounts, onClose, onDone,
}: Props) {
  const [decisions, setDecisions] = useState<Record<string, Decision>>(() => {
    const initial: Record<string, Decision> = {};
    for (const pa of plaidAccounts) {
      initial[pa.plaidAccountId] = pa.suggestedMatch
        ? { action: 'merge', mergeIntoAccountId: pa.suggestedMatch.id, cutoverDate: pa.suggestedMatch.lastTransactionDate ?? '' }
        : { action: 'new', mergeIntoAccountId: '', cutoverDate: '' };
    }
    return initial;
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  function setDecision(plaidAccountId: string, patch: Partial<Decision>) {
    setDecisions((prev) => ({ ...prev, [plaidAccountId]: { ...prev[plaidAccountId], ...patch } }));
  }

  async function handleConfirm() {
    setSubmitting(true); setError('');
    try {
      const res = await fetch(`${API}/plaid/exchange/confirm`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify({
          plaid_item_id: plaidItemId,
          decisions: plaidAccounts.map((pa) => {
            const d = decisions[pa.plaidAccountId];
            return d.action === 'merge'
              ? { plaidAccountId: pa.plaidAccountId, action: 'merge', mergeIntoAccountId: d.mergeIntoAccountId, cutoverDate: d.cutoverDate || undefined }
              : { plaidAccountId: pa.plaidAccountId, action: 'new' };
          }),
        }),
      });
      if (!res.ok) throw new Error();
      onDone(await res.json());
    } catch {
      setError('Could not finish connecting your bank. Please try again.');
    } finally { setSubmitting(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(5px)' }}>

      <div className="w-full max-w-lg flex flex-col rounded-2xl overflow-hidden"
        style={{ background: 'var(--color-elevated)', border: 'var(--glass-border)', boxShadow: 'var(--glass-shadow)' }}>

        {/* ── Header ── */}
        <div className="flex items-center justify-between px-6 py-4"
          style={{ borderBottom: '1px solid var(--color-border)' }}>
          <div>
            <p className="font-bold text-sm">Review {institutionName} accounts</p>
            <p className="text-[11px] mt-0.5" style={{ color: 'var(--color-text-muted)' }}>
              Match to an existing manual account, or create a new one
            </p>
          </div>
          <button onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-[var(--color-elevated)] transition-colors"
            style={{ color: 'var(--color-text-muted)' }}>✕</button>
        </div>

        {/* ── Body ── */}
        <div className="flex flex-col gap-4 p-5 overflow-y-auto max-h-[65vh]">
          {plaidAccounts.map((pa) => {
            const d = decisions[pa.plaidAccountId];
            return (
              <div key={pa.plaidAccountId} className="flex flex-col gap-2.5 p-4 rounded-xl"
                style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold truncate">{pa.name}</p>
                    <p className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>
                      {pa.mask ? `···${pa.mask}` : pa.subtype} · {pa.currency} {pa.balance.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                    </p>
                  </div>
                  {pa.suggestedMatch && (
                    <span className="text-[10px] font-semibold px-2 py-1 rounded-md shrink-0"
                      style={{ background: 'color-mix(in srgb, var(--color-primary) 14%, transparent)', color: 'var(--color-primary)' }}>
                      Match found
                    </span>
                  )}
                </div>

                <select value={d.action === 'merge' ? d.mergeIntoAccountId : 'new'}
                  onChange={(e) => {
                    if (e.target.value === 'new') setDecision(pa.plaidAccountId, { action: 'new', mergeIntoAccountId: '' });
                    else setDecision(pa.plaidAccountId, { action: 'merge', mergeIntoAccountId: e.target.value });
                  }}
                  className="px-3 py-2 text-sm outline-none appearance-none w-full rounded-xl"
                  style={{ background: 'var(--color-elevated)', border: '1px solid var(--color-border)', color: 'var(--color-text-primary)' }}>
                  <option value="new">Create new account</option>
                  {manualAccounts.map((m) => (
                    <option key={m.id} value={m.id}>Merge into: {m.bankName} — {m.accountName}</option>
                  ))}
                </select>

                {d.action === 'merge' && (
                  <div className="flex flex-col gap-1">
                    <span className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>
                      Import Plaid transactions from this date forward (based on your last manual entry for this account)
                    </span>
                    <input type="date" value={d.cutoverDate}
                      onChange={(e) => setDecision(pa.plaidAccountId, { cutoverDate: e.target.value })}
                      className="px-3 py-2 text-sm outline-none rounded-xl w-full"
                      style={{ background: 'var(--color-elevated)', border: '1px solid var(--color-border)', color: 'var(--color-text-primary)', colorScheme: 'dark' }} />
                  </div>
                )}
              </div>
            );
          })}

          {error && <p className="text-xs" style={{ color: 'var(--color-rose)' }}>{error}</p>}
        </div>

        {/* ── Footer ── */}
        <div className="flex items-center justify-end gap-2 px-5 py-4"
          style={{ borderTop: '1px solid var(--color-border)' }}>
          <button onClick={onClose} disabled={submitting}
            className="px-4 py-2 text-sm font-medium rounded-xl hover:bg-[var(--color-elevated)] transition-colors disabled:opacity-40"
            style={{ color: 'var(--color-text-secondary)', border: '1px solid var(--color-border)' }}>
            Cancel
          </button>
          <button onClick={handleConfirm} disabled={submitting}
            className="px-5 py-2 text-sm font-semibold text-white rounded-xl hover:brightness-110 disabled:opacity-40 transition-all"
            style={{ background: 'var(--color-card-green)' }}>
            {submitting ? 'Connecting…' : 'Confirm'}
          </button>
        </div>
      </div>
    </div>
  );
}
