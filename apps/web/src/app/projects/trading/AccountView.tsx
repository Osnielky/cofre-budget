'use client';

import TradingPerformance, { type ProjectPerformance } from '../TradingPerformance';
import AccountHeader from './AccountHeader';
import { CashTiles, CashRows } from './CashPanels';
import { accountTitle, sortAccounts } from '@/lib/projects/trading';

type AccountPerf = ProjectPerformance['accounts'][number];

/* Level 2: one account. Back bar with the other accounts, the header with its
   status, cash tiles and money list for prop firms, and the engine panels. */
export default function AccountView({ projectId, data, account, onBack, onSwitch, onChanged }: {
  projectId: string; data: ProjectPerformance; account: AccountPerf;
  onBack: () => void; onSwitch: (id: string) => void; onChanged: () => Promise<void>;
}) {
  const others = sortAccounts(data.accounts.filter((a) => a.account.id !== account.account.id));
  const prop = account.meta.kind === 'prop_firm';
  const hasTrades = account.trades.total > 0 || account.rows > 0;
  return (
    <section className="flex flex-col gap-4" data-testid="account-view">
      <div className="flex items-center gap-2 min-w-0">
        <button type="button" onClick={onBack} className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold shrink-0 hover:bg-[var(--color-elevated)]"
          style={{ color: 'var(--color-text-secondary)', border: '1px solid var(--color-border)' }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M15 18l-6-6 6-6" /></svg>
          All accounts
        </button>
        {others.length > 0 && (
          <div className="flex items-center gap-1.5 overflow-x-auto min-w-0" style={{ scrollbarWidth: 'none' }} aria-label="Other accounts">
            {others.map((a) => (
              <button key={a.account.id} type="button" onClick={() => onSwitch(a.account.id)}
                className="px-2.5 py-1.5 rounded-lg text-xs font-semibold shrink-0 whitespace-nowrap hover:bg-[var(--color-elevated)]"
                style={{ color: 'var(--color-text-secondary)', border: '1px solid transparent', opacity: a.meta.status === 'failed' || a.meta.status === 'closed' ? 0.6 : 1 }}>
                {accountTitle(a)}
              </button>
            ))}
          </div>
        )}
      </div>

      <AccountHeader projectId={projectId} account={account.account} meta={account.meta} onChanged={onChanged} onRemoved={async () => { await onChanged(); onBack(); }} />

      {prop && account.cash && <CashTiles cash={account.cash} platformPnl={account.netResult} hasTrades={hasTrades} />}

      {hasTrades
        ? <TradingPerformance data={data} view={account.account.id} />
        : !prop && <p className="text-xs px-4 py-6 text-center rounded-xl" style={{ color: 'var(--color-text-muted)', border: '1px dashed var(--color-border)' }}>No activity on this account yet. Sync the bank, or press "Re-download full history" in Settings → Bank Accounts.</p>}

      {prop && account.cash && <CashRows projectId={projectId} cash={account.cash} onChanged={onChanged} />}
    </section>
  );
}
