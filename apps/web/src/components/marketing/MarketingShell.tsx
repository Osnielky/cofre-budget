import { Fraunces } from 'next/font/google';
import LandingNav from '@/components/landing/LandingNav';
import LandingFooter from '@/components/landing/LandingFooter';

// Same serif display face as the landing page, loaded only on marketing pages.
const display = Fraunces({ subsets: ['latin'], weight: ['300', '400'], variable: '--font-display', display: 'swap' });

interface Props {
  /** Small uppercase label above the title. */
  eyebrow: string;
  title: React.ReactNode;
  lead: string;
  /** Articles (compare pages) read best narrow; tools get more room. */
  width?: 'article' | 'tool';
  children: React.ReactNode;
}

/** Public growth pages (free tools, compare pages): landing nav + footer, one column. */
export default function MarketingShell({ eyebrow, title, lead, width = 'tool', children }: Props) {
  const max = width === 'article' ? 'max-w-3xl' : 'max-w-5xl';
  return (
    <div className={`${display.variable} min-h-dvh overflow-x-clip`}>
      <LandingNav />
      <main className={`${max} mx-auto px-4 sm:px-6 pt-12 sm:pt-16 pb-20`}>
        <p className="landing-eyebrow" style={{ color: 'var(--color-primary)' }}>{eyebrow}</p>
        <h1 className="landing-display mt-3 text-[34px] sm:text-[48px]" style={{ color: 'var(--color-text-primary)' }}>{title}</h1>
        <p className="mt-4 max-w-2xl text-base sm:text-lg leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>{lead}</p>
        <div className="mt-10 flex flex-col gap-10">{children}</div>
      </main>
      <LandingFooter />
    </div>
  );
}
