'use client';

import type { ReportRange } from '@/lib/reports/range';
import type { BankAccount } from '@/lib/dashboard/types';

/* The line under the Reports header: the dates the period resolves to, what they are
   compared with, and the account filter. The period itself is picked in the header's
   PeriodPicker (components/PeriodPicker.tsx), which replaced the preset strip here. */
export default function RangeBar({ range, accounts, account, onAccount }: {
  range: ReportRange; accounts: BankAccount[]; account: string | null; onAccount: (id: string | null) => void;
}) {
  const picked = account ? accounts.find((a) => a.id === account) : null;
  return (
    <div className="flex items-center justify-between gap-x-4 gap-y-2 flex-wrap min-w-0">
      <p className="text-xs sm:text-[13px]" style={{ color: 'var(--color-text-muted)' }}>
        <span className="font-semibold" style={{ color: 'var(--color-text-secondary)' }}>{range.label}</span>
        {' '}· compared with {range.prevLabel}
        {picked && <> · <span className="font-semibold" style={{ color: 'var(--color-text-secondary)' }}>{picked.bankName} {picked.accountName}</span> only</>}
      </p>
      {accounts.length > 1 && (
        <select value={account ?? ''} onChange={(e) => onAccount(e.target.value || null)} aria-label="Account"
          className="px-2.5 py-1.5 text-xs rounded-lg outline-none min-w-0 cursor-pointer"
          style={{
            background: 'var(--color-elevated)', border: '1px solid var(--color-border)', color: 'var(--color-text-primary)',
            ...(account ? { borderColor: 'color-mix(in srgb, var(--color-primary) 45%, transparent)', color: 'var(--color-primary)' } : {}),
          }}>
          <option value="">All accounts</option>
          {accounts.map((a) => <option key={a.id} value={a.id}>{a.bankName} · {a.accountName}</option>)}
        </select>
      )}
    </div>
  );
}
