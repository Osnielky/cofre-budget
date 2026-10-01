import type { Metadata } from 'next';
import { HOME_TITLE, HOME_DESCRIPTION, SITE_URL } from '@/lib/seo';
import LandingNav from '@/components/landing/LandingNav';
import LandingHero from '@/components/landing/LandingHero';
import FeatureBlock from '@/components/landing/FeatureBlock';
import WealthPathBand from '@/components/landing/WealthPathBand';
import AccountsMockup from '@/components/landing/mockups/AccountsMockup';
import ChatMockup from '@/components/landing/mockups/ChatMockup';
import SpendingMockup from '@/components/landing/mockups/SpendingMockup';

export const metadata: Metadata = {
  title: { absolute: HOME_TITLE },
  description: HOME_DESCRIPTION,
  alternates: { canonical: SITE_URL },
};

// Signed-in visitors never get here — middleware sends them to /dashboard.
export default function HomePage() {
  return (
    <div className="min-h-dvh overflow-x-hidden">
      <LandingNav />
      <main>
        <LandingHero />
        <FeatureBlock
          eyebrow="Automatic bank sync"
          proBadge
          title="Every transaction, without lifting a finger"
          body="Connect your banks and cards through Plaid. New transactions arrive on their own and get categorized by your rules — no spreadsheets, no CSV exports."
        >
          <AccountsMockup />
        </FeatureBlock>
        <FeatureBlock
          eyebrow="Ask Cofre"
          proBadge
          reverse
          title="Ask about your money in plain English"
          body="“Where did my money go this month?” “Can I afford this trip?” Ask Cofre looks up your real numbers to answer, and can suggest a budget or a category — nothing changes until you confirm."
        >
          <ChatMockup />
        </FeatureBlock>
        <FeatureBlock
          eyebrow="Spot the waste"
          title="See the spending you don’t need"
          body="Budgets and category trends show where your money actually goes, so the delivery habit and the forgotten subscriptions stand out."
        >
          <SpendingMockup />
        </FeatureBlock>
        <WealthPathBand />
      </main>
    </div>
  );
}
