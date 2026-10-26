import type { Metadata } from 'next';
import Link from 'next/link';
import MarketingShell from '@/components/marketing/MarketingShell';
import CompareTable from '@/components/marketing/CompareTable';
import DemoCta from '@/components/marketing/DemoCta';
import { Explainer } from '@/components/marketing/ResultCard';
import { COMPETITORS } from '@/lib/marketing/competitors';
import { SITE_URL } from '@/lib/seo';

const TITLE = 'Mint alternatives in 2026: the free one and the paid ones, compared';
const DESCRIPTION = 'Mint is gone. Monarch, YNAB and Copilot charge $95 to $109 a year with no free plan. Cofre is free forever for manual tracking and $4.99 a month with bank sync and an AI assistant. Prices compared, with dates.';

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: `${SITE_URL}/mint-alternative` },
  openGraph: { title: TITLE, description: DESCRIPTION, url: `${SITE_URL}/mint-alternative` },
};

export default function MintAlternativePage() {
  return (
    <MarketingShell eyebrow="Compare" crumbs={[{ name: 'Mint alternatives', path: '/mint-alternative' }]} title="Looking for a Mint alternative?" lead="Mint closed in 2024 and the apps that replaced it mostly charge around $100 a year. Here is what each one costs today, and the free option." width="article">
      <CompareTable competitors={COMPETITORS} />
      <Explainer title="What Mint users usually miss">
        <ul className="flex flex-col gap-2 list-disc pl-5">
          <li><strong style={{ color: 'var(--color-text-primary)' }}>Free.</strong> Mint was free because it was ad-supported. Cofre&rsquo;s Free plan is free forever and shows no ads; bank sync and the assistant are what Pro pays for.</li>
          <li><strong style={{ color: 'var(--color-text-primary)' }}>All accounts in one place.</strong> Cofre connects banks, cards, savings and investments through Plaid on Pro, and lets you track anything by hand on Free.</li>
          <li><strong style={{ color: 'var(--color-text-primary)' }}>Automatic categories.</strong> Your rules categorize new transactions as they arrive; splits and notes cover the rest.</li>
          <li><strong style={{ color: 'var(--color-text-primary)' }}>Bills and subscriptions.</strong> Cofre spots repeating charges and totals what is still due this month.</li>
          <li><strong style={{ color: 'var(--color-text-primary)' }}>Net worth.</strong> Tracked over time with milestones on the road to $1M, and a projected date at your pace.</li>
        </ul>
      </Explainer>
      <Explainer title="Bringing your Mint history with you">
        <p>If you exported your Mint transactions as a CSV before it closed, Cofre imports them on the Free plan: Settings, Import, pick the files (several at once is fine), map the date, description and amount columns once, and duplicates are skipped. The same import works for any bank&rsquo;s CSV export, which is how Free users keep accounts current without Plaid.</p>
      </Explainer>
      <Explainer title="Head-to-head pages">
        <p>
          {COMPETITORS.map((c, i) => (
            <span key={c.slug}>{i > 0 && ' · '}<Link href={`/compare/${c.slug}`} style={{ color: 'var(--color-primary)' }}>Cofre vs {c.name}</Link></span>
          ))}
        </p>
      </Explainer>
      <DemoCta campaign="mint-alternative" body="Look around first: the demo has a full year of sample data, budgets, cards and the road to $1M, with nothing to sign up for." />
    </MarketingShell>
  );
}
