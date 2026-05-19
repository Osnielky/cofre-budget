'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import Sidebar from '@/components/Sidebar';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, Cell, PieChart, Pie, Legend,
} from 'recharts';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3333/api';

interface Category  { id: string; name: string; icon: string; color: string; type: string }
interface BankAccount { id: string; bankName: string; accountName: string; accountType: string; color: string; balance: number }
interface Transaction {
  id: string; name: string; amount: number; date: string; source: string;
  categoryRef: Category | null; bankAccount: BankAccount | null;
  projectId: string | null;
}
interface Budget { id: string; amount: number; spent: number; category: Category }
interface Project { id: string; name: string; icon: string; color: string; type: string; status: string; expenses: number; income: number; costBasis: number; netGain: number | null; roi: number | null; purchasePrice: number }

const glass: React.CSSProperties = {
  background: 'rgba(35,35,47,0.50)', backdropFilter: 'blur(20px)',
  WebkitBackdropFilter: 'blur(20px)', border: '1px solid rgba(255,255,255,0.08)',
  boxShadow: '0 4px 24px rgba(0,0,0,0.25)',
};

function hexToRgb(hex: string) {
  const n = parseInt(hex.replace('#',''), 16);
  return `${(n>>16)&255}, ${(n>>8)&255}, ${n&255}`;
}
function currentMonth() { return new Date().toISOString().slice(0,7); }
function monthFrom(m: string) { return `${m}-01`; }
function monthTo(m: string) {
  const [y,mo] = m.split('-').map(Number);
  return new Date(y, mo, 0).toISOString().slice(0,10);
}
function monthLabel(m: string) {
  const [y,mo] = m.split('-');
  return new Date(Number(y), Number(mo)-1).toLocaleString('default', { month: 'long', year: 'numeric' });
}
function prevMonth(m: string) {
  const [y,mo] = m.split('-').map(Number);
  const d = new Date(y, mo-2);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
}
function nextMonth(m: string) {
  const [y,mo] = m.split('-').map(Number);
  const d = new Date(y, mo);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
}
function formatAmt(n: number, sign = true) {
  const abs = Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2 });
  if (!sign) return `$${abs}`;
  return n >= 0 ? `+$${abs}` : `-$${abs}`;
}
function formatDate(d: string) {
  return new Date(d+'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
function greeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}
const ACC_ICONS: Record<string,string> = { checking:'💳', savings:'🏦', cash:'💵', credit:'💰', investment:'📈', debit:'💳' };

export default function DashboardPage() {
  const [month, setMonth]             = useState(currentMonth);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [yearTx, setYearTx]           = useState<Transaction[]>([]);
  const [accounts, setAccounts]       = useState<BankAccount[]>([]);
  const [budgets, setBudgets]         = useState<Budget[]>([]);
  const [projects, setProjects]       = useState<Project[]>([]);
  const [loading, setLoading]         = useState(true);
  const [user, setUser]               = useState<{ firstName?: string; email?: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const from = monthFrom(month), to = monthTo(month);
    const yearFrom = `${new Date().getFullYear()}-01-01`;
    const yearTo   = new Date().toISOString().slice(0, 10);
    const [tx, ytx, accs, bdg, proj, me] = await Promise.all([
      fetch(`${API}/transactions?from=${from}&to=${to}&limit=500`, { credentials:'include' }).then(r=>r.json()),
      fetch(`${API}/transactions?from=${yearFrom}&to=${yearTo}&limit=5000`, { credentials:'include' }).then(r=>r.json()),
      fetch(`${API}/bank-accounts`, { credentials:'include' }).then(r=>r.json()),
      fetch(`${API}/budgets?month=${month}`, { credentials:'include' }).then(r=>r.json()),
      fetch(`${API}/projects`, { credentials:'include' }).then(r=>r.json()),
      fetch(`${API}/auth/me`, { credentials:'include' }).then(r=>r.ok?r.json():null).catch(()=>null),
    ]);
    setTransactions(Array.isArray(tx) ? tx : []);
    setYearTx(Array.isArray(ytx) ? ytx : []);
    setAccounts(Array.isArray(accs) ? accs : []);
    setBudgets(Array.isArray(bdg) ? bdg : []);
    setProjects(Array.isArray(proj) ? proj : []);
    setUser(me);
    setLoading(false);
  }, [month]);

  useEffect(() => { load(); }, [load]);

  /* ── Derived numbers ── */
  const isTransfer   = (t: Transaction) => t.categoryRef?.type === 'transfer';
  const income       = transactions.filter(t => Number(t.amount) > 0  && !isTransfer(t)).reduce((s,t) => s + Number(t.amount), 0);
  const expenses     = transactions.filter(t => Number(t.amount) < 0  && !isTransfer(t)).reduce((s,t) => s + Math.abs(Number(t.amount)), 0);
  const savingsRate  = income > 0 ? ((income - expenses) / income * 100) : 0;
  const totalBalance = accounts.reduce((s,a) => s + Number(a.balance || 0), 0);
  const recent       = [...transactions].sort((a,b) => b.date.localeCompare(a.date)).slice(0, 10);
  const isCurrentMonth = month === currentMonth();

  /* Spending by category */
  const catSpend = transactions
    .filter(t => Number(t.amount) < 0 && !isTransfer(t) && t.categoryRef)
    .reduce<Record<string, { cat: Category; total: number }>>((m, t) => {
      const c = t.categoryRef!;
      if (!m[c.id]) m[c.id] = { cat: c, total: 0 };
      m[c.id].total += Math.abs(Number(t.amount));
      return m;
    }, {});
  const topCats = Object.values(catSpend).sort((a,b) => b.total - a.total).slice(0, 7);
  const maxCatSpend = topCats[0]?.total || 1;

  /* Budget health */
  const overBudget  = budgets.filter(b => Number(b.spent) > Number(b.amount));
  const nearBudget  = budgets.filter(b => Number(b.spent) / Number(b.amount) >= 0.8 && Number(b.spent) <= Number(b.amount));
  const totalBudgeted = budgets.reduce((s,b) => s + Number(b.amount), 0);
  const totalSpent    = budgets.reduce((s,b) => s + Math.min(Number(b.spent), Number(b.amount)), 0);

  /* Projects */
  const activeProjects = projects.filter(p => p.status !== 'sold');
  const totalInvested  = projects.reduce((s,p) => s + Number(p.costBasis || 0), 0);
  const totalNetGain   = projects.filter(p => p.netGain != null).reduce((s,p) => s + Number(p.netGain), 0);

  /* Monthly revenue & expenses chart (year so far) */
  const MONTHS_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const currentYear  = new Date().getFullYear();
  const currentMoIdx = new Date().getMonth(); // 0-based
  const monthlyChart = Array.from({ length: currentMoIdx + 1 }, (_, i) => {
    const key = `${currentYear}-${String(i+1).padStart(2,'0')}`;
    const txs = yearTx.filter(t => t.date.startsWith(key) && !isTransfer(t));
    return {
      month: MONTHS_SHORT[i],
      revenue:  +txs.filter(t => Number(t.amount) > 0).reduce((s,t) => s + Number(t.amount), 0).toFixed(2),
      expenses: +txs.filter(t => Number(t.amount) < 0).reduce((s,t) => s + Math.abs(Number(t.amount)), 0).toFixed(2),
    };
  });

  /* Revenue by category (income categories, year so far) */
  const revByCat = yearTx
    .filter(t => Number(t.amount) > 0 && !isTransfer(t) && t.categoryRef)
    .reduce<Record<string, { name: string; icon: string; color: string; value: number }>>((m, t) => {
      const c = t.categoryRef!;
      if (!m[c.id]) m[c.id] = { name: c.name, icon: c.icon, color: c.color, value: 0 };
      m[c.id].value = +(m[c.id].value + Number(t.amount)).toFixed(2);
      return m;
    }, {});
  const revPieData = Object.values(revByCat).sort((a,b) => b.value - a.value).slice(0, 6);
  const uncatRevenue = +yearTx.filter(t => Number(t.amount) > 0 && !isTransfer(t) && !t.categoryRef)
    .reduce((s,t) => s + Number(t.amount), 0).toFixed(2);
  if (uncatRevenue > 0) revPieData.push({ name: 'Uncategorized', icon: '🏷️', color: '#5C5C78', value: uncatRevenue });

  return (
    <div className="flex h-dvh overflow-hidden">
      <Sidebar />
      <main className="flex-1 overflow-y-auto">

        {/* ── Header ── */}
        <div className="sticky top-0 z-20 px-6 pt-5 pb-4 flex items-center justify-between gap-4"
          style={{ background: 'rgba(15,15,26,0.88)', backdropFilter: 'blur(20px)', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">
              {greeting()}{user?.firstName ? `, ${user.firstName}` : ''} 👋
            </h1>
            <p className="text-xs mt-0.5" style={{ color: 'var(--color-text-muted)' }}>
              Here's your financial snapshot
            </p>
          </div>
          {/* Month navigator */}
          <div className="flex items-center gap-1 px-1 py-1 rounded-xl" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
            <button onClick={() => setMonth(prevMonth)} className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-white/10 transition-colors text-sm" style={{ color: 'var(--color-text-muted)' }}>‹</button>
            <span className="text-sm font-semibold px-2 min-w-36 text-center">{monthLabel(month)}</span>
            <button onClick={() => setMonth(nextMonth)} disabled={isCurrentMonth}
              className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-white/10 transition-colors text-sm disabled:opacity-30"
              style={{ color: 'var(--color-text-muted)' }}>›</button>
          </div>
        </div>

        <div className="p-6 flex flex-col gap-5">

          {/* ── Row 1: Charts ── */}
          <div className="grid grid-cols-1 xl:grid-cols-5 gap-5">

            {/* Revenue vs Expenses — grouped bar chart */}
            <div className="xl:col-span-3 flex flex-col gap-4 p-5 rounded-2xl" style={glass}>
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-bold text-sm">Revenue vs Expenses</p>
                  <p className="text-[10px] mt-0.5" style={{ color: 'var(--color-text-muted)' }}>{currentYear} · year to date</p>
                </div>
                <div className="flex items-center gap-3 text-[10px] font-semibold" style={{ color: 'var(--color-text-muted)' }}>
                  <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm inline-block" style={{ background: '#4FBF7F' }} />Revenue</span>
                  <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm inline-block" style={{ background: '#F07A3E' }} />Expenses</span>
                </div>
              </div>
              {loading ? (
                <div className="h-52 flex items-center justify-center text-xs" style={{ color: 'var(--color-text-muted)' }}>Loading…</div>
              ) : (
                <ResponsiveContainer width="100%" height={210}>
                  <BarChart data={monthlyChart} barCategoryGap="30%" barGap={3}>
                    <CartesianGrid vertical={false} stroke="rgba(255,255,255,0.05)" />
                    <XAxis dataKey="month" tick={{ fill: '#6B6B8A', fontSize: 11 }} axisLine={false} tickLine={false} />
                    <YAxis tickFormatter={v => v >= 1000 ? `$${(v/1000).toFixed(0)}k` : `$${v}`}
                      tick={{ fill: '#6B6B8A', fontSize: 10 }} axisLine={false} tickLine={false} width={46} />
                    <Tooltip
                      cursor={{ fill: 'rgba(255,255,255,0.04)' }}
                      contentStyle={{ background: 'rgba(22,22,36,0.97)', border: '1px solid rgba(255,255,255,0.10)', borderRadius: '10px', fontSize: 12 }}
                      labelStyle={{ color: 'white', fontWeight: 700, marginBottom: 4 }}
                      formatter={(value: number, name: string) => [`$${value.toLocaleString('en-US', { minimumFractionDigits: 2 })}`, name === 'revenue' ? 'Revenue' : 'Expenses']}
                    />
                    <Bar dataKey="revenue"  fill="#4FBF7F" radius={[4,4,0,0]} />
                    <Bar dataKey="expenses" fill="#F07A3E" radius={[4,4,0,0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>

            {/* Revenue by channel — donut + breakdown list */}
            <div className="xl:col-span-2 flex flex-col gap-4 p-5 rounded-2xl" style={glass}>
              <div>
                <p className="font-bold text-sm">Revenue by Channel</p>
                <p className="text-[10px] mt-0.5" style={{ color: 'var(--color-text-muted)' }}>{currentYear} · year to date</p>
              </div>
              {loading ? (
                <div className="h-52 flex items-center justify-center text-xs" style={{ color: 'var(--color-text-muted)' }}>Loading…</div>
              ) : revPieData.length === 0 ? (
                <div className="h-52 flex items-center justify-center flex-col gap-2 text-center">
                  <span className="text-3xl opacity-30">📭</span>
                  <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>No income transactions yet this year.</p>
                </div>
              ) : (
                <>
                  <ResponsiveContainer width="100%" height={155}>
                    <PieChart>
                      <Pie data={revPieData} cx="50%" cy="50%" innerRadius={42} outerRadius={68}
                        dataKey="value" nameKey="name" paddingAngle={2} stroke="none">
                        {revPieData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                      </Pie>
                      <Tooltip
                        contentStyle={{ background: 'rgba(22,22,36,0.97)', border: '1px solid rgba(255,255,255,0.10)', borderRadius: '10px', fontSize: 12 }}
                        formatter={(value: number, name: string) => [`$${(value as number).toLocaleString('en-US', { minimumFractionDigits: 2 })}`, name]}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="flex flex-col gap-2">
                    {revPieData.map((r, i) => {
                      const total = revPieData.reduce((s,x) => s + x.value, 0);
                      const pct   = total > 0 ? (r.value / total * 100).toFixed(1) : '0';
                      return (
                        <div key={i} className="flex items-center gap-2">
                          <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: r.color }} />
                          <span className="text-sm shrink-0">{r.icon}</span>
                          <span className="flex-1 text-xs truncate" style={{ color: 'var(--color-text-secondary)' }}>{r.name}</span>
                          <span className="text-[10px] font-semibold shrink-0" style={{ color: r.color }}>{pct}%</span>
                          <span className="text-xs font-bold tabular-nums shrink-0">${r.value.toLocaleString('en-US', { minimumFractionDigits: 0 })}</span>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
            </div>

          </div>

          {/* ── Row 2: Stat cards ── */}
          <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
            {[
              { label: 'NET BALANCE',   value: formatAmt(totalBalance, false), sub: `${accounts.length} account${accounts.length !== 1 ? 's' : ''}`, accent: '#9B6DFF', icon: '💰' },
              { label: 'INCOME',        value: formatAmt(income, false),        sub: monthLabel(month), accent: '#4FBF7F', icon: '📈' },
              { label: 'EXPENSES',      value: formatAmt(expenses, false),      sub: monthLabel(month), accent: '#F07A3E', icon: '📉' },
              { label: 'SAVINGS RATE',  value: `${savingsRate >= 0 ? '' : '-'}${Math.abs(savingsRate).toFixed(1)}%`, sub: income > 0 ? `$${(income - expenses).toFixed(0)} saved` : 'No income yet', accent: savingsRate >= 0 ? '#F5C842' : '#FF6B6B', icon: '🐖' },
            ].map(c => (
              <div key={c.label} className="p-5 flex flex-col gap-2 relative overflow-hidden rounded-2xl"
                style={{ background: `rgba(${hexToRgb(c.accent)}, 0.10)`, border: `1px solid rgba(${hexToRgb(c.accent)}, 0.22)`, boxShadow: `0 4px 24px rgba(${hexToRgb(c.accent)}, 0.08)` }}>
                <div className="absolute -top-8 -right-8 w-28 h-28 rounded-full pointer-events-none"
                  style={{ background: c.accent, opacity: 0.10, filter: 'blur(24px)' }} />
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold tracking-widest uppercase" style={{ color: c.accent, opacity: 0.9 }}>{c.label}</span>
                  <span className="text-xl">{c.icon}</span>
                </div>
                <span className="text-3xl font-extrabold text-white leading-none">{loading ? '—' : c.value}</span>
                <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>{c.sub}</span>
              </div>
            ))}
          </div>

          {/* ── Row 2: Transactions + Accounts & Budget ── */}
          <div className="grid grid-cols-1 xl:grid-cols-5 gap-5">

            {/* Recent Transactions */}
            <div className="xl:col-span-3 flex flex-col gap-3 p-5 rounded-2xl" style={glass}>
              <div className="flex items-center justify-between">
                <p className="font-bold text-sm">Recent Transactions</p>
                <Link href="/transactions" className="text-xs font-semibold hover:opacity-80 transition-opacity" style={{ color: '#9B6DFF' }}>View all →</Link>
              </div>
              {loading ? (
                <p className="text-xs py-4 text-center" style={{ color: 'var(--color-text-muted)' }}>Loading…</p>
              ) : recent.length === 0 ? (
                <p className="text-xs py-4 text-center" style={{ color: 'var(--color-text-muted)' }}>No transactions this month.</p>
              ) : (
                <div className="flex flex-col">
                  {recent.map((tx, i) => {
                    const amt    = Number(tx.amount);
                    const isInc  = amt >= 0;
                    const cat    = tx.categoryRef;
                    return (
                      <div key={tx.id} className="flex items-center gap-3 py-2.5 group"
                        style={i > 0 ? { borderTop: '1px solid rgba(255,255,255,0.05)' } : {}}>
                        {/* Category icon or bar */}
                        <div className="w-8 h-8 rounded-lg flex items-center justify-center text-base shrink-0"
                          style={{ background: cat ? `${cat.color}20` : 'rgba(255,255,255,0.06)' }}>
                          {cat ? cat.icon : (isInc ? '📥' : '📤')}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate leading-snug">{tx.name}</p>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            <span className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>{formatDate(tx.date)}</span>
                            {cat && (
                              <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-md"
                                style={{ background: `${cat.color}18`, color: cat.color }}>{cat.name}</span>
                            )}
                          </div>
                        </div>
                        <span className="text-sm font-bold tabular-nums shrink-0"
                          style={{ color: isInc ? '#4FBF7F' : '#F07A3E' }}>
                          {isInc ? '+' : '-'}${Math.abs(amt).toFixed(2)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Right column: Accounts + Budget health */}
            <div className="xl:col-span-2 flex flex-col gap-4">

              {/* Account balances */}
              <div className="flex flex-col gap-3 p-5 rounded-2xl" style={glass}>
                <div className="flex items-center justify-between">
                  <p className="font-bold text-sm">Accounts</p>
                  <span className="text-xs font-bold tabular-nums" style={{ color: '#9B6DFF' }}>
                    ${totalBalance.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                  </span>
                </div>
                {loading ? <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>Loading…</p>
                : accounts.length === 0 ? <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>No accounts connected.</p>
                : accounts.slice(0,5).map(acc => {
                  const bal = Number(acc.balance || 0);
                  return (
                    <div key={acc.id} className="flex items-center gap-3">
                      <div className="w-7 h-7 rounded-lg flex items-center justify-center text-sm shrink-0"
                        style={{ background: `${acc.color || '#9B6DFF'}20` }}>
                        {ACC_ICONS[acc.accountType] ?? '🏦'}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold truncate">{acc.accountName}</p>
                        <p className="text-[10px] truncate" style={{ color: 'var(--color-text-muted)' }}>{acc.bankName}</p>
                      </div>
                      <span className="text-xs font-bold tabular-nums shrink-0"
                        style={{ color: bal >= 0 ? 'var(--color-text-primary)' : '#FF6B6B' }}>
                        {bal < 0 ? '-' : ''}${Math.abs(bal).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                      </span>
                    </div>
                  );
                })}
                {accounts.length > 5 && (
                  <p className="text-[10px] text-center" style={{ color: 'var(--color-text-muted)' }}>+{accounts.length-5} more</p>
                )}
              </div>

              {/* Budget health */}
              <div className="flex flex-col gap-3 p-5 rounded-2xl" style={glass}>
                <div className="flex items-center justify-between">
                  <p className="font-bold text-sm">Budget</p>
                  <Link href="/budgets" className="text-xs font-semibold hover:opacity-80" style={{ color: '#9B6DFF' }}>Manage →</Link>
                </div>
                {loading ? <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>Loading…</p>
                : budgets.length === 0 ? <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>No budgets set yet.</p>
                : (
                  <>
                    {/* Overall bar */}
                    <div>
                      <div className="flex justify-between text-[10px] mb-1" style={{ color: 'var(--color-text-muted)' }}>
                        <span>Spent ${totalSpent.toFixed(0)} of ${totalBudgeted.toFixed(0)}</span>
                        <span>{totalBudgeted > 0 ? Math.round(totalSpent/totalBudgeted*100) : 0}%</span>
                      </div>
                      <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.08)' }}>
                        <div className="h-full rounded-full transition-all"
                          style={{ width: `${Math.min(100, totalBudgeted > 0 ? totalSpent/totalBudgeted*100 : 0)}%`, background: totalSpent > totalBudgeted ? '#FF6B6B' : '#4FBF7F' }} />
                      </div>
                    </div>
                    {/* Alert rows */}
                    {[...overBudget.slice(0,2), ...nearBudget.slice(0, 2 - Math.min(2, overBudget.length))].map(b => {
                      const pct = Number(b.amount) > 0 ? Math.round(Number(b.spent)/Number(b.amount)*100) : 0;
                      const over = Number(b.spent) > Number(b.amount);
                      return (
                        <div key={b.id} className="flex items-center gap-2">
                          <span className="text-sm shrink-0">{b.category.icon}</span>
                          <div className="flex-1 min-w-0">
                            <div className="flex justify-between text-[10px] mb-0.5">
                              <span className="truncate" style={{ color: 'var(--color-text-secondary)' }}>{b.category.name}</span>
                              <span style={{ color: over ? '#FF6B6B' : '#F5C842' }}>{pct}%</span>
                            </div>
                            <div className="h-1 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.08)' }}>
                              <div className="h-full rounded-full"
                                style={{ width: `${Math.min(100, pct)}%`, background: over ? '#FF6B6B' : '#F5C842' }} />
                            </div>
                          </div>
                        </div>
                      );
                    })}
                    {overBudget.length > 0 && (
                      <p className="text-[10px] font-semibold" style={{ color: '#FF6B6B' }}>
                        ⚠ {overBudget.length} categor{overBudget.length > 1 ? 'ies' : 'y'} over budget
                      </p>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>

          {/* ── Row 3: Spending breakdown + Projects ── */}
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">

            {/* Spending by category */}
            <div className="flex flex-col gap-4 p-5 rounded-2xl" style={glass}>
              <div className="flex items-center justify-between">
                <p className="font-bold text-sm">Top Spending Categories</p>
                <span className="text-xs font-semibold" style={{ color: 'var(--color-text-muted)' }}>{monthLabel(month)}</span>
              </div>
              {loading ? <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>Loading…</p>
              : topCats.length === 0 ? <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>No expenses this month.</p>
              : (
                <div className="flex flex-col gap-3">
                  {topCats.map(({ cat, total }) => (
                    <div key={cat.id} className="flex items-center gap-3">
                      <div className="w-7 h-7 rounded-lg flex items-center justify-center text-sm shrink-0"
                        style={{ background: `${cat.color}20` }}>{cat.icon}</div>
                      <div className="flex-1 min-w-0">
                        <div className="flex justify-between text-xs mb-1">
                          <span className="font-medium truncate" style={{ color: 'var(--color-text-secondary)' }}>{cat.name}</span>
                          <span className="font-bold tabular-nums shrink-0 ml-2" style={{ color: cat.color }}>${total.toFixed(2)}</span>
                        </div>
                        <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.07)' }}>
                          <div className="h-full rounded-full transition-all"
                            style={{ width: `${(total / maxCatSpend * 100).toFixed(1)}%`, background: cat.color }} />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Projects snapshot */}
            <div className="flex flex-col gap-4 p-5 rounded-2xl" style={glass}>
              <div className="flex items-center justify-between">
                <p className="font-bold text-sm">Projects</p>
                <Link href="/projects" className="text-xs font-semibold hover:opacity-80" style={{ color: '#9B6DFF' }}>View all →</Link>
              </div>

              {/* Summary pills */}
              <div className="grid grid-cols-3 gap-2">
                {[
                  { label: 'Active',   value: activeProjects.length.toString(),       color: '#9B6DFF' },
                  { label: 'Invested', value: `$${(totalInvested/1000).toFixed(1)}k`, color: '#F07A3E' },
                  { label: 'Net P&L',  value: (totalNetGain >= 0 ? '+' : '') + `$${Math.abs(totalNetGain).toFixed(0)}`, color: totalNetGain >= 0 ? '#4FBF7F' : '#FF6B6B' },
                ].map(s => (
                  <div key={s.label} className="p-2.5 rounded-xl text-center"
                    style={{ background: `rgba(${hexToRgb(s.color)}, 0.10)`, border: `1px solid rgba(${hexToRgb(s.color)}, 0.20)` }}>
                    <p className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>{s.label}</p>
                    <p className="text-sm font-extrabold mt-0.5" style={{ color: s.color }}>{loading ? '—' : s.value}</p>
                  </div>
                ))}
              </div>

              {loading ? <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>Loading…</p>
              : activeProjects.length === 0 ? (
                <p className="text-xs text-center py-2" style={{ color: 'var(--color-text-muted)' }}>No active projects.</p>
              ) : (
                <div className="flex flex-col gap-2">
                  {activeProjects.slice(0, 5).map(p => {
                    const c    = p.color || '#9B6DFF';
                    const gain = p.netGain;
                    return (
                      <div key={p.id} className="flex items-center gap-3 px-3 py-2.5 rounded-xl"
                        style={{ background: `${c}0d`, border: `1px solid ${c}25` }}>
                        <span className="text-xl shrink-0">{p.icon}</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold truncate">{p.name}</p>
                          <p className="text-[10px] capitalize" style={{ color: 'var(--color-text-muted)' }}>
                            {p.type} · ${Number(p.costBasis).toLocaleString('en-US', { minimumFractionDigits: 0 })} cost
                          </p>
                        </div>
                        <div className="text-right shrink-0">
                          {gain != null ? (
                            <>
                              <p className="text-xs font-bold" style={{ color: gain >= 0 ? '#4FBF7F' : '#FF6B6B' }}>
                                {gain >= 0 ? '+' : '-'}${Math.abs(gain).toFixed(0)}
                              </p>
                              <p className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>
                                {p.roi != null ? `${p.roi >= 0 ? '+' : ''}${p.roi.toFixed(1)}%` : ''}
                              </p>
                            </>
                          ) : (
                            <span className="text-[10px] px-1.5 py-0.5 rounded-full" style={{ background: `${c}20`, color: c }}>active</span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

        </div>
      </main>
    </div>
  );
}
