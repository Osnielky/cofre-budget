import Link from 'next/link';
import { container } from './landing-styles';

/** Closing band on the artwork: one line, one button. */
export default function LandingCta() {
  return (
    <section className="landing-art-band">
      <div className={`${container} py-24 sm:py-32 text-center`}>
        <h2 className="landing-display mx-auto max-w-3xl text-[36px] sm:text-[52px]" style={{ color: '#F5F7FB', textShadow: '0 2px 24px rgba(0,0,0,0.45)' }}>
          Feel good about your money, with Cofre in your corner.
        </h2>
        <Link href="/signup" className="btn-gold inline-block mt-9 px-8 py-4 rounded-full font-semibold">
          Get started today
        </Link>
        <p className="mt-4 text-sm">
          <Link href="/demo" className="underline underline-offset-4" style={{ color: 'rgba(238,243,250,0.75)' }}>
            Or explore the demo with a year of sample data
          </Link>
        </p>
      </div>
    </section>
  );
}
