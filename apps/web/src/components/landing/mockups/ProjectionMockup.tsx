// A rising net-worth path: past (solid) then projection (dashed) to $1M, with
// the next milestone marked, like the Goals page ladder.
const PAST = 'M10 150 C 60 146, 100 138, 150 128';
const FUTURE = 'M150 128 C 220 110, 280 70, 330 18';

export default function ProjectionMockup({ className = '' }: { className?: string }) {
  return (
    <figure aria-label="Net worth projection rising toward one million dollars, with the next milestone at $100,000" className={`landing-mock w-full max-w-md p-4 sm:p-5 ${className}`}>
      <div aria-hidden="true">
        <div className="flex items-baseline justify-between text-xs mb-2">
          <span className="font-semibold" style={{ color: 'var(--color-text-secondary)' }}>Road to $1M</span>
          <span style={{ color: 'var(--color-card-green)' }}>On pace, target 2041</span>
        </div>
        <svg viewBox="0 0 340 160" className="w-full h-auto">
          <line x1="10" y1="18" x2="330" y2="18" stroke="var(--color-border)" strokeDasharray="4 6" />
          <text x="12" y="12" fontSize="11" fill="var(--color-card-amber)">$1,000,000</text>
          <line x1="10" y1="104" x2="330" y2="104" stroke="var(--color-border)" strokeDasharray="4 6" />
          <text x="12" y="98" fontSize="10" fill="var(--color-text-muted)">Level 4, $100,000</text>
          <path d={PAST} fill="none" stroke="var(--color-card-green)" strokeWidth="3" strokeLinecap="round" />
          <path d={FUTURE} fill="none" stroke="var(--color-card-green)" strokeWidth="3" strokeLinecap="round" strokeDasharray="6 7" opacity="0.75" />
          <circle cx="150" cy="128" r="5" fill="var(--color-card-green)" />
          <circle cx="330" cy="18" r="6" fill="var(--color-card-amber)" />
        </svg>
        <div className="mt-2 flex items-center justify-between text-xs">
          <span style={{ color: 'var(--color-text-muted)' }}>Now</span>
          <span className="font-semibold tabular-nums" style={{ color: 'var(--color-text-primary)' }}>$84,210</span>
        </div>
      </div>
    </figure>
  );
}
