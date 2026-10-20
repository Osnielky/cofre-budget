import Link from 'next/link';
import { HOME_HEADLINE } from '@/lib/seo';
import { TRIAL_DAYS } from '@/lib/plans';
import { container } from './landing-styles';
import DashboardMockup from './mockups/DashboardMockup';
import ChatMockup from './mockups/ChatMockup';

/** Full-bleed artwork, headline card bottom-left, product cards floating on the right. */
export default function LandingHero() {
  return (
    <section className="landing-art relative -mt-[68px] pt-[68px]">
      <div className={`${container} grid lg:grid-cols-12 gap-10 lg:gap-8 items-end pt-10 sm:pt-16 lg:pt-24 pb-14 lg:pb-24 lg:min-h-[760px]`}>
        <div className="lg:col-span-5 rounded-[28px] p-6 sm:p-9"
          style={{
            background: 'linear-gradient(165deg, rgba(14,24,48,0.72) 0%, rgba(7,13,28,0.62) 100%)',
            backdropFilter: 'blur(18px) saturate(140%)',
            WebkitBackdropFilter: 'blur(18px) saturate(140%)',
            border: '1px solid color-mix(in srgb, var(--color-primary) 30%, transparent)',
            boxShadow: '0 30px 80px rgba(0,0,0,0.5), 0 0 60px color-mix(in srgb, var(--color-primary) 14%, transparent)',
          }}>
          <h1 className="landing-display text-[40px] sm:text-[52px] lg:text-[58px]" style={{ color: 'var(--color-text-primary)' }}>
            {HOME_HEADLINE}
          </h1>
          <p className="mt-5 text-base sm:text-lg leading-relaxed max-w-md" style={{ color: 'var(--color-text-secondary)' }}>
            Cofre brings every account, budget and goal into one quiet view, and answers your money
            questions in plain English.
          </p>
          <div className="mt-7 flex flex-col sm:flex-row sm:items-center gap-3">
            <Link href="/signup" className="btn-gold px-7 py-3.5 rounded-full font-semibold text-center whitespace-nowrap">Start free</Link>
            <span className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
              Free forever. Pro comes with a {TRIAL_DAYS}-day trial.
            </span>
          </div>
        </div>

        <div className="lg:col-span-7 relative lg:pl-6 lg:pb-12">
          <DashboardMockup className="lg:ml-auto lg:max-w-lg" />
          {/* The chat card tucks over the dashboard's bottom-left corner on wide screens. */}
          <ChatMockup className="mt-4 lg:mt-0 lg:absolute lg:bottom-0 lg:-left-6 lg:max-w-xs" />
        </div>
      </div>
    </section>
  );
}
