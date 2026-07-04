'use client';

import { useState } from 'react';
import Link from 'next/link';
import { BANKS } from '@/components/BankSelect';
import { isLiability } from '@/lib/accountTypes';
import Panel, { PanelEmpty } from '../Panel';
import { fmt } from '../chartTheme';
import type { BankAccount } from '@/lib/dashboard/types';

function fmtK(n: number) { return n >= 10000 ? `$${(n/1000).toFixed(1)}k` : `$${fmt(n)}`; }

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

export default function AccountsPanel({ accounts, netWorth, loading }: {
  accounts: BankAccount[]; netWorth: number; loading: boolean;
}) {
  const isDebtAcc    = (a: BankAccount) => isLiability(a.accountType);
  const totalAssets  = accounts.filter(a => !isDebtAcc(a)).reduce((s,a) => s + Number(a.balance||0), 0);
  const totalDebt    = accounts.filter(a => isDebtAcc(a)).reduce((s,a) => s + Math.abs(Number(a.balance||0)), 0);

  return (
    <Panel title="Accounts" loading={loading}
      legend={
        <div className="text-right">
          <p className="text-xs font-black tabular-nums" style={{ color: 'var(--color-primary)' }}>${fmt(netWorth)}</p>
          <p className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>net worth</p>
        </div>
      }>
      {accounts.length === 0 ? (
        <PanelEmpty message="Connect or add a bank account to see balances here." />
      ) : (
        <>
          {/* Assets vs Debt bar */}
          {(totalAssets > 0 || totalDebt > 0) && (
            <div>
              <div className="flex h-1.5 rounded-full overflow-hidden gap-px">
                <div style={{ width: `${totalAssets/(totalAssets+totalDebt)*100}%`, background: 'var(--color-green)' }} />
                <div style={{ width: `${totalDebt/(totalAssets+totalDebt)*100}%`, background: 'var(--color-rose)' }} />
              </div>
              <div className="flex justify-between text-[10px] mt-1" style={{ color: 'var(--color-text-muted)' }}>
                <span style={{ color: 'var(--color-green)' }}>Assets ${fmtK(totalAssets)}</span>
                <span style={{ color: 'var(--color-rose)' }}>Debt ${fmtK(totalDebt)}</span>
              </div>
            </div>
          )}
          {accounts.slice(0, 5).map(acc => {
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
                  style={{ color: isDebt ? 'var(--color-rose)' : 'var(--color-text-primary)' }}>
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
        </>
      )}
    </Panel>
  );
}
