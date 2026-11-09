'use client';

import type { Transaction } from '@/lib/dashboard/types';
import { nameOf } from '@/lib/reports/compute';
import { parseYmd } from '@/lib/reports/range';
import { money, Empty } from './ui';

/** The biggest single expenses of the period, with date, category and account. */
export default function LargestList({ items, total }: { items: Transaction[]; total?: number }) {
  if (items.length === 0) return <Empty text="No expenses in this period." />;
  return (
    <ul className="flex flex-col divide-y" style={{ borderColor: 'var(--color-border)' }}>
      {items.map((t) => {
        const amt = Math.abs(Number(t.amount));
        return (
          <li key={t.id} className="flex items-center gap-3 py-2 text-[12.5px] min-w-0">
            <span className="w-7 h-7 rounded-lg flex items-center justify-center text-[14px] shrink-0"
              style={{ background: `color-mix(in srgb, ${t.categoryRef?.color ?? 'var(--color-text-muted)'} 16%, transparent)` }}>{t.categoryRef?.icon ?? '·'}</span>
            <div className="flex-1 min-w-0">
              <p className="font-semibold truncate" style={{ color: 'var(--color-text-primary)' }}>{nameOf(t)}</p>
              <p className="text-fine truncate" style={{ color: 'var(--color-text-muted)' }}>
                {parseYmd(t.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                {t.categoryRef ? ` · ${t.categoryRef.name}` : ' · Uncategorized'}
                {t.bankAccount ? ` · ${t.bankAccount.bankName} ${t.bankAccount.accountName}` : ''}
              </p>
            </div>
            <div className="text-right shrink-0">
              <p className="tabular-nums font-bold">{money(amt)}</p>
              {total != null && total > 0 && <p className="text-fine tabular-nums" style={{ color: 'var(--color-text-muted)' }}>{Math.round((amt / total) * 100)}% of spending</p>}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
