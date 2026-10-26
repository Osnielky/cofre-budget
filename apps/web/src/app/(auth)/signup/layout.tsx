import type { Metadata } from 'next';
import { SITE_URL } from '@/lib/seo';

export const metadata: Metadata = {
  title: 'Sign up',
  description: 'Create a free Cofre account: budgets, manual accounts, CSV import, recurring charges, debts and net worth, free forever. No card needed.',
  alternates: { canonical: `${SITE_URL}/signup` },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
