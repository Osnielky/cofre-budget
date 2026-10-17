'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3333/api';

interface CategoryLite { id: string; name: string; icon: string; color: string }
interface AccountLite { id: string; accountName: string; color?: string | null }

export interface RecurringRule {
  id: string;
  name: string;
  amount: number | string;
  interval: number;
  unit: 'day' | 'week' | 'month' | 'year';
  dayOfMonth: number | null;
  startDate: string;
  endDate: string | null;
  occurrenceCount: number | null;
  lastRunDate: string | null;
  runCount: number;
  active: boolean;
  category: CategoryLite | null;
  bankAccount: AccountLite | null;
  note: string | null;
}

interface HistoryTx {
  id: string; date: string; amount: number | string; name: string;
  bankAccount: AccountLite | null;
}

const glass: React.CSSProperties = {
  background: 'var(--color-surface)',
  backdropFilter: 'var(--glass-blur)',
  WebkitBackdropFilter: 'var(--glass-blur)',
  border: 'var(--glass-border)',
  boxShadow: 'var(--glass-shadow)',
};

const ORDINALS = ['1st','2nd','3rd','4th','5th','6th','7th','8th','9th','10th','11th','12th','13th','14th','15th',
  '16th','17th','18th','19th','20th','21st','22nd','23rd','24th','25th','26th','27th','28th','29th','30th','31st'];
const MONTH_ABBR = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];

function money(n: number) {
  return `${n < 0 ? '−' : ''}$${Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
}
function parseDay(d: string) { return new Date(`${d}T00:00:00`); }
function fmtDate(d: string) {
  return parseDay(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}
function weekday(d: string) { return parseDay(d).toLocaleDateString('en-US', { weekday: 'long' }); }
function todayIso() { return new Date().toISOString().slice(0, 10); }
function daysUntil(d: string) {
  return Math.round((parseDay(d).getTime() - parseDay(todayIso()).getTime()) / 86_400_000);
}

/* ── Occurrence maths, mirroring RecurringService ── */
function daysInMonth(y: number, mi: number) { return new Date(Date.UTC(y, mi + 1, 0)).getUTCDate(); }
function occurrenceAt(r: RecurringRule, n: number): string {
  const [Y, M, D] = r.startDate.split('-').map(Number);
  const start = new Date(Date.UTC(Y, M - 1, D));
  const step = Math.max(1, r.interval) * n;
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  if (r.unit === 'day') return iso(new Date(Date.UTC(Y, M - 1, D + step)));
  if (r.unit === 'week') return iso(new Date(Date.UTC(Y, M - 1, D + step * 7)));
  const per = r.unit === 'year' ? 12 : 1;
  const t = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + step * per, 1));
  const y = t.getUTCFullYear(), m = t.getUTCMonth();
  const want = r.dayOfMonth ?? D;
  return iso(new Date(Date.UTC(y, m, Math.min(want, daysInMonth(y, m)))));
}
function allDates(r: RecurringRule, cap = 60): string[] {
  const out: string[] = [];
  for (let n = 0; n < cap; n++) {
    if (r.occurrenceCount != null && out.length >= r.occurrenceCount) break;
    const d = occurrenceAt(r, n);
    if (r.endDate && d > r.endDate) break;
    out.push(d);
  }
  return out;
}
/** Occurrences still ahead of today. */
function upcoming(r: RecurringRule, n = 3): string[] {
  const t = todayIso();
  return allDates(r).filter((d) => d > t).slice(0, n);
}

function cadence(r: RecurringRule): string {
  const every = r.interval === 1 ? `Every ${r.unit}` : `Every ${r.interval} ${r.unit}s`;
  const monthly = r.unit === 'month' || r.unit === 'year';
  return monthly && r.dayOfMonth ? `${every} on the ${ORDINALS[r.dayOfMonth - 1]}` : every;
}

/** A finished series is "Ended"; a manually stopped one is "Paused". */
type Status = 'active' | 'paused' | 'ended';
function statusOf(r: RecurringRule): Status {
  const finished =
    (r.occurrenceCount != null && r.runCount >= r.occurrenceCount)
    || (!!r.endDate && todayIso() > r.endDate);
  if (finished) return 'ended';
  return r.active ? 'active' : 'paused';
}

/** Normalised to a per-month figure so different cadences can be summed. */
function monthlyEquivalent(r: RecurringRule): number {
  const amt = Math.abs(Number(r.amount));
  const per = Math.max(1, r.interval);
  if (r.unit === 'day') return (amt * 30.44) / per;
  if (r.unit === 'week') return (amt * 4.348) / per;
  if (r.unit === 'year') return amt / (12 * per);
  return amt / per;
}

const STATUS_COLOR: Record<Status, string> = {
  active: 'var(--color-green)', paused: 'var(--color-amber)', ended: 'var(--color-text-muted)',
};

function StatCard({ label, value, sub, icon }: { label: string; value: string; sub: string; icon: React.ReactNode }) {
  return (
    <div className="flex-1 min-w-56 flex items-start gap-3 p-4 rounded-2xl" style={glass}>
      <span className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
        style={{ background: 'color-mix(in srgb, var(--color-primary) 15%, transparent)', color: 'var(--color-primary)' }}>
        {icon}
      </span>
      <div className="min-w-0">
        <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>{label}</p>
        <p className="text-xl font-extrabold tabular-nums leading-tight mt-0.5">{value}</p>
        <p className="text-[11px] mt-0.5" style={{ color: 'var(--color-text-muted)' }}>{sub}</p>
      </div>
    </div>
  );
}

const I = { fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };

export default function RecurringManager() {
  const [rules, setRules] = useState<RecurringRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [tab, setTab] = useState<Status>('active');
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [history, setHistory] = useState<HistoryTx[]>([]);
  /** Per-rule history, so the "recorded this month" figure covers every schedule. */
  const [allHistory, setAllHistory] = useState<Record<string, HistoryTx[]>>({});
  const [confirm, setConfirm] = useState<RecurringRule | null>(null);
  const [alsoDeleteFuture, setAlsoDeleteFuture] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const res = await fetch(`${API}/transactions/recurring`, { credentials: 'include' });
      if (!res.ok) throw new Error();
      const data = await res.json();
      setRules(Array.isArray(data) ? data : []);
    } catch {
      setError('Could not load your recurring payments.');
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Recording history for every rule — the headline figure is across all
  // schedules, not just whichever one is selected in the rail.
  useEffect(() => {
    if (rules.length === 0) { setAllHistory({}); return; }
    let cancelled = false;
    Promise.all(rules.map((r) =>
      fetch(`${API}/transactions/recurring/${r.id}/history`, { credentials: 'include' })
        .then((res) => (res.ok ? res.json() : []))
        .then((d) => [r.id, Array.isArray(d) ? d : []] as const)
        .catch(() => [r.id, [] as HistoryTx[]] as const),
    )).then((pairs) => { if (!cancelled) setAllHistory(Object.fromEntries(pairs)); });
    return () => { cancelled = true; };
  }, [rules]);

  const counts = useMemo(() => {
    const c = { active: 0, paused: 0, ended: 0 };
    for (const r of rules) c[statusOf(r)]++;
    return c;
  }, [rules]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rules.filter((r) => statusOf(r) === tab && (!q || r.name.toLowerCase().includes(q)));
  }, [rules, tab, query]);

  const selected = visible.find((r) => r.id === selectedId) ?? visible[0] ?? null;

  // Load the recording history for whichever schedule is showing in the rail.
  useEffect(() => {
    if (!selected) { setHistory([]); return; }
    let cancelled = false;
    fetch(`${API}/transactions/recurring/${selected.id}/history`, { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => { if (!cancelled) setHistory(Array.isArray(d) ? d : []); })
      .catch(() => { if (!cancelled) setHistory([]); });
    return () => { cancelled = true; };
  }, [selected?.id]);

  /* ── Headline figures ── */
  const activeRules = rules.filter((r) => statusOf(r) === 'active');
  const monthlyOut = activeRules.filter((r) => Number(r.amount) < 0).reduce((s, r) => s + monthlyEquivalent(r), 0);
  const nextUp = activeRules
    .map((r) => ({ r, d: upcoming(r, 1)[0] }))
    .filter((x): x is { r: RecurringRule; d: string } => !!x.d)
    .sort((a, b) => a.d.localeCompare(b.d))[0];
  const thisMonth = todayIso().slice(0, 7);
  const recordedThisMonth = Object.values(allHistory).flat().filter((h) => h.date.startsWith(thisMonth));
  const recordedTotal = recordedThisMonth.reduce((s, h) => s + Math.abs(Number(h.amount)), 0);

  async function act(r: RecurringRule, action: 'stop' | 'resume') {
    setBusyId(r.id);
    try {
      await fetch(`${API}/transactions/recurring/${r.id}/${action}`, { method: 'PATCH', credentials: 'include' });
      await load();
    } finally { setBusyId(null); }
  }

  async function confirmDelete() {
    if (!confirm) return;
    setBusyId(confirm.id);
    try {
      await fetch(`${API}/transactions/recurring/${confirm.id}?deleteFuture=${alsoDeleteFuture}`,
        { method: 'DELETE', credentials: 'include' });
      setConfirm(null);
      await load();
    } finally { setBusyId(null); }
  }

  return (
    <div className="flex flex-col gap-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h3 className="text-xl font-bold">Recurring payments</h3>
          <p className="text-xs mt-0.5" style={{ color: 'var(--color-text-muted)' }}>
            Manage transactions recorded on a repeating schedule.
          </p>
        </div>
        <p className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>
          {fmtDate(todayIso())}
        </p>
      </div>

      {/* Headline figures */}
      <div className="flex gap-3 flex-wrap">
        <StatCard label="Monthly scheduled expenses" value={money(monthlyOut)}
          sub={`${activeRules.length} active schedule${activeRules.length === 1 ? '' : 's'}`}
          icon={<svg width="18" height="18" viewBox="0 0 24 24" {...I}><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>} />
        <StatCard label="Next occurrence"
          value={nextUp ? fmtDate(nextUp.d) : '—'}
          sub={nextUp ? `${nextUp.r.name} · in ${daysUntil(nextUp.d)} day${daysUntil(nextUp.d) === 1 ? '' : 's'}` : 'Nothing scheduled'}
          icon={<svg width="18" height="18" viewBox="0 0 24 24" {...I}><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>} />
        <StatCard label="Recorded this month" value={money(recordedTotal)}
          sub={`${recordedThisMonth.length} transaction${recordedThisMonth.length === 1 ? '' : 's'} added`}
          icon={<svg width="18" height="18" viewBox="0 0 24 24" {...I}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M9 15h6"/></svg>} />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[1fr_340px] gap-4 items-start">
        {/* Schedules */}
        <div className="flex flex-col gap-3 p-4 rounded-2xl" style={glass}>
          <p className="text-base font-bold">Your schedules</p>

          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center gap-1.5">
              {(['active', 'paused', 'ended'] as Status[]).map((s) => {
                const on = tab === s;
                return (
                  <button key={s} type="button" onClick={() => { setTab(s); setSelectedId(null); }}
                    className="px-2.5 py-1.5 rounded-lg text-[11px] font-semibold capitalize transition-all flex items-center gap-1.5"
                    style={on
                      ? { background: `color-mix(in srgb, ${STATUS_COLOR[s]} 18%, transparent)`, border: `1px solid color-mix(in srgb, ${STATUS_COLOR[s]} 45%, transparent)`, color: STATUS_COLOR[s] }
                      : { background: 'var(--color-elevated)', border: '1px solid var(--color-border)', color: 'var(--color-text-muted)' }}>
                    {s}<span className="tabular-nums" style={{ opacity: 0.75 }}>{counts[s]}</span>
                  </button>
                );
              })}
            </div>
            <input value={query} onChange={(e) => setQuery(e.target.value)}
              placeholder="Search schedules" aria-label="Search schedules"
              className="flex-1 min-w-36 px-3 py-2 rounded-xl text-xs outline-none"
              style={{ background: 'var(--color-elevated)', border: '1px solid var(--color-border)', color: 'var(--color-text-primary)' }} />
          </div>

          {loading ? (
            <p className="text-xs py-6 text-center" style={{ color: 'var(--color-text-muted)' }}>Loading…</p>
          ) : error ? (
            <p className="text-xs py-6 text-center" style={{ color: 'var(--color-rose)' }}>{error}</p>
          ) : visible.length === 0 ? (
            <div className="px-4 py-10 rounded-xl flex flex-col items-center text-center gap-2"
              style={{ background: 'var(--color-elevated)', border: '1px dashed var(--color-border)' }}>
              <span className="text-2xl">🔁</span>
              <p className="text-sm font-semibold">No {tab} schedules</p>
              <p className="text-xs max-w-xs" style={{ color: 'var(--color-text-muted)' }}>
                {tab === 'active'
                  ? 'Turn on “Make it recurring” when adding a transaction and the series appears here.'
                  : `Nothing ${tab} right now.`}
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {visible.map((r) => {
                const st = statusOf(r);
                const amt = Number(r.amount);
                const accent = r.category?.color ?? (amt >= 0 ? 'var(--color-green)' : 'var(--color-orange)');
                const isSel = selected?.id === r.id;
                const next = upcoming(r, 1)[0];
                return (
                  <div key={r.id} role="button" tabIndex={0}
                    onClick={() => setSelectedId(r.id)}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelectedId(r.id); } }}
                    className="p-3.5 rounded-xl cursor-pointer transition-colors"
                    style={{
                      background: 'var(--color-elevated)',
                      border: `1px solid ${isSel ? 'color-mix(in srgb, var(--color-primary) 55%, transparent)' : 'var(--color-border)'}`,
                    }}>
                    <div className="flex items-start gap-3 flex-wrap">
                      <span className="w-11 h-11 rounded-xl flex items-center justify-center text-lg shrink-0"
                        style={{ background: `color-mix(in srgb, ${accent} 16%, transparent)`, border: `1px solid color-mix(in srgb, ${accent} 30%, transparent)` }}>
                        {r.category?.icon ?? '🔁'}
                      </span>
                      <div className="flex-1 min-w-32">
                        <p className="text-sm font-bold truncate">{r.name}</p>
                        <p className="text-[11px] mt-0.5" style={{ color: 'var(--color-text-muted)' }}>
                          {[r.category?.name, r.bankAccount?.accountName].filter(Boolean).join(' · ') || 'No category'}
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-base font-bold tabular-nums"
                          style={{ color: amt >= 0 ? 'var(--color-green)' : 'var(--color-text-primary)' }}>{money(amt)}</p>
                        <span className="inline-flex items-center gap-1.5 mt-1 px-2 py-0.5 rounded-full text-[10px] font-bold capitalize"
                          style={{ background: `color-mix(in srgb, ${STATUS_COLOR[st]} 16%, transparent)`, color: STATUS_COLOR[st] }}>
                          <span className="w-1.5 h-1.5 rounded-full" style={{ background: STATUS_COLOR[st] }} />{st}
                        </span>
                      </div>
                    </div>

                    <div className="flex gap-6 flex-wrap mt-3 pt-3" style={{ borderTop: '1px solid var(--color-border)' }}>
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--color-text-muted)' }}>Repeats</p>
                        <p className="text-xs mt-0.5">{cadence(r)}</p>
                      </div>
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--color-text-muted)' }}>Next date</p>
                        <p className="text-xs mt-0.5">{next ? fmtDate(next) : '—'}</p>
                      </div>
                    </div>

                    <div className="flex items-center justify-between gap-2 flex-wrap mt-3">
                      <p className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>
                        Started {fmtDate(r.startDate)} · {r.endDate ? `ends ${fmtDate(r.endDate)}`
                          : r.occurrenceCount ? `${r.runCount} of ${r.occurrenceCount} recorded` : 'no end date'}
                      </p>
                      <div className="flex items-center gap-1.5">
                        {st !== 'ended' && (
                          <button type="button" disabled={busyId === r.id}
                            onClick={(e) => { e.stopPropagation(); act(r, st === 'active' ? 'stop' : 'resume'); }}
                            className="px-2.5 py-1.5 rounded-lg text-[11px] font-semibold transition-all hover:brightness-125 disabled:opacity-40"
                            style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', color: 'var(--color-text-secondary)' }}>
                            {busyId === r.id ? '…' : st === 'active' ? 'Pause' : 'Resume'}
                          </button>
                        )}
                        <button type="button" aria-label={`Delete ${r.name}`}
                          onClick={(e) => { e.stopPropagation(); setConfirm(r); setAlsoDeleteFuture(true); }}
                          className="w-8 h-8 rounded-lg flex items-center justify-center transition-colors hover:bg-red-500/20"
                          style={{ color: 'var(--color-rose)' }}>
                          <svg width="13" height="13" viewBox="0 0 24 24" {...I}><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/></svg>
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Recording history for the selected schedule */}
          {selected && (
            <div className="mt-1 pt-3" style={{ borderTop: '1px solid var(--color-border)' }}>
              <p className="text-sm font-bold">Recording history</p>
              <p className="text-[11px] mb-2" style={{ color: 'var(--color-text-muted)' }}>
                Transactions already added for {selected.name}.
              </p>
              {history.length === 0 ? (
                <p className="text-xs py-3" style={{ color: 'var(--color-text-muted)' }}>Nothing recorded yet.</p>
              ) : (
                <div className="flex flex-col gap-1.5">
                  {history.slice(0, 6).map((h) => {
                    const d = parseDay(h.date);
                    return (
                      <div key={h.id} className="flex items-center gap-3 px-3 py-2 rounded-xl"
                        style={{ background: 'var(--color-elevated)' }}>
                        <span className="w-10 shrink-0 text-center">
                          <span className="block text-[9px] font-bold" style={{ color: 'var(--color-text-muted)' }}>{MONTH_ABBR[d.getMonth()]}</span>
                          <span className="block text-sm font-bold tabular-nums leading-none">{String(d.getDate()).padStart(2, '0')}</span>
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-semibold truncate">{h.name}</p>
                          <p className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>
                            {[h.bankAccount?.accountName, fmtDate(h.date)].filter(Boolean).join(' · ')}
                          </p>
                        </div>
                        <p className="text-xs font-bold tabular-nums shrink-0">{money(Number(h.amount))}</p>
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold shrink-0"
                          style={{ background: 'color-mix(in srgb, var(--color-green) 16%, transparent)', color: 'var(--color-green)' }}>
                          Recorded
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
              <p className="text-[11px] mt-2" style={{ color: 'var(--color-text-muted)' }}>
                Pausing a schedule keeps previously recorded transactions.
              </p>
            </div>
          )}
        </div>

        {/* Preview rail */}
        {selected && (() => {
          const amt = Number(selected.amount);
          const accent = selected.category?.color ?? (amt >= 0 ? 'var(--color-green)' : 'var(--color-orange)');
          const next = upcoming(selected, 3);
          return (
            <div className="flex flex-col gap-3 p-4 rounded-2xl" style={glass}>
              <p className="text-base font-bold">Schedule preview</p>

              <div className="flex items-center gap-3">
                <span className="w-11 h-11 rounded-xl flex items-center justify-center text-lg shrink-0"
                  style={{ background: `color-mix(in srgb, ${accent} 16%, transparent)`, border: `1px solid color-mix(in srgb, ${accent} 30%, transparent)` }}>
                  {selected.category?.icon ?? '🔁'}
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-bold truncate">{selected.name}</p>
                  <span className="inline-block mt-0.5 px-2 py-0.5 rounded-full text-[10px] font-bold"
                    style={{ background: 'color-mix(in srgb, var(--color-primary) 15%, transparent)', color: 'var(--color-primary)' }}>
                    Auto-record
                  </span>
                </div>
              </div>

              <p className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>
                Records {money(amt)}{selected.bankAccount ? ` from ${selected.bankAccount.accountName}` : ''}, {cadence(selected).toLowerCase()}.
              </p>

              <div className="grid grid-cols-2 gap-2">
                <div className="p-2.5 rounded-xl" style={{ background: 'var(--color-elevated)' }}>
                  <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--color-text-muted)' }}>Starts</p>
                  <p className="text-xs font-semibold mt-0.5">{fmtDate(selected.startDate)}</p>
                </div>
                <div className="p-2.5 rounded-xl" style={{ background: 'var(--color-elevated)' }}>
                  <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--color-text-muted)' }}>Ends</p>
                  <p className="text-xs font-semibold mt-0.5">
                    {selected.endDate ? fmtDate(selected.endDate)
                      : selected.occurrenceCount ? `After ${selected.occurrenceCount}` : 'No end date'}
                  </p>
                </div>
              </div>

              <div>
                <p className="text-xs font-bold mb-1.5">Upcoming occurrences</p>
                {next.length === 0 ? (
                  <p className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>
                    {statusOf(selected) === 'active' ? 'Nothing further scheduled.' : 'Paused — nothing will be recorded.'}
                  </p>
                ) : (
                  <div className="flex flex-col gap-1.5">
                    {next.map((d) => {
                      const dt = parseDay(d);
                      return (
                        <div key={d} className="flex items-center gap-3 px-2.5 py-2 rounded-xl"
                          style={{ background: 'var(--color-elevated)' }}>
                          <span className="w-9 shrink-0 text-center">
                            <span className="block text-[9px] font-bold" style={{ color: 'var(--color-text-muted)' }}>{MONTH_ABBR[dt.getMonth()]}</span>
                            <span className="block text-sm font-bold tabular-nums leading-none">{String(dt.getDate()).padStart(2, '0')}</span>
                          </span>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-semibold">{weekday(d)}</p>
                            <p className="text-[11px] tabular-nums" style={{ color: 'var(--color-text-muted)' }}>{money(amt)}</p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              <p className="text-[11px] px-3 py-2 rounded-xl" style={{ background: 'color-mix(in srgb, var(--color-primary) 8%, transparent)', color: 'var(--color-text-secondary)' }}>
                Adds a transaction on each date once it arrives. This does not move any money.
              </p>
            </div>
          );
        })()}
      </div>

      {confirm && createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}
          onMouseDown={(e) => { if (e.target === e.currentTarget) setConfirm(null); }}>
          <div className="w-full max-w-md rounded-2xl flex flex-col gap-5 p-6"
            style={{ background: 'var(--color-elevated)', border: 'var(--glass-border)', boxShadow: 'var(--glass-shadow)' }}>
            <div>
              <p className="font-bold text-base">Delete “{confirm.name}”?</p>
              <p className="text-xs mt-1.5" style={{ color: 'var(--color-text-muted)' }}>
                This removes the schedule so nothing new is recorded. Occurrences already
                recorded in the past are real spending and are always kept.
              </p>
            </div>
            <label className="flex items-start gap-2.5 cursor-pointer">
              <input type="checkbox" checked={alsoDeleteFuture}
                onChange={(e) => setAlsoDeleteFuture(e.target.checked)}
                className="mt-0.5 w-4 h-4 shrink-0" style={{ accentColor: 'var(--color-rose)' }} />
              <span>
                <span className="block text-xs font-semibold">Also delete future-dated occurrences</span>
                <span className="block text-[11px] mt-0.5" style={{ color: 'var(--color-text-muted)' }}>
                  Leave this off to keep them as ordinary transactions you can edit.
                </span>
              </span>
            </label>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setConfirm(null)}
                className="px-4 py-2 text-sm font-medium rounded-xl transition-colors hover:bg-[var(--color-surface)]"
                style={{ color: 'var(--color-text-secondary)', border: '1px solid var(--color-border)' }}>Cancel</button>
              <button onClick={confirmDelete} disabled={busyId === confirm.id}
                className="px-4 py-2 text-sm font-semibold rounded-xl transition-all hover:brightness-110 disabled:opacity-40"
                style={{ background: 'color-mix(in srgb, var(--color-rose) 18%, transparent)', border: '1px solid color-mix(in srgb, var(--color-rose) 35%, transparent)', color: 'var(--color-rose)' }}>
                {busyId === confirm.id ? 'Deleting…' : 'Delete schedule'}
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}
