import { container } from './landing-styles';

// The four things Cofre does; each keeps the colour its charts use in the app.
const PILLARS = [
  { eyebrow: 'Track', title: 'Know where you stand', body: 'Net worth, balances and cash flow, updated as your banks sync.', color: 'var(--color-card-sky)' },
  { eyebrow: 'Budget', title: 'A budget that bends, not breaks', body: 'Set amounts by category and watch the month pace itself.', color: 'var(--color-card-green)' },
  { eyebrow: 'Ask', title: 'Answers, not spreadsheets', body: 'Ask Cofre reads your real numbers and proposes changes you confirm.', color: 'var(--color-card-violet)' },
  { eyebrow: 'Grow', title: 'Your road to $1M', body: 'A net-worth goal with milestones, so every month moves you up a level.', color: 'var(--color-card-amber)' },
];

export default function LandingPillars() {
  return (
    <section id="features" aria-labelledby="pillars-heading" className="landing-lines scroll-mt-24">
      <div className={`${container} py-16 sm:py-24`}>
        <div className="max-w-2xl mx-auto text-center">
          <h2 id="pillars-heading" className="landing-display text-[36px] sm:text-[48px]" style={{ color: 'var(--color-text-primary)' }}>
            Everything you need, in one place
          </h2>
          <p className="mt-4 text-base sm:text-lg leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>
            Connect your accounts and Cofre does the sorting. From there you track, budget, ask and grow.
          </p>
        </div>
        <div className="mt-12 grid sm:grid-cols-2 lg:grid-cols-4 gap-6 lg:gap-8">
          {PILLARS.map((p) => (
            <div key={p.eyebrow} className="pt-5" style={{ borderTop: `2px solid ${p.color}` }}>
              <span className="landing-eyebrow" style={{ color: p.color }}>{p.eyebrow}</span>
              <h3 className="landing-display mt-2 text-[24px] sm:text-[26px]" style={{ color: 'var(--color-text-primary)' }}>{p.title}</h3>
              <p className="mt-2.5 text-sm sm:text-[15px] leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>{p.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
