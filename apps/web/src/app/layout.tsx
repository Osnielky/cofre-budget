import { Inter, Great_Vibes } from 'next/font/google';
import './globals.css';
import ThemeProvider from '@/components/ThemeProvider';
import UserProvider from '@/components/UserProvider';

const inter = Inter({ subsets: ['latin'], variable: '--font-sans' });
const script = Great_Vibes({ subsets: ['latin'], weight: '400', variable: '--font-script' });

export const metadata = {
  title: 'Cofre — Budget',
  description: 'Personal budget tracker',
  // Favicon comes from app/icon.svg (the golden chest, matching the in-app logo).
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${script.variable}`} data-theme="cobalt" suppressHydrationWarning>
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
