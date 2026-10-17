import { glassCard, tint } from '../landing-styles';

export default function ChatMockup({ className = '' }: { className?: string }) {
  return (
    <figure aria-label="Ask Cofre answering how much was spent on dining this month" className={`w-full max-w-md rounded-[var(--radius-card)] p-4 sm:p-5 ${className}`} style={glassCard}>
      <div aria-hidden="true" className="flex flex-col gap-3 text-sm">
        <div className="flex items-center gap-2 text-xs font-semibold" style={{ color: 'var(--color-text-secondary)' }}>
          <span className="w-2 h-2 rounded-full" style={{ background: 'var(--color-card-green)' }} />
          Ask Cofre
        </div>
        <p className="self-end max-w-[85%] px-3.5 py-2 rounded-2xl rounded-br-md" style={{ background: tint('var(--color-primary)', 22), color: 'var(--color-text-primary)' }}>
          How much did I spend on dining this month?
        </p>
        <div className="self-start max-w-[92%] px-3.5 py-2.5 rounded-2xl rounded-bl-md" style={{ background: 'var(--color-elevated)', color: 'var(--color-text-primary)' }}>
          <p>You&rsquo;ve spent <strong>$412.60</strong> on dining so far — <strong style={{ color: 'var(--color-card-orange)' }}>38% more</strong> than last month. Most of it is weekday lunch delivery.</p>
          <div className="mt-2.5 flex items-center justify-between gap-3 px-3 py-2 rounded-xl text-xs" style={{ border: '1px solid var(--color-border)' }}>
            <span style={{ color: 'var(--color-text-secondary)' }}>Proposed: set a $300 dining budget</span>
            <span className="shrink-0 px-2.5 py-1 rounded-full font-semibold btn-gold">Confirm</span>
          </div>
        </div>
      </div>
    </figure>
  );
}
