import Link from 'next/link';
import Logo from '@/components/Logo';

const glass: React.CSSProperties = {
  background: 'var(--color-surface)',
  backdropFilter: 'var(--glass-blur)',
  WebkitBackdropFilter: 'var(--glass-blur)',
  border: 'var(--glass-border)',
  boxShadow: 'var(--glass-shadow)',
};

export default function NotFound() {
  return (
    <div className="min-h-dvh flex items-center justify-center px-4">
      <div className="card-lift flex flex-col items-center gap-4 text-center max-w-md w-full p-8 rounded-2xl" style={glass}>
        <Logo size={40} className="text-(--color-primary)" />
        <h1 className="text-xl font-bold" style={{ color: 'var(--color-text-primary)' }}>Page not found</h1>
        <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
          The page you&rsquo;re looking for doesn&rsquo;t exist or may have moved.
        </p>
        <Link href="/dashboard" className="btn-gold py-2.5 px-5 text-sm font-semibold" style={{ borderRadius: 14 }}>
          Go to dashboard
        </Link>
      </div>
    </div>
  );
}
