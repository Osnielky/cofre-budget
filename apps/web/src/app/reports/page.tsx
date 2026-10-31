'use client';

import { Suspense, useCallback, useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import Sidebar from '@/components/Sidebar';
import { useThemeColors } from '@/components/ThemeProvider';
import { useReportsData } from '@/hooks/useReportsData';
import { resolveRange, parseYmd } from '@/lib/reports/range';
import {
  summarize, monthlySeries, categoryRows, categoryStack, merchantRows, moneyFlow,
  insights, weekdayProfile, cumulativeSpend, largestTransactions, makeGrouper, sortRows, GROUP_OPTIONS,
  type CategoryRow, type GroupBy,
} from '@/lib/reports/compute';
import { parseReportState, serializeReportState, applyQuestion, type ReportState, type ReportTab } from '@/lib/reports/state';
import { toCsv, downloadCsv } from '@/lib/reports/csv';
import { money, Card, Segmented } from '@/components/reports/ui';
import RangeBar from '@/components/reports/RangeBar';
import QuestionChips from '@/components/reports/QuestionChips';
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

const TABS: { id: ReportTab; label: string }[] = [
  { id: 'overview', label: 'Overview' }, { id: 'spending', label: 'Spending' }, { id: 'income', label: 'Income' },
  { id: 'merchants', label: 'Merchants' }, { id: 'cashflow', label: 'Cash flow' }, { id: 'networth', label: 'Net worth' },
];
const SORTS = [{ id: 'amount' as const, label: 'By amount' }, { id: 'change' as const, label: 'By change' }];
const INCOME_GROUPS = GROUP_OPTIONS.filter((g) => g.id === 'category' || g.id === 'account');

/** useSearchParams needs a Suspense boundary above it. */
export default function ReportsPage() {
  return <Suspense fallback={null}><Reports /></Suspense>;
}

function Reports() {
  const tc = useThemeColors();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [exportOpen, setExportOpen] = useState(false);
  const now = useMemo(() => new Date(), []);

  /* Every control lives in the URL: back works inside the page, a view can be
     shared, and other pages can deep-link to a report. */
  const state = useMemo(() => parseReportState(searchParams), [searchParams]);
  const update = useCallback((patch: Partial<ReportState>) => {
    const qs = serializeReportState({ ...state, ...patch });
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }, [state, pathname, router]);

  const custom = useMemo(() => ({ from: state.from, to: state.to }), [state.from, state.to]);
  const range = useMemo(() => resolveRange(state.preset, now, custom), [state.preset, custom, now]);
  const data = useReportsData(range);
  const { projects, accounts, history, loading, error } = data;

  // The account filter applies before any calculation, so every number on the
  // page (KPIs, Sankey, insights…) describes just that account.
  const picked = state.account && accounts.some((a) => a.id === state.account) ? state.account : null;
  const cur = useMemo(() => picked ? data.cur.filter((t) => t.bankAccount?.id === picked) : data.cur, [data.cur, picked]);
  const prev = useMemo(() => picked ? data.prev.filter((t) => t.bankAccount?.id === picked) : data.prev, [data.prev, picked]);

  /* Every number below comes from lib/reports/compute (tested) — never from JSX. */
  const spendView: GroupBy = state.view;
  const incomeView: GroupBy = state.view === 'category' || state.view === 'account' ? state.view : 'category';
  const spendGrouper = useMemo(() => makeGrouper(spendView, projects), [spendView, projects]);
  const incomeGrouper = useMemo(() => makeGrouper(incomeView, projects), [incomeView, projects]);
  const summary = useMemo(() => summarize(cur, prev, range.days), [cur, prev, range.days]);
  const months = useMemo(() => monthlySeries(cur, range.months), [cur, range.months]);
  const spendRows = useMemo(() => sortRows(categoryRows(cur, prev, 'expense', projects, spendGrouper), state.sort), [cur, prev, projects, spendGrouper, state.sort]);
  const incomeRows = useMemo(() => sortRows(categoryRows(cur, prev, 'income', projects, incomeGrouper), state.sort), [cur, prev, projects, incomeGrouper, state.sort]);
  const topSpend = useMemo(() => categoryRows(cur, prev, 'expense', projects), [cur, prev, projects]);
  const spendStack = useMemo(() => categoryStack(cur, range.months, 'expense', projects, 6, spendGrouper), [cur, range.months, projects, spendGrouper]);
  const incomeStack = useMemo(() => categoryStack(cur, range.months, 'income', projects, 6, incomeGrouper), [cur, range.months, projects, incomeGrouper]);
  const merchants = useMemo(() => merchantRows(cur, prev, range.months), [cur, prev, range.months]);
  const flow = useMemo(() => moneyFlow(cur, projects, 8, tc.primary, tc.green, tc.rose), [cur, projects, tc.primary, tc.green, tc.rose]);
  const facts = useMemo(() => insights(cur, prev, range, projects, now), [cur, prev, range, projects, now]);
  const weekdays = useMemo(() => weekdayProfile(cur, range), [cur, range]);
  const pace = useMemo(() => cumulativeSpend(cur, prev, range, now), [cur, prev, range, now]);
  const largest = useMemo(() => largestTransactions(cur, 6), [cur]);
  const categoryGrouper = useMemo(() => makeGrouper('category', projects), [projects]);

  /* Deep link into Transactions for the bucket that is open. Project and
     synthetic buckets (needs/wants, fixed) have no transaction filter yet, so
     they link to the period only. */
  const txLink = useCallback((row: CategoryRow, view: GroupBy): string | null => {
    const p = new URLSearchParams({ from: range.from, to: range.to });
    if (picked) p.set('account', picked);
    if (view === 'account') { if (row.id === 'acct:none') return null; p.set('account', row.id.slice(5)); }
    else if (view === 'category') {
      if (row.id === 'uncat') p.set('filter', 'uncategorized');
      else if (!row.id.includes(':')) p.set('category', row.id);
    }
    return `/transactions?${p.toString()}`;
  }, [range.from, range.to, picked]);

  const viewLabel = GROUP_OPTIONS.find((g) => g.id === spendView)?.label ?? 'Category';
  const fileStamp = `${range.from}_${range.to}${picked ? `_${picked.slice(0, 8)}` : ''}`;
  const exports = [
    { label: `Spending by ${viewLabel.toLowerCase()}`, run: () => downloadCsv(`cofre-spending-${fileStamp}.csv`, toCsv([
      { header: viewLabel, value: (r) => r.name }, { header: 'Amount', value: (r) => r.value }, { header: 'Share %', value: (r) => r.share },
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

  const pickedAccount = picked ? accounts.find((a) => a.id === picked) : null;
  const askHref = `/ask-cofre?q=${encodeURIComponent(`Where did my money go between ${range.from} and ${range.to}${pickedAccount ? ` in my ${pickedAccount.bankName} ${pickedAccount.accountName} account` : ''}, and what should I change?`)}`;
  const btn = 'inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold cursor-pointer';
  const setTab = (tab: ReportTab) => update({ tab, open: null });

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

          <RangeBar range={range} preset={state.preset} custom={custom} accounts={accounts} account={picked}
            onPreset={(preset) => update({ preset, open: null })}
            onCustom={(c) => update({ preset: 'custom', from: c.from, to: c.to, open: null })}
            onAccount={(account) => update({ account, open: null })} />

          <QuestionChips state={state} onPick={(q) => update(applyQuestion(state, q))} />

          {error && <p className="text-sm rounded-xl px-4 py-3" style={{ color: 'var(--color-rose)', background: 'color-mix(in srgb, var(--color-rose) 10%, transparent)', border: '1px solid color-mix(in srgb, var(--color-rose) 30%, transparent)' }}>{error}</p>}

          <KpiStrip summary={summary} months={months} prevLabel={range.prevLabel} loading={loading} />

          <Segmented value={state.tab} options={TABS} onChange={setTab} size="md" />

          {loading ? (
            <p className="py-16 text-center text-sm" style={{ color: 'var(--color-text-muted)' }}>Building your report…</p>
          ) : (
            <>
              {state.tab === 'overview' && (
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
                  <Card className="xl:col-span-2" title="Top categories" right={<button type="button" onClick={() => update({ tab: 'spending', view: 'category', open: null })} className="text-xs font-semibold cursor-pointer" style={{ color: 'var(--color-primary)' }}>All spending →</button>}>
                    <CategoryList rows={topSpend} cur={cur} months={range.months} grouper={categoryGrouper} dir="expense" prevLabel={range.prevLabel} limit={6}
                      linkFor={(r) => txLink(r, 'category')} />
                  </Card>
                </div>
              )}

              {state.tab === 'spending' && (
                <div className="grid grid-cols-1 xl:grid-cols-5 gap-4">
                  <Card className="xl:col-span-3" title={`Spending by ${viewLabel.toLowerCase()}`} subtitle="Tap a row for its months, merchants and transactions"
                    right={<div className="flex items-center gap-2 flex-wrap justify-end">
                      <Segmented value={spendView} options={GROUP_OPTIONS} onChange={(view) => update({ view, open: null })} />
                      <Segmented value={state.sort} options={SORTS} onChange={(sort) => update({ sort })} />
                    </div>}>
                    <CategoryList rows={spendRows} cur={cur} months={range.months} grouper={spendGrouper} dir="expense" prevLabel={range.prevLabel}
                      openId={state.open} onOpen={(open) => update({ open })} linkFor={(r) => txLink(r, spendView)} />
                  </Card>
                  <div className="xl:col-span-2 flex flex-col gap-4">
                    <Card title="By month" subtitle={spendView === 'category' ? 'Top categories stacked; the rest as Other' : `${viewLabel} by month`}>
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

              {state.tab === 'income' && (
                <div className="grid grid-cols-1 xl:grid-cols-5 gap-4">
                  <Card className="xl:col-span-3" title={incomeView === 'account' ? 'Income by account' : 'Income by source'} subtitle="Tap a row for its months and transactions"
                    right={<div className="flex items-center gap-2 flex-wrap justify-end">
                      <Segmented value={incomeView} options={INCOME_GROUPS} onChange={(view) => update({ view, open: null })} />
                      <Segmented value={state.sort} options={SORTS} onChange={(sort) => update({ sort })} />
                    </div>}>
                    <CategoryList rows={incomeRows} cur={cur} months={range.months} grouper={incomeGrouper} dir="income" prevLabel={range.prevLabel}
                      openId={state.open} onOpen={(open) => update({ open })} linkFor={(r) => txLink(r, incomeView)} />
                  </Card>
                  <Card className="xl:col-span-2" title="By month">
                    <CategoryStackChart stack={incomeStack} />
                  </Card>
                </div>
              )}

              {state.tab === 'merchants' && (
                <Card title="Merchants" subtitle="Who you paid, how often, and how that changed">
                  <MerchantsTable rows={merchants} monthsCount={range.months.length} prevLabel={range.prevLabel} />
                </Card>
              )}

              {state.tab === 'cashflow' && <CashFlowTab months={months} />}

              {state.tab === 'networth' && (
                <>
                  {picked && <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>Net worth covers every account; the account filter does not apply here.</p>}
                  <NetWorthTab history={history} range={range} />
                </>
              )}
            </>
          )}
        </div>
      </main>
    </div>
  );
}
