import { IBM_Plex_Sans } from 'next/font/google';
import './globals.css';
import ThemeProvider from '@/components/ThemeProvider';
import UserProvider from '@/components/UserProvider';

const ibmPlexSans = IBM_Plex_Sans({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700'],
  variable: '--font-sans',
});

export const metadata = {
  title: 'Cofre — Budget',
  description: 'Personal budget tracker',
  icons: { icon: '/logo-chest.png', apple: '/logo-chest.png' },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={ibmPlexSans.variable} data-theme="tropic" suppressHydrationWarning>
      <body className="text-text-primary antialiased" suppressHydrationWarning>
        <ThemeProvider>
          <UserProvider>
            {children}
          </UserProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
