import ProjectionMockup from './mockups/ProjectionMockup';
import { glassCard } from './landing-styles';

// Same gold-foil treatment the user approved on the login quote (AuthShell).
const goldText: React.CSSProperties = {
  background: 'linear-gradient(160deg, #BF953F 0%, #FCF6BA 25%, #D4A94C 50%, #FBF5B7 68%, #B38728 100%)',
  WebkitBackgroundClip: 'text',
  backgroundClip: 'text',
  color: 'transparent',
};

export default function WealthPathBand() {
  return (
    <section className="max-w-6xl mx-auto px-4 sm:px-6 py-12 sm:py-16">
      <div className="rounded-[var(--radius-card)] p-6 sm:p-10 grid lg:grid-cols-2 gap-10 items-center" style={glassCard}>
        <div>
          <p style={{ fontFamily: 'var(--font-script), cursive', fontSize: 'clamp(40px, 6vw, 64px)', lineHeight: 1.15, color: 'var(--color-text-primary)' }}>
            Every dollar, <span style={goldText}>on the way to a million.</span>
          </p>
          <p className="mt-4 text-base sm:text-lg max-w-xl" style={{ color: 'var(--color-text-secondary)' }}>
            Set a net-worth goal and Cofre shows whether you&rsquo;re ahead or behind pace — and what the money you
            stop wasting does to the date you get there.
          </p>
        </div>
        <div className="flex justify-center lg:justify-end"><ProjectionMockup /></div>
      </div>
    </section>
  );
}
