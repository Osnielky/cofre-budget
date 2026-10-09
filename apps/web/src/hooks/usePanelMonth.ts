'use client';

import { useEffect, useState } from 'react';
import { nextOverride } from '@/lib/dashboard/panelMonth';
import type { Budget } from '@/lib/dashboard/types';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3333/api';

/** A panel's own month: the header month until the user picks a different one. */
export function usePanelMonth(headerMonth: string): [string, (m: string) => void] {
  const [override, setOverride] = useState<string | null>(null);
  return [override ?? headerMonth, (m) => setOverride(nextOverride(m, headerMonth))];
}

/**
 * Budgets for a panel's month. Reuses the header's budgets when the months match
 * and fetches only when the panel looks at a different month.
 */
export function useMonthBudgets(month: string, headerMonth: string, headerBudgets: Budget[]): { budgets: Budget[]; loading: boolean } {
  const [fetched, setFetched] = useState<{ month: string; budgets: Budget[] } | null>(null);
  const differs = month !== headerMonth;

  useEffect(() => {
    if (!differs) return;
    let cancelled = false;
    fetch(`${API}/budgets?month=${month}`, { credentials: 'include' })
      .then((r) => r.json())
      .then((b) => { if (!cancelled) setFetched({ month, budgets: Array.isArray(b) ? b : [] }); })
      .catch((err) => {
        console.error('[dashboard] failed to load budgets', err);
        if (!cancelled) setFetched({ month, budgets: [] });
      });
    return () => { cancelled = true; };
  }, [month, differs]);

  if (!differs) return { budgets: headerBudgets, loading: false };
  return fetched?.month === month ? { budgets: fetched.budgets, loading: false } : { budgets: [], loading: true };
}
