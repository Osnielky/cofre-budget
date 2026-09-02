'use client';

import { useState } from 'react';
import type { RecentAction } from '@/hooks/useAiChat';

function relativeTime(iso: string) {
  const diffMs = Date.now() - new Date(iso).getTime();
  const days = Math.floor(diffMs / 86_400_000);
  if (days <= 0) return 'Today';
  if (days === 1) return 'Yesterday';
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export default function RecentChangesPanel({
  actions, onUndo,
}: {
  actions: RecentAction[];
  onUndo: (id: string) => Promise<{ reverted: number; skipped: number } | null>;
}) {
  const [undoingId, setUndoingId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [undoNotice, setUndoNotice] = useState<string | null>(null);
  const visible = expanded ? actions : actions.slice(0, 5);

  async function handleUndo(id: string) {
    setUndoingId(id);
    setUndoNotice(null);
    try {
      const result = await onUndo(id);
      if (result && result.skipped > 0) {
        const total = result.reverted + result.skipped;
        setUndoNotice(
          `Reverted ${result.reverted} of ${total} — ${result.skipped} ${result.skipped === 1 ? 'was' : 'were'} edited manually since and left alone.`,
        );
      }
    } finally {
      setUndoingId(null);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--color-text-muted)' }}>Recent changes</p>
        {actions.length > 5 && (
          <button onClick={() => setExpanded((e) => !e)} className="text-[10px] font-semibold cursor-pointer" style={{ color: 'var(--color-primary)' }}>
            {expanded ? 'Show less' : 'Full log →'}
          </button>
        )}
      </div>
      {undoNotice && (
        <p className="text-xs px-3 py-2 rounded-xl" style={{ background: 'var(--color-elevated)', border: '1px solid var(--color-amber)', color: 'var(--color-text-secondary)' }}>
          {undoNotice}
        </p>
      )}
      {visible.length === 0 && <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>Nothing yet.</p>}
      {visible.map((a) => (
        <div key={a.id} className="flex items-center justify-between gap-2 px-3 py-2 rounded-xl text-xs"
          style={{ background: 'var(--color-elevated)', border: '1px solid var(--color-border)' }}>
          <div className="min-w-0">
            <p className="truncate">{a.label}</p>
            <p style={{ color: 'var(--color-text-muted)' }}>{relativeTime(a.createdAt)}</p>
          </div>
          <button onClick={() => handleUndo(a.id)} disabled={undoingId === a.id}
            className="text-[10px] font-semibold uppercase shrink-0 cursor-pointer disabled:opacity-40"
            style={{ color: 'var(--color-primary)' }}>
            {undoingId === a.id ? '…' : 'Undo'}
          </button>
        </div>
      ))}
    </div>
  );
}
