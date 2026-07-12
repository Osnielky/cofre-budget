'use client';

/* Six summary tiles for the transactions page: net / expenses / income /
   count / uncategorized / recurring, each with a delta vs the previous
   window. Pure presentation — everything is computed from the two
   transaction lists plus the recurring totals passed in. */

interface Category { id: string; name: string; icon: string; color: string; type: string }
interface TxLite {
  amount: number; categoryId: string | null; projectId: string | null;
  debtId: string | null; categoryRef: Category | null;
}

interface Props {
  transactions: TxLite[];
  prev: TxLite[];
  recurringNow: number;   // $/mo of recurring merchants active in the current window
  recurringPrev: number;
  prevLabel: string;      // "May 2026" or "prior period"
  loading: boolean;
}

function MiniIcon({ d }: { d: string }) {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={d} />
    </svg>
  );
}
const I_WAVE  = 'M2 12c2-5 4-5 6 0s4 5 6 0 4-5 6 0';
const I_DOWN  = 'M12 3v14 M6 11l6 6 6-6';
const I_UP    = 'M12 21V7 M6 13l6-6 6 6';
const I_LIST  = 'M8 6h13 M8 12h13 M8 18h13 M3 6h.01 M3 12h.01 M3 18h.01';
const I_QUEST = 'M9 9a3 3 0 1 1 4.5 2.6c-.9.5-1.5 1-1.5 2.4 M12 18h.01';
const I_SYNC  = 'M21 12a9 9 0 1 1-2.6-6.4 M21 3v5h-5';

const money = (n: number) => `${n < 0 ? '-' : ''}$${Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const isTransfer = (t: TxLite) => t.categoryRef?.type === 'transfer' || !!t.debtId;
const income   = (l: TxLite[]) => l.filter((t) => !isTransfer(t) && Number(t.amount) > 0).reduce((s, t) => s + Number(t.amount), 0);
const expenses = (l: TxLite[]) => l.filter((t) => !isTransfer(t) && Number(t.amount) < 0).reduce((s, t) => s + Math.abs(Number(t.amount)), 0);
const uncat    = (l: TxLite[]) => l.filter((t) => !t.categoryId && !t.projectId && !isTransfer(t)).length;

export default function StatStrip({ transactions, prev, recurringNow, recurringPrev, prevLabel, loading }: Props) {
  const hasPrev = prev.length > 0;
  const pct = (cur: number, old: number) => (hasPrev && old !== 0 ? +(((cur - old) / Math.abs(old)) * 100).toFixed(1) : null);

  const inc = income(transactions), incP = income(prev);
  const exp = expenses(transactions), expP = expenses(prev);
  const net = inc - exp, netP = incP - expP;
  const unc = uncat(transactions), uncP = uncat(prev);

  const tiles: {
    label: string; value: string; color: string; icon: string;
    delta: number | null; deltaText?: string; goodWhenUp: boolean | null;
  }[] = [
    { label: 'Net cash flow', value: money(net), color: 'var(--color-sky)', icon: I_WAVE,
      delta: pct(net, netP), goodWhenUp: true },
    { label: 'Expenses', value: money(exp), color: 'var(--color-orange)', icon: I_DOWN,
      delta: pct(exp, expP), goodWhenUp: false },
    { label: 'Income', value: money(inc), color: 'var(--color-green)', icon: I_UP,
      delta: pct(inc, incP), goodWhenUp: true },
    { label: 'Total transactions', value: String(transactions.length), color: 'var(--color-violet)', icon: I_LIST,
      delta: hasPrev ? transactions.length - prev.length : null, deltaText: 'abs', goodWhenUp: null },
    { label: 'Uncategorized', value: String(unc), color: 'var(--color-amber)', icon: I_QUEST,
      delta: hasPrev ? unc - uncP : null, deltaText: 'abs', goodWhenUp: false },
    { label: 'Recurring', value: `${money(recurringNow)}`, color: 'var(--color-violet)', icon: I_SYNC,
      delta: pct(recurringNow, recurringPrev), goodWhenUp: false },
  ];

  return (
    <div className="grid gap-2.5" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))' }}>
      {tiles.map((t) => {
        const up = (t.delta ?? 0) > 0;
        const deltaColor = t.delta == null || t.delta === 0 || t.goodWhenUp == null
          ? 'var(--color-text-muted)'
          : (up === t.goodWhenUp ? 'var(--color-green)' : 'var(--color-rose)');
        return (
          <div key={t.label} className="flex items-center gap-3 rounded-xl py-2.5 px-3 min-w-0"
            style={{ border: 'var(--glass-border)', background: `color-mix(in srgb, ${t.color} 4%, transparent)` }}>
            <span className="w-9 h-9 rounded-full flex items-center justify-center shrink-0"
              style={{
                color: t.color,
                background: `color-mix(in srgb, ${t.color} 12%, transparent)`,
                border: `1px solid color-mix(in srgb, ${t.color} 40%, transparent)`,
                boxShadow: `0 0 10px color-mix(in srgb, ${t.color} 20%, transparent)`,
              }}>
              <MiniIcon d={t.icon} />
            </span>
            <div className="min-w-0">
              <p className="text-[10.5px] truncate" style={{ color: 'var(--color-text-secondary)' }}>{t.label}</p>
              <p className="text-[14px] font-bold tabular-nums truncate">{loading ? '—' : t.value}</p>
              {!loading && t.delta != null && t.delta !== 0 && (
                <p className="text-[9.5px] truncate" style={{ color: 'var(--color-text-muted)' }}>
                  <span className="font-bold" style={{ color: deltaColor }}>
                    {up ? '▲' : '▼'} {t.deltaText === 'abs' ? Math.abs(t.delta) : `${Math.abs(t.delta)}%`}
                  </span>{' '}
                  vs {prevLabel}
                </p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
