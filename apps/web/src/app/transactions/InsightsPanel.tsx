'use client';

import { useState, useEffect } from 'react';
import { RecurringInfo, normalize } from './recurring';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3333/api';

interface Category { id: string; name: string; icon: string; color: string; type: string }
interface BankAccount { id: string; bankName: string; accountName: string; accountType: string; color: string }
interface Transaction {
  id: string; name: string; amount: number; date: string; source: string;
  categoryId: string | null; categoryRef: Category | null;
  bankAccountId: string; bankAccount: BankAccount | null;
  note: string | null;
}

export type SubStatus = 'active' | 'to-cancel' | 'cancelled';
export type SubscriptionStore = Record<string, { note: string; status: SubStatus }>;

interface InsightsPanelProps {
  selectedTx: Transaction | null;
  onClose: () => void;
  transactions: Transaction[];
  recurringMap: Map<string, RecurringInfo>;
  subscriptions: SubscriptionStore;
  onSubscriptionChange: (next: SubscriptionStore) => void;
  onNoteUpdate: (txId: string, note: string | null) => void;
}

export function InsightsPanel({
  selectedTx, onClose, transactions, recurringMap,
  subscriptions, onSubscriptionChange, onNoteUpdate,
}: InsightsPanelProps) {
  return (
    <>
      {/* Header */}
      <div className="px-4 py-4 border-b shrink-0 flex items-center justify-between gap-2"
        style={{ borderColor: 'var(--color-border)', background: 'rgba(35,35,47,0.5)', backdropFilter: 'var(--glass-blur)', WebkitBackdropFilter: 'var(--glass-blur)' }}>
        <p className="text-[10px] font-bold tracking-widest uppercase" style={{ color: 'var(--color-text-muted)' }}>
          Insights
        </p>
        {selectedTx && (
          <button onClick={onClose}
            className="w-7 h-7 rounded-lg flex items-center justify-center transition-colors"
            style={{ background: 'var(--color-elevated)', color: 'var(--color-text-muted)' }}>
            <XIcon />
          </button>
        )}
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-3 py-3">
        {selectedTx ? (
          <TransactionDetailView
            tx={selectedTx}
            recurringMap={recurringMap}
            subscriptions={subscriptions}
            onSubscriptionChange={onSubscriptionChange}
            onNoteUpdate={onNoteUpdate}
          />
        ) : (
          <DigestView
            transactions={transactions}
            recurringMap={recurringMap}
            subscriptions={subscriptions}
            onSubscriptionChange={onSubscriptionChange}
          />
        )}
      </div>
    </>
  );
}

/* ── Digest View (idle) ─────────────────────────────────────── */

function DigestView({ transactions, recurringMap, subscriptions, onSubscriptionChange }: {
  transactions: Transaction[];
  recurringMap: Map<string, RecurringInfo>;
  subscriptions: SubscriptionStore;
  onSubscriptionChange: (next: SubscriptionStore) => void;
}) {
  const [showAll, setShowAll] = useState(false);
  const [expandedKey, setExpandedKey] = useState<string | null>(null);

  const currentMonth = transactions.length > 0
    ? transactions.reduce((max, t) => (t.date > max ? t.date : max), '').slice(0, 7)
    : new Date().toISOString().slice(0, 7);

  const recurringThisMonth = [...recurringMap.values()]
    .filter((r) => r.occurrences.some((o) => o.month === currentMonth))
    .sort((a, b) => b.medianAmount - a.medianAmount);

  const visible = showAll ? recurringThisMonth : recurringThisMonth.slice(0, 8);
  const hiddenCount = recurringThisMonth.length - 8;
  const toCancelList = Object.entries(subscriptions).filter(([, v]) => v.status === 'to-cancel');
  const totalRecurring = recurringThisMonth.reduce((sum, r) => sum + r.medianAmount, 0);

  return (
    <div className="flex flex-col gap-4">
      {/* Recurring this month */}
      <div>
        <p className="text-[10px] font-bold tracking-widest uppercase mb-2" style={{ color: 'var(--color-text-muted)' }}>
          Recurring this month
        </p>
        {recurringThisMonth.length === 0 ? (
          <p className="text-xs text-center py-8 opacity-40" style={{ color: 'var(--color-text-muted)' }}>
            No recurring charges detected yet
          </p>
        ) : (
          <div className="flex flex-col gap-1.5">
            {visible.map((r) => {
              const sub = subscriptions[r.normalized];
              const isExpanded = expandedKey === r.normalized;
              return (
                <div key={r.normalized} className="rounded-xl overflow-hidden"
                  style={{ background: 'var(--color-elevated)', border: '1px solid var(--color-border)' }}>
                  <button
                    onClick={() => setExpandedKey(isExpanded ? null : r.normalized)}
                    className="w-full flex items-center gap-2.5 px-3 py-2.5 text-left hover:brightness-110 transition-all">
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold truncate">{r.displayName}</p>
                      <p className="text-[10px] mt-0.5" style={{ color: 'var(--color-text-muted)' }}>
                        {r.frequency === 'weekly' ? 'Weekly' : r.frequency === 'monthly' ? 'Monthly' : 'Irregular'}
                        {' · '}avg ${r.medianAmount.toFixed(2)}
                      </p>
                    </div>
                    {sub && sub.status !== 'cancelled' && (
                      <span className="text-[9px] font-bold px-1.5 py-0.5 rounded shrink-0"
                        style={sub.status === 'to-cancel'
                          ? { background: 'color-mix(in srgb, var(--color-rose) 15%, transparent)', color: 'var(--color-rose)' }
                          : { background: 'color-mix(in srgb, var(--color-green) 15%, transparent)', color: 'var(--color-green)' }}>
                        {sub.status === 'to-cancel' ? 'To cancel' : 'Tracked'}
                      </span>
                    )}
                  </button>
                  {isExpanded && (
                    <div style={{ borderTop: '1px solid var(--color-border)' }}>
                      <SubscriptionControls
                        merchantKey={r.normalized}
                        sub={sub}
                        subscriptions={subscriptions}
                        onSubscriptionChange={onSubscriptionChange}
                      />
                    </div>
                  )}
                </div>
              );
            })}
            {!showAll && hiddenCount > 0 && (
              <button onClick={() => setShowAll(true)}
                className="text-xs text-center py-2 hover:underline"
                style={{ color: 'var(--color-text-muted)' }}>
                Show {hiddenCount} more
              </button>
            )}
          </div>
        )}
      </div>

      {/* To Cancel */}
      {toCancelList.length > 0 && (
        <div>
          <p className="text-[10px] font-bold tracking-widest uppercase mb-2" style={{ color: 'var(--color-rose)' }}>
            To Cancel
          </p>
          <div className="flex flex-col gap-1.5">
            {toCancelList.map(([key, sub]) => (
              <div key={key} className="rounded-xl px-3 py-2.5 flex items-start gap-2"
                style={{ background: 'color-mix(in srgb, var(--color-rose) 8%, transparent)', border: '1px solid color-mix(in srgb, var(--color-rose) 18%, transparent)' }}>
                <div className="w-2 h-2 rounded-full mt-1.5 shrink-0" style={{ background: 'var(--color-rose)' }} />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold truncate">{key}</p>
                  {sub.note && (
                    <p className="text-[10px] mt-0.5" style={{ color: 'var(--color-text-muted)' }}>{sub.note}</p>
                  )}
                </div>
                <button
                  onClick={() => onSubscriptionChange({ ...subscriptions, [key]: { ...sub, status: 'cancelled' } })}
                  className="text-[10px] font-semibold px-2 py-1 rounded-lg shrink-0 hover:brightness-110 transition-all"
                  style={{ background: 'color-mix(in srgb, var(--color-green) 15%, transparent)', color: 'var(--color-green)', border: '1px solid color-mix(in srgb, var(--color-green) 25%, transparent)' }}>
                  Done
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Monthly total */}
      {totalRecurring > 0 && (
        <div className="rounded-xl px-3 py-2.5 text-center"
          style={{ background: 'var(--color-elevated)', border: '1px solid var(--color-border)' }}>
          <p className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>
            ↻ <span className="font-bold">${totalRecurring.toFixed(2)}</span>/mo in recurring charges
          </p>
        </div>
      )}
    </div>
  );
}

/* ── Transaction Detail View ────────────────────────────────── */

function TransactionDetailView({ tx, recurringMap, subscriptions, onSubscriptionChange, onNoteUpdate }: {
  tx: Transaction;
  recurringMap: Map<string, RecurringInfo>;
  subscriptions: SubscriptionStore;
  onSubscriptionChange: (next: SubscriptionStore) => void;
  onNoteUpdate: (txId: string, note: string | null) => void;
}) {
  const amount = Number(tx.amount);
  const isIncome = amount >= 0;
  const key = normalize(tx.name);
  const recInfo = recurringMap.get(key);
  const sub = subscriptions[key];
  const [editingNote, setEditingNote] = useState(false);
  const [noteValue, setNoteValue] = useState(tx.note ?? '');

  async function saveNote() {
    setEditingNote(false);
    const trimmed = noteValue.trim() || null;
    if (trimmed === (tx.note ?? null)) return;
    try {
      await fetch(`${API}/transactions/${tx.id}/note`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ note: trimmed }),
      });
      onNoteUpdate(tx.id, trimmed);
    } catch {
      // silently ignore — note will revert on next refresh
    }
  }

  const last4 = recInfo?.occurrences.slice(0, 4) ?? [];

  return (
    <div className="flex flex-col gap-3">
      {/* Header card */}
      <div className="rounded-xl p-3"
        style={{ background: 'rgba(35,35,47,0.5)', backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)', border: '1px solid var(--color-border)' }}>
        <p className="text-sm font-semibold truncate">{tx.name}</p>
        <p className="text-2xl font-bold tabular-nums mt-1"
          style={{ color: isIncome ? 'var(--color-green)' : 'var(--color-rose)' }}>
          {isIncome ? '+' : '-'}${Math.abs(amount).toLocaleString('en-US', { minimumFractionDigits: 2 })}
        </p>
        <p className="text-[11px] mt-1" style={{ color: 'var(--color-text-muted)' }}>
          {new Date(tx.date + 'T12:00:00').toLocaleDateString('en-US', {
            weekday: 'short', month: 'short', day: 'numeric', year: 'numeric',
          })}
        </p>
        {tx.categoryRef && (
          <span className="inline-flex items-center gap-1.5 mt-2 px-2 py-1 rounded-lg text-[11px] font-semibold"
            style={{ background: `${tx.categoryRef.color}18`, color: tx.categoryRef.color }}>
            <span>{tx.categoryRef.icon}</span>
            <span>{tx.categoryRef.name}</span>
          </span>
        )}
      </div>

      {/* Details pills */}
      <div className="flex flex-wrap gap-1.5">
        <span className="text-[10px] px-2 py-1 rounded-lg font-medium"
          style={{ background: 'var(--color-elevated)', color: 'var(--color-text-secondary)' }}>
          {tx.bankAccount?.accountName ?? 'Unknown account'}
        </span>
        <span className="text-[10px] px-2 py-1 rounded-lg font-medium uppercase"
          style={{ background: 'var(--color-elevated)', color: 'var(--color-text-muted)' }}>
          {tx.source}
        </span>
        {editingNote ? (
          <textarea
            autoFocus
            className="w-full text-[11px] rounded-lg px-2 py-1.5 resize-none outline-none mt-0.5"
            style={{ background: 'var(--color-elevated)', border: '1px solid var(--color-primary)', color: 'var(--color-text-primary)', minHeight: '60px' }}
            value={noteValue}
            onChange={(e) => setNoteValue(e.target.value)}
            onBlur={saveNote}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void saveNote(); } }}
            placeholder="Add note…"
          />
        ) : (
          <button onClick={() => setEditingNote(true)}
            className="text-[10px] px-2 py-1 rounded-lg font-medium transition-colors hover:brightness-125"
            style={{ background: 'var(--color-elevated)', color: tx.note ? 'var(--color-text-secondary)' : 'color-mix(in srgb, var(--color-text-muted) 60%, transparent)' }}>
            {tx.note || '+ Add note'}
          </button>
        )}
      </div>

      {/* Recurring history */}
      <div className="rounded-xl p-3"
        style={{ background: 'var(--color-elevated)', border: '1px solid var(--color-border)' }}>
        <p className="text-[10px] font-bold tracking-widest uppercase mb-2" style={{ color: 'var(--color-text-muted)' }}>
          History
        </p>
        {recInfo ? (
          <>
            <div className="flex flex-col gap-2 mb-2">
              {last4.map((o) => {
                const isCurrent = o.date === tx.date;
                return (
                  <div key={o.date} className="flex items-center justify-between">
                    <span className="text-[11px] flex items-center gap-1.5"
                      style={{ color: isCurrent ? 'var(--color-text-primary)' : 'var(--color-text-muted)' }}>
                      {new Date(o.month + '-01').toLocaleString('default', { month: 'short', year: 'numeric' })}
                      {isCurrent && (
                        <span className="text-[9px] font-bold px-1 py-0.5 rounded"
                          style={{ background: 'var(--color-primary)', color: 'white' }}>
                          now
                        </span>
                      )}
                    </span>
                    <span className="text-[11px] tabular-nums font-semibold"
                      style={{ color: isCurrent ? 'var(--color-text-primary)' : 'var(--color-text-muted)' }}>
                      ${o.amount.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                );
              })}
            </div>
            <p className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>
              {recInfo.frequency === 'weekly' ? 'Weekly' : recInfo.frequency === 'monthly' ? 'Monthly' : 'Irregular'}
              {' · '}avg ${recInfo.medianAmount.toFixed(2)}
            </p>
          </>
        ) : (
          <p className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>
            First time we&apos;ve seen this merchant.
          </p>
        )}
      </div>

      {/* Subscription controls */}
      <div className="rounded-xl overflow-hidden"
        style={{ background: 'var(--color-elevated)', border: '1px solid var(--color-border)' }}>
        <p className="text-[10px] font-bold tracking-widest uppercase px-3 pt-3 pb-2" style={{ color: 'var(--color-text-muted)' }}>
          Subscription
        </p>
        <SubscriptionControls
          merchantKey={key}
          sub={sub}
          subscriptions={subscriptions}
          onSubscriptionChange={onSubscriptionChange}
        />
      </div>
    </div>
  );
}

/* ── Subscription Controls ──────────────────────────────────── */

function SubscriptionControls({ merchantKey, sub, subscriptions, onSubscriptionChange }: {
  merchantKey: string;
  sub: { note: string; status: SubStatus } | undefined;
  subscriptions: SubscriptionStore;
  onSubscriptionChange: (next: SubscriptionStore) => void;
}) {
  const [noteValue, setNoteValue] = useState(sub?.note ?? '');

  useEffect(() => {
    setNoteValue(sub?.note ?? '');
  }, [sub?.note]);

  function update(patch: Partial<{ note: string; status: SubStatus }>) {
    onSubscriptionChange({
      ...subscriptions,
      [merchantKey]: { note: noteValue, status: 'active', ...sub, ...patch },
    });
  }

  if (!sub || sub.status === 'cancelled') {
    return (
      <div className="px-3 pb-3">
        {sub?.status === 'cancelled' && (
          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded mb-2 inline-block"
            style={{ background: 'var(--color-elevated)', color: 'var(--color-text-muted)', border: '1px solid var(--color-border)' }}>
            Cancelled
          </span>
        )}
        <button
          onClick={() => update({ status: 'active', note: '' })}
          className="w-full py-2 rounded-lg text-xs font-semibold transition-all hover:brightness-110"
          style={{ background: 'color-mix(in srgb, var(--color-primary) 15%, transparent)', color: 'var(--color-primary)', border: '1px solid color-mix(in srgb, var(--color-primary) 25%, transparent)' }}>
          {sub?.status === 'cancelled' ? 'Track again' : 'Track as subscription'}
        </button>
      </div>
    );
  }

  if (sub.status === 'active') {
    return (
      <div className="px-3 pb-3 flex flex-col gap-2">
        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded w-fit"
          style={{ background: 'color-mix(in srgb, var(--color-green) 15%, transparent)', color: 'var(--color-green)' }}>
          Tracked
        </span>
        <textarea
          className="w-full text-[11px] rounded-lg px-2 py-1.5 resize-none outline-none"
          style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', color: 'var(--color-text-primary)', minHeight: '52px' }}
          placeholder="Cancel instructions (e.g. cancel at netflix.com/account)…"
          value={noteValue}
          onChange={(e) => setNoteValue(e.target.value)}
          onBlur={() => update({ note: noteValue })}
        />
        <button
          onClick={() => update({ status: 'to-cancel', note: noteValue })}
          className="w-full py-2 rounded-lg text-xs font-semibold transition-all hover:brightness-110"
          style={{ background: 'color-mix(in srgb, var(--color-rose) 15%, transparent)', color: 'var(--color-rose)', border: '1px solid color-mix(in srgb, var(--color-rose) 25%, transparent)' }}>
          Mark to cancel
        </button>
      </div>
    );
  }

  /* to-cancel */
  return (
    <div className="px-3 pb-3 flex flex-col gap-2">
      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded w-fit"
        style={{ background: 'color-mix(in srgb, var(--color-rose) 15%, transparent)', color: 'var(--color-rose)' }}>
        Marked to cancel
      </span>
      {sub.note && (
        <p className="text-[11px]" style={{ color: 'var(--color-text-secondary)' }}>{sub.note}</p>
      )}
      <button
        onClick={() => update({ status: 'cancelled' })}
        className="w-full py-2 rounded-lg text-xs font-semibold transition-all hover:brightness-110"
        style={{ background: 'color-mix(in srgb, var(--color-green) 15%, transparent)', color: 'var(--color-green)', border: '1px solid color-mix(in srgb, var(--color-green) 25%, transparent)' }}>
        Done — cancelled ✓
      </button>
    </div>
  );
}

/* ── Icon ───────────────────────────────────────────────────── */

function XIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}
