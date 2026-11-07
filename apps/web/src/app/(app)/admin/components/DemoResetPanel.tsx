'use client';

import { useState } from 'react';
import Panel from '@/components/dashboard/Panel';

/** One button with a confirm step: wipe the Rockefeller demo account and re-seed it. */
export default function DemoResetPanel({ onReset }: { onReset: () => Promise<void> }) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  async function run() {
    setBusy(true); setNote(null);
    try { await onReset(); setNote('Rockefeller was reset to the seed data.'); setConfirming(false); }
    catch (e) { setNote(e instanceof Error ? e.message : 'Reset failed.'); }
    finally { setBusy(false); }
  }

  return (
    <Panel title="Demo account" subtitle="Rockefeller / demo">
      <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
        Puts the Rockefeller account back to its seeded year of data. Use it after a video or if someone changed it.
        Visitor sandboxes are separate and clean themselves up.
      </p>
      <div className="mt-3 flex items-center gap-2 flex-wrap">
        {!confirming ? (
          <button type="button" onClick={() => setConfirming(true)}
            className="px-4 py-2 rounded-xl text-sm font-semibold cursor-pointer"
            style={{ background: 'var(--color-elevated)', border: '1px solid var(--color-border)' }}>
            Reset Rockefeller demo data
          </button>
        ) : (
          <>
            <button type="button" onClick={run} disabled={busy}
              className="px-4 py-2 rounded-xl text-sm font-semibold cursor-pointer disabled:opacity-40"
              style={{ background: 'color-mix(in srgb, var(--color-rose) 18%, transparent)', border: '1px solid color-mix(in srgb, var(--color-rose) 35%, transparent)', color: 'var(--color-rose)' }}>
              {busy ? 'Resetting…' : 'Yes, wipe and re-seed'}
            </button>
            <button type="button" onClick={() => setConfirming(false)} disabled={busy}
              className="px-4 py-2 rounded-xl text-sm font-medium cursor-pointer"
              style={{ color: 'var(--color-text-secondary)', border: '1px solid var(--color-border)' }}>
              Cancel
            </button>
          </>
        )}
      </div>
      {note && <p className="mt-3 text-xs" style={{ color: 'var(--color-text-muted)' }}>{note}</p>}
    </Panel>
  );
}
