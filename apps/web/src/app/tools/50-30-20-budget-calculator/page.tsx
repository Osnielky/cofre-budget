import type { Metadata } from 'next';
import MarketingShell from '@/components/marketing/MarketingShell';
import RuleCalculator from '@/components/marketing/RuleCalculator';
import DemoCta from '@/components/marketing/DemoCta';
import { Explainer } from '@/components/marketing/ResultCard';
import { SITE_URL } from '@/lib/seo';

const TITLE = '50/30/20 budget calculator';
const DESCRIPTION = 'Split your monthly take-home pay into needs, wants and savings with the 50/30/20 rule, and see how far your current spending is from it. Free, no signup.';

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: `${SITE_URL}/tools/50-30-20-budget-calculator` },
  openGraph: { title: TITLE, description: DESCRIPTION, url: `${SITE_URL}/tools/50-30-20-budget-calculator` },
};

export default function RuleCalculatorPage() {
  return (
    <MarketingShell eyebrow="Free tool" crumbs={[{ name: 'Free tools', path: '/tools' }, { name: '50/30/20 budget calculator', path: '/tools/50-30-20-budget-calculator' }]} title="Your 50/30/20 budget" lead="Half for needs, thirty percent for wants, twenty for savings. Type your take-home pay and, if you know them, what you spend today.">
      <RuleCalculator />
      <Explainer title="What goes where">
        <p><strong style={{ color: 'var(--color-text-primary)' }}>Needs</strong> are the bills that arrive whether you like it or not: housing, groceries, utilities, insurance, minimum debt payments, getting to work. <strong style={{ color: 'var(--color-text-primary)' }}>Wants</strong> are everything you could cut in a bad month: restaurants, streaming, travel, the upgrade. <strong style={{ color: 'var(--color-text-primary)' }}>Savings</strong> is the emergency fund, retirement, investments and any debt payment above the minimum.</p>
        <p>The rule is a starting point, not a verdict. In expensive cities needs often run past 50%; the fix is usually to protect the savings 20% and let wants absorb the difference, because wants are the only column that moves this month.</p>
      </Explainer>
      <Explainer title="Doing this every month without the spreadsheet">
        <p>The hard part is not the arithmetic, it is knowing what you actually spent on wants last month. Cofre categorizes transactions as they arrive, totals each category, and the budgets page shows the needs, wants and savings split from real numbers. Ask Cofre can answer &ldquo;how much did I spend on dining out this month&rdquo; directly.</p>
      </Explainer>
      <DemoCta campaign="50-30-20-budget-calculator" body="Import a CSV or connect your bank and Cofre fills in the needs, wants and savings columns from your transactions every month. The demo has a full year to look at." />
    </MarketingShell>
  );
}
