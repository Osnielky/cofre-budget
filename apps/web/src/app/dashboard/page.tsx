'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import Sidebar from '@/components/Sidebar';
import { BANKS } from '@/components/BankSelect';
import {
  ComposedChart, Bar, Line, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, Cell, PieChart, Pie, Area, AreaChart,
} from 'recharts';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3333/api';

interface Category  { id: string; name: string; icon: string; color: string; type: string }
interface BankAccount { id: string; bankName: string; accountName: string; accountType: string; color: string; balance: number; last4?: string }
interface Transaction {
  id: string; name: string; amount: number; date: string; source: string;
  categoryRef: Category | null; bankAccount: BankAccount | null; projectId: string | null;
}
interface Budget { id: string; amount: number; spent: number; category: Category }
interface Project { id: string; name: string; icon: string; color: string; type: string; status: string; expenses: number; income: number; costBasis: number; netGain: number | null; roi: number | null; purchasePrice: number }

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
function monthShort(m: string) {
  const [y,mo] = m.split('-');
  return new Date(Number(y), Number(mo)-1).toLocaleString('default', { month: 'short' });
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
function fmt(n: number) { return n.toLocaleString('en-US', { minimumFractionDigits: 2 }); }
function fmtK(n: number) { return n >= 10000 ? `$${(n/1000).toFixed(1)}k` : `$${fmt(n)}`; }
function formatDate(d: string) {
  return new Date(d+'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
function greeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}

const glass: React.CSSProperties = {
  background: 'rgba(22,22,36,0.60)', backdropFilter: 'blur(20px)',
  WebkitBackdropFilter: 'blur(20px)', border: '1px solid rgba(255,255,255,0.08)',
  boxShadow: '0 4px 32px rgba(0,0,0,0.3)',
};

function TrendBadge({ delta, inverse = false }: { delta: number; inverse?: boolean }) {
  if (Math.abs(delta) < 0.5) return null;
  const good = inverse ? delta < 0 : delta > 0;
  return (
    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md flex items-center gap-0.5"
      style={{ background: good ? 'rgba(79,191,127,0.15)' : 'rgba(255,107,107,0.15)', color: good ? '#4FBF7F' : '#FF6B6B' }}>
      {delta > 0 ? '↑' : '↓'}{Math.abs(delta).toFixed(1)}%
    </span>
  );
}

function BankLogo({ bankName, size = 28 }: { bankName: string; size?: number }) {
  const [err, setErr] = useState(false);
  const bank = BANKS.find(b => b.name === bankName);
  if (!bank) return <span style={{ fontSize: size * 0.6 }}>🏦</span>;
  if (err) return (
    <div className="rounded-lg flex items-center justify-center text-white font-black"
      style={{ width: size, height: size, background: bank.color, fontSize: size * 0.35 }}>
      {bank.abbr}
    </div>
  );
  return (
    <img src={`https://logo.clearbit.com/${bank.domain}`} width={size} height={size}
      style={{ objectFit: 'contain', borderRadius: 6, background: 'white', padding: 2 }}
      onError={() => setErr(true)} />
  );
}

export default function DashboardPage() {
  const [month, setMonth]          = useState(currentMonth);
  const [transactions, setTx]      = useState<Transaction[]>([]);
  const [yearTx, setYearTx]        = useState<Transaction[]>([]);
  const [accounts, setAccounts]    = useState<BankAccount[]>([]);
  const [budgets, setBudgets]      = useState<Budget[]>([]);
  const [projects, setProjects]    = useState<Project[]>([]);
  const [loading, setLoading]      = useState(true);
  const [user, setUser]            = useState<{ name?: string; email?: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
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
      setTx(Array.isArray(tx) ? tx : []);
      setYearTx(Array.isArray(ytx) ? ytx : []);
      setAccounts(Array.isArray(accs) ? accs : []);
      setBudgets(Array.isArray(bdg) ? bdg : []);
      setProjects(Array.isArray(proj) ? proj : []);
      setUser(me);
    } catch {} finally { setLoading(false); }
  }, [month]);

  useEffect(() => { load(); }, [load]);

  /* ── Derived data ── */
  const isTransfer   = (t: Transaction) => t.categoryRef?.type === 'transfer';
  const isDebtAcc    = (a: BankAccount) => ['credit','loan'].includes(a.accountType);
  const income       = transactions.filter(t => Number(t.amount) > 0  && !isTransfer(t)).reduce((s,t) => s + Number(t.amount), 0);
  const expenses     = transactions.filter(t => Number(t.amount) < 0  && !isTransfer(t)).reduce((s,t) => s + Math.abs(Number(t.amount)), 0);
  const net          = income - expenses;
  const savingsRate  = income > 0 ? (net / income * 100) : 0;
  const totalBalance = accounts.reduce((s,a) => s + (isDebtAcc(a) ? -Math.abs(Number(a.balance||0)) : Number(a.balance||0)), 0);
  const totalAssets  = accounts.filter(a => !isDebtAcc(a)).reduce((s,a) => s + Number(a.balance||0), 0);
  const totalDebt    = accounts.filter(a => isDebtAcc(a)).reduce((s,a) => s + Math.abs(Number(a.balance||0)), 0);
  const isCurrentMonth = month === currentMonth();

  /* Prev month comparison from yearTx */
  const prevM    = prevMonth(month);
  const prevInc  = yearTx.filter(t => t.date.startsWith(prevM) && Number(t.amount) > 0  && !isTransfer(t)).reduce((s,t) => s + Number(t.amount), 0);
  const prevExp  = yearTx.filter(t => t.date.startsWith(prevM) && Number(t.amount) < 0  && !isTransfer(t)).reduce((s,t) => s + Math.abs(Number(t.amount)), 0);
  const incDelta = prevInc > 0 ? ((income - prevInc) / prevInc * 100) : 0;
  const expDelta = prevExp > 0 ? ((expenses - prevExp) / prevExp * 100) : 0;

  /* Category spending */
  const catSpend = transactions
    .filter(t => Number(t.amount) < 0 && !isTransfer(t) && t.categoryRef)
    .reduce<Record<string, { cat: Category; total: number }>>((m,t) => {
      const c = t.categoryRef!;
      if (!m[c.id]) m[c.id] = { cat:c, total:0 };
      m[c.id].total += Math.abs(Number(t.amount));
      return m;
    }, {});
  const topCats      = Object.values(catSpend).sort((a,b) => b.total - a.total).slice(0,6);
  const maxCatSpend  = topCats[0]?.total || 1;
  const totalCatSpend = topCats.reduce((s,c) => s + c.total, 0);

  /* Budget health */
  const overBudget     = budgets.filter(b => Number(b.spent) > Number(b.amount));
  const nearBudget     = budgets.filter(b => Number(b.spent)/Number(b.amount) >= 0.8 && Number(b.spent) <= Number(b.amount));
  const totalBudgeted  = budgets.reduce((s,b) => s + Number(b.amount), 0);
  const totalSpent     = budgets.reduce((s,b) => s + Number(b.spent), 0);
  const budgetPct      = totalBudgeted > 0 ? Math.min(100, totalSpent/totalBudgeted*100) : 0;

  /* Projects */
  const activeProjects = projects.filter(p => p.status !== 'sold');
  const totalInvested  = projects.reduce((s,p) => s + Number(p.costBasis||0), 0);
  const totalNetGain   = projects.filter(p => p.netGain != null).reduce((s,p) => s + Number(p.netGain), 0);

  /* Monthly chart */
  const MONTHS_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const currentYear  = new Date().getFullYear();
  const currentMoIdx = new Date().getMonth();
  let cumulativeNet  = 0;
  const monthlyChart = Array.from({ length: currentMoIdx + 1 }, (_,i) => {
    const key = `${currentYear}-${String(i+1).padStart(2,'0')}`;
    const txs = yearTx.filter(t => t.date.startsWith(key) && !isTransfer(t));
    const rev = +txs.filter(t => Number(t.amount) > 0).reduce((s,t) => s + Number(t.amount), 0).toFixed(2);
    const exp = +txs.filter(t => Number(t.amount) < 0).reduce((s,t) => s + Math.abs(Number(t.amount)), 0).toFixed(2);
    cumulativeNet += (rev - exp);
    return { month: MONTHS_SHORT[i], revenue: rev, expenses: exp, net: +cumulativeNet.toFixed(2) };
  });

  /* Revenue by category (donut) */
  const revByCat = yearTx
    .filter(t => Number(t.amount) > 0 && !isTransfer(t) && t.categoryRef)
    .reduce<Record<string, { name:string; icon:string; color:string; value:number }>>((m,t) => {
      const c = t.categoryRef!;
      if (!m[c.id]) m[c.id] = { name:c.name, icon:c.icon, color:c.color, value:0 };
      m[c.id].value = +(m[c.id].value + Number(t.amount)).toFixed(2);
      return m;
    }, {});
  const revPieData = Object.values(revByCat).sort((a,b) => b.value - a.value).slice(0,5);
  const totalRevYTD = revPieData.reduce((s,r) => s + r.value, 0);

  /* Recent transactions */
  const recent = [...transactions].sort((a,b) => b.date.localeCompare(a.date)).slice(0, 8);

  /* Spending trend (last 30 days from current month) */
  const dailySpend: Record<string,number> = {};
  transactions.filter(t => Number(t.amount) < 0 && !isTransfer(t)).forEach(t => {
    dailySpend[t.date] = (dailySpend[t.date]||0) + Math.abs(Number(t.amount));
  });
  const spendTrendData = Object.entries(dailySpend).sort(([a],[b]) => a.localeCompare(b)).map(([date,total]) => ({
    date: formatDate(date), total: +total.toFixed(2),
  }));

  return (
    <div className="flex h-dvh overflow-hidden">
      <Sidebar />
      <main className="flex-1 overflow-y-auto">

        {/* ── Sticky header ── */}
        <div className="sticky top-0 z-20 px-6 pt-5 pb-4 flex items-center justify-between gap-4"
          style={{ background: 'rgba(15,15,24,0.92)', backdropFilter: 'blur(24px)', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          <div>
            <h1 className="text-xl font-bold tracking-tight">
              {greeting()}{user?.name ? `, ${user.name.split(' ')[0]}` : ''} 👋
            </h1>
            <p className="text-xs mt-0.5" style={{ color: 'var(--color-text-muted)' }}>
              Here's your financial snapshot
            </p>
          </div>
          <div className="flex items-center gap-2">
            {loading && <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: '#4FBF7F' }} />}
            <div className="flex items-center gap-1 px-1 py-1 rounded-xl" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
              <button onClick={() => setMonth(prevMonth)} className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-white/10 transition-colors" style={{ color: 'var(--color-text-muted)' }}>‹</button>
              <span className="text-sm font-semibold px-2 min-w-32 text-center">{monthLabel(month)}</span>
              <button onClick={() => setMonth(nextMonth)} disabled={isCurrentMonth} className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-white/10 transition-colors disabled:opacity-30" style={{ color: 'var(--color-text-muted)' }}>›</button>
            </div>
          </div>
        </div>

        <div className="p-6 flex flex-col gap-5">

          {/* ── Row 1: Stat cards ── */}
          <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
            {[
              { label: 'Net Worth',    value: `$${fmt(totalBalance)}`,                    sub: `${accounts.length} accounts`,              accent: '#9B6DFF', icon: '💎', delta: null,     inverseDelta: false },
              { label: 'Income',       value: `$${fmt(income)}`,                          sub: `vs ${monthShort(prevM)}: $${fmt(prevInc)}`, accent: '#4FBF7F', icon: '📈', delta: incDelta, inverseDelta: false },
              { label: 'Expenses',     value: `$${fmt(expenses)}`,                        sub: `vs ${monthShort(prevM)}: $${fmt(prevExp)}`, accent: '#F07A3E', icon: '📉', delta: expDelta, inverseDelta: true },
              { label: 'Savings Rate', value: `${savingsRate >= 0 ? '' : '-'}${Math.abs(savingsRate).toFixed(1)}%`, sub: net >= 0 ? `$${fmt(net)} saved` : `$${fmt(Math.abs(net))} deficit`, accent: savingsRate >= 30 ? '#4FBF7F' : savingsRate >= 0 ? '#F5C842' : '#FF6B6B', icon: '🏦', delta: null, inverseDelta: false },
            ].map(c => (
              <div key={c.label} className="p-5 flex flex-col gap-2 relative overflow-hidden rounded-2xl cursor-default select-none"
                style={{ background: `rgba(${hexToRgb(c.accent)}, 0.08)`, border: `1px solid rgba(${hexToRgb(c.accent)}, 0.20)` }}>
                <div className="absolute -top-10 -right-10 w-32 h-32 rounded-full pointer-events-none"
                  style={{ background: c.accent, opacity: 0.08, filter: 'blur(30px)' }} />
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold tracking-widest uppercase" style={{ color: c.accent, opacity: 0.85 }}>{c.label}</span>
                  <span className="text-lg">{c.icon}</span>
                </div>
                <div className="flex items-end gap-2 flex-wrap">
                  <span className="text-2xl font-extrabold leading-none" style={{ color: 'var(--color-text-primary)' }}>
                    {loading ? <span className="opacity-30">—</span> : c.value}
                  </span>
                  {!loading && c.delta !== null && <TrendBadge delta={c.delta} inverse={c.inverseDelta} />}
                </div>
                <span className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>{c.sub}</span>
              </div>
            ))}
          </div>

          {/* ── Row 2: Charts ── */}
          <div className="grid grid-cols-1 xl:grid-cols-5 gap-5">

            {/* Revenue vs Expenses + cumulative net */}
            <div className="xl:col-span-3 flex flex-col gap-4 p-5 rounded-2xl" style={glass}>
              <div className="flex items-center justify-between flex-wrap gap-3">
                <div>
                  <p className="font-bold text-sm">Cash Flow</p>
                  <p className="text-[10px] mt-0.5" style={{ color: 'var(--color-text-muted)' }}>{currentYear} · year to date</p>
                </div>
                <div className="flex items-center gap-4 text-[10px] font-semibold" style={{ color: 'var(--color-text-muted)' }}>
                  <span className="flex items-center gap-1.5"><span className="w-2.5 h-1.5 rounded-sm" style={{ background: '#4FBF7F' }} />Revenue</span>
                  <span className="flex items-center gap-1.5"><span className="w-2.5 h-1.5 rounded-sm" style={{ background: '#F07A3E' }} />Expenses</span>
                  <span className="flex items-center gap-1.5"><span className="w-5 h-0.5 rounded-full" style={{ background: '#9B6DFF' }} />Net</span>
                </div>
              </div>
              {loading ? (
                <div className="h-52 flex items-center justify-center text-xs" style={{ color: 'var(--color-text-muted)' }}>Loading…</div>
              ) : (
                <ResponsiveContainer width="100%" height={220}>
                  <ComposedChart data={monthlyChart} barCategoryGap="30%" barGap={3}>
                    <CartesianGrid vertical={false} stroke="rgba(255,255,255,0.05)" />
                    <XAxis dataKey="month" tick={{ fill: '#6B6B8A', fontSize: 11 }} axisLine={false} tickLine={false} />
                    <YAxis yAxisId="bar" tickFormatter={v => v >= 1000 ? `$${(v/1000).toFixed(0)}k` : `$${v}`}
                      tick={{ fill: '#6B6B8A', fontSize: 10 }} axisLine={false} tickLine={false} width={46} />
                    <YAxis yAxisId="line" orientation="right" tickFormatter={v => v >= 1000 ? `$${(v/1000).toFixed(0)}k` : `$${v}`}
                      tick={{ fill: '#6B6B8A', fontSize: 10 }} axisLine={false} tickLine={false} width={46} />
                    <Tooltip
                      cursor={{ fill: 'rgba(255,255,255,0.04)' }}
                      contentStyle={{ background: 'rgba(18,18,30,0.97)', border: '1px solid rgba(255,255,255,0.10)', borderRadius: 12, fontSize: 12 }}
                      labelStyle={{ color: 'white', fontWeight: 700, marginBottom: 4 }}
                      formatter={(v: number, name: string) => [`$${fmt(v)}`, name === 'revenue' ? 'Revenue' : name === 'expenses' ? 'Expenses' : 'Cumulative Net']}
                    />
                    <Bar yAxisId="bar" dataKey="revenue"  fill="#4FBF7F" radius={[4,4,0,0]} fillOpacity={0.85} />
                    <Bar yAxisId="bar" dataKey="expenses" fill="#F07A3E" radius={[4,4,0,0]} fillOpacity={0.85} />
                    <Line yAxisId="line" type="monotone" dataKey="net" stroke="#9B6DFF" strokeWidth={2} dot={{ fill: '#9B6DFF', r: 3, strokeWidth: 0 }} />
                  </ComposedChart>
                </ResponsiveContainer>
              )}
            </div>

            {/* Revenue by category donut */}
            <div className="xl:col-span-2 flex flex-col gap-4 p-5 rounded-2xl" style={glass}>
              <div>
                <p className="font-bold text-sm">Revenue Sources</p>
                <p className="text-[10px] mt-0.5" style={{ color: 'var(--color-text-muted)' }}>{currentYear} · year to date</p>
              </div>
              {loading ? (
                <div className="h-48 flex items-center justify-center text-xs" style={{ color: 'var(--color-text-muted)' }}>Loading…</div>
              ) : revPieData.length === 0 ? (
                <div className="h-48 flex flex-col items-center justify-center gap-2 text-center">
                  <span className="text-3xl opacity-30">📭</span>
                  <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>No income yet this year.</p>
                </div>
              ) : (
                <>
                  <div className="relative">
                    <ResponsiveContainer width="100%" height={130}>
                      <PieChart>
                        <Pie data={revPieData} cx="50%" cy="50%" innerRadius={38} outerRadius={58}
                          dataKey="value" nameKey="name" paddingAngle={3} stroke="none">
                          {revPieData.map((e,i) => <Cell key={i} fill={e.color} />)}
                        </Pie>
                        <Tooltip contentStyle={{ background: 'rgba(18,18,30,0.97)', border: '1px solid rgba(255,255,255,0.10)', borderRadius: 10, fontSize: 11 }}
                          formatter={(v: number) => [`$${fmt(v)}`]} />
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                      <p className="text-[10px] font-semibold" style={{ color: 'var(--color-text-muted)' }}>Total</p>
                      <p className="text-sm font-black" style={{ color: '#4FBF7F' }}>{fmtK(totalRevYTD)}</p>
                    </div>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    {revPieData.map((r,i) => (
                      <div key={i} className="flex items-center gap-2">
                        <span className="text-sm shrink-0">{r.icon}</span>
                        <span className="flex-1 text-xs truncate" style={{ color: 'var(--color-text-secondary)' }}>{r.name}</span>
                        <span className="text-[10px] font-semibold shrink-0" style={{ color: r.color }}>
                          {totalRevYTD > 0 ? (r.value/totalRevYTD*100).toFixed(1) : 0}%
                        </span>
                        <span className="text-xs font-bold tabular-nums shrink-0">{fmtK(r.value)}</span>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>

          {/* ── Row 3: Spending trend + top categories ── */}
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">

            {/* Daily spending area chart */}
            <div className="flex flex-col gap-4 p-5 rounded-2xl" style={glass}>
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-bold text-sm">Daily Spending</p>
                  <p className="text-[10px] mt-0.5" style={{ color: 'var(--color-text-muted)' }}>{monthLabel(month)}</p>
                </div>
                <div className="text-right">
                  <p className="text-xs font-bold" style={{ color: '#F07A3E' }}>${fmt(expenses)}</p>
                  <p className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>total spent</p>
                </div>
              </div>
              {loading ? (
                <div className="h-36 flex items-center justify-center text-xs" style={{ color: 'var(--color-text-muted)' }}>Loading…</div>
              ) : spendTrendData.length === 0 ? (
                <div className="h-36 flex items-center justify-center text-xs" style={{ color: 'var(--color-text-muted)' }}>No expenses this month.</div>
              ) : (
                <ResponsiveContainer width="100%" height={140}>
                  <AreaChart data={spendTrendData}>
                    <defs>
                      <linearGradient id="spendGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#F07A3E" stopOpacity={0.3}/>
                        <stop offset="95%" stopColor="#F07A3E" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid vertical={false} stroke="rgba(255,255,255,0.04)" />
                    <XAxis dataKey="date" tick={{ fill: '#6B6B8A', fontSize: 9 }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
                    <YAxis tickFormatter={v => `$${v}`} tick={{ fill: '#6B6B8A', fontSize: 9 }} axisLine={false} tickLine={false} width={36} />
                    <Tooltip contentStyle={{ background: 'rgba(18,18,30,0.97)', border: '1px solid rgba(255,255,255,0.10)', borderRadius: 10, fontSize: 11 }}
                      formatter={(v: number) => [`$${fmt(v)}`, 'Spent']} />
                    <Area type="monotone" dataKey="total" stroke="#F07A3E" strokeWidth={2} fill="url(#spendGrad)" dot={false} />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </div>

            {/* Spending by Category — donut */}
            <div className="flex flex-col gap-4 p-5 rounded-2xl" style={glass}>
              {/* Header */}
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-bold text-sm">Spending by Category</p>
                  <p className="text-2xl font-extrabold mt-0.5 tabular-nums" style={{ color: 'var(--color-text-primary)' }}>
                    {loading ? '—' : `$${fmt(expenses)}`}
                  </p>
                </div>
                <span className="text-[10px] font-semibold px-2.5 py-1 rounded-lg"
                  style={{ background: 'rgba(255,255,255,0.06)', color: 'var(--color-text-muted)', border: '1px solid rgba(255,255,255,0.08)' }}>
                  {monthLabel(month)}
                </span>
              </div>

              {loading ? (
                <div className="h-40 flex items-center justify-center text-xs" style={{ color: 'var(--color-text-muted)' }}>Loading…</div>
              ) : topCats.length === 0 ? (
                <div className="h-40 flex flex-col items-center justify-center gap-2">
                  <span className="text-3xl opacity-25">🧾</span>
                  <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>No categorized expenses.</p>
                </div>
              ) : (
                <div className="flex gap-4 items-center">
                  {/* Donut */}
                  <div className="relative shrink-0" style={{ width: 148, height: 148 }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={topCats.map(({ cat, total }) => ({ name: cat.name, value: total, color: cat.color }))}
                          cx="50%" cy="50%"
                          innerRadius={46} outerRadius={68}
                          dataKey="value" paddingAngle={2} stroke="none"
                          startAngle={90} endAngle={-270}>
                          {topCats.map(({ cat }, i) => <Cell key={i} fill={cat.color} />)}
                        </Pie>
                        <Tooltip
                          contentStyle={{ background: 'rgba(18,18,30,0.97)', border: '1px solid rgba(255,255,255,0.10)', borderRadius: 10, fontSize: 11 }}
                          formatter={(v: number, name: string) => [`$${fmt(v)}`, name]}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                    {/* Center label */}
                    <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                      <p className="text-lg font-extrabold leading-none" style={{ color: 'var(--color-text-primary)' }}>
                        {budgetPct > 0 ? `${Math.min(100, budgetPct).toFixed(0)}%` : `${topCats.length}`}
                      </p>
                      <p className="text-[9px] font-semibold mt-0.5 text-center leading-tight px-2" style={{ color: 'var(--color-text-muted)' }}>
                        {budgetPct > 0 ? 'Total\nExpends' : 'Categories'}
                      </p>
                    </div>
                  </div>

                  {/* Legend */}
                  <div className="flex flex-col gap-2 flex-1 min-w-0">
                    {topCats.map(({ cat, total }) => {
                      const pct = totalCatSpend > 0 ? (total / totalCatSpend * 100).toFixed(0) : '0';
                      return (
                        <div key={cat.id} className="flex items-center gap-2">
                          <div className="w-2 h-2 rounded-sm shrink-0" style={{ background: cat.color }} />
                          <span className="text-xs flex-1 truncate" style={{ color: 'var(--color-text-secondary)' }}>
                            {cat.icon} {cat.name}
                          </span>
                          <span className="text-[10px] font-bold shrink-0" style={{ color: cat.color }}>{pct}%</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* ── Row 4: Transactions + Accounts + Budget ── */}
          <div className="grid grid-cols-1 xl:grid-cols-5 gap-5">

            {/* Recent transactions */}
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
                    const amt   = Number(tx.amount);
                    const isInc = amt >= 0;
                    const cat   = tx.categoryRef;
                    return (
                      <div key={tx.id} className="flex items-center gap-3 py-2.5 group"
                        style={i > 0 ? { borderTop: '1px solid rgba(255,255,255,0.05)' } : {}}>
                        <div className="w-8 h-8 rounded-xl flex items-center justify-center text-sm shrink-0 relative"
                          style={{ background: cat ? `${cat.color}18` : 'rgba(255,255,255,0.06)' }}>
                          {cat ? cat.icon : (isInc ? '↓' : '↑')}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-semibold truncate">{tx.name}</p>
                          <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                            <span className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>{formatDate(tx.date)}</span>
                            {tx.bankAccount && (
                              <span className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>· {tx.bankAccount.accountName}</span>
                            )}
                            {cat && (
                              <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-md"
                                style={{ background: `${cat.color}18`, color: cat.color }}>{cat.name}</span>
                            )}
                          </div>
                        </div>
                        <span className="text-sm font-bold tabular-nums shrink-0"
                          style={{ color: isInc ? '#4FBF7F' : 'var(--color-text-primary)' }}>
                          {isInc ? '+' : '−'}${Math.abs(amt).toFixed(2)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Accounts + Budget stacked */}
            <div className="xl:col-span-2 flex flex-col gap-4">

              {/* Accounts */}
              <div className="flex flex-col gap-3 p-5 rounded-2xl" style={glass}>
                <div className="flex items-center justify-between">
                  <p className="font-bold text-sm">Accounts</p>
                  <div className="text-right">
                    <p className="text-xs font-black tabular-nums" style={{ color: '#9B6DFF' }}>${fmt(totalBalance)}</p>
                    <p className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>net worth</p>
                  </div>
                </div>
                {/* Assets vs Debt bar */}
                {(totalAssets > 0 || totalDebt > 0) && (
                  <div>
                    <div className="flex h-1.5 rounded-full overflow-hidden gap-px">
                      <div style={{ width: `${totalAssets/(totalAssets+totalDebt)*100}%`, background: '#4FBF7F' }} />
                      <div style={{ width: `${totalDebt/(totalAssets+totalDebt)*100}%`, background: '#FF6B6B' }} />
                    </div>
                    <div className="flex justify-between text-[10px] mt-1" style={{ color: 'var(--color-text-muted)' }}>
                      <span style={{ color: '#4FBF7F' }}>Assets ${fmtK(totalAssets)}</span>
                      <span style={{ color: '#FF6B6B' }}>Debt ${fmtK(totalDebt)}</span>
                    </div>
                  </div>
                )}
                {loading ? <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>Loading…</p>
                : accounts.slice(0, 5).map(acc => {
                  const isDebt = isDebtAcc(acc);
                  const bal    = Number(acc.balance || 0);
                  return (
                    <div key={acc.id} className="flex items-center gap-2.5">
                      <div className="w-7 h-7 rounded-lg overflow-hidden flex items-center justify-center shrink-0"
                        style={{ background: 'white', border: `1px solid ${acc.color || '#9B6DFF'}30` }}>
                        <BankLogo bankName={acc.bankName} size={22} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold truncate">{acc.accountName}</p>
                        <p className="text-[10px] truncate" style={{ color: 'var(--color-text-muted)' }}>
                          {acc.bankName}{isDebt ? ' · owed' : ''}
                        </p>
                      </div>
                      <span className="text-xs font-bold tabular-nums shrink-0"
                        style={{ color: isDebt ? '#FF6B6B' : 'var(--color-text-primary)' }}>
                        {isDebt ? '−' : ''}${Math.abs(bal).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                      </span>
                    </div>
                  );
                })}
                {accounts.length > 5 && (
                  <Link href="/settings" className="text-[10px] text-center hover:opacity-80" style={{ color: 'var(--color-text-muted)' }}>
                    +{accounts.length - 5} more accounts
                  </Link>
                )}
              </div>

              {/* Budget health */}
              <div className="flex flex-col gap-3 p-5 rounded-2xl" style={glass}>
                <div className="flex items-center justify-between">
                  <p className="font-bold text-sm">Budget</p>
                  <Link href="/budgets" className="text-xs font-semibold hover:opacity-80" style={{ color: '#9B6DFF' }}>Manage →</Link>
                </div>
                {loading ? <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>Loading…</p>
                : budgets.length === 0 ? (
                  <div className="text-center py-2">
                    <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>No budgets set.</p>
                    <Link href="/budgets" className="text-xs font-semibold mt-1 block hover:opacity-80" style={{ color: '#9B6DFF' }}>Set budgets →</Link>
                  </div>
                ) : (
                  <>
                    <div>
                      <div className="flex justify-between text-[10px] mb-1.5" style={{ color: 'var(--color-text-muted)' }}>
                        <span>Spent ${fmt(Math.min(totalSpent, totalBudgeted))} of ${fmt(totalBudgeted)}</span>
                        <span style={{ color: budgetPct >= 100 ? '#FF6B6B' : budgetPct >= 80 ? '#F5C842' : '#4FBF7F' }}>{budgetPct.toFixed(0)}%</span>
                      </div>
                      <div className="h-2 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.08)' }}>
                        <div className="h-full rounded-full transition-all duration-700"
                          style={{ width: `${budgetPct}%`, background: budgetPct >= 100 ? '#FF6B6B' : budgetPct >= 80 ? '#F5C842' : '#4FBF7F' }} />
                      </div>
                    </div>
                    {overBudget.length > 0 && (
                      <p className="text-[10px] font-bold px-2 py-1.5 rounded-lg" style={{ background: 'rgba(255,107,107,0.1)', color: '#FF6B6B' }}>
                        ⚠ {overBudget.length} categor{overBudget.length > 1 ? 'ies' : 'y'} over budget
                      </p>
                    )}
                    {[...overBudget.slice(0,2), ...nearBudget.slice(0, Math.max(0, 2-overBudget.length))].map(b => {
                      const pct = Number(b.amount) > 0 ? Math.round(Number(b.spent)/Number(b.amount)*100) : 0;
                      const over = Number(b.spent) > Number(b.amount);
                      return (
                        <div key={b.id} className="flex items-center gap-2">
                          <span className="text-base shrink-0">{b.category.icon}</span>
                          <div className="flex-1 min-w-0">
                            <div className="flex justify-between text-[10px] mb-0.5">
                              <span className="truncate" style={{ color: 'var(--color-text-secondary)' }}>{b.category.name}</span>
                              <span style={{ color: over ? '#FF6B6B' : '#F5C842' }}>{pct}%</span>
                            </div>
                            <div className="h-1 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.08)' }}>
                              <div className="h-full rounded-full"
                                style={{ width: `${Math.min(100,pct)}%`, background: over ? '#FF6B6B' : '#F5C842' }} />
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </>
                )}
              </div>
            </div>
          </div>

          {/* ── Row 5: Projects ── */}
          {(projects.length > 0 || loading) && (
            <div className="flex flex-col gap-4 p-5 rounded-2xl" style={glass}>
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-bold text-sm">Projects</p>
                  <p className="text-[10px] mt-0.5" style={{ color: 'var(--color-text-muted)' }}>
                    {activeProjects.length} active · ${fmt(totalInvested)} invested · Net P&L{' '}
                    <span style={{ color: totalNetGain >= 0 ? '#4FBF7F' : '#FF6B6B' }}>
                      {totalNetGain >= 0 ? '+' : '−'}${fmt(Math.abs(totalNetGain))}
                    </span>
                  </p>
                </div>
                <Link href="/projects" className="text-xs font-semibold hover:opacity-80" style={{ color: '#9B6DFF' }}>View all →</Link>
              </div>
              {loading ? (
                <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>Loading…</p>
              ) : (
                <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
                  {activeProjects.slice(0, 4).map(p => {
                    const c    = p.color || '#9B6DFF';
                    const gain = p.netGain;
                    const roi  = p.roi;
                    return (
                      <Link href="/projects" key={p.id}
                        className="flex flex-col gap-2.5 p-4 rounded-xl transition-all hover:brightness-110"
                        style={{ background: `${c}0d`, border: `1px solid ${c}28` }}>
                        <div className="flex items-center gap-2">
                          <span className="text-xl">{p.icon}</span>
                          <div className="min-w-0">
                            <p className="text-xs font-bold truncate">{p.name}</p>
                            <p className="text-[10px] capitalize" style={{ color: 'var(--color-text-muted)' }}>{p.type}</p>
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-2 text-center">
                          <div className="rounded-lg py-1.5" style={{ background: 'rgba(255,255,255,0.05)' }}>
                            <p className="text-[9px] font-semibold uppercase tracking-wider" style={{ color: 'var(--color-text-muted)' }}>Invested</p>
                            <p className="text-xs font-bold mt-0.5" style={{ color: c }}>${fmt(Number(p.costBasis))}</p>
                          </div>
                          <div className="rounded-lg py-1.5" style={{ background: 'rgba(255,255,255,0.05)' }}>
                            <p className="text-[9px] font-semibold uppercase tracking-wider" style={{ color: 'var(--color-text-muted)' }}>P&L</p>
                            <p className="text-xs font-bold mt-0.5" style={{ color: gain != null ? (gain >= 0 ? '#4FBF7F' : '#FF6B6B') : 'var(--color-text-muted)' }}>
                              {gain != null ? `${gain >= 0 ? '+' : '−'}$${Math.abs(gain).toFixed(0)}` : '—'}
                            </p>
                          </div>
                        </div>
                        {roi != null && (
                          <div className="flex items-center justify-between text-[10px]">
                            <span style={{ color: 'var(--color-text-muted)' }}>ROI</span>
                            <span className="font-bold" style={{ color: roi >= 0 ? '#4FBF7F' : '#FF6B6B' }}>
                              {roi >= 0 ? '+' : ''}{roi.toFixed(1)}%
                            </span>
                          </div>
                        )}
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          )}

        </div>
      </main>
    </div>
  );
}
