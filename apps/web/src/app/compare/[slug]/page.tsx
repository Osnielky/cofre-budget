import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import MarketingShell from '@/components/marketing/MarketingShell';
import CompareTable from '@/components/marketing/CompareTable';
import DemoCta from '@/components/marketing/DemoCta';
import { Explainer } from '@/components/marketing/ResultCard';
import { COMPETITORS, competitorBySlug } from '@/lib/marketing/competitors';
import { SITE_URL } from '@/lib/seo';

export const dynamicParams = false;

export function generateStaticParams() {
  return COMPETITORS.map((c) => ({ slug: c.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const c = competitorBySlug((await params).slug);
  if (!c) return {};
  const title = `${c.headline}: price, free plan and features`;
  const description = `${c.name} vs Cofre in 2026: ${c.name} costs ${c.yearly} a year${c.freePlan ? '' : ' with no free plan'}; Cofre is free forever for manual tracking and $4.99 a month with bank sync and an AI assistant.`;
  return {
    title,
    description,
    alternates: { canonical: `${SITE_URL}/compare/${c.slug}` },
    openGraph: { title, description, url: `${SITE_URL}/compare/${c.slug}` },
  };
}

function Reasons({ title, items }: { title: string; items: string[] }) {
  return (
    <Explainer title={title}>
      <ul className="flex flex-col gap-2 list-disc pl-5">
        {items.map((r) => <li key={r}>{r}</li>)}
      </ul>
    </Explainer>
  );
}

export default async function ComparePage({ params }: { params: Promise<{ slug: string }> }) {
  const c = competitorBySlug((await params).slug);
  if (!c) notFound();
  const others = COMPETITORS.filter((o) => o.slug !== c.slug);
  return (
    <MarketingShell eyebrow="Compare" title={c.headline} lead={c.intro} width="article">
      <CompareTable competitors={[c]} />
      <Reasons title={`Why people switch from ${c.name} to Cofre`} items={c.switchReasons} />
      <Reasons title={`When ${c.name} is the better fit`} items={c.stayReasons} />
      <Explainer title="What Cofre is">
        <p>Cofre is a personal budget and net-worth tracker. The Free plan covers unlimited manual accounts, CSV import, transactions with categories, splits and notes, budgets, recurring payments, auto-categorization rules, projects, debts, savings goals and net worth. Pro adds automatic bank sync through Plaid (up to four institutions) and Ask Cofre, an assistant that answers questions from your real numbers and can only propose changes you confirm. Elite removes the institution limit and raises the assistant allowance.</p>
        <p>Banks connect through Plaid, so Cofre never sees your bank login. Access tokens are encrypted at rest, traffic is HTTPS, and your data is not sold or used for advertising. Pro and Elite start with a 15-day free trial you can cancel from Settings. Full details on the <Link href="/pricing" style={{ color: 'var(--color-primary)' }}>pricing page</Link>.</p>
      </Explainer>
      <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
        Also compare: {others.map((o, i) => (
          <span key={o.slug}>{i > 0 && ' · '}<Link href={`/compare/${o.slug}`} style={{ color: 'var(--color-primary)' }}>{o.name}</Link></span>
        ))} · <Link href="/mint-alternative" style={{ color: 'var(--color-primary)' }}>Mint alternatives</Link>
      </p>
      <DemoCta campaign={`compare-${c.slug}`} body={`No signup needed to look around: the demo has a full year of sample data, budgets, cards and the road to $1M. Then decide whether ${c.name} is worth the difference.`} />
    </MarketingShell>
  );
}
