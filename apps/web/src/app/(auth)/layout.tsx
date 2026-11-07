import { Great_Vibes } from 'next/font/google';

/* The gilded quote on the auth pages is the only place the script face is used,
   so it loads here rather than in the root layout. AuthShell reads --font-script. */
const script = Great_Vibes({ subsets: ['latin'], weight: '400', variable: '--font-script' });

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return <div className={`${script.variable} contents`}>{children}</div>;
}
