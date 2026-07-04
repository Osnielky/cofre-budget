'use client';

import { useState, useEffect, useCallback } from 'react';
import type { Transaction, BankAccount, Budget, Project, Debt } from '@/lib/dashboard/types';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3333/api';

function currentMonth() { return new Date().toISOString().slice(0, 7); }
function monthFrom(m: string) { return `${m}-01`; }
function monthTo(m: string) {
  const [y, mo] = m.split('-').map(Number);
  return new Date(y, mo, 0).toISOString().slice(0, 10);
}

export function useDashboardData() {
  const [month, setMonth] = useState(currentMonth);
  const [transactions, setTx] = useState<Transaction[]>([]);
  const [yearTx, setYearTx] = useState<Transaction[]>([]);
  const [accounts, setAccounts] = useState<BankAccount[]>([]);
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [debts, setDebts] = useState<Debt[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const from = monthFrom(month), to = monthTo(month);
      const yearFrom = `${new Date().getFullYear()}-01-01`;
      const yearTo = new Date().toISOString().slice(0, 10);
      const [tx, ytx, accs, bdg, proj, dbt] = await Promise.all([
        fetch(`${API}/transactions?from=${from}&to=${to}&limit=500`, { credentials: 'include' }).then((r) => r.json()),
        fetch(`${API}/transactions?from=${yearFrom}&to=${yearTo}&limit=5000`, { credentials: 'include' }).then((r) => r.json()),
        fetch(`${API}/bank-accounts`, { credentials: 'include' }).then((r) => r.json()),
        fetch(`${API}/budgets?month=${month}`, { credentials: 'include' }).then((r) => r.json()),
        fetch(`${API}/projects`, { credentials: 'include' }).then((r) => r.json()),
        fetch(`${API}/debts`, { credentials: 'include' }).then((r) => r.json()),
      ]);
      setTx(Array.isArray(tx) ? tx : []);
      setYearTx(Array.isArray(ytx) ? ytx : []);
      setAccounts(Array.isArray(accs) ? accs : []);
      setBudgets(Array.isArray(bdg) ? bdg : []);
      setProjects(Array.isArray(proj) ? proj : []);
      setDebts(Array.isArray(dbt) ? dbt : []);
    } catch {} finally { setLoading(false); }
  }, [month]);

  useEffect(() => { reload(); }, [reload]);

  return { month, setMonth, transactions, yearTx, accounts, budgets, projects, debts, loading, reload };
}
