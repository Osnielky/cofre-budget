'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import Panel, { PanelEmpty } from '@/components/dashboard/Panel';
import { useAdminTickets, fetchAdminTicket, patchAdminTicket, adminTicketScreenshotUrl } from '@/hooks/useAdmin';
import { relativeTime } from '@/lib/admin/format';
import type { AdminTicket, TicketStatus } from '@/lib/admin/types';
import { StatusPill } from '@/components/support/MyTicketsList';
import { STATUS_LABELS } from '@/lib/support/report';

const STATUSES: TicketStatus[] = ['open', 'in_progress', 'resolved', 'closed'];
const date = (iso: string) => new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
const firstLine = (s: string) => { const l = s.split('\n')[0]; return l.length > 90 ? l.slice(0, 90) + '…' : l; };
const inputStyle: React.CSSProperties = { background: 'var(--color-surface)', border: '1px solid var(--color-border)', color: 'var(--color-text-primary)' };

/** Admin queue for problem reports: filter by status, open one, note it, reply and resolve. */
export default function TicketsPanel({ refreshKey }: { refreshKey: number }) {
  const [status, setStatus] = useState<TicketStatus | 'all'>('open');
  const [page, setPage] = useState(1);
  const [bump, setBump] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const { data, error } = useAdminTickets(status, page, refreshKey + bump);

  // The admin email links to /admin?ticket=<id>.
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get('ticket');
    if (id) setSelectedId(id);
  }, []);

  const tab = (s: TicketStatus | 'all', label: string, n?: number) => (
    <button key={s} type="button" onClick={() => { setStatus(s); setPage(1); }}
      className="px-2.5 py-1 rounded-md text-[10.5px] font-semibold transition-all cursor-pointer whitespace-nowrap"
      style={status === s
        ? { background: 'color-mix(in srgb, var(--color-primary) 16%, transparent)', border: '1px solid color-mix(in srgb, var(--color-primary) 35%, transparent)', color: 'var(--color-primary)' }
        : { background: 'transparent', border: '1px solid var(--color-border)', color: 'var(--color-text-muted)' }}>
      {label}{n != null ? ` ${n}` : ''}
    </button>
  );

  return (
    <Panel title="Problem reports" subtitle={data ? `${data.counts.open} open · ${data.counts.in_progress} in progress` : undefined}
      legend={
        <div className="flex items-center gap-1.5 flex-wrap justify-end">
          {STATUSES.map((s) => tab(s, STATUS_LABELS[s], data?.counts[s]))}
          {tab('all', 'All', data?.total)}
        </div>
      }>
      {error && <p className="text-sm" style={{ color: 'var(--color-rose)' }}>{error}</p>}
      {!data && !error && <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>Loading…</p>}
      {data && data.tickets.length === 0 && <PanelEmpty message={status === 'all' ? 'No reports yet.' : `Nothing ${STATUS_LABELS[status].toLowerCase()}.`} />}
      {data && data.tickets.length > 0 && (
        <div className="flex flex-col gap-3">
          <div className="overflow-x-auto -mx-1 px-1">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wider" style={{ color: 'var(--color-text-muted)' }}>
                  {['When', 'Who', 'Page', 'Problem', ''].map((h, i) => <th key={i} scope="col" className="py-2 pr-4 font-semibold">{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {data.tickets.map((t) => (
                  <tr key={t.id} onClick={() => setSelectedId(t.id)} className="cursor-pointer"
                    style={{ borderTop: '1px solid var(--color-border)' }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--color-elevated)'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}>
                    <td className="py-2.5 pr-4 whitespace-nowrap" style={{ color: 'var(--color-text-secondary)' }} title={date(t.createdAt)}>{relativeTime(t.createdAt)}</td>
                    <td className="py-2.5 pr-4 max-w-[180px] truncate">{t.user.name || t.user.email || '—'}</td>
                    <td className="py-2.5 pr-4 whitespace-nowrap tabular-nums" style={{ color: 'var(--color-text-secondary)' }}>{t.page}</td>
                    <td className="py-2.5 pr-4 min-w-[200px]">{firstLine(t.description)}</td>
                    <td className="py-2.5 whitespace-nowrap text-right"><span className="inline-flex items-center gap-2">{t.hasScreenshot && <span title="Has a screenshot" aria-label="Has a screenshot">🖼</span>}<StatusPill status={t.status} /></span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {data.lastPage > 1 && (
            <div className="flex items-center justify-end gap-2 text-xs" style={{ color: 'var(--color-text-muted)' }}>
              <button type="button" disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="px-2 py-1 rounded-md disabled:opacity-40 cursor-pointer" style={{ border: '1px solid var(--color-border)' }}>Prev</button>
              <span>Page {data.page} of {data.lastPage}</span>
              <button type="button" disabled={page >= data.lastPage} onClick={() => setPage((p) => p + 1)} className="px-2 py-1 rounded-md disabled:opacity-40 cursor-pointer" style={{ border: '1px solid var(--color-border)' }}>Next</button>
            </div>
          )}
        </div>
      )}
      {selectedId && (
        <TicketDrawer id={selectedId} onClose={() => setSelectedId(null)} onChanged={() => setBump((b) => b + 1)} />
      )}
    </Panel>
  );
}

function TicketDrawer({ id, onClose, onChanged }: { id: string; onClose: () => void; onChanged: () => void }) {
  const [t, setT] = useState<AdminTicket | null>(null);
  const [error, setError] = useState('');
  const [status, setStatus] = useState<TicketStatus>('open');
  const [note, setNote] = useState('');
  const [reply, setReply] = useState('');
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState('');

  useEffect(() => {
    let alive = true;
    setT(null); setError('');
    fetchAdminTicket(id).then((x) => { if (!alive) return; setT(x); setStatus(x.status); setNote(x.adminNote ?? ''); setReply(x.reply ?? ''); })
      .catch((e: Error) => { if (alive) setError(e.message); });
    return () => { alive = false; };
  }, [id]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !busy) onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [busy, onClose]);

  async function save(resolve: boolean) {
    setBusy(true); setError(''); setSaved('');
    try {
      const next = await patchAdminTicket(id, { status: resolve ? 'resolved' : status, reply: reply.trim() || null, adminNote: note.trim() || null });
      setT(next); setStatus(next.status);
      setSaved(resolve && next.replySentAt ? 'Resolved and reply sent.' : 'Saved.');
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save.');
    } finally { setBusy(false); }
  }

  const dirty = t ? status !== t.status || note.trim() !== (t.adminNote ?? '') || reply.trim() !== (t.reply ?? '') : false;

  // Portalled: the Panel's backdrop-filter would otherwise become the containing block of this fixed drawer.
  return createPortal(
    <div className="fixed inset-0 z-[70] flex items-end md:items-stretch md:justify-end" style={{ background: 'rgba(0,0,0,0.55)' }}
      onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) onClose(); }}>
      <aside role="dialog" aria-modal="true" aria-label="Problem report"
        className="w-full md:w-[520px] md:max-w-[92vw] max-h-[92dvh] md:max-h-none md:h-full overflow-y-auto rounded-t-2xl md:rounded-none flex flex-col gap-4 p-5 sm:p-6"
        style={{ background: 'var(--color-elevated)', borderLeft: 'var(--glass-border)', boxShadow: 'var(--glass-shadow)' }}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="font-bold text-base">Problem report</p>
            {t && <p className="text-xs mt-0.5 truncate" style={{ color: 'var(--color-text-muted)' }}>{t.user.name || '—'} · {t.user.email || 'no email'} · {date(t.createdAt)}</p>}
          </div>
          <button type="button" onClick={onClose} disabled={busy} aria-label="Close" className="w-8 h-8 rounded-lg flex items-center justify-center cursor-pointer" style={{ border: '1px solid var(--color-border)', color: 'var(--color-text-secondary)' }}>✕</button>
        </div>

        {error && <p className="text-sm" style={{ color: 'var(--color-rose)' }} role="alert">{error}</p>}
        {!t && !error && <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>Loading…</p>}
        {t && (
          <>
            <div className="flex flex-wrap items-center gap-2 text-xs" style={{ color: 'var(--color-text-muted)' }}>
              <StatusPill status={t.status} />
              <span className="tabular-nums">{t.page}</span><span>· {t.viewport}</span>
              <span className="truncate max-w-full" title={t.userAgent}>· {browserOf(t.userAgent)}</span>
            </div>
            {t.hasScreenshot ? (
              <a href={adminTicketScreenshotUrl(t.id)} target="_blank" rel="noopener noreferrer" className="rounded-xl overflow-hidden block" style={{ border: '1px solid var(--color-border)' }} title="Open full size">
                {/* eslint-disable-next-line @next/next/no-img-element -- private image from the API */}
                <img src={adminTicketScreenshotUrl(t.id)} alt="Screenshot sent with the report" className="w-full h-auto" />
              </a>
            ) : (
              <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>No screenshot.</p>
            )}
            <p className="text-sm whitespace-pre-wrap rounded-xl px-3.5 py-3" style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>{t.description}</p>

            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-semibold" style={{ color: 'var(--color-text-secondary)' }}>Status</span>
              <select value={status} onChange={(e) => setStatus(e.target.value as TicketStatus)} disabled={busy}
                className="w-full px-3 py-2.5 text-sm rounded-xl outline-none appearance-none" style={inputStyle}>
                {STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
              </select>
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-semibold" style={{ color: 'var(--color-text-secondary)' }}>Internal note <span style={{ color: 'var(--color-text-muted)' }}>(only admins see this)</span></span>
              <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} disabled={busy} maxLength={4000}
                className="w-full px-3 py-2.5 text-sm rounded-xl outline-none resize-y" style={inputStyle} />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-semibold" style={{ color: 'var(--color-text-secondary)' }}>Reply to {t.user.name || 'the user'} <span style={{ color: 'var(--color-text-muted)' }}>(they see this in Settings → Help{t.replySentAt ? `; emailed ${relativeTime(t.replySentAt)}` : '; emailed when resolved'})</span></span>
              <textarea value={reply} onChange={(e) => setReply(e.target.value)} rows={4} disabled={busy} maxLength={4000}
                placeholder="What you found and what changed."
                className="w-full px-3 py-2.5 text-sm rounded-xl outline-none resize-y" style={inputStyle} />
            </label>

            {saved && <p className="text-xs" style={{ color: 'var(--color-green)' }} role="status">{saved}</p>}
            <div className="flex flex-wrap gap-2 justify-end pt-1">
              <button type="button" onClick={() => save(false)} disabled={busy || !dirty}
                className="px-4 py-2 text-sm font-medium rounded-xl transition-colors disabled:opacity-40 cursor-pointer"
                style={{ color: 'var(--color-text-secondary)', border: '1px solid var(--color-border)' }}>
                {busy ? 'Saving…' : 'Save'}
              </button>
              <button type="button" onClick={() => save(true)} disabled={busy || !reply.trim() || (t.status === 'resolved' && !!t.replySentAt && reply.trim() === (t.reply ?? ''))}
                className="btn-gold px-4 py-2 text-sm font-semibold rounded-xl transition-all disabled:opacity-40">
                {t.replySentAt ? 'Reply sent' : 'Resolve & send reply'}
              </button>
            </div>
          </>
        )}
      </aside>
    </div>,
    document.body,
  );
}

function browserOf(ua: string): string {
  if (!ua) return 'unknown browser';
  const m = /(Edg|OPR|Chrome|Firefox|Safari)\/(\d+)/.exec(ua);
  const name = m ? ({ Edg: 'Edge', OPR: 'Opera', Chrome: 'Chrome', Firefox: 'Firefox', Safari: 'Safari' } as Record<string, string>)[m[1]] : 'browser';
  const os = /iPhone|iPad/.test(ua) ? 'iOS' : /Android/.test(ua) ? 'Android' : /Mac OS/.test(ua) ? 'macOS' : /Windows/.test(ua) ? 'Windows' : /Linux/.test(ua) ? 'Linux' : '';
  return `${name}${m ? ' ' + m[2] : ''}${os ? ' on ' + os : ''}`;
}
