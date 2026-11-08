'use client';

import { useState, useCallback, useMemo } from 'react';
import type { Transaction, BankAccount, Budget, Project, Debt } from '@/lib/dashboard/types';
import { useApi } from './useApi';
import { monthRange, monthWithin, sliceMonth } from '@/lib/dashboard/monthSlice';
import { budgetsKey, currentMonth, transactionsKey, yearRange } from '@/lib/dashboard/keys';

const NO_TX: Transaction[] = [];
const NO_ACCOUNTS: BankAccount[] = [];
const NO_BUDGETS: Budget[] = [];
const NO_PROJECTS: Project[] = [];
const NO_DEBTS: Debt[] = [];

/* Everything the dashboard reads, each list on its own cache key (hooks/useApi)
   so a month change refetches only the budgets for that month, and the Goals
   and Ask Cofre pages, which call this too, share the same responses. The
   month's rows come out of the year-to-date list whenever the month is in it;
   only a month outside the current year costs its own request. */
export function useDashboardData() {
  const [month, setMonth] = useState(() => currentMonth());
  const { from: yearFrom, to: yearTo } = yearRange();
  const inYear = monthWithin(month, yearFrom, yearTo);
  const { from, to } = monthRange(month);

  const year = useApi<Transaction[]>(transactionsKey(yearFrom, yearTo), NO_TX);
  const monthOnly = useApi<Transaction[]>(inYear ? null : transactionsKey(from, to), NO_TX);
  const accounts = useApi<BankAccount[]>('/bank-accounts', NO_ACCOUNTS);
  const budgets = useApi<Budget[]>(budgetsKey(month), NO_BUDGETS);
  const projects = useApi<Project[]>('/projects', NO_PROJECTS);
  const debts = useApi<Debt[]>('/debts', NO_DEBTS);

  const yearTx = Array.isArray(year.data) ? year.data : NO_TX;
  const transactions = useMemo(
    () => (inYear ? sliceMonth(yearTx, month) : Array.isArray(monthOnly.data) ? monthOnly.data : NO_TX),
    [inYear, yearTx, month, monthOnly.data],
  );

  const parts = [year, monthOnly, accounts, budgets, projects, debts];
  const loading = parts.some((p) => p.loading);
  const error = parts.some((p) => p.error) ? 'Something went wrong loading your data. Please try again.' : null;

  const reload = useCallback(() => {
    void Promise.all([year.mutate(), monthOnly.mutate(), accounts.mutate(), budgets.mutate(), projects.mutate(), debts.mutate()]);
  }, [year.mutate, monthOnly.mutate, accounts.mutate, budgets.mutate, projects.mutate, debts.mutate]);

  return {
    month, setMonth, transactions, yearTx,
    accounts: Array.isArray(accounts.data) ? accounts.data : NO_ACCOUNTS,
    budgets: Array.isArray(budgets.data) ? budgets.data : NO_BUDGETS,
    projects: Array.isArray(projects.data) ? projects.data : NO_PROJECTS,
    debts: Array.isArray(debts.data) ? debts.data : NO_DEBTS,
    loading, error, reload,
  };
}
