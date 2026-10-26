import Link from 'next/link';
import { Fraunces } from 'next/font/google';
import LandingNav from '@/components/landing/LandingNav';
import LandingFooter from '@/components/landing/LandingFooter';
import { breadcrumbJsonLd, serializeJsonLd, type Crumb } from '@/lib/seo';

// Same serif display face as the landing page, loaded only on marketing pages.
const display = Fraunces({ subsets: ['latin'], weight: ['300', '400'], variable: '--font-display', display: 'swap' });

interface Props {
  /** Small uppercase label above the title. */
  eyebrow: string;
  title: React.ReactNode;
  lead: string;
  /** Trail after Home; the last crumb is this page. Rendered as a nav and as BreadcrumbList JSON-LD. */
  crumbs: Crumb[];
  /** Articles (compare pages) read best narrow; tools get more room. */
  width?: 'article' | 'tool';
  children: React.ReactNode;
}

/** Public growth pages (free tools, compare pages): landing nav + footer, one column. */
export default function MarketingShell({ eyebrow, title, lead, crumbs, width = 'tool', children }: Props) {
  const max = width === 'article' ? 'max-w-3xl' : 'max-w-5xl';
  const trail: Crumb[] = [{ name: 'Home', path: '/' }, ...crumbs];
  return (
    <div className={`${display.variable} min-h-dvh overflow-x-clip`}>
      <LandingNav />
      <main className={`${max} mx-auto px-4 sm:px-6 pt-8 sm:pt-12 pb-20`}>
        <nav aria-label="Breadcrumb" className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
          <ol className="flex flex-wrap items-center gap-1.5">
            {trail.map((c, i) => (
              <li key={c.name} className="flex items-center gap-1.5">
                {i > 0 && <span aria-hidden="true">/</span>}
                {c.path && i < trail.length - 1
                  ? <Link href={c.path} className="hover:underline underline-offset-2">{c.name}</Link>
                  : <span aria-current={i === trail.length - 1 ? 'page' : undefined}>{c.name}</span>}
              </li>
            ))}
          </ol>
        </nav>
        <p className="landing-eyebrow mt-6" style={{ color: 'var(--color-primary)' }}>{eyebrow}</p>
        <h1 className="landing-display mt-3 text-[34px] sm:text-[48px]" style={{ color: 'var(--color-text-primary)' }}>{title}</h1>
        <p className="mt-4 max-w-2xl text-base sm:text-lg leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>{lead}</p>
        <div className="mt-10 flex flex-col gap-10">{children}</div>
      </main>
      <LandingFooter />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(breadcrumbJsonLd(crumbs)) }} />
    </div>
  );
}
