'use client';

import { useMemo } from 'react';
import type { Transaction, BankAccount, Project } from '@/lib/dashboard/types';
import type { HistoryPoint } from '@/lib/goals/history';
import type { ReportRange } from '@/lib/reports/range';
import { useApi } from './useApi';

export interface ReportsData {
  cur: Transaction[];
  prev: Transaction[];
  projects: Project[];
  accounts: BankAccount[];
  history: HistoryPoint[];
  loading: boolean;
  error: string | null;
}

const NO_TX: Transaction[] = [];
const NO_PROJECTS: Project[] = [];
const NO_ACCOUNTS: BankAccount[] = [];
const NO_HISTORY: { points: HistoryPoint[] } = { points: [] };

/**
 * One transactions request covering the previous period through the end of
 * the current one, split client-side; projects, accounts and the net worth
 * history come from the shared cache (hooks/useApi), as does each range once
 * it has been seen, so switching presets back and forth is instant.
 */
export function useReportsData(range: ReportRange): ReportsData {
  const projects = useApi<Project[]>('/projects', NO_PROJECTS);
  const accounts = useApi<BankAccount[]>('/bank-accounts', NO_ACCOUNTS);
  const history = useApi<{ points: HistoryPoint[] }>('/net-worth-goal/history', NO_HISTORY);
  const rows = useApi<Transaction[]>(`/transactions?from=${range.prevFrom}&to=${range.to}&limit=20000`, NO_TX);

  const list = Array.isArray(rows.data) ? rows.data : NO_TX;
  const cur = useMemo(() => list.filter((t) => t.date.slice(0, 10) >= range.from && t.date.slice(0, 10) <= range.to), [list, range.from, range.to]);
  const prev = useMemo(() => list.filter((t) => t.date.slice(0, 10) >= range.prevFrom && t.date.slice(0, 10) <= range.prevTo), [list, range.prevFrom, range.prevTo]);

  return {
    cur, prev,
    projects: Array.isArray(projects.data) ? projects.data : NO_PROJECTS,
    accounts: Array.isArray(accounts.data) ? accounts.data : NO_ACCOUNTS,
    history: Array.isArray(history.data?.points) ? history.data.points : [],
    loading: rows.loading,
    error: rows.error ? 'Could not load your transactions. Please try again.' : null,
  };
}
