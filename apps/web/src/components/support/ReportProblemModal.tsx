'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { capturePage, readImageFile } from './capture';
import { validateDescription, viewportOf, MAX_DESCRIPTION } from '@/lib/support/report';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3333/api';

interface Props {
  onClose: () => void;
  /** Called with the new ticket id after a successful report (the Help tab refreshes its list). */
  onReported?: (id: string) => void;
}

const inputStyle: React.CSSProperties = { background: 'var(--color-surface)', border: '1px solid var(--color-border)', color: 'var(--color-text-primary)' };
const ghost = 'px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors cursor-pointer disabled:opacity-40';
const ghostStyle: React.CSSProperties = { color: 'var(--color-text-secondary)', border: '1px solid var(--color-border)' };

/**
 * "Report a problem": grabs a screenshot of the page behind the dialog as it
 * opens, lets the user retake / remove / upload one, asks what went wrong and
 * files the ticket. Demo accounts get the demo message from the API.
 */
export default function ReportProblemModal({ onClose, onReported }: Props) {
  const pathname = usePathname() ?? '/';
  const [shot, setShot] = useState<string | null>(null);
  const [capturing, setCapturing] = useState(true);
  const [captureFailed, setCaptureFailed] = useState(false);
  const [description, setDescription] = useState('');
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [doneId, setDoneId] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function capture() {
    setCapturing(true); setCaptureFailed(false);
    try {
      // Let the dialog paint first so the user is not left staring at a blank backdrop; it is excluded from the shot.
      await new Promise((r) => requestAnimationFrame(() => setTimeout(r, 30)));
      setShot(await capturePage());
    } catch {
      setShot(null); setCaptureFailed(true);
    } finally { setCapturing(false); }
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- capture once, when the dialog opens
  useEffect(() => { capture(); }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !busy) onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [busy, onClose]);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setError('');
    try { setShot(await readImageFile(file)); setCaptureFailed(false); }
    catch (err) { setError(err instanceof Error ? err.message : 'Could not use that image.'); }
  }

  const problem = validateDescription(description);

  async function submit() {
    setTouched(true);
    if (problem) return;
    setBusy(true); setError('');
    try {
      const res = await fetch(`${API}/support/tickets`, {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ description: description.trim(), page: pathname, viewport: viewportOf(window), screenshot: shot ?? undefined }),
      });
      const data = await res.json().catch(() => null);
      if (res.status === 403 && data?.code === 'DEMO_READ_ONLY') {
        throw new Error('Reporting is off in the demo. Email support@budgetcofre.com instead.');
      }
      if (res.status === 429) throw new Error('You have sent several reports just now. Please try again in a few minutes.');
      if (!res.ok) throw new Error(data?.message ?? 'Could not send the report. Please try again.');
      setDoneId(data.id);
      onReported?.(data.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send the report. Please try again.');
    } finally { setBusy(false); }
  }

  return createPortal(
    <div data-no-capture className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center sm:p-4"
      style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}
      onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) onClose(); }}>
      <div role="dialog" aria-modal="true" aria-labelledby="report-title"
        className="w-full sm:max-w-lg max-h-[100dvh] sm:max-h-[90dvh] overflow-y-auto rounded-t-2xl sm:rounded-2xl flex flex-col gap-4 p-5 sm:p-6"
        style={{ background: 'var(--color-elevated)', border: 'var(--glass-border)', boxShadow: 'var(--glass-shadow)' }}>

        {doneId ? (
          <>
            <div className="flex flex-col items-center text-center gap-2 py-4">
              <span className="w-12 h-12 rounded-full flex items-center justify-center text-xl" style={{ background: 'color-mix(in srgb, var(--color-green) 16%, transparent)', color: 'var(--color-green)' }} aria-hidden="true">✓</span>
              <p id="report-title" className="font-bold text-base">Thanks, we got it.</p>
              <p className="text-sm max-w-sm" style={{ color: 'var(--color-text-secondary)' }}>
                We&rsquo;ll look into it and reply by email. You can follow it in{' '}
                <Link href="/settings?tab=help" onClick={onClose} className="font-semibold" style={{ color: 'var(--color-primary)' }}>Settings → Help</Link>.
              </p>
            </div>
            <div className="flex justify-end">
              <button type="button" onClick={onClose} className="btn-gold px-4 py-2 text-sm font-semibold rounded-xl">Done</button>
            </div>
          </>
        ) : (
          <>
            <div>
              <p id="report-title" className="font-bold text-base">Report a problem</p>
              <p className="text-xs mt-0.5" style={{ color: 'var(--color-text-muted)' }}>Tell us what went wrong. A screenshot of this screen is attached so we can see what you saw.</p>
            </div>

            {/* Screenshot */}
            <div className="flex flex-col gap-2">
              <div className="relative rounded-xl overflow-hidden flex items-center justify-center" style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', minHeight: 120 }}>
                {capturing ? (
                  <p className="text-xs py-10" style={{ color: 'var(--color-text-muted)' }} aria-live="polite">Capturing this screen…</p>
                ) : shot ? (
                  // eslint-disable-next-line @next/next/no-img-element -- a data URL preview, not an asset
                  <img src={shot} alt="Screenshot that will be sent with your report" className="w-full h-auto max-h-56 object-contain" />
                ) : (
                  <p className="text-xs py-8 px-4 text-center" style={{ color: 'var(--color-text-muted)' }}>
                    {captureFailed ? 'Couldn’t capture this screen. Attach an image instead, or send without one.' : 'No screenshot attached.'}
                  </p>
                )}
              </div>
              <div className="flex flex-wrap gap-1.5">
                <button type="button" onClick={capture} disabled={capturing || busy} className={ghost} style={ghostStyle}>Retake</button>
                <button type="button" onClick={() => fileRef.current?.click()} disabled={busy} className={ghost} style={ghostStyle}>Upload image</button>
                {shot && <button type="button" onClick={() => setShot(null)} disabled={busy} className={ghost} style={ghostStyle}>Remove</button>}
                <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={onFile} />
              </div>
            </div>

            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-semibold" style={{ color: 'var(--color-text-secondary)' }}>What went wrong?</span>
              <textarea value={description} onChange={(e) => setDescription(e.target.value)} onBlur={() => setTouched(true)}
                rows={4} maxLength={MAX_DESCRIPTION} autoFocus disabled={busy}
                placeholder="What you were doing, what you expected, and what happened instead."
                className="w-full px-3 py-2.5 text-sm rounded-xl outline-none resize-y" style={inputStyle} />
              <span className="flex justify-between text-[11px]" style={{ color: 'var(--color-text-muted)' }}>
                <span role={touched && problem ? 'alert' : undefined} style={touched && problem ? { color: 'var(--color-rose)' } : undefined}>{touched && problem ? problem : ''}</span>
                <span className="tabular-nums">{description.trim().length}/{MAX_DESCRIPTION}</span>
              </span>
            </label>

            <p className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>
              We&rsquo;ll include this page ({pathname}), your screen size and browser. Only you and Cofre&rsquo;s team can see the screenshot.
            </p>

            {error && <p className="text-xs" style={{ color: 'var(--color-rose)' }} role="alert">{error}</p>}

            <div className="flex gap-2 justify-end pt-1">
              <button type="button" onClick={onClose} disabled={busy}
                className="px-4 py-2 text-sm font-medium rounded-xl transition-colors hover:bg-[var(--color-surface)]"
                style={{ color: 'var(--color-text-secondary)', border: '1px solid var(--color-border)' }}>
                Cancel
              </button>
              <button type="button" onClick={submit} disabled={busy || capturing}
                className="btn-gold px-4 py-2 text-sm font-semibold rounded-xl transition-all disabled:opacity-40">
                {busy ? 'Sending…' : 'Send report'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}
