import type { Metadata } from 'next';
import { Inter, Great_Vibes } from 'next/font/google';
import './globals.css';
import ThemeProvider from '@/components/ThemeProvider';
import UserProvider from '@/components/UserProvider';
import WebVitals from '@/components/WebVitals';
import { SITE_URL, SITE_NAME, HOME_TITLE, HOME_DESCRIPTION } from '@/lib/seo';

const inter = Inter({ subsets: ['latin'], variable: '--font-sans' });
const script = Great_Vibes({ subsets: ['latin'], weight: '400', variable: '--font-script' });

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: HOME_TITLE, template: `%s · ${SITE_NAME}` },
  description: HOME_DESCRIPTION,
  openGraph: { type: 'website', siteName: SITE_NAME, url: SITE_URL, title: HOME_TITLE, description: HOME_DESCRIPTION },
  twitter: { card: 'summary_large_image', title: HOME_TITLE, description: HOME_DESCRIPTION },
  // Favicon comes from app/icon.svg (the golden chest, matching the in-app logo).
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${script.variable}`} data-theme="cobalt" suppressHydrationWarning>
      <body className="text-text-primary antialiased" suppressHydrationWarning>
        <WebVitals />
        <ThemeProvider>
          <UserProvider>
            {children}
          </UserProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
