import Link from 'next/link';
import { glassCard, quietButton } from '@/components/landing/landing-styles';

interface Props {
  /** utm_campaign for the admin Traffic panel, e.g. "millionaire-calculator". */
  campaign: string;
  title?: string;
  body: string;
}

const utm = (campaign: string) => `?utm_source=tools&utm_medium=cta&utm_campaign=${encodeURIComponent(campaign)}`;

/** Closes every growth page: the real thing, with the demo as the no-signup path. */
export default function DemoCta({ campaign, title = 'See this with your real accounts', body }: Props) {
  return (
    <section className="rounded-3xl p-6 sm:p-10 text-center" style={glassCard}>
      <h2 className="landing-display text-[28px] sm:text-[36px]" style={{ color: 'var(--color-text-primary)' }}>{title}</h2>
      <p className="mt-3 mx-auto max-w-xl text-sm sm:text-base leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>{body}</p>
      <div className="mt-7 flex flex-col sm:flex-row items-center justify-center gap-3">
        <Link href={`/signup${utm(campaign)}`} className="btn-gold px-7 py-3.5 rounded-full font-semibold">Start free</Link>
        <Link href={`/demo${utm(campaign)}`} className="px-7 py-3.5 rounded-full font-semibold" style={quietButton}>Try the demo</Link>
      </div>
      <p className="mt-4 text-xs" style={{ color: 'var(--color-text-muted)' }}>Free plan is free forever. No card needed.</p>
    </section>
  );
}
