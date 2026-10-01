import { glassCard } from '../landing-styles';

// A rising net-worth path: past (solid) then projection (dashed) to $1M.
const PAST = 'M10 150 C 60 146, 100 138, 150 128';
const FUTURE = 'M150 128 C 220 110, 280 70, 330 18';

export default function ProjectionMockup({ className = '' }: { className?: string }) {
  return (
    <figure aria-label="Net worth projection rising toward one million dollars" className={`w-full max-w-md rounded-[var(--radius-card)] p-4 sm:p-5 ${className}`} style={glassCard}>
      <div aria-hidden="true">
        <div className="flex items-baseline justify-between text-xs mb-2">
          <span className="font-semibold" style={{ color: 'var(--color-text-secondary)' }}>Net worth</span>
          <span style={{ color: 'var(--color-card-green)' }}>On pace for $1M</span>
        </div>
        <svg viewBox="0 0 340 160" className="w-full h-auto">
          <line x1="10" y1="18" x2="330" y2="18" stroke="var(--color-border)" strokeDasharray="4 6" />
          <text x="12" y="12" fontSize="11" fill="var(--color-card-amber)">$1,000,000</text>
          <path d={PAST} fill="none" stroke="var(--color-card-green)" strokeWidth="3" strokeLinecap="round" />
          <path d={FUTURE} fill="none" stroke="var(--color-card-green)" strokeWidth="3" strokeLinecap="round" strokeDasharray="6 7" opacity="0.75" />
          <circle cx="150" cy="128" r="5" fill="var(--color-card-green)" />
          <circle cx="330" cy="18" r="6" fill="var(--color-card-amber)" />
        </svg>
      </div>
    </figure>
  );
}
