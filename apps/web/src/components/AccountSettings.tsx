'use client';

import { useEffect, useState, FormEvent } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import Avatar from './Avatar';
import { useUser } from './UserProvider';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3333/api';

const inputStyle: React.CSSProperties = {
  background: 'var(--color-elevated)',
  border: '1px solid var(--color-border)',
  borderRadius: 'var(--radius-input)',
  color: 'var(--color-text-primary)',
};

const glass: React.CSSProperties = {
  background: 'var(--color-surface)',
  backdropFilter: 'var(--glass-blur)',
  WebkitBackdropFilter: 'var(--glass-blur)',
  border: 'var(--glass-border)',
  boxShadow: 'var(--glass-shadow)',
};

function fmtDate(iso?: string) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

export default function AccountSettings() {
  const { user, loading, refetch } = useUser();

  // Profile (name)
  const [name, setName] = useState('');
  const [savingName, setSavingName] = useState(false);
  const [nameMsg, setNameMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  useEffect(() => { setName(user?.name ?? ''); }, [user?.name]);

  const isGoogle   = !!user?.googleId;
  const planLabel  = user?.plan === 'elite' ? 'Elite' : user?.plan === 'pro' ? 'Pro' : 'Free';
  const isPaid     = user?.plan === 'pro' || user?.plan === 'elite';
  const nameDirty  = name.trim() !== (user?.name ?? '') && name.trim().length > 0;

  const [showPwModal, setShowPwModal] = useState(false);

  async function saveName(e: FormEvent) {
    e.preventDefault();
    if (!nameDirty) return;
    setSavingName(true); setNameMsg(null);
    try {
      const res = await fetch(`${API}/auth/profile`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify({ name: name.trim() }),
      });
      if (!res.ok) throw new Error();
      await refetch();
      setNameMsg({ kind: 'ok', text: 'Saved.' });
    } catch {
      setNameMsg({ kind: 'err', text: 'Could not save. Please try again.' });
    } finally { setSavingName(false); }
  }

  if (loading && !user) {
    return <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>Loading account…</p>;
  }

  return (
    <div className="flex flex-col gap-5 max-w-2xl">

      {/* ── Identity card ── */}
      <div className="p-5 rounded-2xl flex items-center justify-between gap-4" style={{ ...glass, borderRadius: 'var(--radius-card)' }}>
        <div className="flex items-center gap-4 min-w-0">
          <Avatar name={user?.name} email={user?.email} src={user?.avatarUrl} size={64} rounded={20} />
          <div className="min-w-0">
            <p className="text-lg font-bold truncate" style={{ color: 'var(--color-text-primary)' }}>
              {user?.name || user?.email?.split('@')[0]}
            </p>
            <p className="text-sm truncate" style={{ color: 'var(--color-text-muted)' }}>{user?.email}</p>
            <div className="flex items-center gap-2 mt-2 flex-wrap">
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-md uppercase tracking-wide"
                style={{ background: 'color-mix(in srgb, var(--color-primary) 16%, transparent)', color: 'var(--color-primary)' }}>
                {planLabel} plan
              </span>
              {isGoogle && (
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md flex items-center gap-1"
                  style={{ background: 'var(--color-elevated)', color: 'var(--color-text-secondary)', border: '1px solid var(--color-border)' }}>
                  <GoogleMark /> Connected with Google
                </span>
              )}
            </div>
          </div>
        </div>
        {!isGoogle && (
          <button type="button" onClick={() => setShowPwModal(true)}
            className="px-4 py-2 text-sm font-semibold rounded-xl transition-colors shrink-0 hover:text-(--color-text-primary)"
            style={{ color: 'var(--color-text-secondary)', border: '1px solid var(--color-border)' }}>
            Change password
          </button>
        )}
      </div>

      {/* ── Details / edit name ── */}
      <form onSubmit={saveName} className="p-5 rounded-2xl flex flex-col gap-4" style={{ ...glass, borderRadius: 'var(--radius-card)' }}>
        <p className="text-sm font-bold" style={{ color: 'var(--color-text-primary)' }}>Profile details</p>

        <div className="flex flex-col gap-1.5">
          <label className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'var(--color-text-muted)' }}>Display name</label>
          <input value={name} onChange={(e) => { setName(e.target.value); setNameMsg(null); }}
            placeholder="Your name" maxLength={80}
            className="px-3 py-2.5 text-sm outline-none rounded-xl" style={inputStyle} />
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'var(--color-text-muted)' }}>Email</label>
          <input value={user?.email ?? ''} disabled readOnly
            className="px-3 py-2.5 text-sm outline-none rounded-xl cursor-not-allowed"
            style={{ ...inputStyle, opacity: 0.6 }} />
          <p className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>Your email can't be changed here.</p>
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'var(--color-text-muted)' }}>Member since</label>
          <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>{fmtDate(user?.createdAt)}</p>
        </div>

        <div className="flex items-center justify-between pt-1">
          {nameMsg
            ? <p className="text-xs" style={{ color: nameMsg.kind === 'ok' ? 'var(--color-green)' : 'var(--color-card-orange)' }}>{nameMsg.text}</p>
            : <span />}
          <button type="submit" disabled={!nameDirty || savingName}
            className="px-5 py-2 text-sm font-semibold text-white rounded-xl hover:brightness-110 disabled:opacity-50 transition-all"
            style={{ background: 'var(--color-primary)' }}>
            {savingName ? 'Saving…' : 'Save'}
          </button>
        </div>
      </form>

      {/* ── Billing & Membership ── */}
      <div className="p-5 rounded-2xl flex flex-col gap-4" style={{ ...glass, borderRadius: 'var(--radius-card)' }}>
        <p className="text-sm font-bold" style={{ color: 'var(--color-text-primary)' }}>Billing &amp; Membership</p>

        <div className="flex items-center justify-between gap-4 p-4 rounded-xl"
          style={{ background: 'var(--color-elevated)', border: '1px solid var(--color-border)' }}>
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
              style={{
                background: isPaid
                  ? 'linear-gradient(135deg, var(--color-primary) 0%, var(--color-violet) 100%)'
                  : 'var(--color-surface)',
                border: isPaid ? 'none' : '1px solid var(--color-border)',
                color: isPaid ? '#fff' : 'var(--color-text-muted)',
              }}>
              <PlanIcon />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-bold" style={{ color: 'var(--color-text-primary)' }}>
                {isPaid ? `${planLabel} membership` : 'Free plan'}
              </p>
              <p className="text-[12px]" style={{ color: 'var(--color-text-muted)' }}>
                {isPaid
                  ? 'Thanks for supporting Cofre — all features unlocked.'
                  : "You're on the free plan. No charges, no billing on file."}
              </p>
            </div>
          </div>
          <span className="text-[10px] font-bold px-2.5 py-1 rounded-full uppercase tracking-wide shrink-0"
            style={{
              background: isPaid ? 'color-mix(in srgb, var(--color-green) 14%, transparent)' : 'var(--color-surface)',
              color: isPaid ? 'var(--color-green)' : 'var(--color-text-muted)',
              border: isPaid ? '1px solid color-mix(in srgb, var(--color-green) 30%, transparent)' : '1px solid var(--color-border)',
            }}>
            {isPaid ? 'Active' : 'Free'}
          </span>
        </div>

        {!isPaid && (
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <p className="text-[12px]" style={{ color: 'var(--color-text-muted)' }}>
              Upgrade for automatic bank sync.
            </p>
            <Link href="/settings?tab=billing"
              className="px-4 py-2 text-sm font-semibold text-white rounded-xl transition-all"
              style={{ background: 'var(--color-primary)' }}>
              Upgrade to Pro
            </Link>
          </div>
        )}
      </div>

      {showPwModal && <PasswordModal onClose={() => setShowPwModal(false)} />}
    </div>
  );
}

function PasswordModal({ onClose }: { onClose: () => void }) {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setMsg(null);
    if (next.length < 8) { setMsg({ kind: 'err', text: 'New password must be at least 8 characters.' }); return; }
    if (next !== confirm) { setMsg({ kind: 'err', text: 'New passwords do not match.' }); return; }
    setSaving(true);
    try {
      const res = await fetch(`${API}/auth/change-password`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify({ currentPassword: current, newPassword: next }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.message || 'Could not change password.');
      setMsg({ kind: 'ok', text: 'Password updated.' });
      setCurrent(''); setNext(''); setConfirm('');
      setTimeout(onClose, 800);
    } catch (err: any) {
      setMsg({ kind: 'err', text: err?.message || 'Could not change password.' });
    } finally { setSaving(false); }
  }

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(6px)' }}
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>

      <form onSubmit={submit}
        className="w-full max-w-md flex flex-col rounded-2xl overflow-hidden"
        style={{ background: 'var(--color-elevated)', border: 'var(--glass-border)', boxShadow: 'var(--glass-shadow)' }}>

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5" style={{ borderBottom: '1px solid var(--color-border)' }}>
          <div>
            <p className="font-bold text-sm" style={{ color: 'var(--color-text-primary)' }}>Change password</p>
            <p className="text-xs mt-0.5" style={{ color: 'var(--color-text-muted)' }}>Enter your current password to confirm.</p>
          </div>
          <button type="button" onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center transition-colors hover:bg-[var(--color-surface)]"
            style={{ color: 'var(--color-text-muted)' }}>
            <CloseIcon />
          </button>
        </div>

        {/* Body */}
        <div className="flex flex-col gap-4 px-6 py-5">
          <div className="flex flex-col gap-1.5">
            <label className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'var(--color-text-muted)' }}>Current password</label>
            <input type="password" value={current} onChange={(e) => { setCurrent(e.target.value); setMsg(null); }}
              autoComplete="current-password" autoFocus className="px-3 py-2.5 text-sm outline-none rounded-xl" style={inputStyle} />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'var(--color-text-muted)' }}>New password</label>
            <input type="password" value={next} onChange={(e) => { setNext(e.target.value); setMsg(null); }}
              autoComplete="new-password" className="px-3 py-2.5 text-sm outline-none rounded-xl" style={inputStyle} />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'var(--color-text-muted)' }}>Confirm new password</label>
            <input type="password" value={confirm} onChange={(e) => { setConfirm(e.target.value); setMsg(null); }}
              autoComplete="new-password" className="px-3 py-2.5 text-sm outline-none rounded-xl" style={inputStyle} />
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4" style={{ borderTop: '1px solid var(--color-border)' }}>
          {msg
            ? <p className="text-xs" style={{ color: msg.kind === 'ok' ? 'var(--color-green)' : 'var(--color-card-orange)' }}>{msg.text}</p>
            : <span />}
          <div className="flex gap-2">
            <button type="button" onClick={onClose}
              className="px-4 py-2 text-sm font-medium rounded-xl transition-colors hover:bg-[var(--color-surface)]"
              style={{ color: 'var(--color-text-secondary)' }}>
              Cancel
            </button>
            <button type="submit" disabled={saving || !current || !next || !confirm}
              className="px-5 py-2 text-sm font-semibold text-white rounded-xl hover:brightness-110 disabled:opacity-50 transition-all"
              style={{ background: 'var(--color-primary)' }}>
              {saving ? 'Updating…' : 'Update password'}
            </button>
          </div>
        </div>
      </form>
    </div>,
    document.body,
  );
}

function PlanIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 7h18v12a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V7z"/><path d="M3 7l2-3h14l2 3"/><path d="M3 11h18"/>
    </svg>
  );
}

function CloseIcon() {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>;
}

function GoogleMark() {
  return (
    <svg width="11" height="11" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3c-1.6 4.7-6.1 8-11.3 8-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.6 4.1 29.6 2 24 2 11.8 2 2 11.8 2 24s9.8 22 22 22 22-9.8 22-22c0-1.5-.2-2.7-.4-3.5z"/>
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 16 19 13 24 13c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.6 4.1 29.6 2 24 2 16.3 2 9.7 6.3 6.3 14.7z"/>
      <path fill="#4CAF50" d="M24 46c5.5 0 10.5-2.1 14.3-5.5l-6.6-5.6C29.6 36.5 26.9 37.5 24 37.5c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.6 41.6 16.2 46 24 46z"/>
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.3-2.2 4.2-4 5.6l6.6 5.6C41.8 36.6 46 31 46 24c0-1.5-.2-2.7-.4-3.5z"/>
    </svg>
  );
}
