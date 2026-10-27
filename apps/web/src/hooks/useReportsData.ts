'use client';

import { useEffect, useState } from 'react';
import type { Transaction, BankAccount, Project } from '@/lib/dashboard/types';
import type { HistoryPoint } from '@/lib/goals/history';
import type { ReportRange } from '@/lib/reports/range';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3333/api';

export interface ReportsData {
  cur: Transaction[];
  prev: Transaction[];
  projects: Project[];
  accounts: BankAccount[];
  history: HistoryPoint[];
  loading: boolean;
  error: string | null;
}

/**
 * One transactions request covering the previous period through the end of
 * the current one, split client-side; projects, accounts and the net worth
 * history load once. Reloads transactions whenever the range changes.
 */
export function useReportsData(range: ReportRange): ReportsData {
  const [cur, setCur] = useState<Transaction[]>([]);
  const [prev, setPrev] = useState<Transaction[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [accounts, setAccounts] = useState<BankAccount[]>([]);
  const [history, setHistory] = useState<HistoryPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      fetch(`${API}/projects`, { credentials: 'include' }).then((r) => r.json()).catch(() => []),
      fetch(`${API}/bank-accounts`, { credentials: 'include' }).then((r) => r.json()).catch(() => []),
      fetch(`${API}/net-worth-goal/history`, { credentials: 'include' }).then((r) => (r.ok ? r.json() : { points: [] })).catch(() => ({ points: [] })),
    ]).then(([p, a, h]) => {
      if (cancelled) return;
      setProjects(Array.isArray(p) ? p : []);
      setAccounts(Array.isArray(a) ? a : []);
      setHistory(Array.isArray(h?.points) ? h.points : []);
    });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true); setError(null);
    fetch(`${API}/transactions?from=${range.prevFrom}&to=${range.to}&limit=20000`, { credentials: 'include' })
      .then((r) => { if (!r.ok) throw new Error('request failed'); return r.json(); })
      .then((rows: Transaction[]) => {
        if (cancelled) return;
        const list = Array.isArray(rows) ? rows : [];
        setCur(list.filter((t) => t.date.slice(0, 10) >= range.from && t.date.slice(0, 10) <= range.to));
        setPrev(list.filter((t) => t.date.slice(0, 10) >= range.prevFrom && t.date.slice(0, 10) <= range.prevTo));
      })
      .catch(() => { if (!cancelled) setError('Could not load your transactions. Please try again.'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [range.from, range.to, range.prevFrom, range.prevTo]);

  return { cur, prev, projects, accounts, history, loading, error };
}
