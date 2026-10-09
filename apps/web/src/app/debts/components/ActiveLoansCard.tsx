'use client';

import { useState, useEffect, useCallback } from 'react';
import { avatarColor, initials } from '@/lib/avatar';
import { fmt, today, fmtDate, inDays } from '../format';
import type { Debt, DebtDetail } from '../types';
import { paymentHistory, historySummary } from '@/lib/debts/history';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3333/api';

type FilterDir = 'all' | 'lent' | 'owed';

const inputStyle: React.CSSProperties = { background: 'var(--color-elevated)', border: '1px solid var(--color-border)', color: 'var(--color-text-primary)' };

function SearchIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" />
    </svg>
  );
}

interface Props {
  debts: Debt[];
  loading: boolean;
  reload: () => void;
}

export default function ActiveLoansCard({ debts, loading, reload }: Props) {
  const [search, setSearch] = useState('');
  const [filterDir, setFilterDir] = useState<FilterDir>('all');
  const [openId, setOpenId] = useState<string | null>(null);
  const [detail, setDetail] = useState<DebtDetail | null>(null);
  const [pay, setPay] = useState({ amount: '', date: today(), note: '', emailReceipt: true });
  const [toast, setToast] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const loadDetail = useCallback((id: string) => {
    fetch(`${API}/debts/${id}`, { credentials: 'include' }).then((r) => r.json()).then(setDetail).catch(() => {});
  }, []);
  useEffect(() => { if (openId) loadDetail(openId); else setDetail(null); }, [openId, loadDetail]);

  const lentCount = debts.filter((d) => d.direction === 'lent').length;
  const owedCount = debts.filter((d) => d.direction === 'owed').length;
  const q = search.trim().toLowerCase();
  const visible = debts
    .filter((d) => filterDir === 'all' || d.direction === filterDir)
    .filter((d) => !q || d.borrowerName.toLowerCase().includes(q) || (d.description ?? '').toLowerCase().includes(q));

  function flash(msg: string) { setToast(msg); setTimeout(() => setToast(''), 3000); }

  async function recordPayment(e: React.FormEvent) {
    e.preventDefault();
    if (!openId) return;
    const res = await fetch(`${API}/debts/${openId}/payments`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
      body: JSON.stringify({ amount: parseFloat(pay.amount), date: pay.date, note: pay.note || null, emailReceipt: pay.emailReceipt }),
    });
    const data = await res.json().catch(() => null);
    setPay({ amount: '', date: today(), note: '', emailReceipt: true });
    if (data?.emailed) flash('Receipt emailed');
    loadDetail(openId); reload();
  }

  async function deletePayment(pid: string) {
    if (!openId) return;
    await fetch(`${API}/debts/${openId}/payments/${pid}`, { method: 'DELETE', credentials: 'include' });
    loadDetail(openId); reload();
  }

  async function sendStatement() {
    if (!openId) return;
    const res = await fetch(`${API}/debts/${openId}/send-statement`, { method: 'POST', credentials: 'include' });
    flash(res.ok ? 'Statement emailed' : 'Could not send');
  }

  async function deleteDebt(id: string) {
    await fetch(`${API}/debts/${id}`, { method: 'DELETE', credentials: 'include' });
    if (openId === id) setOpenId(null);
    reload();
  }

  return (
    <div className="rounded-2xl p-5 flex flex-col gap-4 relative"
      style={{ background: 'var(--color-surface)', backdropFilter: 'var(--glass-blur)', WebkitBackdropFilter: 'var(--glass-blur)', border: '1px solid var(--color-border)' }}>
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <p className="font-bold text-base">Active Loans</p>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2 px-3 py-2 rounded-xl flex-1 min-w-40" style={inputStyle}>
          <span style={{ color: 'var(--color-text-muted)' }}><SearchIcon /></span>
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search loans"
            className="bg-transparent outline-none text-sm flex-1 min-w-0" style={{ color: 'var(--color-text-primary)' }} />
        </div>
        <div className="flex gap-1 p-1 rounded-xl" style={{ background: 'var(--color-elevated)', border: '1px solid var(--color-border)' }}>
          {([['all', `All ${debts.length}`], ['lent', `Owed to Me ${lentCount}`], ['owed', `I Owe ${owedCount}`]] as const).map(([dir, label]) => (
            <button key={dir} type="button" onClick={() => setFilterDir(dir)}
              className="px-3 py-1.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap"
              style={{
                background: filterDir === dir ? 'color-mix(in srgb, var(--color-card-violet) 18%, transparent)' : 'transparent',
                color: filterDir === dir ? 'var(--color-card-violet)' : 'var(--color-text-muted)',
                border: filterDir === dir ? '1px solid color-mix(in srgb, var(--color-card-violet) 35%, transparent)' : '1px solid transparent',
              }}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <p className="text-xs text-center py-12" style={{ color: 'var(--color-text-muted)' }}>Loading…</p>
      ) : debts.length === 0 ? (
        <div className="py-16 flex flex-col items-center gap-4 text-center rounded-2xl" style={{ background: 'var(--color-elevated)' }}>
          <span className="text-5xl opacity-30">🤝</span>
          <div>
            <p className="font-semibold text-base">No loans recorded yet</p>
            <p className="text-sm mt-1 max-w-md px-4" style={{ color: 'var(--color-text-muted)' }}>
              Lent money to a friend, or borrowed from one? Record it, then log each repayment as it arrives — the balance updates itself.
            </p>
          </div>
        </div>
      ) : visible.length === 0 ? (
        <p className="text-sm text-center py-12" style={{ color: 'var(--color-text-muted)' }}>No loans match your search.</p>
      ) : (
        <div className="flex flex-col gap-3">
          {visible.map((d) => {
            const open = openId === d.id;
            const pct = Math.min(d.percentage, 100);
            const ac = avatarColor(d.borrowerName);
            const t = today();
            const overdue = d.status === 'open' && !!d.dueDate && d.dueDate < t;
            const dueSoon = d.status === 'open' && !overdue && !!d.dueDate && d.dueDate <= inDays(7);
            const dueStatus = overdue ? 'Overdue' : dueSoon ? 'Due soon' : 'On track';
            return (
              <div key={d.id} className="rounded-2xl overflow-hidden transition-all"
                style={{
                  background: 'var(--color-elevated)',
                  border: '1px solid var(--color-border)', borderLeft: `3px solid ${ac}`,
                }}>
                <div role="button" tabIndex={0} className="w-full text-left p-4 cursor-pointer"
                  onClick={() => setOpenId(open ? null : d.id)}
                  onKeyDown={(e) => { if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); setOpenId(open ? null : d.id); } }}>
                  <div className="flex items-center gap-4 flex-wrap sm:flex-nowrap">
                    <div className="w-11 h-11 rounded-full flex items-center justify-center text-sm font-bold shrink-0"
                      style={{ background: `color-mix(in srgb, ${ac} 20%, transparent)`, border: `1px solid color-mix(in srgb, ${ac} 40%, transparent)`, color: ac }}>
                      {initials(d.borrowerName)}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-semibold text-sm">{d.borrowerName}</p>
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                          style={d.direction === 'lent'
                            ? { background: 'color-mix(in srgb, var(--color-green) 15%, transparent)', color: 'var(--color-green)' }
                            : { background: 'color-mix(in srgb, var(--color-violet) 15%, transparent)', color: 'var(--color-violet)' }}>
                          {d.direction === 'lent' ? 'OWES YOU' : 'YOU OWE'}
                        </span>
                        {d.status === 'paid' && (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                            style={{ background: 'color-mix(in srgb, var(--color-text-muted) 15%, transparent)', color: 'var(--color-text-muted)' }}>PAID</span>
                        )}
                        {overdue && (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                            style={{ background: 'color-mix(in srgb, var(--color-rose) 15%, transparent)', color: 'var(--color-rose)' }}>OVERDUE</span>
                        )}
                      </div>
                      <p className="text-[11px] mt-0.5 truncate" style={{ color: 'var(--color-text-muted)' }}>
                        {d.description ? `${d.description} · ` : ''}
                        {d.startDate ? `${d.direction === 'owed' ? 'Borrowed' : 'Lent'} ${fmtDate(d.startDate)}` : ''}
                        {d.startDate && d.dueDate ? ' · ' : ''}
                        {d.dueDate && `Next: ${fmtDate(d.dueDate)} · $${fmt(d.remaining)} · `}
                        {d.dueDate && (
                          <span className="font-semibold" style={{ color: overdue ? 'var(--color-rose)' : dueSoon ? 'var(--color-amber)' : 'var(--color-green)' }}>
                            {dueStatus}
                          </span>
                        )}
                      </p>
                      <div className="flex items-center gap-3 mt-2.5">
                        <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--color-border)' }}>
                          <div className="h-full rounded-full transition-all duration-700" style={{ width: `${pct}%`, background: 'var(--color-green)' }} />
                        </div>
                        <span className="text-[10px] font-semibold tabular-nums shrink-0" style={{ color: 'var(--color-green)' }}>
                          {d.direction === 'owed' ? 'paid back' : 'repaid'} ${fmt(d.paid)} · {Math.round(pct)}%
                        </span>
                      </div>
                    </div>

                    <div className="text-right shrink-0">
                      <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--color-text-muted)' }}>Remaining</p>
                      <p className="text-lg font-extrabold tabular-nums" style={{ color: d.remaining > 0 ? 'var(--color-orange)' : 'var(--color-green)' }}>${fmt(d.remaining)}</p>
                      <p className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>of ${fmt(d.principal)}</p>
                    </div>
                    <span className={`shrink-0 text-xs transition-transform duration-200 ${open ? 'rotate-180' : ''}`} style={{ color: 'var(--color-text-muted)' }}>▾</span>
                  </div>
                </div>

                {open && detail && detail.id === d.id && (
                  <div className="px-4 pb-4 flex flex-col gap-4" style={{ borderTop: '1px solid var(--color-border)' }}>
                    <form onSubmit={recordPayment} className="flex flex-wrap items-end gap-2.5 pt-4">
                      <div className="flex flex-col gap-1">
                        <span className="text-[10px] uppercase tracking-wider" style={{ color: 'var(--color-text-muted)' }}>
                          {d.direction === 'owed' ? 'Amount paid back' : 'Repayment received'}
                        </span>
                        <input required type="number" step="0.01" min="0.01" placeholder="0.00" value={pay.amount}
                          onChange={(e) => setPay((p) => ({ ...p, amount: e.target.value }))}
                          className="w-28 px-3 py-2 text-sm rounded-xl outline-none" style={inputStyle} />
                      </div>
                      <div className="flex flex-col gap-1">
                        <span className="text-[10px] uppercase tracking-wider" style={{ color: 'var(--color-text-muted)' }}>Date</span>
                        <input type="date" value={pay.date} onChange={(e) => setPay((p) => ({ ...p, date: e.target.value }))}
                          className="px-3 py-2 text-sm rounded-xl outline-none" style={inputStyle} />
                      </div>
                      <div className="flex flex-col gap-1 flex-1 min-w-32">
                        <span className="text-[10px] uppercase tracking-wider" style={{ color: 'var(--color-text-muted)' }}>Note (optional)</span>
                        <input value={pay.note} onChange={(e) => setPay((p) => ({ ...p, note: e.target.value }))}
                          placeholder="e.g. Zelle, cash" className="px-3 py-2 text-sm rounded-xl outline-none w-full" style={inputStyle} />
                      </div>
                      <button type="submit" className="px-4 py-2 text-sm font-semibold text-white rounded-xl hover:brightness-110" style={{ background: 'var(--color-green)' }}>
                        {d.direction === 'owed' ? 'Record payment' : 'Record repayment'}
                      </button>
                      <label className="flex items-center gap-1.5 text-[11px]" style={{ color: d.borrowerEmail ? 'var(--color-text-secondary)' : 'var(--color-text-muted)' }}>
                        <input type="checkbox" checked={pay.emailReceipt && !!d.borrowerEmail} disabled={!d.borrowerEmail}
                          onChange={(e) => setPay((p) => ({ ...p, emailReceipt: e.target.checked }))} />
                        {d.direction === 'owed' ? 'Email confirmation' : 'Email receipt'}
                      </label>
                      <button type="button" onClick={sendStatement} disabled={!d.borrowerEmail}
                        className="ml-auto px-3 py-2 text-xs font-semibold rounded-xl disabled:opacity-40 hover:bg-[var(--color-surface)]"
                        style={{ border: '1px solid var(--color-border)', color: 'var(--color-text-primary)' }}>Send statement</button>
                      {confirmDeleteId === d.id ? (
                        <span className="flex items-center gap-1.5">
                          <span className="text-[11px]" style={{ color: 'var(--color-rose)' }}>
                            Delete this record &amp; its payments?{(() => {
                              const n = detail.payments.filter((p) => p.transactionId).length;
                              return n > 0 ? ` ${n} linked transaction${n > 1 ? 's' : ''} will be kept as income.` : '';
                            })()}
                          </span>
                          <button type="button" onClick={() => { setConfirmDeleteId(null); deleteDebt(d.id); }}
                            className="px-2.5 py-2 text-xs font-semibold rounded-xl text-white" style={{ background: 'var(--color-rose)' }}>Yes, delete</button>
                          <button type="button" onClick={() => setConfirmDeleteId(null)}
                            className="px-2.5 py-2 text-xs font-medium rounded-xl hover:bg-[var(--color-surface)]" style={{ color: 'var(--color-text-secondary)' }}>Cancel</button>
                        </span>
                      ) : (
                        <button type="button" onClick={() => setConfirmDeleteId(d.id)} className="px-3 py-2 text-xs font-semibold rounded-xl hover:bg-red-500/15" style={{ color: 'var(--color-rose)' }}>Delete</button>
                      )}
                    </form>

                    {detail.payments.length === 0 ? (
                      <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>No repayments logged yet — record each one above as it arrives.</p>
                    ) : (
                      <RepaymentHistory detail={detail} onDelete={deletePayment} />
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {toast && (
        <div className="fixed bottom-6 right-6 px-4 py-2.5 rounded-xl text-sm font-semibold z-50"
          style={{ background: 'var(--popover-bg)', border: '1px solid var(--color-border)', color: 'var(--color-green)' }}>{toast}</div>
      )}
    </div>
  );
}

/* ── Repayment history: running balance per payment + pace summary ── */

function monthYear(ym: string) {
  const [y, m] = ym.split('-').map(Number);
  return new Date(y, m - 1).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
}

function SummaryChip({ label, value, tone, className = '' }: { label: string; value: string; tone?: string; className?: string }) {
  return (
    <div className={`flex flex-col gap-0.5 px-3 py-2 rounded-xl min-w-0 ${className}`} style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
      <span className="text-[9.5px] font-bold uppercase tracking-wider truncate" style={{ color: 'var(--color-text-muted)' }}>{label}</span>
      <span className="text-[13px] font-bold tabular-nums truncate" style={{ color: tone ?? 'var(--color-text-primary)' }}>{value}</span>
    </div>
  );
}

function RepaymentHistory({ detail, onDelete }: { detail: DebtDetail; onDelete: (paymentId: string) => void }) {
  const owed = detail.direction === 'owed';
  const rows = paymentHistory(Number(detail.principal), detail.payments, detail.startDate);
  const s = historySummary(Number(detail.remaining), detail.payments, today());
  const amountTone = owed ? 'var(--color-orange)' : 'var(--color-green)';
  const days = (n: number) => `${n} day${n === 1 ? '' : 's'}`;

  return (
    <div className="flex flex-col gap-2">
      <p className="text-[10px] font-bold tracking-widest uppercase" style={{ color: 'var(--color-text-muted)' }}>
        Repayment history · {rows.length}
      </p>

      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
        <SummaryChip label="Average" value={`$${fmt(s.avgPayment)}`} />
        <SummaryChip label="Largest" value={`$${fmt(s.largest)}`} />
        <SummaryChip label="Typical gap" value={s.avgDaysBetween != null ? `~${days(s.avgDaysBetween)}` : '—'} />
        <SummaryChip label="Last paid" value={s.lastPaymentDaysAgo == null ? '—' : s.lastPaymentDaysAgo === 0 ? 'Today' : `${days(s.lastPaymentDaysAgo)} ago`} />
        <SummaryChip label="Est. payoff" className="col-span-2 sm:col-span-1"
          value={Number(detail.remaining) <= 0 ? 'Paid off' : s.projectedPayoff ? monthYear(s.projectedPayoff) : '—'}
          tone={Number(detail.remaining) <= 0 ? 'var(--color-green)' : undefined} />
      </div>

      <div className="flex flex-col gap-1.5">
        {rows.map((p) => {
          const source = p.transaction
            ? `${p.transaction.name}${p.transaction.accountName ? ` · ${p.transaction.accountName}` : ''}`
            : p.transactionId ? 'Linked transaction' : 'Recorded manually';
          return (
            <div key={p.id} className="flex flex-col gap-1.5 text-xs py-2 px-2.5 rounded-lg" style={{ background: 'var(--color-surface)' }}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-[10px] font-bold tabular-nums px-1.5 py-0.5 rounded-md"
                      style={{ background: 'var(--color-elevated)', color: 'var(--color-text-muted)' }}>#{p.seq}</span>
                    <span className="font-semibold" style={{ color: 'var(--color-text-secondary)' }}>{fmtDate(p.date)}</span>
                    {p.paidOff && (
                      <span className="text-[9.5px] font-bold px-1.5 py-0.5 rounded-full"
                        style={{ background: 'color-mix(in srgb, var(--color-green) 15%, transparent)', color: 'var(--color-green)' }}>PAID OFF</span>
                    )}
                  </p>
                  <p className="mt-1 truncate text-[11px]" style={{ color: 'var(--color-text-muted)' }}>
                    {p.note ? `${p.note} · ` : ''}{source}
                  </p>
                </div>
                <div className="flex items-start gap-2.5 shrink-0">
                  <div className="text-right">
                    <p className="font-bold tabular-nums" style={{ color: amountTone }}>{owed ? '−' : '+'}${fmt(p.amount)}</p>
                    <p className="text-[10.5px] tabular-nums mt-0.5" style={{ color: 'var(--color-text-muted)' }}>{p.shareOfPrincipal}% of loan</p>
                  </div>
                  {!p.transactionId && (
                    <button onClick={() => onDelete(p.id)} aria-label="Delete payment" className="hover:opacity-70 pt-0.5" style={{ color: 'var(--color-text-muted)' }}>✕</button>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2.5">
                <div className="flex-1 h-1 rounded-full overflow-hidden" style={{ background: 'var(--color-border)' }}>
                  <div className="h-full rounded-full" style={{ width: `${p.pctRepaid}%`, background: 'var(--color-green)' }} />
                </div>
                <span className="text-[10.5px] tabular-nums shrink-0" style={{ color: 'var(--color-text-muted)' }}>
                  {p.pctRepaid}% {owed ? 'paid back' : 'repaid'}
                </span>
              </div>

              <div className="flex items-center justify-between gap-3 flex-wrap text-[10.5px] tabular-nums" style={{ color: 'var(--color-text-muted)' }}>
                <span>
                  {owed ? 'Paid back' : 'Repaid'} so far <span className="font-semibold" style={{ color: 'var(--color-text-secondary)' }}>${fmt(p.paidSoFar)}</span>
                  {p.daysSincePrev != null && (
                    <> · {p.daysSincePrev === 0 ? 'same day as previous' : `${days(p.daysSincePrev)} after ${p.sinceLoanStart ? 'the loan' : 'previous'}`}</>
                  )}
                </span>
                <span>
                  Pending after{' '}
                  <span className="font-bold" style={{ color: p.remainingAfter > 0 ? 'var(--color-orange)' : 'var(--color-green)' }}>
                    ${fmt(p.remainingAfter)}
                  </span>
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
