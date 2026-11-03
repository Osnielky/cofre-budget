'use client';

import { useMemo, useState } from 'react';
import AccountTypeIcon from '@/components/AccountTypeIcon';
import { accountTypeMeta } from '@/lib/accountTypes';
import {
  accountTypeFromSubtype, cutoverSentence, groupCandidates, summarizeDecisions, untrackedHint,
  type MergeCandidate, type RankedCandidate, type ReviewDecision,
} from '@/lib/plaid/merge-review';

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
  /** Manual account id → its newest entry date; the cutover an account picked by hand defaults to. */
  lastEntryDates?: Record<string, string | null>;
}

interface Props {
  plaidItemId: string;
  institutionName: string;
  plaidAccounts: PreviewAccount[];
  manualAccounts: MergeCandidate[];
  lastEntryDates?: Record<string, string | null>;
  onClose: () => void;
  onDone: (newAccounts: any[]) => void;
}

const money = (n: number, currency = 'USD') =>
  n.toLocaleString('en-US', { style: 'currency', currency, minimumFractionDigits: 2 });

/* Shown after connecting a bank, only when the user has at least one manual account.
   Each Plaid account is a card with one two-way choice — link it to an account the
   user already tracks (keeping that account's id, colour and history) or add it as a
   new one — followed by a picker of candidate accounts (same bank first, the last-4
   match on top) and one plain sentence that says what the cutover date does. The
   footer counts the decisions and names the button after them. */
export default function PlaidMergeReviewModal({
  plaidItemId, institutionName, plaidAccounts, manualAccounts, lastEntryDates = {}, onClose, onDone,
}: Props) {
  const [decisions, setDecisions] = useState<Record<string, ReviewDecision>>(() => {
    const initial: Record<string, ReviewDecision> = {};
    for (const pa of plaidAccounts) {
      initial[pa.plaidAccountId] = pa.suggestedMatch
        ? { action: 'merge', mergeIntoAccountId: pa.suggestedMatch.id, cutoverDate: pa.suggestedMatch.lastTransactionDate ?? '' }
        : { action: 'new', mergeIntoAccountId: '', cutoverDate: '' };
    }
    return initial;
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  function setDecision(plaidAccountId: string, patch: Partial<ReviewDecision>) {
    setDecisions((prev) => ({ ...prev, [plaidAccountId]: { ...prev[plaidAccountId], ...patch } }));
  }

  const summary = useMemo(() => summarizeDecisions(plaidAccounts.map((pa) => decisions[pa.plaidAccountId])), [decisions, plaidAccounts]);

  async function handleConfirm() {
    if (summary.incomplete > 0) return;
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
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4"
      style={{ background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(5px)' }}>

      <div className="w-full sm:max-w-xl flex flex-col rounded-t-2xl sm:rounded-2xl overflow-hidden max-h-[94dvh] sm:max-h-[88vh]"
        style={{ background: 'var(--color-elevated)', border: 'var(--glass-border)', boxShadow: 'var(--glass-shadow)' }}>

        {/* ── Header ── */}
        <div className="flex items-start justify-between gap-3 px-5 sm:px-6 py-4 shrink-0"
          style={{ borderBottom: '1px solid var(--color-border)' }}>
          <div className="min-w-0">
            <p className="font-bold text-sm">{institutionName} is connected</p>
            <p className="text-[12px] mt-0.5" style={{ color: 'var(--color-text-secondary)' }}>
              Plaid found {plaidAccounts.length} account{plaidAccounts.length === 1 ? '' : 's'}. Tell Cofre which ones you already track so nothing shows up twice.
            </p>
          </div>
          <button onClick={onClose} aria-label="Close"
            className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 hover:bg-[var(--color-surface)] transition-colors"
            style={{ color: 'var(--color-text-muted)' }}>✕</button>
        </div>

        {/* ── Body ── */}
        <div className="flex flex-col gap-3 p-4 sm:p-5 overflow-y-auto min-h-0">
          {plaidAccounts.map((pa) => (
            <AccountCard key={pa.plaidAccountId} account={pa} institutionName={institutionName}
              manualAccounts={manualAccounts} lastEntryDates={lastEntryDates} decision={decisions[pa.plaidAccountId]}
              onChange={(patch) => setDecision(pa.plaidAccountId, patch)} />
          ))}
          {error && <p className="text-xs" style={{ color: 'var(--color-rose)' }}>{error}</p>}
        </div>

        {/* ── Footer ── */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-3 px-4 sm:px-5 py-3 sm:py-4 shrink-0"
          style={{ borderTop: '1px solid var(--color-border)' }}>
          <p className="text-[12px] tabular-nums min-w-0 truncate" style={{ color: summary.incomplete ? 'var(--color-amber)' : 'var(--color-text-secondary)' }}>
            {summary.summary}
          </p>
          <div className="flex items-center justify-end gap-2 shrink-0">
            <button onClick={onClose} disabled={submitting}
              className="px-4 py-2 text-sm font-medium rounded-xl hover:bg-[var(--color-surface)] transition-colors disabled:opacity-40"
              style={{ color: 'var(--color-text-secondary)', border: '1px solid var(--color-border)' }}>
              Cancel
            </button>
            <button onClick={handleConfirm} disabled={submitting || summary.incomplete > 0}
              className="px-5 py-2 text-sm font-semibold text-white rounded-xl hover:brightness-110 disabled:opacity-40 transition-all"
              style={{ background: 'var(--color-card-green)' }}>
              {submitting ? 'Connecting…' : summary.button}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── One Plaid account ─────────────────────────────────────────────────── */

function AccountCard({ account: pa, institutionName, manualAccounts, lastEntryDates, decision: d, onChange }: {
  account: PreviewAccount;
  institutionName: string;
  manualAccounts: MergeCandidate[];
  lastEntryDates: Record<string, string | null>;
  decision: ReviewDecision;
  onChange: (patch: Partial<ReviewDecision>) => void;
}) {
  /* Picking an account also sets its cutover to that account's newest entry: without
     a cutover the initial sync runs no duplicate check against the rows already there. */
  const pick = (id: string) => onChange({ action: 'merge', mergeIntoAccountId: id, cutoverDate: lastEntryDates[id] ?? '' });
  const type = accountTypeFromSubtype(pa.subtype);
  const meta = accountTypeMeta(type);
  const { sameBank, otherBanks } = useMemo(() => groupCandidates(manualAccounts, institutionName, pa.mask), [manualAccounts, institutionName, pa.mask]);
  const [showOthers, setShowOthers] = useState(() => !!d.mergeIntoAccountId && otherBanks.some((a) => a.id === d.mergeIntoAccountId));
  const [editDate, setEditDate] = useState(false);
  const chosen = [...sameBank, ...otherBanks].find((a) => a.id === d.mergeIntoAccountId) ?? null;
  const hint = untrackedHint(sameBank, type);
  const hasCandidates = manualAccounts.length > 0;

  return (
    <div className="flex flex-col gap-3 p-3.5 sm:p-4 rounded-xl"
      style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>

      {/* What Plaid found */}
      <div className="flex items-center gap-3">
        <span className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
          style={{ background: `color-mix(in srgb, ${meta.accent} 16%, transparent)`, color: meta.accent }}>
          <AccountTypeIcon type={type} size={18} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold truncate">{pa.name}</p>
          <p className="text-[11px] truncate" style={{ color: 'var(--color-text-muted)' }}>
            {meta.label}{pa.mask ? ` ···${pa.mask}` : ''}
          </p>
        </div>
        <p className="text-sm font-bold tabular-nums shrink-0">{money(pa.balance, pa.currency)}</p>
      </div>

      {/* The decision */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2" role="radiogroup" aria-label={`What to do with ${pa.name}`}>
        <ChoiceTile selected={d.action === 'merge'} disabled={!hasCandidates}
          title="Link to an account I have"
          caption={pa.suggestedMatch ? 'Recommended · same last 4' : hasCandidates ? 'Keeps its name and history' : 'No manual accounts yet'}
          onSelect={() => {
            const id = d.mergeIntoAccountId || pa.suggestedMatch?.id || '';
            if (id) pick(id); else onChange({ action: 'merge', mergeIntoAccountId: '' });
          }} />
        <ChoiceTile selected={d.action === 'new'}
          title="Add as a new account"
          caption="Shows up next to the ones you have"
          onSelect={() => onChange({ action: 'new' })} />
      </div>

      {d.action === 'merge' && (
        <div className="flex flex-col gap-2">
          <div className="flex flex-col rounded-xl overflow-hidden" style={{ border: '1px solid var(--color-border)' }}>
            {sameBank.length === 0 && (
              <p className="px-3 py-2 text-[11px]" style={{ color: 'var(--color-text-muted)' }}>
                None of your manual accounts is at {institutionName}. Pick one from another bank below if you named it differently.
              </p>
            )}
            {sameBank.map((a) => (
              <CandidateRow key={a.id} candidate={a} selected={a.id === d.mergeIntoAccountId} onSelect={() => pick(a.id)} />
            ))}
            {otherBanks.length > 0 && (
              <button type="button" onClick={() => setShowOthers((v) => !v)}
                className="flex items-center justify-between px-3 py-2 text-[11px] font-medium text-left hover:bg-[var(--color-elevated)] transition-colors"
                style={{ color: 'var(--color-text-secondary)', borderTop: sameBank.length ? '1px solid var(--color-border)' : undefined }}>
                <span>Other banks ({otherBanks.length})</span>
                <span aria-hidden="true">{showOthers ? '▴' : '▾'}</span>
              </button>
            )}
            {showOthers && otherBanks.map((a) => (
              <CandidateRow key={a.id} candidate={a} selected={a.id === d.mergeIntoAccountId} showBank onSelect={() => pick(a.id)} />
            ))}
          </div>

          {chosen ? (
            <div className="flex flex-col gap-1.5">
              <p className="text-[12px] leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>
                {cutoverSentence(chosen.accountName, d.cutoverDate)}{' '}
                {!editDate && (
                  <button type="button" onClick={() => setEditDate(true)} className="font-semibold underline-offset-2 hover:underline"
                    style={{ color: 'var(--color-primary)' }}>
                    {d.cutoverDate ? 'Change date' : 'Set a date'}
                  </button>
                )}
              </p>
              {editDate && (
                <label className="flex items-center gap-2 text-[11px]" style={{ color: 'var(--color-text-muted)' }}>
                  <span className="shrink-0">Import from</span>
                  <input type="date" value={d.cutoverDate} onChange={(e) => onChange({ cutoverDate: e.target.value })}
                    className="px-3 py-1.5 text-sm outline-none rounded-lg flex-1 min-w-0"
                    style={{ background: 'var(--color-elevated)', border: '1px solid var(--color-border)', color: 'var(--color-text-primary)', colorScheme: 'dark' }} />
                  {d.cutoverDate && (
                    <button type="button" onClick={() => onChange({ cutoverDate: '' })} className="shrink-0 hover:underline"
                      style={{ color: 'var(--color-text-secondary)' }}>Import all</button>
                  )}
                </label>
              )}
            </div>
          ) : (
            <p className="text-[12px]" style={{ color: 'var(--color-amber)' }}>Pick the account this one is.</p>
          )}
        </div>
      )}

      {d.action === 'new' && hint && (
        <p className="text-[12px] leading-relaxed px-3 py-2 rounded-lg"
          style={{ color: 'var(--color-amber)', background: 'color-mix(in srgb, var(--color-amber) 10%, transparent)' }}>
          {hint}
        </p>
      )}
    </div>
  );
}

function ChoiceTile({ selected, disabled, title, caption, onSelect }: {
  selected: boolean; disabled?: boolean; title: string; caption: string; onSelect: () => void;
}) {
  return (
    <button type="button" role="radio" aria-checked={selected} disabled={disabled} onClick={onSelect}
      className="flex flex-col items-start gap-0.5 px-3 py-2.5 rounded-xl text-left transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
      style={{
        background: selected ? 'color-mix(in srgb, var(--color-primary) 14%, transparent)' : 'var(--color-elevated)',
        border: `1px solid ${selected ? 'var(--color-primary)' : 'var(--color-border)'}`,
      }}>
      <span className="flex items-center gap-2 text-[13px] font-semibold" style={{ color: selected ? 'var(--color-primary)' : 'var(--color-text-primary)' }}>
        <span aria-hidden="true" className="w-3.5 h-3.5 rounded-full shrink-0 flex items-center justify-center"
          style={{ border: `1.5px solid ${selected ? 'var(--color-primary)' : 'var(--color-text-muted)'}` }}>
          {selected && <span className="w-1.5 h-1.5 rounded-full" style={{ background: 'var(--color-primary)' }} />}
        </span>
        {title}
      </span>
      <span className="text-[11px] pl-[22px]" style={{ color: 'var(--color-text-muted)' }}>{caption}</span>
    </button>
  );
}

function CandidateRow({ candidate: a, selected, showBank, onSelect }: {
  candidate: RankedCandidate; selected: boolean; showBank?: boolean; onSelect: () => void;
}) {
  const meta = accountTypeMeta(a.accountType);
  return (
    <button type="button" role="radio" aria-checked={selected} onClick={onSelect}
      className="flex items-center gap-3 px-3 py-2 text-left transition-colors hover:bg-[var(--color-elevated)]"
      style={{ background: selected ? 'color-mix(in srgb, var(--color-primary) 10%, transparent)' : undefined, borderTop: '1px solid var(--color-border)', marginTop: -1 }}>
      <span aria-hidden="true" className="w-3.5 h-3.5 rounded-full shrink-0 flex items-center justify-center"
        style={{ border: `1.5px solid ${selected ? 'var(--color-primary)' : 'var(--color-text-muted)'}` }}>
        {selected && <span className="w-1.5 h-1.5 rounded-full" style={{ background: 'var(--color-primary)' }} />}
      </span>
      <span className="w-1 self-stretch rounded-full shrink-0" style={{ background: meta.accent }} />
      <span className="min-w-0 flex-1">
        <span className="block text-[13px] font-medium truncate">{a.accountName}</span>
        <span className="block text-[11px] truncate" style={{ color: 'var(--color-text-muted)' }}>
          {showBank ? `${a.bankName} · ` : ''}{meta.label}{a.last4 ? ` ···${a.last4}` : ''}
        </span>
      </span>
      {a.sameLast4 && (
        <span className="hidden sm:inline text-[10px] font-semibold px-1.5 py-0.5 rounded-md shrink-0"
          style={{ background: 'color-mix(in srgb, var(--color-green) 16%, transparent)', color: 'var(--color-green)' }}>
          same last 4
        </span>
      )}
      {/* The accounts list serves numeric columns as strings. */}
      <span className="text-[13px] font-semibold tabular-nums shrink-0">{money(Number(a.balance))}</span>
    </button>
  );
}
