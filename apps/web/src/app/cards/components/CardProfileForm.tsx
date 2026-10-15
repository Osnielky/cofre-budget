'use client';

import { useEffect, useState } from 'react';
import type { CardGoal, CardProfileView, ScoreBand } from '@/lib/cards/types';
import { GOAL_LABELS, SCORE_BANDS } from '@/lib/cards/profile';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3333/api';

const EMPTY: CardProfileView = { goal: null, annualFeeOk: null, creditScoreBand: null, monthlyDebtBudget: null, plannedPurchaseAmount: null, plannedPurchaseNote: null };

function toAmount(s: string): number | null | undefined {
  const t = s.trim().replace(/[$,\s]/g, '');
  if (t === '') return null;
  return /^\d+(\.\d+)?$/.test(t) ? Number(t) : undefined;
}

export default function CardProfileForm() {
  const [profile, setProfile] = useState<CardProfileView>(EMPTY);
  const [budget, setBudget] = useState('');
  const [purchase, setPurchase] = useState('');
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [open, setOpen] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);

  useEffect(() => {
    fetch(`${API}/cards/profile`, { credentials: 'include' })
      .then((r) => { if (!r.ok) throw new Error(); return r.json(); })
      .then((p: CardProfileView | null) => {
        setLoaded(true);
        if (!p) return;
        setProfile(p);
        setBudget(p.monthlyDebtBudget === null ? '' : String(p.monthlyDebtBudget));
        setPurchase(p.plannedPurchaseAmount === null ? '' : String(p.plannedPurchaseAmount));
        setOpen(!p.goal || !p.creditScoreBand);
      })
      .catch(() => setLoadFailed(true));
  }, []);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const monthlyDebtBudget = toAmount(budget);
    const plannedPurchaseAmount = toAmount(purchase);
    if (monthlyDebtBudget === undefined || plannedPurchaseAmount === undefined) { setStatus('error'); return; }
    setStatus('saving');
    const res = await fetch(`${API}/cards/profile`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
      body: JSON.stringify({ ...profile, monthlyDebtBudget, plannedPurchaseAmount }),
    }).catch(() => null);
    if (!res?.ok) { setStatus('error'); return; }
    setProfile(await res.json());
    setStatus('saved');
  }

  const inputStyle = { background: 'var(--color-elevated)', border: '1px solid var(--color-border)' };

  return (
    <section className="rounded-2xl p-5" style={{ background: 'var(--color-surface)', border: 'var(--glass-border)', backdropFilter: 'var(--glass-blur)' }}>
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className="w-full flex items-center justify-between gap-3 text-left">
        <span>
          <span className="block font-semibold">Your card goals</span>
          <span className="block text-xs" style={{ color: 'var(--color-text-muted)' }}>Ask Cofre uses these to advise you on cards</span>
        </span>
        <span aria-hidden="true">{open ? '−' : '+'}</span>
      </button>
      {open && (
        <form onSubmit={save} className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
          <label className="flex flex-col gap-1">
            <span style={{ color: 'var(--color-text-secondary)' }}>Main goal</span>
            <select value={profile.goal ?? ''} onChange={(e) => setProfile({ ...profile, goal: (e.target.value || null) as CardGoal | null })}
              className="px-3 py-2 rounded-lg" style={inputStyle}>
              <option value="">Choose…</option>
              {Object.entries(GOAL_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span style={{ color: 'var(--color-text-secondary)' }}>Approximate credit score</span>
            <select value={profile.creditScoreBand ?? ''} onChange={(e) => setProfile({ ...profile, creditScoreBand: (e.target.value || null) as ScoreBand | null })}
              className="px-3 py-2 rounded-lg" style={inputStyle}>
              <option value="">Choose…</option>
              {SCORE_BANDS.map((b) => <option key={b.value} value={b.value}>{b.label}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span style={{ color: 'var(--color-text-secondary)' }}>Annual fee OK?</span>
            <select value={profile.annualFeeOk === null ? '' : String(profile.annualFeeOk)}
              onChange={(e) => setProfile({ ...profile, annualFeeOk: e.target.value === '' ? null : e.target.value === 'true' })}
              className="px-3 py-2 rounded-lg" style={inputStyle}>
              <option value="">Not sure</option>
              <option value="true">Yes, if the rewards are worth it</option>
              <option value="false">No annual fee</option>
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span style={{ color: 'var(--color-text-secondary)' }}>Monthly amount for card payments ($)</span>
            <input value={budget} onChange={(e) => setBudget(e.target.value)} inputMode="decimal" className="px-3 py-2 rounded-lg" style={inputStyle} />
          </label>
          <label className="flex flex-col gap-1">
            <span style={{ color: 'var(--color-text-secondary)' }}>Planned big purchase ($)</span>
            <input value={purchase} onChange={(e) => setPurchase(e.target.value)} inputMode="decimal" className="px-3 py-2 rounded-lg" style={inputStyle} />
          </label>
          <label className="flex flex-col gap-1">
            <span style={{ color: 'var(--color-text-secondary)' }}>What is it?</span>
            <input value={profile.plannedPurchaseNote ?? ''} maxLength={120}
              onChange={(e) => setProfile({ ...profile, plannedPurchaseNote: e.target.value })} className="px-3 py-2 rounded-lg" style={inputStyle} />
          </label>
          <div className="md:col-span-2 flex items-center gap-3">
            <button type="submit" disabled={status === 'saving' || !loaded} className="btn-gold px-4 py-2.5 rounded-xl font-semibold">
              {status === 'saving' ? 'Saving…' : 'Save goals'}
            </button>
            {loadFailed && <span style={{ color: 'var(--color-rose)' }}>Could not load your goals.</span>}
            {status === 'saved' && <span style={{ color: 'var(--color-green)' }}>Saved</span>}
            {status === 'error' && <span style={{ color: 'var(--color-rose)' }}>Amounts must be numbers like 450 or 1200.50</span>}
          </div>
        </form>
      )}
    </section>
  );
}
