import type { Metadata } from 'next';
import { SITE_URL } from '@/lib/seo';
import { PLAN_PRICES, TRIAL_DAYS } from '@/lib/plans';

const description = `Cofre pricing: Free forever for manual accounts, CSV import, budgets and net worth. Pro adds bank sync and Ask Cofre for $${PLAN_PRICES.pro.month}/mo; Elite for $${PLAN_PRICES.elite.month}/mo. ${TRIAL_DAYS}-day free trial.`;

export const metadata: Metadata = {
  title: 'Pricing',
  description,
  alternates: { canonical: `${SITE_URL}/pricing` },
  openGraph: { title: 'Cofre pricing', description, url: `${SITE_URL}/pricing` },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
