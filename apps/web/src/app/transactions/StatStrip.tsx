'use client';

/* Four summary cards for the transactions page: net cash flow, income,
   expenses, recurring — each with a delta vs the previous window and a
   lightweight two-point trend line (previous value -> current value,
   drawn from data already loaded; no extra fetch). Pure presentation. */

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
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={d} />
    </svg>
  );
}
const I_WAVE  = 'M2 12c2-5 4-5 6 0s4 5 6 0 4-5 6 0';
const I_UP    = 'M12 21V7 M6 13l6-6 6 6';
const I_DOWN  = 'M12 3v14 M6 11l6 6 6-6';
const I_SYNC  = 'M21 12a9 9 0 1 1-2.6-6.4 M21 3v5h-5';

const money = (n: number) => `${n < 0 ? '-' : ''}$${Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const isTransfer = (t: TxLite) => t.categoryRef?.type === 'transfer' || !!t.debtId;
const income   = (l: TxLite[]) => l.filter((t) => !isTransfer(t) && Number(t.amount) > 0).reduce((s, t) => s + Number(t.amount), 0);
const expenses = (l: TxLite[]) => l.filter((t) => !isTransfer(t) && Number(t.amount) < 0).reduce((s, t) => s + Math.abs(Number(t.amount)), 0);

/* A gentle 2-point-derived curve (prev -> current) with a shaded area
   underneath — honest about there being only two real data points, but
   reads as a trend line rather than a bare diagonal. */
function Sparkline({ prev, current, color }: { prev: number; current: number; color: string }) {
  const w = 72, h = 28, pad = 3;
  const lo = Math.min(prev, current, 0);
  const hi = Math.max(prev, current, 1);
  const span = hi - lo || 1;
  const y = (v: number) => h - pad - ((v - lo) / span) * (h - pad * 2);
  const x0 = pad, x1 = w / 2, x2 = w - pad;
  const y0 = y(prev), y1 = y((prev + current) / 2), y2 = y(current);
  const path = `M ${x0} ${y0} Q ${x1 * 0.6} ${y0} ${x1} ${y1} T ${x2} ${y2}`;
  const areaPath = `${path} L ${x2} ${h} L ${x0} ${h} Z`;
  const gradId = `spark-${color.replace(/[^a-zA-Z0-9]/g, '')}`;
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="shrink-0" aria-hidden="true">
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.35" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={areaPath} fill={`url(#${gradId})`} />
      <path d={path} fill="none" stroke={color} strokeWidth="1.75" strokeLinecap="round" />
      <circle cx={x2} cy={y2} r="2.25" fill={color} />
    </svg>
  );
}

export default function StatStrip({ transactions, prev, recurringNow, recurringPrev, prevLabel, loading }: Props) {
  const hasPrev = prev.length > 0;
  const pct = (cur: number, old: number) => (hasPrev && old !== 0 ? +(((cur - old) / Math.abs(old)) * 100).toFixed(1) : null);

  const inc = income(transactions), incP = income(prev);
  const exp = expenses(transactions), expP = expenses(prev);
  const net = inc - exp, netP = incP - expP;

  const cards: {
    label: string; value: string; color: string; icon: string;
    prevValue: number; curValue: number;
    delta: number | null; goodWhenUp: boolean;
  }[] = [
    { label: 'Net cash flow', value: money(net), color: 'var(--color-sky)', icon: I_WAVE,
      prevValue: netP, curValue: net, delta: pct(net, netP), goodWhenUp: true },
    { label: 'Income', value: money(inc), color: 'var(--color-green)', icon: I_UP,
      prevValue: incP, curValue: inc, delta: pct(inc, incP), goodWhenUp: true },
    { label: 'Expenses', value: money(exp), color: 'var(--color-orange)', icon: I_DOWN,
      prevValue: expP, curValue: exp, delta: pct(exp, expP), goodWhenUp: false },
    { label: 'Recurring', value: money(recurringNow), color: 'var(--color-violet)', icon: I_SYNC,
      prevValue: recurringPrev, curValue: recurringNow, delta: pct(recurringNow, recurringPrev), goodWhenUp: false },
  ];

  return (
    <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
      {cards.map((c) => {
        const up = (c.delta ?? 0) > 0;
        const deltaColor = c.delta == null || c.delta === 0
          ? 'var(--color-text-muted)'
          : (up === c.goodWhenUp ? 'var(--color-green)' : 'var(--color-rose)');
        return (
          <div key={c.label} className="flex items-center justify-between gap-3 rounded-2xl py-4 px-4 min-w-0"
            style={{ border: 'var(--glass-border)', background: `color-mix(in srgb, ${c.color} 5%, var(--color-surface))` }}>
            <div className="flex items-center gap-3 min-w-0">
              <span className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                style={{
                  color: c.color,
                  background: `color-mix(in srgb, ${c.color} 14%, transparent)`,
                  border: `1px solid color-mix(in srgb, ${c.color} 32%, transparent)`,
                }}>
                <MiniIcon d={c.icon} />
              </span>
              <div className="min-w-0">
                <p className="text-xs flex items-center gap-1" style={{ color: 'var(--color-text-secondary)' }}>
                  {c.label}
                </p>
                <p className="text-lg font-bold tabular-nums truncate">{loading ? '—' : c.value}</p>
                {!loading && c.delta != null && (
                  <p className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>
                    <span className="font-bold" style={{ color: deltaColor }}>
                      {c.delta === 0 ? '—' : `${up ? '↑' : '↓'} ${Math.abs(c.delta)}%`}
                    </span>{' '}
                    vs {prevLabel}
                  </p>
                )}
              </div>
            </div>
            {!loading && hasPrev && (
              <Sparkline prev={c.prevValue} current={c.curValue} color={c.color} />
            )}
          </div>
        );
      })}
    </div>
  );
}
