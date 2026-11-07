'use client';

import { useState } from 'react';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3333/api';
const input = 'w-full px-3 py-2 text-sm rounded-xl outline-none';
const inputStyle = { background: 'var(--color-elevated)', border: '1px solid var(--color-border)', color: 'var(--color-text-primary)' };

/** Creates a manual investment account (a prop-firm combine, a broker without a connection) and follows it. */
export default function AddAccountModal({ projectId, onClose, onCreated, onConnectInstead }: {
  projectId: string; onClose: () => void; onCreated: () => Promise<void>; onConnectInstead: () => void;
}) {
  const [form, setForm] = useState({ firm: 'Topstep', name: '', kind: 'prop_firm' as 'prop_firm' | 'broker', status: 'evaluation' as 'evaluation' | 'funded' | 'active', accountSize: '', startedAt: new Date().toISOString().slice(0, 10) });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setError(null);
    try {
      const r = await fetch(`${API}/projects/${projectId}/accounts`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify({ firm: form.firm.trim(), name: form.name.trim(), kind: form.kind, status: form.kind === 'broker' ? 'active' : form.status, accountSize: form.accountSize ? Number(form.accountSize) : null, startedAt: form.startedAt || null }),
      });
      if (!r.ok) throw new Error((await r.json().catch(() => ({})))?.message ?? 'Could not create the account');
      await onCreated();
      onClose();
    } catch (err: unknown) { setError(err instanceof Error ? err.message : 'Could not create the account'); }
    finally { setBusy(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(6px)' }} onClick={(e) => { if (e.target === e.currentTarget && !busy) onClose(); }}>
      <form onSubmit={submit} className="w-full max-w-md flex flex-col gap-4 p-5 rounded-2xl" style={{ background: 'var(--color-elevated)', border: 'var(--glass-border)', boxShadow: 'var(--glass-shadow)' }}>
        <div>
          <p className="font-bold text-sm" style={{ color: 'var(--color-text-primary)' }}>Add an account you are not connected to</p>
          <p className="text-xs mt-1" style={{ color: 'var(--color-text-muted)' }}>A prop-firm combine or funded account, or a broker without a bank connection. You will attribute its payments and payouts to it from the project's transactions.</p>
          <button type="button" onClick={onConnectInstead} className="text-xs font-semibold mt-1.5" style={{ color: 'var(--color-primary)' }}>Connected brokerage instead → pick it in the project form</button>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1 text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--color-text-muted)' }}>Firm
            <input className={input} style={inputStyle} value={form.firm} onChange={(e) => setForm((f) => ({ ...f, firm: e.target.value }))} placeholder="Topstep" required /></label>
          <label className="flex flex-col gap-1 text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--color-text-muted)' }}>Account name
            <input className={input} style={inputStyle} value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="50K #1" required /></label>
          <label className="flex flex-col gap-1 text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--color-text-muted)' }}>Kind
            <select className={input} style={inputStyle} value={form.kind} onChange={(e) => setForm((f) => ({ ...f, kind: e.target.value as 'prop_firm' | 'broker' }))}>
              <option value="prop_firm">Prop firm</option><option value="broker">Broker</option></select></label>
          {form.kind === 'prop_firm' && (
            <label className="flex flex-col gap-1 text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--color-text-muted)' }}>Status
              <select className={input} style={inputStyle} value={form.status} onChange={(e) => setForm((f) => ({ ...f, status: e.target.value as 'evaluation' | 'funded' }))}>
                <option value="evaluation">Evaluation</option><option value="funded">Funded</option></select></label>
          )}
          <label className="flex flex-col gap-1 text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--color-text-muted)' }}>Account size
            <input className={input} style={inputStyle} type="number" min="0" value={form.accountSize} onChange={(e) => setForm((f) => ({ ...f, accountSize: e.target.value }))} placeholder="50000" /></label>
          <label className="flex flex-col gap-1 text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--color-text-muted)' }}>Started
            <input className={input} style={inputStyle} type="date" value={form.startedAt} onChange={(e) => setForm((f) => ({ ...f, startedAt: e.target.value }))} /></label>
        </div>
        {error && <p className="text-xs" style={{ color: 'var(--color-rose)' }}>{error}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} disabled={busy} className="px-4 py-2 text-sm font-medium rounded-xl" style={{ color: 'var(--color-text-secondary)' }}>Cancel</button>
          <button type="submit" disabled={busy || !form.firm.trim() || !form.name.trim()} className="px-5 py-2 text-sm font-semibold rounded-xl text-white btn-gold disabled:opacity-50">{busy ? 'Adding…' : 'Add account'}</button>
        </div>
      </form>
    </div>
  );
}
