'use client';

import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import type { Transaction } from '@/lib/dashboard/types';
import type { BudgetWithSpent, Category, HistoryPoint, Project } from '@/lib/budgets/types';
import { monthKeyOf } from '@/lib/dashboard/derive';
import { assemble, daysIn, monthFraction, shiftMonth, TREND_MONTHS } from '@/lib/budgets/assemble';
import { computePlan } from '@/lib/budgets/calculations';
import { canUndo, draftReducer, emptyDraft } from '@/lib/budgets/draft';
import { buildBatchPayload, saveBudgetBatch } from '@/lib/budgets/persist';

export const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3333/api';


export type Notice = { tone: 'success' | 'error'; text: string } | null;

const json = (r: Response) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status))));

/**
 * Owns everything the Budgets page knows: server state (budgets, categories,
 * projects, transactions), the draft scenario, and the derived plan. Drafts
 * live only in memory — nothing is written until `save()`.
 */
export function useBudgetScenario() {
  const [month, setMonthState] = useState(() => monthKeyOf(new Date()));
  const [budgets, setBudgets] = useState<BudgetWithSpent[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [history, setHistory] = useState<HistoryPoint[]>([]);
  const [categoryAverages, setCategoryAverages] = useState<Record<string, number>>({});
  const [txs, setTxs] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);
  const [draft, dispatch] = useReducer(draftReducer, emptyDraft);
  const loadedMonth = useRef<string | null>(null);

  const fetchBudgets = useCallback(async (m: string) => {
    const b = await fetch(`${API}/budgets?month=${m}`, { credentials: 'include' }).then(json);
    setBudgets(Array.isArray(b) ? b : []);
    // Plan history includes this month's totals; refresh it too, best-effort.
    fetch(`${API}/budgets/history?months=6`, { credentials: 'include' }).then(json)
      .then((h) => { if (Array.isArray(h)) setHistory(h); }).catch(() => undefined);
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadError(false);
    const from = `${shiftMonth(month, -(TREND_MONTHS - 1))}-01`;
    const to = `${month}-${String(daysIn(month)).padStart(2, '0')}`;
    // If this month has no budgets yet, the API copies them from the most recent prior month first.
    fetch(`${API}/budgets/ensure-month`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
      body: JSON.stringify({ month }),
    })
      .catch(() => undefined)
      .then(() => Promise.all([
        fetch(`${API}/budgets?month=${month}`, { credentials: 'include' }).then(json),
        fetch(`${API}/categories`, { credentials: 'include' }).then(json),
        fetch(`${API}/projects`, { credentials: 'include' }).then(json),
        fetch(`${API}/transactions?from=${from}&to=${to}&limit=5000`, { credentials: 'include' }).then(json),
        // Secondary panels: a failure here shouldn't block the editor.
        fetch(`${API}/budgets/history?months=6`, { credentials: 'include' }).then(json).catch(() => []),
        fetch(`${API}/budgets/category-averages?months=3&month=${month}`, { credentials: 'include' }).then(json).catch(() => ({})),
      ]))
      .then(([b, c, p, t, h, avgs]) => {
        if (cancelled) return;
        setBudgets(Array.isArray(b) ? b : []);
        setCategories(Array.isArray(c) ? c : []);
        setProjects(Array.isArray(p) ? p : []);
        setTxs(Array.isArray(t) ? t : []);
        setHistory(Array.isArray(h) ? h : []);
        setCategoryAverages(avgs && typeof avgs === 'object' && !Array.isArray(avgs) ? avgs : {});
      })
      .catch(() => { if (!cancelled) setLoadError(true); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [month]);

  const assembled = useMemo(() => assemble(budgets, txs, month), [budgets, txs, month]);

  // Keep the reducer's originals in sync with server data. A month change
  // starts a fresh scenario; any other refresh keeps unsaved drafts.
  useEffect(() => {
    if (loading) return;
    const originals = Object.fromEntries(assembled.sources.map((s) => [s.key, s.originalCents]));
    dispatch({ type: loadedMonth.current === month ? 'rebase' : 'load', originals });
    loadedMonth.current = month;
  }, [assembled, loading, month]);

  const now = useMemo(() => new Date(), [txs]);
  const fraction = monthFraction(month, now);

  const plan = useMemo(() => computePlan({
    sources: assembled.sources,
    drafts: draft.drafts,
    expectedIncomeCents: assembled.expectedIncomeCents,
    incomeTargetReceivedCents: assembled.incomeTargetReceivedCents,
    incomeReceivedCents: assembled.incomeReceivedCents,
    totalSpentCents: assembled.totalSpentCents,
    monthFraction: fraction,
  }), [assembled, draft.drafts, fraction]);

  const dirty = plan.modifiedCount > 0;

  // Warn before a reload / tab close would throw away unsaved drafts.
  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [dirty]);

  useEffect(() => {
    if (!notice || notice.tone === 'error') return;
    const t = setTimeout(() => setNotice(null), 3500);
    return () => clearTimeout(t);
  }, [notice]);

  const refresh = useCallback(() => fetchBudgets(month).catch(() => {
    setNotice({ tone: 'error', text: 'Couldn’t refresh budgets. Reload the page to see the latest values.' });
  }), [fetchBudgets, month]);

  const save = useCallback(async () => {
    const { payload, invalid } = buildBatchPayload(month, assembled.sources, draft.drafts);
    if (invalid.length) {
      setNotice({ tone: 'error', text: `Fix invalid amounts first: ${invalid.join(', ')}` });
      return;
    }
    setSaving(true);
    const res = await saveBudgetBatch(API, payload);
    if (!res.ok) {
      setSaving(false);
      setNotice({ tone: 'error', text: `Changes not saved — ${res.error}` });
      return; // drafts stay intact
    }
    try {
      await fetchBudgets(month); // authoritative state; rebase then drops the saved drafts
      setNotice({ tone: 'success', text: `Saved ${res.saved} budget${res.saved === 1 ? '' : 's'}.` });
    } catch {
      setNotice({ tone: 'error', text: 'Saved, but couldn’t reload budgets. Reload the page to confirm.' });
    } finally {
      setSaving(false);
    }
  }, [assembled.sources, draft.drafts, fetchBudgets, month]);

  const setMonth = useCallback((m: string) => {
    if (m !== month) setMonthState(m);
  }, [month]);

  return {
    month, setMonth, isCurrentMonth: month === monthKeyOf(now), now,
    budgets, categories, projects, txs, history, categoryAverages,
    loading, loadError, saving, notice, setNotice,
    assembled, plan, draft, dispatch, dirty, canUndo: canUndo(draft),
    save, refresh,
  };
}

export type BudgetScenario = ReturnType<typeof useBudgetScenario>;
