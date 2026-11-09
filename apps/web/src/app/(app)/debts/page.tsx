'use client';

import PageHeader, { HeaderAction } from '@/components/PageHeader';
import { useState, useEffect, useCallback } from 'react';
import StatsRow from './components/StatsRow';
import ActiveLoansCard from './components/ActiveLoansCard';
import UpcomingPaymentsCard from './components/UpcomingPaymentsCard';
import AddLoanModal from './components/AddLoanModal';
import RecordPaymentModal from './components/RecordPaymentModal';
import type { Debt } from './types';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3333/api';

function currentMonthKey() { return new Date().toISOString().slice(0, 7); }

export default function DebtsPage() {
  const [debts, setDebts] = useState<Debt[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddLoan, setShowAddLoan] = useState(false);
  const [showRecordPayment, setShowRecordPayment] = useState(false);
  const [toast, setToast] = useState('');

  const load = useCallback(() => {
    setLoading(true);
    fetch(`${API}/debts`, { credentials: 'include' })
      .then((r) => r.json()).then((d) => setDebts(Array.isArray(d) ? d : []))
      .catch(() => {}).finally(() => setLoading(false));
  }, []);
  useEffect(() => { load(); }, [load]);

  function flash(msg: string) { setToast(msg); setTimeout(() => setToast(''), 3000); }

  const openDebts = debts.filter((d) => d.status === 'open');
  const openLent = openDebts.filter((d) => d.direction === 'lent');
  const openOwed = openDebts.filter((d) => d.direction === 'owed');
  const owedToYou = openLent.reduce((s, d) => s + Number(d.remaining), 0);
  const youOwe = openOwed.reduce((s, d) => s + Number(d.remaining), 0);
  const monthKey = currentMonthKey();
  const dueThisMonthDebts = openDebts.filter((d) => !!d.dueDate && d.dueDate.startsWith(monthKey));
  const dueThisMonth = dueThisMonthDebts.reduce((s, d) => s + Number(d.remaining), 0);

  return (
    <div className="contents">
      <main className="flex-1 overflow-y-auto pt-14 md:pt-0">
        <div className="p-4 sm:p-6 flex flex-col gap-5">
          <PageHeader title="Loans & Debts" subtitle="Track money you lent and money you owe"
            actions={<>
              <HeaderAction onClick={() => setShowRecordPayment(true)} label="Record payment" shortLabel="Record" />
              <HeaderAction onClick={() => setShowAddLoan(true)} primary label="Add loan" shortLabel="Add"
                icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>} />
            </>} />

          {!loading && debts.length > 0 && (
            <StatsRow
              netPosition={owedToYou - youOwe}
              owedToYou={owedToYou} owedToYouCount={openLent.length}
              youOwe={youOwe} youOweCount={openOwed.length}
              dueThisMonth={dueThisMonth} dueThisMonthCount={dueThisMonthDebts.length}
            />
          )}

          <div className="flex items-start gap-3 px-4 py-3 rounded-xl"
            style={{ background: 'color-mix(in srgb, var(--color-sky) 8%, transparent)', border: '1px solid color-mix(in srgb, var(--color-sky) 25%, transparent)' }}>
            <span style={{ color: 'var(--color-sky)' }} className="mt-0.5">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="12" cy="12" r="10" /><path d="M12 16v-4M12 8h.01" />
              </svg>
            </span>
            <p className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>
              <span className="font-semibold" style={{ color: 'var(--color-sky)' }}>Included in Net Worth</span> · Money owed to you is an asset; money you owe is a liability.
            </p>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-[1fr_360px] gap-5 items-start">
            <ActiveLoansCard debts={debts} loading={loading} reload={load} />
            <UpcomingPaymentsCard debts={debts} />
          </div>
        </div>

        {toast && (
          <div className="fixed bottom-6 right-6 px-4 py-2.5 rounded-xl text-sm font-semibold z-50"
            style={{ background: 'var(--popover-bg)', border: '1px solid var(--color-border)', color: 'var(--color-green)' }}>{toast}</div>
        )}

        {showAddLoan && <AddLoanModal onClose={() => setShowAddLoan(false)} onCreated={load} />}
        {showRecordPayment && (
          <RecordPaymentModal openDebts={openDebts} onClose={() => setShowRecordPayment(false)}
            onRecorded={(msg) => { flash(msg); load(); }} />
        )}
      </main>
    </div>
  );
}
