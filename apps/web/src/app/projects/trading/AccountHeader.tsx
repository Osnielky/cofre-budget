'use client';

import { useState } from 'react';
import { KIND_LABEL, STATUS_LABEL, accountTitle, statusTone, type AccountMeta, type TradingStatus } from '@/lib/projects/trading';
import { panel } from '../TradingPerformance';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3333/api';
const TONE = { up: 'var(--color-green)', down: 'var(--color-rose)', flat: 'var(--color-text-primary)', muted: 'var(--color-text-muted)' } as const;
const STATUSES: TradingStatus[] = ['evaluation', 'funded', 'failed', 'closed', 'active'];
const input = 'px-2.5 py-1.5 text-xs rounded-lg outline-none min-w-0';
const inputStyle = { background: 'var(--color-elevated)', border: '1px solid var(--color-border)', color: 'var(--color-text-primary)' };

export default function AccountHeader({ projectId, account, meta, onChanged, onRemoved }: {
  projectId: string; account: { id: string; bankName: string; accountName: string }; meta: AccountMeta;
  onChanged: () => Promise<void>; onRemoved: () => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ firm: meta.firm ?? '', accountSize: meta.accountSize == null ? '' : String(meta.accountSize), startedAt: meta.startedAt ?? '', endedAt: meta.endedAt ?? '', notes: meta.notes ?? '' });
  const [busy, setBusy] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function patch(body: Partial<AccountMeta>) {
    setBusy(true); setError(null);
    try {
      const r = await fetch(`${API}/projects/${projectId}/accounts/${account.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify(body) });
      if (!r.ok) throw new Error((await r.json().catch(() => ({})))?.message ?? 'Could not save');
      await onChanged();
    } catch (e: unknown) { setError(e instanceof Error ? e.message : 'Could not save'); }
    finally { setBusy(false); }
  }

  async function save() {
    await patch({ firm: form.firm.trim() || null, accountSize: form.accountSize === '' ? null : Number(form.accountSize), startedAt: form.startedAt || null, endedAt: form.endedAt || null, notes: form.notes.trim() || null });
    setEditing(false);
  }

  async function remove() {
    setBusy(true);
    const r = await fetch(`${API}/projects/${projectId}/accounts/${account.id}`, { method: 'DELETE', credentials: 'include' });
    setBusy(false);
    if (r.ok) await onRemoved(); else setError('Could not remove the account');
  }

  const connected = meta.provider === 'plaid';
  return (
    <div className="p-4 flex flex-col gap-3" style={panel} data-testid="account-header">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <h3 className="text-base font-bold truncate" style={{ color: 'var(--color-text-primary)' }}>{accountTitle({ account })}</h3>
          <div className="flex items-center gap-1.5 mt-1 flex-wrap text-[10px] font-bold">
            <span className="px-1.5 py-0.5 rounded-md" style={{ background: 'color-mix(in srgb, var(--color-card-sky) 16%, transparent)', color: 'var(--color-card-sky)' }}>{KIND_LABEL[meta.kind]}{connected ? ' · Connected' : ' · Not connected'}</span>
            <label className="flex items-center gap-1">
              <span className="px-1.5 py-0.5 rounded-md" style={{ background: `color-mix(in srgb, ${TONE[statusTone(meta.status)]} 14%, transparent)`, color: TONE[statusTone(meta.status)] }}>{STATUS_LABEL[meta.status]}</span>
              <select value={meta.status} disabled={busy} aria-label="Account status" onChange={(e) => patch({ status: e.target.value as TradingStatus })}
                className="text-[10px] font-semibold rounded-md px-1 py-0.5 cursor-pointer" style={inputStyle}>
                {STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
              </select>
            </label>
            {meta.accountSize != null && <span style={{ color: 'var(--color-text-muted)' }}>${meta.accountSize.toLocaleString('en-US')} account</span>}
            {meta.startedAt && <span style={{ color: 'var(--color-text-muted)' }}>since {meta.startedAt}{meta.endedAt ? ` · until ${meta.endedAt}` : ''}</span>}
          </div>
          {meta.notes && !editing && <p className="text-xs mt-1.5" style={{ color: 'var(--color-text-secondary)' }}>{meta.notes}</p>}
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {connected && <a href="/settings?tab=banks" className="text-[11px] font-semibold px-2.5 py-1.5 rounded-lg" style={{ color: 'var(--color-text-secondary)', border: '1px solid var(--color-border)' }}>Sync in Settings</a>}
          <button type="button" onClick={() => setEditing((v) => !v)} className="text-[11px] font-semibold px-2.5 py-1.5 rounded-lg" style={{ color: 'var(--color-primary)', border: '1px solid color-mix(in srgb, var(--color-primary) 30%, transparent)' }}>{editing ? 'Cancel' : 'Edit'}</button>
          {!confirmRemove
            ? <button type="button" onClick={() => setConfirmRemove(true)} className="text-[11px] font-semibold px-2.5 py-1.5 rounded-lg" style={{ color: 'var(--color-text-muted)', border: '1px solid var(--color-border)' }}>Remove from project</button>
            : <button type="button" disabled={busy} onClick={remove} className="text-[11px] font-semibold px-2.5 py-1.5 rounded-lg" style={{ color: 'var(--color-rose)', border: '1px solid color-mix(in srgb, var(--color-rose) 35%, transparent)' }}>Confirm remove (the account stays in Settings)</button>}
        </div>
      </div>
      {editing && (
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
          <input className={input} style={inputStyle} placeholder="Firm" value={form.firm} onChange={(e) => setForm((f) => ({ ...f, firm: e.target.value }))} aria-label="Firm" />
          <input className={input} style={inputStyle} placeholder="Account size" type="number" min="0" value={form.accountSize} onChange={(e) => setForm((f) => ({ ...f, accountSize: e.target.value }))} aria-label="Account size" />
          <input className={input} style={inputStyle} type="date" value={form.startedAt} onChange={(e) => setForm((f) => ({ ...f, startedAt: e.target.value }))} aria-label="Started" />
          <input className={input} style={inputStyle} type="date" value={form.endedAt} onChange={(e) => setForm((f) => ({ ...f, endedAt: e.target.value }))} aria-label="Ended" />
          <button type="button" disabled={busy} onClick={save} className="text-xs font-semibold px-3 py-1.5 rounded-lg text-white btn-gold">Save</button>
          <textarea className={`${input} sm:col-span-2 lg:col-span-5`} style={inputStyle} rows={2} placeholder="Notes" value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} aria-label="Notes" />
        </div>
      )}
      {error && <p className="text-xs" style={{ color: 'var(--color-rose)' }}>{error}</p>}
    </div>
  );
}
