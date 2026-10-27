'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import Sidebar from '@/components/Sidebar';
import { useThemeColors } from '@/components/ThemeProvider';
import { useReportsData } from '@/hooks/useReportsData';
import { resolveRange, parseYmd, type RangePreset } from '@/lib/reports/range';
import {
  summarize, monthlySeries, categoryRows, categoryStack, merchantRows, moneyFlow,
  insights, weekdayProfile, cumulativeSpend, largestTransactions,
} from '@/lib/reports/compute';
import { toCsv, downloadCsv } from '@/lib/reports/csv';
import { money, Card, Segmented } from '@/components/reports/ui';
import RangeBar from '@/components/reports/RangeBar';
import KpiStrip from '@/components/reports/KpiStrip';
import MoneyFlowChart from '@/components/reports/MoneyFlowChart';
import InsightsList from '@/components/reports/InsightsList';
import PaceChart from '@/components/reports/PaceChart';
import CategoryList from '@/components/reports/CategoryList';
import CategoryStackChart from '@/components/reports/CategoryStackChart';
import WeekdayChart from '@/components/reports/WeekdayChart';
import MerchantsTable from '@/components/reports/MerchantsTable';
import CashFlowTab from '@/components/reports/CashFlowTab';
import NetWorthTab from '@/components/reports/NetWorthTab';

type Tab = 'overview' | 'spending' | 'income' | 'merchants' | 'cashflow' | 'networth';
const TABS: { id: Tab; label: string }[] = [
  { id: 'overview', label: 'Overview' }, { id: 'spending', label: 'Spending' }, { id: 'income', label: 'Income' },
  { id: 'merchants', label: 'Merchants' }, { id: 'cashflow', label: 'Cash flow' }, { id: 'networth', label: 'Net worth' },
];

export default function ReportsPage() {
  const tc = useThemeColors();
  const [preset, setPreset] = useState<RangePreset>('this-month');
  const [custom, setCustom] = useState({ from: '', to: '' });
  const [tab, setTab] = useState<Tab>('overview');
  const [exportOpen, setExportOpen] = useState(false);
  const now = useMemo(() => new Date(), []);
  const range = useMemo(() => resolveRange(preset, now, custom), [preset, custom, now]);
  const { cur, prev, projects, history, loading, error } = useReportsData(range);

  /* Every number below comes from lib/reports/compute (tested) — never from JSX. */
  const summary = useMemo(() => summarize(cur, prev, range.days), [cur, prev, range.days]);
  const months = useMemo(() => monthlySeries(cur, range.months), [cur, range.months]);
  const spendRows = useMemo(() => categoryRows(cur, prev, 'expense', projects), [cur, prev, projects]);
  const incomeRows = useMemo(() => categoryRows(cur, prev, 'income', projects), [cur, prev, projects]);
  const spendStack = useMemo(() => categoryStack(cur, range.months, 'expense', projects), [cur, range.months, projects]);
  const incomeStack = useMemo(() => categoryStack(cur, range.months, 'income', projects), [cur, range.months, projects]);
  const merchants = useMemo(() => merchantRows(cur, prev, range.months), [cur, prev, range.months]);
  const flow = useMemo(() => moneyFlow(cur, projects, 8, tc.primary, tc.green, tc.rose), [cur, projects, tc.primary, tc.green, tc.rose]);
  const facts = useMemo(() => insights(cur, prev, range, projects, now), [cur, prev, range, projects, now]);
  const weekdays = useMemo(() => weekdayProfile(cur, range), [cur, range]);
  const pace = useMemo(() => cumulativeSpend(cur, prev, range, now), [cur, prev, range, now]);
  const largest = useMemo(() => largestTransactions(cur, 6), [cur]);

  const fileStamp = `${range.from}_${range.to}`;
  const exports = [
    { label: 'Spending by category', run: () => downloadCsv(`cofre-spending-${fileStamp}.csv`, toCsv([
      { header: 'Category', value: (r) => r.name }, { header: 'Amount', value: (r) => r.value }, { header: 'Share %', value: (r) => r.share },
      { header: 'Transactions', value: (r) => r.count }, { header: `Previous (${range.prevLabel})`, value: (r) => r.prevValue }, { header: 'Change %', value: (r) => r.delta ?? '' },
    ], spendRows)) },
    { label: 'Income by source', run: () => downloadCsv(`cofre-income-${fileStamp}.csv`, toCsv([
      { header: 'Source', value: (r) => r.name }, { header: 'Amount', value: (r) => r.value }, { header: 'Share %', value: (r) => r.share },
      { header: 'Transactions', value: (r) => r.count }, { header: `Previous (${range.prevLabel})`, value: (r) => r.prevValue }, { header: 'Change %', value: (r) => r.delta ?? '' },
    ], incomeRows)) },
    { label: 'Merchants', run: () => downloadCsv(`cofre-merchants-${fileStamp}.csv`, toCsv([
      { header: 'Merchant', value: (r) => r.name }, { header: 'Total', value: (r) => r.total }, { header: 'Transactions', value: (r) => r.count },
      { header: 'Average', value: (r) => r.avg }, { header: `Previous (${range.prevLabel})`, value: (r) => r.prevTotal }, { header: 'Change %', value: (r) => r.delta ?? '' }, { header: 'New', value: (r) => (r.isNew ? 'yes' : '') },
    ], merchants)) },
    { label: 'Months', run: () => downloadCsv(`cofre-months-${fileStamp}.csv`, toCsv([
      { header: 'Month', value: (m) => m.key }, { header: 'Income', value: (m) => m.income }, { header: 'Spending', value: (m) => m.spending }, { header: 'Net', value: (m) => m.net },
    ], months)) },
    { label: 'Transactions in this period', run: () => downloadCsv(`cofre-transactions-${fileStamp}.csv`, toCsv([
      { header: 'Date', value: (t) => t.date.slice(0, 10) }, { header: 'Name', value: (t) => t.name }, { header: 'Amount', value: (t) => Number(t.amount) },
      { header: 'Category', value: (t) => t.categoryRef?.name ?? t.projectCategoryRef?.name ?? '' }, { header: 'Account', value: (t) => t.bankAccount ? `${t.bankAccount.bankName} · ${t.bankAccount.accountName}` : '' },
      { header: 'Source', value: (t) => t.source },
    ], [...cur].sort((a, b) => b.date.localeCompare(a.date)))) },
  ];

  const askHref = `/ask-cofre?q=${encodeURIComponent(`Where did my money go between ${range.from} and ${range.to}, and what should I change?`)}`;
  const btn = 'inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold cursor-pointer';

  return (
    <div className="flex h-dvh overflow-hidden">
      <Sidebar />
      <main className="flex-1 overflow-y-auto pt-14 md:pt-0">
        <div className="px-4 sm:px-6 py-4 sm:py-6 flex flex-col gap-4 sm:gap-5 max-w-[1400px]">
          {/* Header */}
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Reports</h1>
              <p className="text-sm mt-0.5 hidden sm:block" style={{ color: 'var(--color-text-muted)' }}>Where the money went, and how that is changing.</p>
            </div>
            <div className="flex items-center gap-2">
              <div className="relative">
                <button type="button" onClick={() => setExportOpen((v) => !v)} aria-haspopup="menu" aria-expanded={exportOpen}
                  className={btn} style={{ background: 'var(--color-elevated)', border: '1px solid var(--color-border)', color: 'var(--color-text-primary)' }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 3v12M6 9l6 6 6-6M4 21h16" /></svg>
                  Export CSV
                </button>
                {exportOpen && (
                  <div role="menu" className="absolute right-0 top-full mt-2 z-30 rounded-xl overflow-hidden py-1 w-60"
                    style={{ background: 'var(--popover-bg)', border: 'var(--glass-border)', boxShadow: 'var(--glass-shadow)' }}>
                    {exports.map((e) => (
                      <button key={e.label} role="menuitem" type="button" onClick={() => { e.run(); setExportOpen(false); }}
                        className="w-full text-left px-3 py-2 text-xs hover:brightness-110 cursor-pointer" style={{ color: 'var(--color-text-primary)' }}>
                        {e.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <Link href={askHref} className={`${btn} btn-gold`}>
                <span aria-hidden="true">✦</span><span className="hidden sm:inline">Ask Cofre about this</span><span className="sm:hidden">Ask</span>
              </Link>
            </div>
          </div>

          <RangeBar range={range} preset={preset} custom={custom} onPreset={setPreset} onCustom={(c) => { setCustom(c); setPreset('custom'); }} />

          {error && <p className="text-sm rounded-xl px-4 py-3" style={{ color: 'var(--color-rose)', background: 'color-mix(in srgb, var(--color-rose) 10%, transparent)', border: '1px solid color-mix(in srgb, var(--color-rose) 30%, transparent)' }}>{error}</p>}

          <KpiStrip summary={summary} months={months} prevLabel={range.prevLabel} loading={loading} />

          <Segmented value={tab} options={TABS} onChange={setTab} size="md" />

          {loading ? (
            <p className="py-16 text-center text-sm" style={{ color: 'var(--color-text-muted)' }}>Building your report…</p>
          ) : (
            <>
              {tab === 'overview' && (
                <div className="grid grid-cols-1 xl:grid-cols-5 gap-4">
                  <Card className="xl:col-span-3" title="Money flow" subtitle="Income sources → cash → where it went">
                    <MoneyFlowChart flow={flow} />
                  </Card>
                  <Card className="xl:col-span-2" title="What stands out" subtitle={`${range.label} vs ${range.prevLabel}`}>
                    <InsightsList items={facts} />
                  </Card>
                  <Card className="xl:col-span-3" title="Spending pace" subtitle="Cumulative spending by day of period">
                    <PaceChart points={pace} prevLabel={range.prevLabel} />
                  </Card>
                  <Card className="xl:col-span-2" title="Top categories" right={<button type="button" onClick={() => setTab('spending')} className="text-xs font-semibold cursor-pointer" style={{ color: 'var(--color-primary)' }}>All spending →</button>}>
                    <CategoryList rows={spendRows} cur={cur} months={range.months} projects={projects} dir="expense" prevLabel={range.prevLabel} limit={6} />
                  </Card>
                </div>
              )}

              {tab === 'spending' && (
                <div className="grid grid-cols-1 xl:grid-cols-5 gap-4">
                  <Card className="xl:col-span-3" title="Spending by category" subtitle="Tap a category for its months, merchants and transactions">
                    <CategoryList rows={spendRows} cur={cur} months={range.months} projects={projects} dir="expense" prevLabel={range.prevLabel} />
                  </Card>
                  <div className="xl:col-span-2 flex flex-col gap-4">
                    <Card title="By month" subtitle="Top categories stacked; the rest as Other">
                      <CategoryStackChart stack={spendStack} />
                    </Card>
                    <Card title="By weekday" subtitle="Average spend per day of the week">
                      <WeekdayChart profile={weekdays} />
                    </Card>
                    <Card title="Largest expenses">
                      {largest.length === 0 ? <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>None yet.</p> : (
                        <ul className="flex flex-col gap-1.5">
                          {largest.map((t) => (
                            <li key={t.id} className="flex items-center justify-between gap-3 text-[12.5px]">
                              <span className="truncate" style={{ color: 'var(--color-text-secondary)' }}>
                                <span className="tabular-nums" style={{ color: 'var(--color-text-muted)' }}>{parseYmd(t.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span> {t.name}
                                {t.categoryRef && <span className="ml-1.5 text-[10px] px-1.5 py-0.5 rounded-md" style={{ background: `color-mix(in srgb, ${t.categoryRef.color} 14%, transparent)`, color: t.categoryRef.color }}>{t.categoryRef.icon} {t.categoryRef.name}</span>}
                              </span>
                              <span className="tabular-nums font-bold shrink-0">{money(Math.abs(Number(t.amount)))}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </Card>
                  </div>
                </div>
              )}

              {tab === 'income' && (
                <div className="grid grid-cols-1 xl:grid-cols-5 gap-4">
                  <Card className="xl:col-span-3" title="Income by source" subtitle="Tap a source for its months and transactions">
                    <CategoryList rows={incomeRows} cur={cur} months={range.months} projects={projects} dir="income" prevLabel={range.prevLabel} />
                  </Card>
                  <Card className="xl:col-span-2" title="By month">
                    <CategoryStackChart stack={incomeStack} />
                  </Card>
                </div>
              )}

              {tab === 'merchants' && (
                <Card title="Merchants" subtitle="Who you paid, how often, and how that changed">
                  <MerchantsTable rows={merchants} monthsCount={range.months.length} prevLabel={range.prevLabel} />
                </Card>
              )}

              {tab === 'cashflow' && <CashFlowTab months={months} />}

              {tab === 'networth' && <NetWorthTab history={history} range={range} />}
            </>
          )}
        </div>
      </main>
    </div>
  );
}
