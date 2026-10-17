import { tint } from './landing-styles';

interface FeatureBlockProps {
  eyebrow: string;
  title: string;
  body: string;
  /** Bank sync and Ask Cofre are Pro/Elite only — say so wherever they're pitched. */
  proBadge?: boolean;
  /** Mockup on the left on desktop. */
  reverse?: boolean;
  children: React.ReactNode;
}

export default function FeatureBlock({ eyebrow, title, body, proBadge, reverse, children }: FeatureBlockProps) {
  return (
    <section className="max-w-6xl mx-auto px-4 sm:px-6 py-12 sm:py-16 grid lg:grid-cols-2 gap-10 items-center">
      <div className={reverse ? 'lg:order-2' : undefined}>
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em]" style={{ color: 'var(--color-text-muted)' }}>
          {eyebrow}
          {proBadge && (
            <span className="normal-case tracking-normal px-2 py-0.5 rounded-full" style={{ background: tint('var(--color-primary)', 16), color: 'var(--color-primary)' }}>Pro</span>
          )}
        </div>
        <h2 className="mt-3 text-3xl sm:text-4xl font-bold tracking-tight" style={{ color: 'var(--color-text-primary)' }}>{title}</h2>
        <p className="mt-4 text-base sm:text-lg max-w-xl" style={{ color: 'var(--color-text-secondary)' }}>{body}</p>
      </div>
      <div className={`flex justify-center ${reverse ? 'lg:order-1 lg:justify-start' : 'lg:justify-end'}`}>{children}</div>
    </section>
  );
}
