'use client';

import Link from 'next/link';
import { AreaChart, Area, ResponsiveContainer, Tooltip, XAxis } from 'recharts';
import type { BudgetWithSpent, Transaction } from '@/lib/budgets/types';

function fmt(n: number) { return Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2 }); }
function fmtDate(d: string) { return new Date(d + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }); }

interface BudgetRowDetailProps {
  budget: BudgetWithSpent;
  txs: Transaction[];
  avg3mo?: number;
  raiseTo: number;
  onRaise: () => void;
  onDelete: () => void;
  deleting: boolean;
}

export default function BudgetRowDetail({ budget, txs, avg3mo, raiseTo, onRaise, onDelete, deleting }: BudgetRowDetailProps) {
  const catColor = budget.category?.color ?? '#818CF8';
  const expenses = [...txs].filter((t) => Number(t.amount) < 0).sort((a, b) => b.date.localeCompare(a.date));
  const thisMonth = expenses.reduce((s, t) => s + Math.abs(Number(t.amount)), 0);
  const biggest = expenses.reduce((max, t) => (Math.abs(Number(t.amount)) > Math.abs(Number(max?.amount ?? 0)) ? t : max), expenses[0]);

  const byDay: Record<string, number> = {};
  for (const t of expenses) byDay[t.date] = (byDay[t.date] || 0) + Math.abs(Number(t.amount));
  const trend = Object.entries(byDay).sort(([a], [b]) => a.localeCompare(b)).map(([date, total]) => ({ date: fmtDate(date), total: +total.toFixed(2) }));

  return (
    <div style={{ borderTop: '1px solid var(--color-border)' }}>
      {expenses.length === 0 ? (
        <div className="p-6 text-center">
          <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>No {budget.category?.name} transactions this month.</p>
          <button type="button" onClick={onDelete} disabled={deleting}
            className="mt-3 text-xs font-semibold px-3 py-1.5 rounded-lg hover:bg-red-500/10 transition-colors disabled:opacity-40"
            style={{ color: 'var(--color-rose)' }}>
            {deleting ? 'Deleting…' : 'Delete budget'}
          </button>
        </div>
      ) : (
        <>
          <div className="px-5 py-3 flex items-center gap-6 flex-wrap"
            style={{ background: `linear-gradient(135deg, ${catColor}08 0%, transparent 100%)`, borderBottom: '1px solid var(--color-border)' }}>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--color-text-muted)' }}>This month</p>
              <p className="text-lg font-black" style={{ color: catColor }}>${fmt(thisMonth)}</p>
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--color-text-muted)' }}>3-month avg</p>
              <p className="text-lg font-black" style={{ color: 'var(--color-text-primary)' }}>{avg3mo != null && avg3mo > 0 ? `$${fmt(avg3mo)}` : '—'}</p>
            </div>
            {biggest && (
              <div className="min-w-0">
                <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--color-text-muted)' }}>Biggest</p>
                <p className="text-sm font-bold truncate" style={{ color: 'var(--color-text-primary)' }}>
                  {biggest.name} · ${fmt(Math.abs(Number(biggest.amount)))}
                </p>
              </div>
            )}
            {trend.length > 1 && (
              <div className="flex-1 h-12 min-w-24">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={trend}>
                    <defs>
                      <linearGradient id={`grad-${budget.id}`} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={catColor} stopOpacity={0.3} />
                        <stop offset="95%" stopColor={catColor} stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <XAxis dataKey="date" hide />
                    <Tooltip contentStyle={{ background: 'var(--color-elevated)', border: '1px solid var(--color-border)', borderRadius: 8, fontSize: 11, color: 'var(--color-text-primary)' }}
                      formatter={(v: unknown) => [`$${fmt(Number(v))}`, 'Spent']} />
                    <Area type="monotone" dataKey="total" stroke={catColor} strokeWidth={2} fill={`url(#grad-${budget.id})`} dot={false} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}
            <div className="flex items-center gap-2 ml-auto shrink-0">
              <button type="button" onClick={onRaise}
                className="text-[11px] font-semibold px-3 py-1.5 rounded-lg hover:brightness-110 transition-all"
                style={{ background: `${catColor}22`, color: catColor, border: `1px solid ${catColor}44` }}>
                Raise to ${fmt(raiseTo)}
              </button>
              <Link href="/transactions"
                className="text-[11px] font-semibold px-3 py-1.5 rounded-lg no-underline transition-colors hover:bg-[var(--color-elevated)]"
                style={{ color: 'var(--color-text-secondary)', border: '1px solid var(--color-border)' }}>
                See all {expenses.length}
              </Link>
              <button type="button" onClick={onDelete} disabled={deleting}
                className="text-[11px] font-semibold px-3 py-1.5 rounded-lg hover:bg-red-500/10 transition-colors disabled:opacity-40"
                style={{ color: 'var(--color-rose)' }}>
                {deleting ? '…' : 'Delete'}
              </button>
            </div>
          </div>

          <div className="flex flex-col max-h-64 overflow-y-auto">
            {expenses.map((tx, i) => (
              <div key={tx.id} className="flex items-center gap-3 px-5 py-3"
                style={i > 0 ? { borderTop: '1px solid var(--color-border)' } : {}}>
                <div className="w-8 h-8 rounded-xl flex items-center justify-center text-sm shrink-0" style={{ background: `${catColor}18` }}>
                  {budget.category?.icon ?? '📦'}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold truncate">{tx.name}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>{fmtDate(tx.date)}</span>
                    {tx.bankAccount && <span className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>· {tx.bankAccount.accountName}</span>}
                  </div>
                </div>
                <span className="text-sm font-bold tabular-nums shrink-0" style={{ color: 'var(--color-text-primary)' }}>
                  −${fmt(Math.abs(Number(tx.amount)))}
                </span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
