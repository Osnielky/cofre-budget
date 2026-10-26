import type { Metadata } from 'next';
import Link from 'next/link';
import MarketingShell from '@/components/marketing/MarketingShell';
import PayoffCalculator from '@/components/marketing/PayoffCalculator';
import DemoCta from '@/components/marketing/DemoCta';
import { Explainer } from '@/components/marketing/ResultCard';
import { SITE_URL } from '@/lib/seo';

const TITLE = 'Credit card payoff calculator: months, interest and utilization';
const DESCRIPTION = 'Enter a card balance, APR and monthly payment to see how long payoff takes, how much interest you pay, what $50 more a month saves, and your utilization rating. Free, no signup.';

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: `${SITE_URL}/tools/credit-card-payoff-calculator` },
  openGraph: { title: TITLE, description: DESCRIPTION, url: `${SITE_URL}/tools/credit-card-payoff-calculator` },
};

export default function PayoffCalculatorPage() {
  return (
    <MarketingShell eyebrow="Free tool" title="How long until this card is paid off?" lead="Balance, APR, payment. The months, the interest, and the one number lenders watch: utilization.">
      <PayoffCalculator />
      <Explainer title="How this is calculated">
        <p>Every month the card charges interest of balance × APR ÷ 12, then your payment lands. What is left after interest reduces the balance. If the payment is smaller than the interest, the balance grows and the calculator says so instead of inventing a date.</p>
        <p>Real statements use a daily rate on the average daily balance, so the exact figures differ by a few dollars. The order of magnitude is right, and that is what decides whether to pay $200 or $250.</p>
      </Explainer>
      <Explainer title="Why utilization matters">
        <p>Utilization is the balance divided by the limit, per card and across all cards. It is one of the biggest inputs to a credit score after payment history, and unlike history it resets every statement: pay the balance down and the score follows within a cycle or two. Under 30% is the common guidance; under 10% is where the best scores sit.</p>
        <p>Cofre shows utilization, APRs, due dates and payment tips for each card on the Cards page, from the card data your bank shares through Plaid or from what you type in. If the card is one piece of a bigger picture, the <Link href="/tools/millionaire-calculator" style={{ color: 'var(--color-primary)' }}>millionaire calculator</Link> shows what the freed-up payment does over time.</p>
      </Explainer>
      <DemoCta campaign="credit-card-payoff-calculator" body="Cofre tracks every card's balance, APR, due date and utilization, and tells you which card to pay first. The demo includes cards with real-looking statements." />
    </MarketingShell>
  );
}
