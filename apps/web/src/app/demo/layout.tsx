import type { Metadata } from 'next';

/** The demo entry creates a sandbox and redirects, so it is not a page to index;
    it stays crawlable (no robots disallow) so the noindex is actually seen. */
export const metadata: Metadata = {
  title: 'Try the demo',
  robots: { index: false, follow: true },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
