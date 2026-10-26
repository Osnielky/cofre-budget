import type { Metadata } from 'next';
import { SITE_URL } from '@/lib/seo';

export const metadata: Metadata = {
  title: 'Log in',
  description: 'Log in to Cofre to see your budgets, accounts, cards and your road to $1M.',
  alternates: { canonical: `${SITE_URL}/login` },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
