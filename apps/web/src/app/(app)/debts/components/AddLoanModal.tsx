'use client';

import { useState } from 'react';
import { createPortal } from 'react-dom';
import { today } from '../format';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3333/api';

interface Props { onClose: () => void; onCreated: () => void }

export default function AddLoanModal({ onClose, onCreated }: Props) {
  const [dir, setDir] = useState<'lent' | 'owed'>('lent');
  const [form, setForm] = useState({ borrowerName: '', borrowerEmail: '', principal: '', description: '', startDate: today(), dueDate: '' });
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
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
        direction: dir,
      }),
    });
    setSaving(false);
    onCreated();
    onClose();
  }

  const fields = [
    ['borrowerName', dir === 'lent' ? 'Who you lent to' : 'Who you borrowed from', 'text', true],
    ['borrowerEmail', 'Their email (optional, for receipts)', 'email', false],
    ['principal', dir === 'lent' ? 'Amount lent' : 'Amount owed', 'number', true],
    ['description', 'Note (optional)', 'text', false],
    ['startDate', dir === 'lent' ? 'Date lent' : 'Date borrowed', 'date', false],
    ['dueDate', 'Due date (optional)', 'date', false],
  ] as const;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(6px)' }}
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <form onSubmit={submit} className="w-full max-w-sm flex flex-col rounded-2xl"
        style={{ background: 'var(--color-elevated)', border: '1px solid var(--color-border)', boxShadow: 'var(--glass-shadow)' }}>
        <div className="px-5 py-4 flex flex-col gap-0.5 rounded-t-2xl" style={{ borderBottom: '1px solid var(--color-border)' }}>
          <div className="flex items-center justify-between">
            <p className="font-bold text-sm">Add Loan</p>
            <button type="button" onClick={onClose} className="w-8 h-8 rounded-lg hover:bg-[var(--color-surface)]" style={{ color: 'var(--color-text-muted)' }}>✕</button>
          </div>
          <p className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>
            A personal record between you and someone you trust — you&apos;ll log repayments yourself.
          </p>
        </div>
        <div className="flex flex-col gap-3 px-5 py-4">
          <div className="flex gap-1 p-1 rounded-xl self-start" style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
            {(['lent', 'owed'] as const).map((d) => (
              <button key={d} type="button" onClick={() => setDir(d)}
                className="px-3 py-1.5 rounded-lg text-xs font-bold transition-all"
                style={{
                  background: dir === d ? 'color-mix(in srgb, var(--color-card-violet) 18%, transparent)' : 'transparent',
                  color: dir === d ? 'var(--color-card-violet)' : 'var(--color-text-muted)',
                  border: dir === d ? '1px solid color-mix(in srgb, var(--color-card-violet) 35%, transparent)' : '1px solid transparent',
                }}>
                {d === 'lent' ? 'I Lent' : 'I Owe'}
              </button>
            ))}
          </div>
          {fields.map(([key, label, type, req]) => (
            <label key={key} className="flex flex-col gap-1.5">
              <span className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'var(--color-text-muted)' }}>{label}</span>
              <input required={req} type={type} step={type === 'number' ? '0.01' : undefined} min={type === 'number' ? '0.01' : undefined}
                value={form[key]} onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                className="px-3 py-2.5 text-sm rounded-xl outline-none"
                style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', color: 'var(--color-text-primary)' }} />
            </label>
          ))}
        </div>
        <div className="flex gap-2 justify-end px-5 py-4" style={{ borderTop: '1px solid var(--color-border)' }}>
          <button type="button" onClick={onClose}
            className="px-4 py-2 text-sm font-medium rounded-xl"
            style={{ color: 'var(--color-text-secondary)', border: '1px solid var(--color-border)' }}>Cancel</button>
          <button type="submit" disabled={saving}
            className="px-5 py-2 text-sm font-semibold text-white rounded-xl hover:brightness-110 disabled:opacity-50"
            style={{ background: 'var(--color-card-violet)' }}>{saving ? 'Saving…' : 'Save record'}</button>
        </div>
      </form>
    </div>,
    document.body,
  );
}
