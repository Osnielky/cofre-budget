import { Inter } from 'next/font/google';
import './globals.css';

const inter = Inter({ subsets: ['latin'], variable: '--font-sans' });

export const metadata = {
  title: 'Cofre — Budget',
  description: 'Personal budget tracker',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.variable}>
      <body className="bg-[var(--color-base)] text-[var(--color-text-primary)] antialiased">
        {children}
      </body>
    </html>
  );
}
