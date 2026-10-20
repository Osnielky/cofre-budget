import { container, tint } from './landing-styles';

interface FeatureBlockProps {
  id?: string;
  eyebrow: string;
  title: React.ReactNode;
  body: string;
  /** Bank sync and Ask Cofre are Pro/Elite only — say so wherever they're pitched. */
  proBadge?: boolean;
  /** Mockup on the left on desktop. */
  reverse?: boolean;
  /** The visual column; position children absolutely inside it to overlap cards. */
  children: React.ReactNode;
}

export default function FeatureBlock({ id, eyebrow, title, body, proBadge, reverse, children }: FeatureBlockProps) {
  return (
    <section id={id} className={`${container} py-14 sm:py-20 grid lg:grid-cols-2 gap-10 lg:gap-16 items-center scroll-mt-24`}>
      <div className={`max-w-lg ${reverse ? 'lg:order-2' : ''}`}>
        <div className="flex items-center gap-2">
          <span className="landing-eyebrow">{eyebrow}</span>
          {proBadge && (
            <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full" style={{ background: tint('var(--color-primary)', 16), color: 'var(--color-primary)' }}>Pro</span>
          )}
        </div>
        <h2 className="landing-display mt-3 text-[34px] sm:text-[44px]" style={{ color: 'var(--color-text-primary)' }}>{title}</h2>
        <p className="mt-4 text-base sm:text-lg leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>{body}</p>
      </div>
      <div className={`relative flex justify-center ${reverse ? 'lg:order-1 lg:justify-start' : 'lg:justify-end'}`}>{children}</div>
    </section>
  );
}
