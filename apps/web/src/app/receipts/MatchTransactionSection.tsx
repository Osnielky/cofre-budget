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
      <div className="rounded-xl p-3 mb-4"
        style={{ background: 'color-mix(in srgb, var(--color-sky) 8%, transparent)', border: '1px solid color-mix(in srgb, var(--color-sky) 20%, transparent)' }}>
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
    <div className="rounded-xl p-3 mb-4" style={{ background: 'var(--color-elevated)', border: '1px solid var(--color-border)' }}>
      <button onClick={() => setExpanded((v) => !v)} className="text-xs font-medium" style={{ color: 'var(--color-sky)' }}>
        {expanded ? 'Hide' : 'Match to Transaction'}
      </button>
      {expanded && (
        <div className="mt-2 space-y-1.5">
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
