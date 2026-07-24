import Link from 'next/link';
import Logo from './Logo';

interface Props {
  title: string;
  updated: string;
  children: React.ReactNode;
}

/** Shared layout for public legal pages (/privacy, /terms) — no auth required. */
export default function LegalPageShell({ title, updated, children }: Props) {
  return (
    <div className="min-h-dvh flex flex-col">
      <header className="flex items-center justify-between px-6 sm:px-10 py-6 max-w-3xl w-full mx-auto">
        <Link href="/" className="flex items-center gap-2.5 no-underline" style={{ color: 'var(--color-text-primary)' }}>
          <span className="w-9 h-9 rounded-full flex items-center justify-center"
            style={{ border: 'var(--glass-border)', background: 'color-mix(in srgb, var(--color-primary) 12%, transparent)' }}>
            <Logo size={18} />
          </span>
          <span className="font-bold text-[15px]">Cofre</span>
        </Link>
        <Link href="/login" className="text-xs font-semibold no-underline" style={{ color: 'var(--color-primary)' }}>
          Sign in →
        </Link>
      </header>

      <main className="flex-1 px-6 sm:px-10 pb-20">
        <div className="max-w-3xl mx-auto rounded-2xl p-6 sm:p-10" style={{ background: 'var(--color-elevated)', border: 'var(--glass-border)', boxShadow: 'var(--glass-shadow)' }}>
          <h1 className="text-2xl sm:text-3xl font-bold" style={{ color: 'var(--color-text-primary)' }}>{title}</h1>
          <p className="mt-2 text-xs" style={{ color: 'var(--color-text-muted)' }}>Last updated {updated}</p>

          <div className="legal-copy mt-8 flex flex-col gap-5 text-sm leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>
            {children}
          </div>
        </div>
      </main>
    </div>
  );
}
