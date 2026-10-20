import { tint } from '../landing-styles';

/** A credit card tile like the Cards page: generic card art, balance, utilization, APR, due date. */
export default function CardMockup({ className = '' }: { className?: string }) {
  const util = 14;
  return (
    <figure aria-label="A credit card with a $684 balance, 14% utilization rated excellent, 24.99% APR and a payment due November 3" className={`landing-mock w-full max-w-sm p-4 sm:p-5 ${className}`}>
      <div aria-hidden="true" className="text-sm">
        <div className="rounded-2xl p-4 h-28 flex flex-col justify-between"
          style={{ background: 'linear-gradient(135deg, #1C3F6E 0%, #2471A3 100%)', boxShadow: '0 10px 24px rgba(3,8,20,0.45)' }}>
          <div className="flex items-start justify-between">
            <span className="text-[10px] font-bold tracking-widest text-white/80">REWARDS CARD</span>
            <span className="w-7 h-5 rounded-md" style={{ background: 'linear-gradient(135deg, #F5C842, #D4A94C)' }} />
          </div>
          <span className="text-sm font-semibold text-white tracking-[0.18em]">•••• 1174</span>
        </div>

        <div className="mt-4 flex items-end justify-between">
          <div>
            <p className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>Current balance</p>
            <p className="text-2xl font-bold tabular-nums" style={{ color: 'var(--color-text-primary)' }}>$684.32</p>
          </div>
          <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>of $5,000 limit</p>
        </div>

        <div className="mt-3">
          <div className="flex items-center justify-between text-xs mb-1.5">
            <span style={{ color: 'var(--color-text-secondary)' }}>Utilization</span>
            <span className="font-semibold px-2 py-0.5 rounded-full" style={{ background: tint('var(--color-card-green)', 16), color: 'var(--color-card-green)' }}>{util}%, excellent</span>
          </div>
          <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--color-elevated)' }}>
            <div className="h-full rounded-full" style={{ width: `${util}%`, background: 'var(--color-card-green)' }} />
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3 text-xs">
          <div className="rounded-xl px-3 py-2" style={{ background: 'var(--color-elevated)' }}>
            <p style={{ color: 'var(--color-text-muted)' }}>Purchase APR</p>
            <p className="font-semibold tabular-nums" style={{ color: 'var(--color-text-primary)' }}>24.99%</p>
          </div>
          <div className="rounded-xl px-3 py-2" style={{ background: 'var(--color-elevated)' }}>
            <p style={{ color: 'var(--color-text-muted)' }}>Next payment</p>
            <p className="font-semibold" style={{ color: 'var(--color-text-primary)' }}>Nov 3, $35 min</p>
          </div>
        </div>
      </div>
    </figure>
  );
}
