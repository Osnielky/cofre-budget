'use client';

import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import AccountTypeIcon from './AccountTypeIcon';
import LinkIcon from './LinkIcon';
import InfoIcon from './InfoIcon';
import { accountTypeLabel } from '@/lib/accountTypes';
import {
  amountOf, describeMatch, orientSides, searchCandidates, type LinkTx,
} from '@/lib/transactions/transferLink';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3333/api';

interface Account {
  id: string; bankName: string; accountName: string; accountType: string;
  color: string; last4?: string | null;
}

export interface TransferTx extends LinkTx {
  bankAccount: Account | null;
}

interface Props {
  tx: TransferTx;
  /** Server-suggested counterparts: same amount, opposite direction, within five days. */
  matches: TransferTx[];
  matchesLoading: boolean;
  accounts: Account[];
  onClose: () => void;
  /** Commits the link. `matchTxId` is null when linking to a bare account. */
  onLink: (accountId: string | null, matchTxId: string | null, note: string) => Promise<void>;
}

type Tab = 'suggested' | 'find' | 'cash';

/** How far either side of the transaction the "Find a transaction" tab looks. */
const SEARCH_WINDOW_DAYS = 90;

function shiftDate(date: string, days: number): string {
  const d = new Date(`${date}T12:00:00`);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function money(n: number): string {
  return `${n < 0 ? '−' : '+'}$${Math.abs(n).toFixed(2)}`;
}

function prettyDate(date: string): string {
  return new Date(`${date}T12:00:00`).toLocaleDateString(undefined, {
    month: 'short', day: 'numeric', year: 'numeric',
  });
}


/**
 * One side of the pair. Hoisted to module scope: a component declared inside
 * another component is a new type on every render, so React would unmount and
 * remount this subtree each time anything in the modal changed.
 */
function Panel({ side, tx: panelTx, account, currentTxId, onChange }: {
  side: 'from' | 'to';
  tx: TransferTx | null;
  account: Account | null;
  currentTxId: string;
  onChange: () => void;
}) {
  const isFrom = side === 'from';
  const isCurrent = panelTx?.id === currentTxId;
  const acct = panelTx?.bankAccount ?? account;
  const amt = panelTx ? amountOf(panelTx) : null;

  return (
    <div className="flex-1 min-w-0 p-4 rounded-2xl"
      style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
      <div className="flex items-start justify-between gap-2 mb-3">
        <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--color-text-muted)' }}>
          {isFrom ? 'From · Sending account' : 'To · Receiving account'}
        </p>
        {panelTx && (
          <span className="text-[9px] font-bold px-2 py-0.5 rounded-full shrink-0"
            style={isCurrent
              ? { background: 'color-mix(in srgb, var(--color-sky) 18%, transparent)', color: 'var(--color-sky)' }
              : { background: 'color-mix(in srgb, var(--color-violet) 22%, transparent)', color: 'var(--color-violet)' }}>
            {isCurrent ? 'Current transaction' : 'Suggested'}
          </span>
        )}
      </div>

      {!panelTx && !account ? (
        <p className="text-xs py-8 text-center" style={{ color: 'var(--color-text-muted)' }}>
          Choose the {isFrom ? 'source' : 'destination'} below.
        </p>
      ) : (
        <>
          <div className="flex items-center gap-3 mb-3">
            <span className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0"
              style={{ background: 'var(--color-elevated)', border: '1px solid var(--color-border)' }}>
              <AccountTypeIcon type={acct?.accountType ?? ''} size={20} />
            </span>
            <div className="min-w-0">
              <p className="text-base font-bold truncate" style={{ color: 'var(--color-text-primary)' }}>
                {acct?.bankName ?? 'Account'}
              </p>
              <p className="text-xs truncate" style={{ color: 'var(--color-text-muted)' }}>
                {accountTypeLabel(acct?.accountType ?? '')}
                {acct?.last4 ? ` ••${acct.last4}` : ''}
              </p>
            </div>
          </div>

          {amt !== null && (
            <>
              <p className="text-3xl font-black tabular-nums leading-tight"
                style={{ color: amt < 0 ? 'var(--color-rose)' : 'var(--color-green)' }}>
                {money(amt)}
              </p>
              <p className="text-xs mb-3" style={{ color: 'var(--color-text-muted)' }}>
                {amt < 0 ? 'Outgoing transaction' : 'Incoming transaction'}
              </p>
            </>
          )}

          {panelTx && (
            <div className="flex flex-col gap-2.5 pt-3" style={{ borderTop: '1px solid var(--color-border)' }}>
              <div>
                <p className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>Posted date</p>
                <p className="text-xs font-semibold" style={{ color: 'var(--color-text-primary)' }}>{prettyDate(panelTx.date)}</p>
              </div>
              <div className="min-w-0">
                <p className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>Description</p>
                <p className="text-xs font-semibold break-words" style={{ color: 'var(--color-text-primary)' }}>{panelTx.name}</p>
              </div>
            </div>
          )}

          {panelTx && !isCurrent && (
            <button type="button" onClick={onChange}
              className="w-full flex items-center justify-center gap-2 mt-3 py-2 rounded-xl text-xs font-semibold transition-colors hover:bg-[var(--color-elevated)]"
              style={{ border: '1px solid var(--color-border)', color: 'var(--color-text-secondary)' }}>
              Change {isFrom ? 'source' : 'destination'} transaction
            </button>
          )}
        </>
      )}
    </div>
  );
}

/** A selectable row in the find / cash lists. */
function Row({ selected, onClick, icon, title, subtitle, trailing }: {
  selected: boolean; onClick: () => void; icon: React.ReactNode;
  title: string; subtitle: string; trailing?: React.ReactNode;
}) {
  return (
    <button type="button" onClick={onClick}
      className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all text-left"
      style={{
        background: selected ? 'color-mix(in srgb, var(--color-violet) 16%, transparent)' : 'var(--color-surface)',
        border: `1px solid ${selected ? 'var(--color-violet)' : 'var(--color-border)'}`,
      }}>
      <span className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
        style={{ background: 'var(--color-elevated)' }}>{icon}</span>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-semibold truncate" style={{ color: selected ? 'var(--color-violet)' : 'var(--color-text-primary)' }}>{title}</p>
        <p className="text-[10px] truncate" style={{ color: 'var(--color-text-muted)' }}>{subtitle}</p>
      </div>
      {trailing}
    </button>
  );
}

export default function LinkTransferModal({
  tx, matches, matchesLoading, accounts, onClose, onLink,
}: Props) {
  const [tab, setTab] = useState<Tab>('suggested');
  const [chosenTx, setChosenTx] = useState<TransferTx | null>(null);
  const [chosenAccountId, setChosenAccountId] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [infoOpen, setInfoOpen] = useState(false);
  const [linking, setLinking] = useState(false);
  const [error, setError] = useState('');

  /* "Find a transaction" pool, fetched once the tab is first opened. Searching
     only what the page happens to have loaded would silently miss anything
     outside the period being viewed, which reads as a broken search. */
  const [pool, setPool] = useState<TransferTx[] | null>(null);
  const [poolLoading, setPoolLoading] = useState(false);
  const [query, setQuery] = useState('');

  useEffect(() => {
    if (tab !== 'find' || pool !== null || poolLoading) return;
    setPoolLoading(true);
    const from = shiftDate(tx.date, -SEARCH_WINDOW_DAYS);
    const to   = shiftDate(tx.date, SEARCH_WINDOW_DAYS);
    fetch(`${API}/transactions?from=${from}&to=${to}&limit=500`, { credentials: 'include' })
      .then((r) => r.json())
      .then((rows) => setPool(Array.isArray(rows) ? rows : []))
      .catch(() => setPool([]))
      .finally(() => setPoolLoading(false));
  }, [tab, pool, poolLoading, tx.date]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose(); }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  /* The suggested match is pre-selected, so the common case is one click. */
  useEffect(() => {
    if (tab === 'suggested' && !chosenTx && !chosenAccountId && matches.length > 0) {
      setChosenTx(matches[0]);
    }
  }, [tab, chosenTx, chosenAccountId, matches]);

  const cashAccounts = useMemo(
    () => accounts.filter((a) => a.accountType === 'cash' && a.id !== tx.bankAccountId),
    [accounts, tx.bankAccountId],
  );

  const results = useMemo(
    () => (pool ? searchCandidates(tx, pool, query) as TransferTx[] : []),
    [pool, tx, query],
  );

  const chosenAccount = chosenAccountId ? accounts.find((a) => a.id === chosenAccountId) ?? null : null;
  const { from, to } = orientSides(tx, chosenTx);
  const srcIsOutgoing = amountOf(tx) < 0;
  const hasSelection = !!chosenTx || !!chosenAccountId;

  function choose(t: TransferTx) {
    setChosenAccountId(null);
    setChosenTx((prev) => (prev?.id === t.id ? null : t));
  }

  async function submit() {
    if (!hasSelection || linking) return;
    setLinking(true);
    setError('');
    try {
      const accountId = chosenTx ? chosenTx.bankAccountId : chosenAccountId;
      await onLink(accountId, chosenTx?.id ?? null, note.trim());
    } catch {
      setError('Could not link these transactions. Nothing was changed.');
      setLinking(false);
    }
  }

  const TABS: { id: Tab; label: string }[] = [
    { id: 'suggested', label: 'Suggested match' },
    { id: 'find', label: 'Find a transaction' },
    { id: 'cash', label: 'From My Cash' },
  ];

  return createPortal(
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 overflow-y-auto"
      style={{ background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(6px)' }}
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div role="dialog" aria-modal="true" aria-label="Link a transfer"
        className="w-full max-w-4xl my-auto flex flex-col rounded-2xl overflow-hidden"
        style={{ background: 'var(--color-elevated)', border: 'var(--glass-border)', boxShadow: 'var(--glass-shadow)' }}>

        {/* Header */}
        <div className="flex items-start gap-4 px-5 sm:px-6 py-5">
          <span className="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0"
            style={{ background: 'color-mix(in srgb, var(--color-violet) 20%, transparent)', color: 'var(--color-violet)' }}>
            <LinkIcon size={22} />
          </span>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <h2 className="text-2xl font-black leading-tight" style={{ color: 'var(--color-text-primary)' }}>Link a transfer</h2>
              <button type="button" onClick={() => setInfoOpen((v) => !v)} aria-label="What is this for?"
                className="w-4 h-4 rounded-full flex items-center justify-center shrink-0 hover:opacity-75"
                style={{ color: infoOpen ? 'var(--color-violet)' : 'var(--color-text-muted)' }}>
                <InfoIcon size={14} />
              </button>
            </div>
            <p className="text-sm mt-0.5" style={{ color: 'var(--color-text-muted)' }}>
              See where the money came from and where it arrived.
            </p>
          </div>
          <button onClick={onClose} aria-label="Close"
            className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 hover:bg-[var(--color-surface)]"
            style={{ color: 'var(--color-text-muted)' }}>✕</button>
        </div>

        <div className="px-5 sm:px-6 pb-5 flex flex-col gap-4">
          {infoOpen && (
            <p className="text-[11px] leading-snug p-3 rounded-xl"
              style={{ background: 'color-mix(in srgb, var(--color-violet) 10%, transparent)', color: 'var(--color-text-secondary)' }}>
              A transfer is money moving between your own accounts — like paying a credit card from checking.
              Linking both sides keeps your budget accurate by keeping transfers out of your income and spending totals.
            </p>
          )}

          {/* Reassurance */}
          <div className="flex items-center gap-3 px-4 py-3 rounded-xl"
            style={{ background: 'color-mix(in srgb, var(--color-sky) 10%, transparent)', border: '1px solid color-mix(in srgb, var(--color-sky) 25%, transparent)' }}>
            <span className="shrink-0" style={{ color: 'var(--color-sky)' }}><InfoIcon size={16} /></span>
            <p className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>
              Connects your transaction records. No money will be moved.
            </p>
          </div>

          {/* Tabs */}
          <div role="tablist" className="grid grid-cols-1 sm:grid-cols-3 gap-1 p-1 rounded-xl"
            style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
            {TABS.map((t) => (
              <button key={t.id} role="tab" aria-selected={tab === t.id} type="button"
                onClick={() => setTab(t.id)}
                className="py-2.5 rounded-lg text-sm font-semibold transition-all"
                style={tab === t.id
                  ? { background: 'var(--color-violet)', color: '#fff' }
                  : { color: 'var(--color-text-secondary)' }}>
                {t.label}
              </button>
            ))}
          </div>

          {/* The pair */}
          <div className="relative flex flex-col md:flex-row gap-3 md:gap-6 items-stretch">
            <Panel side="from" tx={from as TransferTx | null} account={!from && !srcIsOutgoing ? chosenAccount : null}
              currentTxId={tx.id} onChange={() => setTab('find')} />
            <div className="flex md:absolute md:inset-y-0 md:left-1/2 md:-translate-x-1/2 items-center justify-center z-10">
              <span className="w-10 h-10 rounded-full flex items-center justify-center shrink-0 rotate-90 md:rotate-0"
                style={{ background: 'var(--color-elevated)', border: '1.5px solid var(--color-violet)', color: 'var(--color-violet)' }}>
                →
              </span>
            </div>
            <Panel side="to" tx={to as TransferTx | null} account={!to && srcIsOutgoing ? chosenAccount : null}
              currentTxId={tx.id} onChange={() => setTab('find')} />
          </div>

          {/* Tab body */}
          {tab === 'suggested' && (
            <div>
              {matchesLoading ? (
                <p className="text-xs py-4 text-center" style={{ color: 'var(--color-text-muted)' }}>Searching for matches…</p>
              ) : matches.length === 0 ? (
                <p className="text-xs py-4 text-center" style={{ color: 'var(--color-text-muted)' }}>
                  No transaction with the same amount and the opposite direction turned up within five days.
                  Try <button type="button" onClick={() => setTab('find')} className="underline" style={{ color: 'var(--color-violet)' }}>finding it yourself</button>.
                </p>
              ) : (
                <div className="flex flex-col gap-1.5">
                  {matches.map((m) => {
                    const { label } = describeMatch(tx, m);
                    return (
                      <Row key={m.id} selected={chosenTx?.id === m.id} onClick={() => choose(m)}
                        icon={<AccountTypeIcon type={m.bankAccount?.accountType ?? ''} size={15} />}
                        title={m.name}
                        subtitle={`${m.bankAccount?.accountName ?? 'Account'} · ${label}`}
                        trailing={
                          <span className="text-xs font-bold tabular-nums shrink-0"
                            style={{ color: amountOf(m) < 0 ? 'var(--color-rose)' : 'var(--color-green)' }}>
                            {money(amountOf(m))}
                          </span>
                        } />
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {tab === 'find' && (
            <div className="flex flex-col gap-2">
              <input
                autoFocus value={query} onChange={(e) => setQuery(e.target.value)}
                placeholder="Search transactions by name…"
                className="w-full px-3 py-2.5 text-sm outline-none rounded-xl"
                style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', color: 'var(--color-text-primary)' }}
              />
              <p className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>
                Looking within {SEARCH_WINDOW_DAYS} days either side of {prettyDate(tx.date)}. Transactions already
                linked to another transfer are not shown.
              </p>
              <div className="flex flex-col gap-1.5 max-h-64 overflow-y-auto">
                {poolLoading && <p className="text-xs py-4 text-center" style={{ color: 'var(--color-text-muted)' }}>Loading transactions…</p>}
                {!poolLoading && results.length === 0 && (
                  <p className="text-xs py-4 text-center" style={{ color: 'var(--color-text-muted)' }}>
                    Nothing here matches. A transfer needs a transaction in another account going the opposite way.
                  </p>
                )}
                {results.map((m) => (
                  <Row key={m.id} selected={chosenTx?.id === m.id} onClick={() => choose(m)}
                    icon={<AccountTypeIcon type={m.bankAccount?.accountType ?? ''} size={15} />}
                    title={m.name}
                    subtitle={`${m.bankAccount?.accountName ?? 'Account'} · ${prettyDate(m.date)}`}
                    trailing={
                      <span className="text-xs font-bold tabular-nums shrink-0"
                        style={{ color: amountOf(m) < 0 ? 'var(--color-rose)' : 'var(--color-green)' }}>
                        {money(amountOf(m))}
                      </span>
                    } />
                ))}
              </div>
            </div>
          )}

          {tab === 'cash' && (
            <div className="flex flex-col gap-2">
              <p className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>
                Cash rarely leaves a second record, so this links the transfer to the account itself
                rather than pairing it with another transaction.
              </p>
              {cashAccounts.length === 0 ? (
                <p className="text-xs py-4 text-center" style={{ color: 'var(--color-text-muted)' }}>
                  You have no cash accounts yet. Add one in Accounts to use this.
                </p>
              ) : cashAccounts.map((a) => (
                <Row key={a.id} selected={chosenAccountId === a.id}
                  onClick={() => { setChosenTx(null); setChosenAccountId((p) => (p === a.id ? null : a.id)); }}
                  icon={<AccountTypeIcon type={a.accountType} size={15} />}
                  title={a.accountName} subtitle={a.bankName} />
              ))}
            </div>
          )}

          {/* Note */}
          <div>
            <label htmlFor="transfer-note" className="text-sm font-bold" style={{ color: 'var(--color-text-primary)' }}>
              Transfer note <span className="font-normal text-xs" style={{ color: 'var(--color-text-muted)' }}>Optional</span>
            </label>
            <input id="transfer-note" value={note} onChange={(e) => setNote(e.target.value)}
              placeholder="Add a note to help you recognize this transfer"
              maxLength={500}
              className="w-full mt-1.5 px-3 py-2.5 text-sm outline-none rounded-xl"
              style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', color: 'var(--color-text-primary)' }} />
          </div>

          {/* Outcome */}
          <div className="flex items-center gap-3 px-4 py-3 rounded-xl"
            style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
            <span className="w-9 h-9 rounded-full flex items-center justify-center shrink-0"
              style={{ background: 'color-mix(in srgb, var(--color-violet) 20%, transparent)', color: 'var(--color-violet)' }}>
              <LinkIcon size={15} />
            </span>
            <div className="min-w-0">
              <p className="text-xs font-bold" style={{ color: 'var(--color-text-primary)' }}>Keep both records connected</p>
              <p className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>Open either transaction to see its linked record.</p>
            </div>
          </div>

          {error && <p className="text-xs" style={{ color: 'var(--color-rose)' }}>{error}</p>}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-3 px-5 sm:px-6 py-4"
          style={{ borderTop: '1px solid var(--color-border)' }}>
          <button onClick={onClose}
            className="px-5 py-2.5 text-sm font-medium rounded-xl hover:bg-[var(--color-surface)] transition-colors"
            style={{ color: 'var(--color-text-secondary)', border: '1px solid var(--color-border)' }}>Cancel</button>
          <button disabled={!hasSelection || linking} onClick={submit}
            className="flex items-center gap-2 px-6 py-2.5 text-sm font-bold text-white rounded-xl hover:brightness-110 disabled:opacity-40 transition-all"
            style={{ background: hasSelection ? 'var(--color-violet)' : '#6B6B8A' }}>
            <LinkIcon size={15} color="#fff" />
            {linking ? 'Linking…' : hasSelection ? 'Link transactions' : 'Choose a transaction'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
