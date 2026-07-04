'use client';

import Link from 'next/link';
import Panel, { PanelEmpty } from '../Panel';
import type { Transaction } from '@/lib/dashboard/types';

function formatDate(d: string) {
  return new Date(d+'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export default function RecentTransactionsPanel({ transactions, loading }: { transactions: Transaction[]; loading: boolean }) {
  const recent = [...transactions].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 8);

  return (
    <Panel title="Recent Transactions" loading={loading}
      legend={<Link href="/transactions" className="text-xs font-semibold hover:opacity-80 transition-opacity" style={{ color: 'var(--color-primary)' }}>View all →</Link>}>
      {recent.length === 0 ? (
        <PanelEmpty message="No transactions this month yet." />
      ) : (
        <div className="flex flex-col">
          {recent.map((tx, i) => {
            const amt   = Number(tx.amount);
            const isInc = amt >= 0;
            const cat   = tx.categoryRef;
            return (
              <div key={tx.id} className="flex items-center gap-3 py-2.5 group"
                style={i > 0 ? { borderTop: '1px solid var(--color-border)' } : {}}>
                <div className="w-8 h-8 rounded-xl flex items-center justify-center text-sm shrink-0 relative"
                  style={{ background: cat ? `${cat.color}18` : 'var(--color-elevated)' }}>
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
                  style={{ color: isInc ? 'var(--color-green)' : 'var(--color-text-primary)' }}>
                  {isInc ? '+' : '−'}${Math.abs(amt).toFixed(2)}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </Panel>
  );
}
