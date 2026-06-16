import { Inter, Outfit, Fraunces, Cormorant_Garamond, Jost } from 'next/font/google';
import './globals.css';
import ThemeProvider from '@/components/ThemeProvider';
import UserProvider from '@/components/UserProvider';

const inter    = Inter({ subsets: ['latin'], variable: '--font-sans' });
const outfit   = Outfit({ subsets: ['latin'], variable: '--font-outfit' });
const fraunces = Fraunces({ subsets: ['latin'], variable: '--font-fraunces', style: ['normal', 'italic'], axes: ['opsz'] });
const cormorant = Cormorant_Garamond({ subsets: ['latin'], variable: '--font-cormorant', weight: ['400', '500', '600'], style: ['normal', 'italic'] });
const jost      = Jost({ subsets: ['latin'], variable: '--font-jost' });

export const metadata = {
  title: 'Cofre — Budget',
  description: 'Personal budget tracker',
  // Favicon comes from app/icon.svg (the golden chest, matching the in-app logo).
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${outfit.variable} ${fraunces.variable} ${cormorant.variable} ${jost.variable}`} data-theme="tropic" suppressHydrationWarning>
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
