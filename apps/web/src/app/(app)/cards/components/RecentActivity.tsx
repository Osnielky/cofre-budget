'use client';

/* The newest transactions on the selected card, folded under the detail. Loaded the first
   time it is opened for an account and kept for the visit, so flipping between cards
   never refetches. */

import { useEffect, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import type { Transaction } from '@/lib/dashboard/types';
import { fmtDateShort } from '@/app/(app)/debts/format';
import { Money } from '@/components/motion/Money';
import { durations, fadeUp } from '@/lib/motion/tokens';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3333/api';
const LIMIT = 8;
const cache = new Map<string, Transaction[]>();

interface Props { accountId: string; open: boolean; onToggle: () => void }

export default function RecentActivity({ accountId, open, onToggle }: Props) {
  const reduce = useReducedMotion();
  const [rows, setRows] = useState<Transaction[] | null>(() => cache.get(accountId) ?? null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!open) return;
    const cached = cache.get(accountId);
    if (cached) { setRows(cached); return; }
    let live = true;
    fetch(`${API}/transactions?accountId=${encodeURIComponent(accountId)}&limit=${LIMIT}`, { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error())))
      .then((d: unknown) => {
        const list = (Array.isArray(d) ? d : []) as Transaction[];
        cache.set(accountId, list);
        if (live) setRows(list);
      })
      .catch(() => { if (live) setFailed(true); });
    return () => { live = false; };
  }, [accountId, open]);

  return (
    <div className="pt-3" style={{ borderTop: '1px solid var(--color-border)' }}>
      <button type="button" onClick={onToggle} aria-expanded={open}
        className="w-full flex items-center justify-between gap-3 py-1 text-sm font-semibold">
        <span>Recent activity</span>
        <motion.svg animate={{ rotate: open ? 180 : 0 }} transition={{ duration: reduce ? 0 : durations.fast }}
          width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="m6 9 6 6 6-6" />
        </motion.svg>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div key="body" initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
            transition={{ duration: reduce ? 0 : durations.base }} className="overflow-hidden">
            {failed ? (
              <p className="py-2 text-xs" style={{ color: 'var(--color-rose)' }}>Could not load the activity.</p>
            ) : rows === null ? (
              <p className="py-2 text-xs" style={{ color: 'var(--color-text-muted)' }}>Loading…</p>
            ) : rows.length === 0 ? (
              <p className="py-2 text-xs" style={{ color: 'var(--color-text-muted)' }}>No transactions on this card yet.</p>
            ) : (
              <ul className="py-1 flex flex-col">
                {rows.map((t, i) => {
                  const income = Number(t.amount) >= 0;
                  return (
                    <motion.li key={t.id} {...fadeUp(i, !!reduce)} className="flex items-center gap-3 py-2 text-sm">
                      <span className="w-12 shrink-0 text-xs tabular-nums" style={{ color: 'var(--color-text-muted)' }}>{fmtDateShort(t.date)}</span>
                      <span className="flex-1 min-w-0 truncate">{t.name}</span>
                      <span className="shrink-0 font-semibold tabular-nums" style={{ color: income ? 'var(--color-green)' : 'var(--color-text-primary)' }}>
                        {income ? '+' : '−'}<Money value={t.amount} />
                      </span>
                    </motion.li>
                  );
                })}
              </ul>
            )}
            <a href="/transactions" className="inline-block mt-1 mb-1 text-xs font-semibold" style={{ color: 'var(--color-primary)' }}>All transactions →</a>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
