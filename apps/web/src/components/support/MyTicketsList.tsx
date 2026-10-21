'use client';

import { useCallback, useEffect, useState } from 'react';
import ReportProblemModal from './ReportProblemModal';
import { STATUS_LABELS, statusTone, type MyTicket } from '@/lib/support/report';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3333/api';
const when = (iso: string) => new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

export function StatusPill({ status }: { status: MyTicket['status'] }) {
  const tone = statusTone(status);
  return (
    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 uppercase tracking-wide"
      style={{ background: `color-mix(in srgb, ${tone} 16%, transparent)`, color: tone, border: `1px solid color-mix(in srgb, ${tone} 30%, transparent)` }}>
      {STATUS_LABELS[status]}
    </span>
  );
}

/** Settings → Help: the user's problem reports, their status and the reply. */
export default function MyTicketsList() {
  const [tickets, setTickets] = useState<MyTicket[] | null>(null);
  const [error, setError] = useState('');
  const [reporting, setReporting] = useState(false);

  const load = useCallback(() => {
    fetch(`${API}/support/tickets`, { credentials: 'include' })
      .then(async (r) => { if (!r.ok) throw new Error(`Could not load your reports (${r.status}).`); setTickets(await r.json()); })
      .catch((e: Error) => setError(e.message));
  }, []);
  useEffect(() => { load(); }, [load]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold">Help &amp; feedback</h2>
          <p className="text-xs mt-0.5" style={{ color: 'var(--color-text-muted)' }}>Something broken or confusing? Tell us and we&rsquo;ll fix it.</p>
        </div>
        <button type="button" onClick={() => setReporting(true)} className="btn-gold px-4 py-2 text-sm font-semibold rounded-xl">Report a problem</button>
      </div>
      {reporting && <ReportProblemModal onClose={() => setReporting(false)} onReported={load} />}

      {error && <p className="text-sm" style={{ color: 'var(--color-rose)' }}>{error}</p>}
      {tickets === null && !error && <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>Loading…</p>}
      {tickets && tickets.length === 0 && (
        <p className="text-sm rounded-2xl px-5 py-6 text-center" style={{ color: 'var(--color-text-secondary)', background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
          No reports yet. If something looks wrong, use <strong>Report a problem</strong> in the sidebar and we&rsquo;ll take it from there.
        </p>
      )}
      {tickets && tickets.length > 0 && (
        <ul className="flex flex-col gap-3">
          {tickets.map((t) => (
            <li key={t.id} className="rounded-2xl p-4 flex flex-col gap-2.5" style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
              <div className="flex flex-wrap items-center gap-2 text-xs" style={{ color: 'var(--color-text-muted)' }}>
                <StatusPill status={t.status} />
                <span>{when(t.createdAt)}</span>
                <span>· {t.page}</span>
                {t.resolvedAt && <span>· resolved {when(t.resolvedAt)}</span>}
              </div>
              <div className="flex gap-3">
                <p className="text-sm flex-1 min-w-0 whitespace-pre-wrap" style={{ color: 'var(--color-text-primary)' }}>{t.description}</p>
                {t.hasScreenshot && (
                  <a href={`${API}/support/tickets/${t.id}/screenshot`} target="_blank" rel="noopener noreferrer" className="shrink-0 rounded-lg overflow-hidden" title="Open the screenshot"
                    style={{ border: '1px solid var(--color-border)', width: 96, height: 60 }}>
                    {/* eslint-disable-next-line @next/next/no-img-element -- private image from the API */}
                    <img src={`${API}/support/tickets/${t.id}/screenshot`} alt="Screenshot you sent" className="w-full h-full object-cover" />
                  </a>
                )}
              </div>
              {t.reply && (
                <div className="rounded-xl px-3.5 py-2.5 text-sm" style={{ background: 'color-mix(in srgb, var(--color-green) 8%, transparent)', borderLeft: '3px solid var(--color-green)' }}>
                  <p className="text-[11px] font-semibold uppercase tracking-wide mb-1" style={{ color: 'var(--color-green)' }}>Reply from Cofre</p>
                  <p className="whitespace-pre-wrap" style={{ color: 'var(--color-text-primary)' }}>{t.reply}</p>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
        Prefer email? <a href="mailto:support@budgetcofre.com" style={{ color: 'var(--color-primary)' }}>support@budgetcofre.com</a>
      </p>
    </div>
  );
}
