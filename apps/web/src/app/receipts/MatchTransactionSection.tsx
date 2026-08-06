'use client';

import { useState, useEffect, useCallback } from 'react';
import { money, type Receipt } from '@/lib/receipts/derive';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3333/api';

interface TransactionCandidate {
  id: string;
  name: string;
  date: string;
  amount: number;
  amountDelta: number;
  linked: boolean;
}

interface Props {
  receipt: Receipt;
  onChanged: () => void;
}

export default function MatchTransactionSection({ receipt, onChanged }: Props) {
  const [candidates, setCandidates] = useState<TransactionCandidate[]>([]);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const search = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API}/receipts/${receipt.id}/transaction-candidates`, { credentials: 'include' });
      const data = await res.json();
      setCandidates(Array.isArray(data) ? data : []);
    } finally {
      setLoading(false);
    }
  }, [receipt.id]);

  useEffect(() => {
    if (expanded) search();
  }, [expanded, search]);

  async function link(txId: string | null) {
    const targetTxId = txId ?? receipt.matchedTransaction?.id;
    if (!targetTxId) return;
    setBusyId(txId ?? 'unlink');
    try {
      const res = await fetch(`${API}/transactions/${targetTxId}/receipt`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ receiptId: txId ? receipt.id : null }),
      });
      if (res.ok) onChanged();
    } finally {
      setBusyId(null);
    }
  }

  if (receipt.matchedTransaction) {
    const tx = receipt.matchedTransaction;
    return (
      <div className="rounded-xl p-3" style={{ background: 'var(--color-elevated)', border: '1px solid var(--color-border)' }}>
        <p className="text-xs mb-1" style={{ color: 'var(--color-text-muted)' }}>Matched to transaction</p>
        <p className="text-sm font-medium" style={{ color: 'var(--color-text-primary)' }}>{tx.name} — {money(tx.amount)} on {tx.date}</p>
        <button onClick={() => link(null)} disabled={busyId === 'unlink'}
          className="mt-2 text-xs font-medium underline disabled:opacity-50"
          style={{ color: 'var(--color-card-orange)' }}>
          {busyId === 'unlink' ? 'Unmatching…' : 'Unmatch'}
        </button>
      </div>
    );
  }

  return (
    <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--color-border)' }}>
      <button onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center justify-between gap-2 px-4 py-3 text-sm font-medium"
        style={{ background: 'var(--color-elevated)', color: 'var(--color-text-primary)' }}>
        <span className="flex items-center gap-2">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--color-sky)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M9 17H7a5 5 0 0 1 0-10h2 M15 7h2a5 5 0 0 1 0 10h-2 M8 12h8" />
          </svg>
          Match to Transaction
        </span>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
          style={{ color: 'var(--color-text-muted)', transform: expanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }} aria-hidden="true">
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>
      {expanded && (
        <div className="p-3 space-y-1.5" style={{ borderTop: '1px solid var(--color-border)' }}>
          {loading && <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>Searching…</p>}
          {!loading && candidates.length === 0 && (
            <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>No nearby transactions found.</p>
          )}
          {candidates.map((c) => (
            <div key={c.id} className="flex items-center justify-between gap-2 text-xs rounded-lg px-2 py-1.5"
              style={{ background: 'var(--color-surface)' }}>
              <span className="truncate" style={{ color: 'var(--color-text-primary)' }}>{c.name} · {money(c.amount)} · {c.date}</span>
              <button onClick={() => link(c.id)} disabled={busyId === c.id}
                className="shrink-0 px-2 py-1 rounded-md font-medium disabled:opacity-50"
                style={{ background: 'color-mix(in srgb, var(--color-sky) 15%, transparent)', color: 'var(--color-sky)' }}>
                {busyId === c.id ? 'Matching…' : 'Match'}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
