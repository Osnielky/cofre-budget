'use client';

import { useState } from 'react';

export default function ProposalCard({
  summary, onConfirm, onReject,
}: {
  summary: string;
  onConfirm: () => Promise<void>;
  onReject: () => Promise<void>;
}) {
  const [status, setStatus] = useState<'pending' | 'confirming' | 'rejecting' | 'confirmed' | 'rejected'>('pending');

  async function handleConfirm() {
    setStatus('confirming');
    try { await onConfirm(); setStatus('confirmed'); } catch { setStatus('pending'); }
  }
  async function handleReject() {
    setStatus('rejecting');
    try { await onReject(); setStatus('rejected'); } catch { setStatus('pending'); }
  }

  return (
    <div className="mt-2 p-4 rounded-2xl flex flex-col gap-3 max-w-md"
      style={{ background: 'var(--color-elevated)', border: '1px solid var(--color-border)' }}>
      <p className="text-sm font-semibold">{summary}</p>
      {status === 'pending' && (
        <div className="flex gap-2">
          <button onClick={handleConfirm}
            className="flex-1 py-2 rounded-xl text-xs font-bold uppercase cursor-pointer"
            style={{ background: 'var(--color-primary)', color: 'white' }}>Confirm</button>
          <button onClick={handleReject}
            className="px-4 py-2 rounded-xl text-xs font-semibold cursor-pointer"
            style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>Reject</button>
        </div>
      )}
      {status === 'confirming' && <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>Applying…</p>}
      {status === 'rejecting' && <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>Rejecting…</p>}
      {status === 'confirmed' && <p className="text-xs font-semibold" style={{ color: 'var(--color-green)' }}>✓ Confirmed</p>}
      {status === 'rejected' && <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>Rejected</p>}
    </div>
  );
}
