import type { Metadata } from 'next';
import { Fraunces } from 'next/font/google';
import { HOME_TITLE, HOME_DESCRIPTION, SITE_NAME, SITE_URL, softwareAppJsonLd, organizationJsonLd, serializeJsonLd } from '@/lib/seo';
import LandingNav from '@/components/landing/LandingNav';
import LandingHero from '@/components/landing/LandingHero';
import LandingPillars from '@/components/landing/LandingPillars';
import FeatureBlock from '@/components/landing/FeatureBlock';
import TrustSection from '@/components/landing/TrustSection';
import LandingPricing from '@/components/landing/LandingPricing';
import LandingFaq from '@/components/landing/LandingFaq';
import LandingCta from '@/components/landing/LandingCta';
import LandingFooter from '@/components/landing/LandingFooter';
import AccountsMockup from '@/components/landing/mockups/AccountsMockup';
import NetWorthChip from '@/components/landing/mockups/NetWorthChip';
import TransactionsMockup from '@/components/landing/mockups/TransactionsMockup';
import ChatMockup from '@/components/landing/mockups/ChatMockup';
import RecurringMockup from '@/components/landing/mockups/RecurringMockup';
import SpendingMockup from '@/components/landing/mockups/SpendingMockup';
import ProjectionMockup from '@/components/landing/mockups/ProjectionMockup';
import CardMockup from '@/components/landing/mockups/CardMockup';

// Serif display face for landing headlines only; the app keeps Inter.
const display = Fraunces({ subsets: ['latin'], weight: ['300', '400'], variable: '--font-display', display: 'swap' });

export const metadata: Metadata = {
  title: { absolute: HOME_TITLE },
  description: HOME_DESCRIPTION,
  alternates: { canonical: SITE_URL },
  // Next replaces (not merges) nested metadata objects, so repeat the root's generic fields.
  openGraph: { type: 'website', siteName: SITE_NAME, url: SITE_URL, title: HOME_TITLE, description: HOME_DESCRIPTION },
  twitter: { card: 'summary_large_image', title: HOME_TITLE, description: HOME_DESCRIPTION },
};

// Same gold-foil treatment as the login quote (AuthShell).
const goldText: React.CSSProperties = {
  background: 'linear-gradient(160deg, #BF953F 0%, #FCF6BA 25%, #D4A94C 50%, #FBF5B7 68%, #B38728 100%)',
  WebkitBackgroundClip: 'text',
  backgroundClip: 'text',
  color: 'transparent',
};

// Signed-in visitors never get here — middleware sends them to /dashboard.
export default function HomePage() {
  return (
    <div className={`${display.variable} min-h-dvh overflow-x-clip`}>
      <LandingNav />
      <main>
        <LandingHero />
        <LandingPillars />

        <FeatureBlock
          eyebrow="Accounts"
          title="All your accounts, in one place"
          body="Connect banks, cards, savings and investments through Plaid. Balances refresh on their own, and the accounts you track by hand sit right beside them."
        >
          <AccountsMockup />
          <NetWorthChip className="absolute -top-7 -right-1 sm:right-8 lg:-right-5" />
        </FeatureBlock>

        <FeatureBlock
          eyebrow="Transactions"
          reverse
          title="Every transaction, in one list"
          body="Search, filter and group by bank, income or recurring. Your rules categorize new transactions as they arrive; splits and notes handle the rest."
        >
          <TransactionsMockup />
        </FeatureBlock>

        <FeatureBlock
          eyebrow="Ask Cofre"
          proBadge
          title="Ask about your money in plain English"
          body="“Where did my money go this month?” “Can I afford this trip?” Ask Cofre looks up your real numbers to answer, and can suggest a budget or a category. Nothing changes until you confirm."
        >
          <ChatMockup />
        </FeatureBlock>

        <FeatureBlock
          eyebrow="Recurring"
          reverse
          title="Catch the subscriptions you forgot"
          body="Cofre spots repeating charges like rent, streaming and gym fees, and totals what is still due this month so nothing slips by."
        >
          <RecurringMockup />
        </FeatureBlock>

        <FeatureBlock
          eyebrow="Budgets"
          title="See the spending you don’t need"
          body="Budgets and category trends show where your money actually goes, so the delivery habit and the forgotten subscriptions stand out."
        >
          <SpendingMockup />
        </FeatureBlock>

        <FeatureBlock
          eyebrow="Goals"
          reverse
          title={<>Every dollar, <span style={goldText}>on the way to a million.</span></>}
          body="Set a net-worth goal and Cofre shows whether you are ahead or behind pace, which milestone comes next, and when you will get there at your current rate."
        >
          <ProjectionMockup />
        </FeatureBlock>

        <FeatureBlock
          eyebrow="Cards"
          title="Know your cards, not just the balance"
          body="APRs, limits, due dates and utilization for every card, plus payment tips built from your real numbers."
        >
          <CardMockup />
        </FeatureBlock>

        <TrustSection />
        <LandingPricing />
        <LandingFaq />
        <LandingCta />
      </main>
      <LandingFooter />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(softwareAppJsonLd()) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(organizationJsonLd()) }} />
    </div>
  );
}
