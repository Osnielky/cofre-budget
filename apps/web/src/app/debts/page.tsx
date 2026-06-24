'use client';

import { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import Sidebar from '@/components/Sidebar';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3333/api';

interface Payment { id: string; amount: number; date: string; note: string | null; transactionId: string | null }
interface Debt {
  id: string; borrowerName: string; borrowerEmail: string | null; principal: number;
  description: string | null; startDate: string | null; dueDate: string | null; status: 'open' | 'paid';
  paid: number; remaining: number; percentage: number;
}
interface DebtDetail extends Debt { payments: Payment[] }

function fmt(n: number) { return Math.abs(Number(n)).toLocaleString('en-US', { minimumFractionDigits: 2 }); }
function today() { return new Date().toISOString().slice(0, 10); }

export default function DebtsPage() {
  const [debts, setDebts] = useState<Debt[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [formDir, setFormDir] = useState<'lent' | 'owed'>('lent');
  const [form, setForm] = useState({ borrowerName: '', borrowerEmail: '', principal: '', description: '', startDate: today(), dueDate: '' });
  const [saving, setSaving] = useState(false);

  const resetForm = () => {
    setFormDir('lent');
    setForm({ borrowerName: '', borrowerEmail: '', principal: '', description: '', startDate: today(), dueDate: '' });
  };

  const [openId, setOpenId] = useState<string | null>(null);
  const [detail, setDetail] = useState<DebtDetail | null>(null);
  const [pay, setPay] = useState({ amount: '', date: today(), note: '', emailReceipt: true });
  const [toast, setToast] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    fetch(`${API}/debts`, { credentials: 'include' })
      .then(r => r.json()).then(d => setDebts(Array.isArray(d) ? d : []))
      .catch(() => {}).finally(() => setLoading(false));
  }, []);
  useEffect(() => { load(); }, [load]);

  const loadDetail = useCallback((id: string) => {
    fetch(`${API}/debts/${id}`, { credentials: 'include' }).then(r => r.json()).then(setDetail).catch(() => {});
  }, []);
  useEffect(() => { if (openId) loadDetail(openId); else setDetail(null); }, [openId, loadDetail]);

  const totalLent = debts.reduce((s, d) => s + Number(d.principal), 0);
  const totalRepaid = debts.reduce((s, d) => s + Number(d.paid), 0);
  const outstanding = debts.filter(d => d.status === 'open').reduce((s, d) => s + Number(d.remaining), 0);
  const peopleOwing = debts.filter(d => d.status === 'open').length;

  async function createDebt(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    await fetch(`${API}/debts`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
      body: JSON.stringify({
        borrowerName: form.borrowerName,
        borrowerEmail: form.borrowerEmail || null,
        principal: parseFloat(form.principal),
        description: form.description || null,
        startDate: form.startDate || null,
        dueDate: form.dueDate || null,
        direction: formDir,
      }),
    });
    setSaving(false); setShowForm(false); resetForm();
    load();
  }

  async function recordPayment(e: React.FormEvent) {
    e.preventDefault();
    if (!openId) return;
    const res = await fetch(`${API}/debts/${openId}/payments`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
      body: JSON.stringify({ amount: parseFloat(pay.amount), date: pay.date, note: pay.note || null, emailReceipt: pay.emailReceipt }),
    });
    const data = await res.json().catch(() => null);
    setPay({ amount: '', date: today(), note: '', emailReceipt: true });
    if (data?.emailed) { setToast('Receipt emailed'); setTimeout(() => setToast(''), 3000); }
    loadDetail(openId); load();
  }

  async function deletePayment(pid: string) {
    if (!openId) return;
    await fetch(`${API}/debts/${openId}/payments/${pid}`, { method: 'DELETE', credentials: 'include' });
    loadDetail(openId); load();
  }

  async function sendStatement() {
    if (!openId) return;
    const res = await fetch(`${API}/debts/${openId}/send-statement`, { method: 'POST', credentials: 'include' });
    setToast(res.ok ? 'Statement emailed' : 'Could not send'); setTimeout(() => setToast(''), 3000);
  }

  async function deleteDebt(id: string) {
    await fetch(`${API}/debts/${id}`, { method: 'DELETE', credentials: 'include' });
    if (openId === id) setOpenId(null);
    load();
  }

  return (
    <div className="flex h-dvh overflow-hidden">
      <Sidebar />
      <main className="flex-1 overflow-y-auto pt-14 md:pt-0">
        <div className="sticky top-14 md:top-0 z-20 px-6 pt-5 pb-4 flex items-center justify-between gap-4 flex-wrap"
          style={{ background: 'var(--header-bg)', backdropFilter: 'var(--glass-blur)', WebkitBackdropFilter: 'var(--glass-blur)', borderBottom: '1px solid var(--color-border)' }}>
          <div>
            <h1 className="text-xl font-bold tracking-tight">Debts</h1>
            <p className="text-xs mt-0.5" style={{ color: 'var(--color-text-muted)' }}>Money you lent out</p>
          </div>
          <button onClick={() => setShowForm(true)}
            className="px-4 py-2 text-sm font-semibold text-white rounded-xl hover:brightness-110 transition-all flex items-center gap-1.5"
            style={{ background: 'var(--color-card-violet)' }}>
            <span className="text-base leading-none">+</span> Add Debt
          </button>
        </div>

        <div className="p-6 flex flex-col gap-5">
          {!loading && debts.length > 0 && (
            <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
              {[
                { label: 'Total Lent', value: `$${fmt(totalLent)}`, color: 'var(--color-card-violet)' },
                { label: 'Total Repaid', value: `$${fmt(totalRepaid)}`, color: 'var(--color-green)' },
                { label: 'Outstanding', value: `$${fmt(outstanding)}`, color: 'var(--color-orange)' },
                { label: 'People Owing', value: `${peopleOwing}`, color: 'var(--color-card-sky)' },
              ].map(s => (
                <div key={s.label} className="p-4 rounded-2xl flex flex-col gap-1.5"
                  style={{ background: 'var(--color-surface)', backdropFilter: 'var(--glass-blur)', WebkitBackdropFilter: 'var(--glass-blur)', border: '1px solid var(--color-border)' }}>
                  <span className="text-[10px] font-bold tracking-widest uppercase" style={{ color: s.color }}>{s.label}</span>
                  <span className="text-xl font-extrabold leading-none tabular-nums">{s.value}</span>
                </div>
              ))}
            </div>
          )}

          {loading ? (
            <p className="text-xs text-center py-12" style={{ color: 'var(--color-text-muted)' }}>Loading…</p>
          ) : debts.length === 0 ? (
            <div className="py-16 flex flex-col items-center gap-4 text-center rounded-2xl" style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
              <span className="text-5xl opacity-30">🤝</span>
              <div>
                <p className="font-semibold text-base">No debts tracked</p>
                <p className="text-sm mt-1" style={{ color: 'var(--color-text-muted)' }}>Record money you lent so you can track repayments.</p>
              </div>
              <button onClick={() => setShowForm(true)} className="mt-2 px-5 py-2.5 text-sm font-semibold text-white rounded-xl hover:brightness-110" style={{ background: 'var(--color-card-violet)' }}>+ Add Your First Debt</button>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {debts.map(d => {
                const open = openId === d.id;
                const pct = Math.min(d.percentage, 100);
                return (
                  <div key={d.id} className="rounded-2xl overflow-hidden transition-all"
                    style={{ background: 'var(--color-surface)', backdropFilter: 'var(--glass-blur)', WebkitBackdropFilter: 'var(--glass-blur)', border: '1px solid var(--color-border)' }}>
                    <div role="button" tabIndex={0} className="w-full text-left p-5 cursor-pointer"
                      onClick={() => setOpenId(open ? null : d.id)}
                      onKeyDown={e => { if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); setOpenId(open ? null : d.id); } }}>
                      <div className="flex items-center gap-4">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="font-semibold text-sm">{d.borrowerName}</p>
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                              style={d.status === 'paid'
                                ? { background: 'color-mix(in srgb, var(--color-green) 15%, transparent)', color: 'var(--color-green)' }
                                : { background: 'color-mix(in srgb, var(--color-amber) 15%, transparent)', color: 'var(--color-amber)' }}>
                              {d.status === 'paid' ? 'PAID' : 'OPEN'}
                            </span>
                          </div>
                          {(d.startDate || d.dueDate) && (
                            <p className="text-[11px] mt-0.5" style={{ color: 'var(--color-text-muted)' }}>
                              {d.startDate ? `Lent ${d.startDate}` : ''}{d.startDate && d.dueDate ? ' · ' : ''}{d.dueDate ? `due ${d.dueDate}` : ''}
                            </p>
                          )}
                          <div className="mt-2 h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--color-border)' }}>
                            <div className="h-full rounded-full transition-all duration-700" style={{ width: `${pct}%`, background: 'var(--color-green)' }} />
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--color-text-muted)' }}>Remaining</p>
                          <p className="text-lg font-extrabold tabular-nums" style={{ color: d.remaining > 0 ? 'var(--color-orange)' : 'var(--color-green)' }}>${fmt(d.remaining)}</p>
                          <p className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>of ${fmt(d.principal)}</p>
                        </div>
                      </div>
                    </div>

                    {open && detail && detail.id === d.id && (
                      <div className="px-5 pb-5 flex flex-col gap-4" style={{ borderTop: '1px solid var(--color-border)' }}>
                        <form onSubmit={recordPayment} className="flex flex-wrap items-end gap-2 pt-4">
                          <div className="flex flex-col gap-1">
                            <span className="text-[10px] uppercase tracking-wider" style={{ color: 'var(--color-text-muted)' }}>Payment</span>
                            <input required type="number" step="0.01" min="0.01" placeholder="0.00" value={pay.amount}
                              onChange={e => setPay(p => ({ ...p, amount: e.target.value }))}
                              className="w-28 px-3 py-2 text-sm rounded-xl outline-none" style={{ background: 'var(--color-elevated)', border: '1px solid var(--color-border)', color: 'var(--color-text-primary)' }} />
                          </div>
                          <div className="flex flex-col gap-1">
                            <span className="text-[10px] uppercase tracking-wider" style={{ color: 'var(--color-text-muted)' }}>Date</span>
                            <input type="date" value={pay.date} onChange={e => setPay(p => ({ ...p, date: e.target.value }))}
                              className="px-3 py-2 text-sm rounded-xl outline-none" style={{ background: 'var(--color-elevated)', border: '1px solid var(--color-border)', color: 'var(--color-text-primary)' }} />
                          </div>
                          <button type="submit" className="px-4 py-2 text-sm font-semibold text-white rounded-xl hover:brightness-110" style={{ background: 'var(--color-green)' }}>Record</button>
                          <label className="flex items-center gap-1.5 text-[11px]" style={{ color: d.borrowerEmail ? 'var(--color-text-secondary)' : 'var(--color-text-muted)' }}>
                            <input type="checkbox" checked={pay.emailReceipt && !!d.borrowerEmail} disabled={!d.borrowerEmail}
                              onChange={e => setPay(p => ({ ...p, emailReceipt: e.target.checked }))} />
                            Email receipt
                          </label>
                          <button type="button" onClick={sendStatement} disabled={!d.borrowerEmail}
                            className="ml-auto px-3 py-2 text-xs font-semibold rounded-xl disabled:opacity-40 hover:bg-[var(--color-elevated)]"
                            style={{ border: '1px solid var(--color-border)', color: 'var(--color-text-primary)' }}>Send statement</button>
                          {confirmDeleteId === d.id ? (
                            <span className="flex items-center gap-1.5">
                              <span className="text-[11px]" style={{ color: 'var(--color-rose)' }}>
                                Delete debt &amp; its payments?{(() => {
                                  const n = detail.payments.filter((p) => p.transactionId).length;
                                  return n > 0 ? ` ${n} linked transaction${n > 1 ? 's' : ''} will be kept as income.` : '';
                                })()}
                              </span>
                              <button type="button" onClick={() => { setConfirmDeleteId(null); deleteDebt(d.id); }}
                                className="px-2.5 py-2 text-xs font-semibold rounded-xl text-white" style={{ background: 'var(--color-rose)' }}>Yes, delete</button>
                              <button type="button" onClick={() => setConfirmDeleteId(null)}
                                className="px-2.5 py-2 text-xs font-medium rounded-xl hover:bg-[var(--color-elevated)]" style={{ color: 'var(--color-text-secondary)' }}>Cancel</button>
                            </span>
                          ) : (
                            <button type="button" onClick={() => setConfirmDeleteId(d.id)} className="px-3 py-2 text-xs font-semibold rounded-xl hover:bg-red-500/15" style={{ color: 'var(--color-rose)' }}>Delete</button>
                          )}
                        </form>

                        {detail.payments.length === 0 ? (
                          <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>No payments yet.</p>
                        ) : (
                          <div className="flex flex-col gap-1.5">
                            {detail.payments.map(p => (
                              <div key={p.id} className="flex items-center justify-between text-xs py-1.5 px-2 rounded-lg" style={{ background: 'var(--color-elevated)' }}>
                                <span style={{ color: 'var(--color-text-muted)' }}>{p.date}{p.note ? ` · ${p.note}` : ''}</span>
                                <span className="flex items-center gap-3">
                                  <span className="font-bold tabular-nums" style={{ color: 'var(--color-green)' }}>+${fmt(p.amount)}</span>
                                  {p.transactionId
                                    ? <span className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>via transaction</span>
                                    : <button onClick={() => deletePayment(p.id)} className="hover:opacity-70" style={{ color: 'var(--color-text-muted)' }}>✕</button>}
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {toast && (
          <div className="fixed bottom-6 right-6 px-4 py-2.5 rounded-xl text-sm font-semibold z-50"
            style={{ background: 'var(--popover-bg)', border: '1px solid var(--color-border)', color: 'var(--color-green)' }}>{toast}</div>
        )}

        {showForm && createPortal(
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(6px)' }}
            onMouseDown={e => { if (e.target === e.currentTarget) { setShowForm(false); resetForm(); } }}>
            <form onSubmit={createDebt} className="w-full max-w-sm flex flex-col rounded-2xl"
              style={{ background: 'var(--color-elevated)', border: '1px solid var(--color-border)', boxShadow: 'var(--glass-shadow)' }}>
              <div className="px-5 py-4 flex items-center justify-between rounded-t-2xl" style={{ borderBottom: '1px solid var(--color-border)' }}>
                <p className="font-bold text-sm">New Debt</p>
                <button type="button" onClick={() => { setShowForm(false); resetForm(); }}
                  className="w-8 h-8 rounded-lg hover:bg-[var(--color-surface)]" style={{ color: 'var(--color-text-muted)' }}>✕</button>
              </div>
              <div className="flex flex-col gap-3 px-5 py-4">
                {/* Direction toggle */}
                <div className="flex gap-1 p-1 rounded-xl self-start" style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
                  {(['lent', 'owed'] as const).map((dir) => (
                    <button key={dir} type="button" onClick={() => setFormDir(dir)}
                      className="px-3 py-1.5 rounded-lg text-xs font-bold transition-all"
                      style={{
                        background: formDir === dir ? 'color-mix(in srgb, var(--color-card-violet) 18%, transparent)' : 'transparent',
                        color: formDir === dir ? 'var(--color-card-violet)' : 'var(--color-text-muted)',
                        border: formDir === dir ? '1px solid color-mix(in srgb, var(--color-card-violet) 35%, transparent)' : '1px solid transparent',
                      }}>
                      {dir === 'lent' ? 'I Lent' : 'I Owe'}
                    </button>
                  ))}
                </div>
                {/* Fields with direction-aware labels */}
                {([
                  ['borrowerName', formDir === 'lent' ? 'Borrower name' : 'Lender name', 'text', true],
                  ['borrowerEmail', 'Email (optional)', 'email', false],
                  ['principal', formDir === 'lent' ? 'Amount lent' : 'Amount owed', 'number', true],
                  ['description', 'Note (optional)', 'text', false],
                  ['startDate', formDir === 'lent' ? 'Date lent' : 'Date borrowed', 'date', false],
                  ['dueDate', 'Due date (optional)', 'date', false],
                ] as const).map(([key, label, type, req]) => (
                  <label key={key} className="flex flex-col gap-1.5">
                    <span className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'var(--color-text-muted)' }}>{label}</span>
                    <input required={req} type={type} step={type === 'number' ? '0.01' : undefined} min={type === 'number' ? '0.01' : undefined}
                      value={(form as any)[key]} onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
                      className="px-3 py-2.5 text-sm rounded-xl outline-none"
                      style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', color: 'var(--color-text-primary)' }} />
                  </label>
                ))}
              </div>
              <div className="flex gap-2 justify-end px-5 py-4" style={{ borderTop: '1px solid var(--color-border)' }}>
                <button type="button" onClick={() => { setShowForm(false); resetForm(); }}
                  className="px-4 py-2 text-sm font-medium rounded-xl"
                  style={{ color: 'var(--color-text-secondary)', border: '1px solid var(--color-border)' }}>Cancel</button>
                <button type="submit" disabled={saving}
                  className="px-5 py-2 text-sm font-semibold text-white rounded-xl hover:brightness-110 disabled:opacity-50"
                  style={{ background: 'var(--color-card-violet)' }}>{saving ? 'Saving…' : 'Create'}</button>
              </div>
            </form>
          </div>,
          document.body
        )}
      </main>
    </div>
  );
}
