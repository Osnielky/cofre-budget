import { Inter } from 'next/font/google';
import './globals.css';

const inter = Inter({ subsets: ['latin'], variable: '--font-sans' });

export const metadata = {
  title: 'Cofre — Budget',
  description: 'Personal budget tracker',
  icons: { icon: '/logo-chest.png', apple: '/logo-chest.png' },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.variable} suppressHydrationWarning>
      <body className="text-text-primary antialiased" suppressHydrationWarning>
        {children}
      </body>
    </html>
  );
}
