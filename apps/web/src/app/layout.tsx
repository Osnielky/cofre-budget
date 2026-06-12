import { Manrope, Sora, Outfit, Fraunces } from 'next/font/google';
import './globals.css';
import ThemeProvider from '@/components/ThemeProvider';
import UserProvider from '@/components/UserProvider';

const manrope  = Manrope({ subsets: ['latin'], variable: '--font-manrope' });
const sora     = Sora({ subsets: ['latin'], variable: '--font-sora' });
const outfit   = Outfit({ subsets: ['latin'], variable: '--font-outfit' });
const fraunces = Fraunces({ subsets: ['latin'], variable: '--font-fraunces', style: ['normal', 'italic'], axes: ['opsz'] });

export const metadata = {
  title: 'Cofre — Budget',
  description: 'Personal budget tracker',
  icons: { icon: '/logo-chest.png', apple: '/logo-chest.png' },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${manrope.variable} ${sora.variable} ${outfit.variable} ${fraunces.variable}`} data-theme="tropic" suppressHydrationWarning>
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
