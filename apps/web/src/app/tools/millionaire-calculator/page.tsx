import type { Metadata } from 'next';
import Link from 'next/link';
import MarketingShell from '@/components/marketing/MarketingShell';
import MillionaireCalculator from '@/components/marketing/MillionaireCalculator';
import DemoCta from '@/components/marketing/DemoCta';
import { Explainer } from '@/components/marketing/ResultCard';
import { SITE_URL } from '@/lib/seo';

const TITLE = 'Millionaire calculator: when will you reach $1M?';
const DESCRIPTION = 'Enter your net worth, monthly savings and expected return to see the month you reach $1,000,000 and the date of every milestone on the way. Free, no signup.';

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: `${SITE_URL}/tools/millionaire-calculator` },
  openGraph: { title: TITLE, description: DESCRIPTION, url: `${SITE_URL}/tools/millionaire-calculator` },
};

export default function MillionaireCalculatorPage() {
  return (
    <MarketingShell eyebrow="Free tool" title="When will you be a millionaire?" lead="Three numbers in, a date out. The ladder below is the same one Cofre tracks for you on the Goals page.">
      <MillionaireCalculator />
      <Explainer title="How this is calculated">
        <p>Each month your net worth grows by one twelfth of the yearly return, then your contribution is added. That is monthly compounding, the same way an index fund with automatic deposits behaves. The result is before inflation and taxes, so treat it as the optimistic end of the range.</p>
        <p>The milestones are Cofre&rsquo;s levels: $5K, $10K, $25K, $50K, $100K, $250K, $500K and $1M. Early levels come fast; the later ones take longer because each roughly doubles the one before.</p>
        <p>Two levers move the date. The monthly contribution is the one you control this month. The return is mostly set by what you invest in, and the difference between 4% and 7% over twenty years is larger than most people expect. Try both fields.</p>
      </Explainer>
      <Explainer title="Where the net worth number comes from">
        <p>Add up what you own (cash, savings, investments, retirement accounts, the value of a home) and subtract what you owe (credit cards, loans, the mortgage). A negative number is normal early on and the calculator handles it. Cofre computes this from your linked accounts and keeps a history, so the pace on the Goals page is measured, not estimated. See also the <Link href="/tools/credit-card-payoff-calculator" style={{ color: 'var(--color-primary)' }}>credit card payoff calculator</Link> if cards are the part slowing you down.</p>
      </Explainer>
      <DemoCta campaign="millionaire-calculator" body="Cofre measures your real pace from your accounts, tells you whether you are ahead or behind, and shows the month each milestone lands. The demo has a year of sample data to explore." />
    </MarketingShell>
  );
}
