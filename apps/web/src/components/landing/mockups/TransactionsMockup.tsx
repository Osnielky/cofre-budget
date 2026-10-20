import { tint } from '../landing-styles';

const ROWS = [
  { merchant: 'Whole Foods', category: 'Groceries', color: 'var(--color-card-green)', amount: '−$118.40', reviewed: true },
  { merchant: 'ACME Corp payroll', category: 'Salary', color: 'var(--color-card-sky)', amount: '+$2,600.00', reviewed: true },
  { merchant: 'Shell', category: 'Transport', color: 'var(--color-card-sky)', amount: '−$48.20', reviewed: false },
  { merchant: 'Sushi Nakazawa', category: 'Dining', color: 'var(--color-card-orange)', amount: '−$78.00', reviewed: false },
];

export default function TransactionsMockup({ className = '' }: { className?: string }) {
  return (
    <figure aria-label="A transaction list with categories applied and two rows still to review" className={`landing-mock w-full max-w-md p-4 sm:p-5 ${className}`}>
      <div aria-hidden="true" className="flex flex-col gap-3 text-sm">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold" style={{ color: 'var(--color-text-secondary)' }}>Transactions</span>
          <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full" style={{ background: tint('var(--color-card-amber)', 16), color: 'var(--color-card-amber)' }}>2 to review</span>
        </div>
        <div className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs" style={{ background: 'var(--color-elevated)', color: 'var(--color-text-muted)', border: '1px solid var(--color-border)' }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
          Search merchants or notes
        </div>
        <ul className="flex flex-col gap-1.5">
          {ROWS.map((r) => (
            <li key={r.merchant} className="flex items-center gap-3 px-3 py-2.5 rounded-xl" style={{ background: 'var(--color-elevated)' }}>
              <span className="w-5 h-5 rounded-full flex items-center justify-center shrink-0"
                style={r.reviewed
                  ? { background: tint('var(--color-card-green)', 20), color: 'var(--color-card-green)' }
                  : { border: '1.5px solid var(--color-border)' }}>
                {r.reviewed && <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12l5 5L20 7" /></svg>}
              </span>
              <span className="flex-1 min-w-0 truncate" style={{ color: 'var(--color-text-primary)' }}>{r.merchant}</span>
              <span className="hidden sm:inline text-[11px] font-semibold px-2 py-0.5 rounded-full shrink-0" style={{ background: tint(r.color, 16), color: r.color }}>{r.category}</span>
              <span className="shrink-0 font-semibold tabular-nums" style={{ color: r.amount.startsWith('+') ? 'var(--color-card-green)' : 'var(--color-text-primary)' }}>{r.amount}</span>
            </li>
          ))}
        </ul>
      </div>
    </figure>
  );
}
