'use client';

import { useState } from 'react';
import { createPortal } from 'react-dom';
import { fmt, today } from '../format';
import type { Debt } from '../types';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3333/api';

interface Props { openDebts: Debt[]; onClose: () => void; onRecorded: (toast: string) => void }

export default function RecordPaymentModal({ openDebts, onClose, onRecorded }: Props) {
  const [selectedId, setSelectedId] = useState(openDebts[0]?.id ?? '');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(today());
  const [note, setNote] = useState('');
  const [emailReceipt, setEmailReceipt] = useState(true);
  const [saving, setSaving] = useState(false);
  const selected = openDebts.find((d) => d.id === selectedId) ?? null;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!selected) return;
    setSaving(true);
    const res = await fetch(`${API}/debts/${selected.id}/payments`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
      body: JSON.stringify({ amount: parseFloat(amount), date, note: note || null, emailReceipt }),
    });
    const data = await res.json().catch(() => null);
    setSaving(false);
    onRecorded(data?.emailed ? 'Receipt emailed' : 'Payment recorded');
    onClose();
  }

  const inputStyle: React.CSSProperties = { background: 'var(--color-surface)', border: '1px solid var(--color-border)', color: 'var(--color-text-primary)' };

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(6px)' }}
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <form onSubmit={submit} className="w-full max-w-sm flex flex-col rounded-2xl"
        style={{ background: 'var(--color-elevated)', border: '1px solid var(--color-border)', boxShadow: 'var(--glass-shadow)' }}>
        <div className="px-5 py-4 flex flex-col gap-0.5 rounded-t-2xl" style={{ borderBottom: '1px solid var(--color-border)' }}>
          <div className="flex items-center justify-between">
            <p className="font-bold text-sm">Record Payment</p>
            <button type="button" onClick={onClose} className="w-8 h-8 rounded-lg hover:bg-[var(--color-surface)]" style={{ color: 'var(--color-text-muted)' }}>✕</button>
          </div>
          <p className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>Log a repayment against one of your open loans.</p>
        </div>

        {openDebts.length === 0 ? (
          <p className="px-5 py-6 text-sm" style={{ color: 'var(--color-text-muted)' }}>No open loans to record a payment against.</p>
        ) : (
          <div className="flex flex-col gap-3 px-5 py-4">
            <label className="flex flex-col gap-1.5">
              <span className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'var(--color-text-muted)' }}>Loan</span>
              <select required value={selectedId} onChange={(e) => setSelectedId(e.target.value)}
                className="px-3 py-2.5 text-sm rounded-xl outline-none" style={inputStyle}>
                {openDebts.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.direction === 'lent' ? `${d.borrowerName} owes you` : `You owe ${d.borrowerName}`} · ${fmt(d.remaining)} left
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'var(--color-text-muted)' }}>
                {selected?.direction === 'owed' ? 'Amount paid back' : 'Repayment received'}
              </span>
              <input required type="number" step="0.01" min="0.01" placeholder="0.00" value={amount}
                onChange={(e) => setAmount(e.target.value)} className="px-3 py-2.5 text-sm rounded-xl outline-none" style={inputStyle} />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'var(--color-text-muted)' }}>Date</span>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="px-3 py-2.5 text-sm rounded-xl outline-none" style={inputStyle} />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'var(--color-text-muted)' }}>Note (optional)</span>
              <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Zelle, cash"
                className="px-3 py-2.5 text-sm rounded-xl outline-none" style={inputStyle} />
            </label>
            <label className="flex items-center gap-1.5 text-[11px]" style={{ color: selected?.borrowerEmail ? 'var(--color-text-secondary)' : 'var(--color-text-muted)' }}>
              <input type="checkbox" checked={emailReceipt && !!selected?.borrowerEmail} disabled={!selected?.borrowerEmail}
                onChange={(e) => setEmailReceipt(e.target.checked)} />
              {selected?.direction === 'owed' ? 'Email confirmation' : 'Email receipt'}
            </label>
          </div>
        )}

        <div className="flex gap-2 justify-end px-5 py-4" style={{ borderTop: '1px solid var(--color-border)' }}>
          <button type="button" onClick={onClose}
            className="px-4 py-2 text-sm font-medium rounded-xl"
            style={{ color: 'var(--color-text-secondary)', border: '1px solid var(--color-border)' }}>Cancel</button>
          <button type="submit" disabled={saving || openDebts.length === 0}
            className="px-5 py-2 text-sm font-semibold text-white rounded-xl hover:brightness-110 disabled:opacity-50"
            style={{ background: 'var(--color-green)' }}>{saving ? 'Saving…' : 'Record payment'}</button>
        </div>
      </form>
    </div>,
    document.body,
  );
}
