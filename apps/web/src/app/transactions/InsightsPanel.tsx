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
export type SubscriptionStore = Record<string, { note: string; status: SubStatus; cancelledAt?: string }>;

interface InsightsPanelProps {
  selectedTx: Transaction | null;
  onClose: () => void;
  transactions: Transaction[];
  recurringMap: Map<string, RecurringInfo>;
  subscriptions: SubscriptionStore;
  onSubscriptionChange: (next: SubscriptionStore) => void;
  onNoteUpdate: (txId: string, note: string | null) => void;
  currentMonth: string;
}

export function InsightsPanel({
  selectedTx, onClose, transactions, recurringMap,
  subscriptions, onSubscriptionChange, onNoteUpdate,
  currentMonth,
}: InsightsPanelProps) {
  return (
    <>
      {/* Header */}
      <div className="px-4 py-4 border-b shrink-0 flex items-center justify-between gap-2"
        style={{ borderColor: 'var(--color-border)', background: 'rgba(35,35,47,0.5)', backdropFilter: 'var(--glass-blur)', WebkitBackdropFilter: 'var(--glass-blur)' }}>
        <p className="text-[10px] font-bold tracking-widest uppercase" style={{ color: 'var(--color-text-muted)' }}>
          Insights
        </p>
        <div className="flex items-center gap-1.5">
          {selectedTx && (
            <button onClick={onClose}
              className="w-7 h-7 rounded-lg flex items-center justify-center transition-colors"
              style={{ background: 'var(--color-elevated)', color: 'var(--color-text-muted)' }}>
              <XIcon />
            </button>
          )}
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-3 py-3">
        {selectedTx ? (
          <TransactionDetailView
            tx={selectedTx}
            transactions={transactions}
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
            currentMonth={currentMonth}
          />
        )}
      </div>
    </>
  );
}

/* ── Digest View (idle) ─────────────────────────────────────── */

function DigestView({ transactions, recurringMap, subscriptions, onSubscriptionChange, currentMonth }: {
  transactions: Transaction[];
  recurringMap: Map<string, RecurringInfo>;
  subscriptions: SubscriptionStore;
  onSubscriptionChange: (next: SubscriptionStore) => void;
  currentMonth: string;
}) {
  const [showAll, setShowAll] = useState(false);
  const [expandedKey, setExpandedKey] = useState<string | null>(null);

  const recurringThisMonth = [...recurringMap.values()]
    .filter((r) => r.occurrences.some((o) => o.month === currentMonth))
    .filter((r) => subscriptions[r.normalized]?.status !== 'cancelled')
    .sort((a, b) => {
      const pa = statusPriority(subscriptions[a.normalized]);
      const pb = statusPriority(subscriptions[b.normalized]);
      if (pa !== pb) return pa - pb;
      return b.medianAmount - a.medianAmount;
    });

  const unreviewedList = recurringThisMonth.filter((r) => !subscriptions[r.normalized]);
  const unreviewedTotal = unreviewedList.reduce((sum, r) => sum + r.medianAmount, 0);

  // Map each recurring merchant to its most common expense category
  const merchantCategoryMap = new Map<string, { id: string; name: string; icon: string; color: string } | null>();
  for (const r of recurringMap.values()) {
    const counts = new Map<string, { count: number; ref: { id: string; name: string; icon: string; color: string } }>();
    for (const t of transactions) {
      if (normalize(t.name) !== r.normalized || !t.categoryRef || t.categoryRef.type !== 'expense') continue;
      const existing = counts.get(t.categoryRef.id);
      if (existing) existing.count++;
      else counts.set(t.categoryRef.id, { count: 1, ref: t.categoryRef });
    }
    if (counts.size === 0) { merchantCategoryMap.set(r.normalized, null); continue; }
    const top = [...counts.values()].sort((a, b) => b.count - a.count)[0];
    merchantCategoryMap.set(r.normalized, top.ref);
  }

  // Group unreviewed recurring merchants by category; flag when 2+ share one
  const catGroups = new Map<string, { cat: { id: string; name: string; icon: string; color: string }; merchants: typeof recurringThisMonth }>();
  for (const r of unreviewedList) {
    const cat = merchantCategoryMap.get(r.normalized);
    if (!cat) continue;
    if (!catGroups.has(cat.id)) catGroups.set(cat.id, { cat, merchants: [] });
    catGroups.get(cat.id)!.merchants.push(r);
  }
  const duplicateGroups = [...catGroups.values()].filter((g) => g.merchants.length >= 2);

  const stillCharging = [...recurringMap.values()].filter((r) => {
    const sub = subscriptions[r.normalized];
    return sub?.status === 'cancelled' && sub.cancelledAt &&
      r.occurrences.some((o) => o.date > sub.cancelledAt!);
  });

  const confirmedSavings = [...recurringMap.values()]
    .filter((r) => {
      const sub = subscriptions[r.normalized];
      if (!sub || sub.status !== 'cancelled') return false;
      if (!sub.cancelledAt) return true;
      return !r.occurrences.some((o) => o.date > sub.cancelledAt!);
    })
    .reduce((sum, r) => sum + r.medianAmount, 0);

  const visible = showAll ? recurringThisMonth : recurringThisMonth.slice(0, 8);
  const hiddenCount = recurringThisMonth.length - 8;
  const toCancelList = Object.entries(subscriptions).filter(([, v]) => v.status === 'to-cancel');
  const totalRecurring = recurringThisMonth.reduce((sum, r) => sum + r.medianAmount, 0);

  return (
    <div className="flex flex-col gap-4">
      {/* Burden header */}
      {recurringThisMonth.length > 0 && (
        <div className="rounded-xl px-3 py-2.5"
          style={{
            background: unreviewedList.length > 0
              ? 'color-mix(in srgb, var(--color-card-amber) 8%, transparent)'
              : 'color-mix(in srgb, var(--color-green) 8%, transparent)',
            border: `1px solid ${unreviewedList.length > 0
              ? 'color-mix(in srgb, var(--color-card-amber) 20%, transparent)'
              : 'color-mix(in srgb, var(--color-green) 20%, transparent)'}`,
          }}>
          {unreviewedList.length > 0 ? (
            <>
              <p className="text-xs font-bold" style={{ color: 'var(--color-card-amber)' }}>
                {unreviewedList.length} unreviewed subscription{unreviewedList.length !== 1 ? 's' : ''}
              </p>
              <p className="text-[10px] mt-0.5" style={{ color: 'var(--color-text-muted)' }}>
                ${unreviewedTotal.toFixed(2)}/mo you haven&apos;t evaluated yet
              </p>
            </>
          ) : (
            <>
              <p className="text-xs font-bold" style={{ color: 'var(--color-green)' }}>
                All subscriptions reviewed ✓
              </p>
              <p className="text-[10px] mt-0.5" style={{ color: 'var(--color-text-muted)' }}>
                Nothing new to evaluate this month
              </p>
            </>
          )}
        </div>
      )}

      {/* Possible duplicates */}
      {duplicateGroups.length > 0 && (
        <div>
          <p className="text-[10px] font-bold tracking-widest uppercase mb-2"
            style={{ color: 'var(--color-card-amber)' }}>
            Possible Duplicates
          </p>
          <div className="flex flex-col gap-1.5">
            {duplicateGroups.map(({ cat, merchants }) => (
              <div key={cat.id} className="rounded-xl p-3"
                style={{
                  background: 'color-mix(in srgb, var(--color-card-amber) 8%, transparent)',
                  border: '1px solid color-mix(in srgb, var(--color-card-amber) 20%, transparent)',
                }}>
                <p className="text-[10px] font-semibold mb-2"
                  style={{ color: 'var(--color-card-amber)' }}>
                  {cat.icon} {cat.name} — {merchants.length} services
                </p>
                {merchants.map((r) => (
                  <div key={r.normalized} className="flex items-center justify-between py-0.5">
                    <span className="text-[11px]" style={{ color: 'var(--color-text-secondary)' }}>
                      {r.displayName}
                    </span>
                    <span className="text-[11px] tabular-nums" style={{ color: 'var(--color-text-muted)' }}>
                      ${r.medianAmount.toFixed(2)}/mo
                    </span>
                  </div>
                ))}
                <p className="text-[10px] mt-2 pt-1.5 border-t"
                  style={{ color: 'var(--color-text-muted)', borderColor: 'color-mix(in srgb, var(--color-card-amber) 20%, transparent)' }}>
                  Do you need both? ${merchants.reduce((s, r) => s + r.medianAmount, 0).toFixed(2)}/mo total
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

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
                    {!sub ? (
                      <span className="text-[9px] font-bold px-1.5 py-0.5 rounded shrink-0"
                        style={{ background: 'color-mix(in srgb, var(--color-card-amber) 15%, transparent)', color: 'var(--color-card-amber)' }}>
                        Review
                      </span>
                    ) : sub.status === 'to-cancel' ? (
                      <span className="text-[9px] font-bold px-1.5 py-0.5 rounded shrink-0"
                        style={{ background: 'color-mix(in srgb, var(--color-rose) 15%, transparent)', color: 'var(--color-rose)' }}>
                        To cancel
                      </span>
                    ) : (
                      <span className="text-[9px] font-bold px-1.5 py-0.5 rounded shrink-0"
                        style={{ background: 'color-mix(in srgb, var(--color-green) 15%, transparent)', color: 'var(--color-green)' }}>
                        Tracked
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
                  <p className="text-xs font-semibold truncate">
                    {recurringMap.get(key)?.displayName ?? key}
                  </p>
                  {sub.note && (
                    <p className="text-[10px] mt-0.5" style={{ color: 'var(--color-text-muted)' }}>{sub.note}</p>
                  )}
                </div>
                <button
                  onClick={() => onSubscriptionChange({ ...subscriptions, [key]: { ...sub, status: 'cancelled', cancelledAt: new Date().toISOString().slice(0, 10) } })}
                  className="text-[10px] font-semibold px-2 py-1 rounded-lg shrink-0 hover:brightness-110 transition-all"
                  style={{ background: 'color-mix(in srgb, var(--color-green) 15%, transparent)', color: 'var(--color-green)', border: '1px solid color-mix(in srgb, var(--color-green) 25%, transparent)' }}>
                  Done
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Still charging after cancellation */}
      {stillCharging.length > 0 && (
        <div>
          <p className="text-[10px] font-bold tracking-widest uppercase mb-2"
            style={{ color: 'var(--color-rose)' }}>
            Still Charging!
          </p>
          <div className="flex flex-col gap-1.5">
            {stillCharging.map((r) => {
              const sub = subscriptions[r.normalized]!;
              const postCharges = r.occurrences.filter((o) => o.date > sub.cancelledAt!);
              const postTotal = postCharges.reduce((s, o) => s + Math.abs(o.amount), 0);
              return (
                <div key={r.normalized} className="rounded-xl px-3 py-2.5"
                  style={{
                    background: 'color-mix(in srgb, var(--color-rose) 10%, transparent)',
                    border: '1px solid color-mix(in srgb, var(--color-rose) 25%, transparent)',
                  }}>
                  <p className="text-xs font-semibold truncate">{r.displayName}</p>
                  <p className="text-[10px] mt-0.5" style={{ color: 'var(--color-text-muted)' }}>
                    {postCharges.length} charge{postCharges.length !== 1 ? 's' : ''} after cancellation · ${postTotal.toFixed(2)} total
                  </p>
                  <button
                    onClick={() => onSubscriptionChange({
                      ...subscriptions,
                      [r.normalized]: { ...sub, status: 'to-cancel' },
                    })}
                    className="mt-2 text-[10px] font-semibold px-2 py-1 rounded-lg transition-all hover:brightness-110"
                    style={{
                      background: 'color-mix(in srgb, var(--color-rose) 15%, transparent)',
                      color: 'var(--color-rose)',
                      border: '1px solid color-mix(in srgb, var(--color-rose) 25%, transparent)',
                    }}>
                    Re-open cancellation
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Monthly total + savings */}
      {(totalRecurring > 0 || confirmedSavings > 0) && (
        <div className="rounded-xl px-3 py-2.5 flex flex-col gap-1"
          style={{ background: 'var(--color-elevated)', border: '1px solid var(--color-border)' }}>
          {totalRecurring > 0 && (
            <p className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>
              ↻ <span className="font-bold tabular-nums">${totalRecurring.toFixed(2)}</span>/mo in recurring charges
            </p>
          )}
          {confirmedSavings > 0 && (
            <p className="text-[11px]" style={{ color: 'var(--color-green)' }}>
              ✓ <span className="font-bold tabular-nums">${confirmedSavings.toFixed(2)}</span>/mo saved
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function statusPriority(sub: { status: SubStatus } | undefined): number {
  if (!sub) return 0;
  if (sub.status === 'to-cancel') return 1;
  if (sub.status === 'active') return 2;
  return 3; // cancelled — filtered out below
}

/* ── Transaction Detail View ────────────────────────────────── */

function TransactionDetailView({ tx, transactions, recurringMap, subscriptions, onSubscriptionChange, onNoteUpdate }: {
  tx: Transaction;
  transactions: Transaction[];
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

  const thisYear = new Date().getFullYear().toString();
  const merchantTxs = transactions
    .filter((t) => normalize(t.name) === key && t.id !== tx.id)
    .sort((a, b) => b.date.localeCompare(a.date));
  const allOccurrences = [tx, ...merchantTxs];
  const thisYearTotal = allOccurrences
    .filter((t) => t.date.startsWith(thisYear))
    .reduce((sum, t) => sum + Math.abs(Number(t.amount)), 0);
  const displayOccurrences = allOccurrences.slice(0, 6);
  const thisYearCount = allOccurrences.filter((t) => t.date.startsWith(thisYear)).length;
  const allTimeTotal = allOccurrences.reduce((sum, t) => sum + Math.abs(Number(t.amount)), 0);
  const postCancellationCharges = sub?.status === 'cancelled' && sub.cancelledAt
    ? allOccurrences.filter((o) => o.date > sub.cancelledAt!)
    : [];
  const [historyOpen, setHistoryOpen] = useState(false);
  const [editingNote, setEditingNote] = useState(false);
  const [noteValue, setNoteValue] = useState(tx.note ?? '');

  useEffect(() => {
    setNoteValue(tx.note ?? '');
  }, [tx.id, tx.note]);

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

      {/* Post-cancellation warning */}
      {postCancellationCharges.length > 0 && (
        <div className="rounded-xl px-3 py-2.5"
          style={{
            background: 'color-mix(in srgb, var(--color-rose) 10%, transparent)',
            border: '1px solid color-mix(in srgb, var(--color-rose) 25%, transparent)',
          }}>
          <p className="text-xs font-bold" style={{ color: 'var(--color-rose)' }}>
            ⚠ Still charging after cancellation
          </p>
          <p className="text-[10px] mt-0.5" style={{ color: 'var(--color-text-muted)' }}>
            {postCancellationCharges.length} charge{postCancellationCharges.length !== 1 ? 's' : ''} detected after {sub!.cancelledAt}
          </p>
        </div>
      )}

      {/* History — collapsible */}
      <div className="rounded-xl overflow-hidden"
        style={{ background: 'var(--color-elevated)', border: '1px solid var(--color-border)' }}>
        {/* Toggle row */}
        <button
          className="w-full flex items-center justify-between px-3 py-3 transition-colors hover:brightness-110"
          onClick={() => setHistoryOpen((o) => !o)}>
          <p className="text-[10px] font-bold tracking-widest uppercase" style={{ color: 'var(--color-text-muted)' }}>
            History
          </p>
          <div className="flex items-center gap-2">
            <span className="text-[10px] tabular-nums" style={{ color: 'var(--color-text-secondary)' }}>
              {allOccurrences.length} {allOccurrences.length === 1 ? 'transaction' : 'transactions'}
              {thisYearTotal > 0 && ` · $${thisYearTotal.toLocaleString('en-US', { minimumFractionDigits: 2 })} in ${thisYear}`}
            </span>
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"
              strokeLinecap="round" strokeLinejoin="round"
              style={{ color: 'var(--color-text-muted)', transform: historyOpen ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.15s' }}>
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </div>
        </button>

        {/* Expanded body */}
        {historyOpen && (
          <div className="px-3 pb-3 flex flex-col gap-2 border-t" style={{ borderColor: 'var(--color-border)' }}>
            <div className="flex flex-col gap-2 pt-2">
              {displayOccurrences.map((o) => {
                const isCurrent = o.id === tx.id;
                return (
                  <div key={o.id} className="flex items-center justify-between">
                    <span className="text-[11px] flex items-center gap-1.5"
                      style={{ color: isCurrent ? 'var(--color-text-primary)' : 'var(--color-text-muted)' }}>
                      {new Date(o.date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                      {isCurrent && (
                        <span className="text-[9px] font-bold px-1 py-0.5 rounded"
                          style={{ background: 'var(--color-primary)', color: 'white' }}>
                          this
                        </span>
                      )}
                    </span>
                    <span className="text-[11px] tabular-nums font-semibold"
                      style={{ color: isCurrent ? 'var(--color-text-primary)' : 'var(--color-text-muted)' }}>
                      ${Math.abs(Number(o.amount)).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                );
              })}
            </div>
            {allOccurrences.length > 6 && (
              <p className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>
                +{allOccurrences.length - 6} more transactions
              </p>
            )}
            {/* Summary footer */}
            <div className="flex items-center justify-between pt-1 border-t" style={{ borderColor: 'var(--color-border)' }}>
              <span className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>
                {thisYearCount} this year
                {recInfo ? ` · ${recInfo.frequency === 'weekly' ? 'weekly' : recInfo.frequency === 'monthly' ? 'monthly' : 'irregular'}` : ''}
              </span>
              <span className="text-[10px] font-semibold tabular-nums" style={{ color: 'var(--color-text-secondary)' }}>
                ${allTimeTotal.toLocaleString('en-US', { minimumFractionDigits: 2 })} total
              </span>
            </div>
          </div>
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
  sub: { note: string; status: SubStatus; cancelledAt?: string } | undefined;
  subscriptions: SubscriptionStore;
  onSubscriptionChange: (next: SubscriptionStore) => void;
}) {
  const [noteValue, setNoteValue] = useState(sub?.note ?? '');

  useEffect(() => {
    setNoteValue(sub?.note ?? '');
  }, [sub?.note]);

  function update(patch: Partial<{ note: string; status: SubStatus }>) {
    const cancelledAt = patch.status === 'cancelled'
      ? new Date().toISOString().slice(0, 10)
      : sub?.cancelledAt;
    onSubscriptionChange({
      ...subscriptions,
      [merchantKey]: {
        note: noteValue,
        status: 'active',
        ...sub,
        ...patch,
        ...(cancelledAt ? { cancelledAt } : {}),
      },
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
