import Link from 'next/link';
import { HOME_HEADLINE } from '@/lib/seo';
import { TRIAL_DAYS } from '@/lib/plans';
import { container } from './landing-styles';
import DashboardMockup from './mockups/DashboardMockup';
import ChatMockup from './mockups/ChatMockup';

/* Hero backdrop. To swap the footage, replace these two files in apps/web/public:
   hero-loop.mp4 (landscape, muted, 10–15 s, under ~4 MB) and hero-poster.jpg
   (a frame of it, 1280×720). Nothing else needs to change. */
const HERO_VIDEO = '/hero-loop.mp4';
const HERO_POSTER = '/hero-poster.jpg';

/** Full-bleed looping video, headline card bottom-left, product cards floating on the right. */
export default function LandingHero() {
  // `isolate` keeps the -z-10 backdrop inside this section's stacking context;
  // without it the video paints behind the section background and vanishes.
  return (
    <section className="relative isolate -mt-[68px] pt-[68px] overflow-hidden" style={{ background: 'var(--color-base)' }}>
      {/* Backdrop: the loop on tablets and up, the poster frame on phones and for
          anyone who prefers reduced motion. Both sit under the same scrim. */}
      <div aria-hidden="true" className="absolute inset-0 -z-10">
        <video
          className="hidden sm:block motion-reduce:hidden absolute inset-0 w-full h-full object-cover"
          src={HERO_VIDEO}
          poster={HERO_POSTER}
          autoPlay
          muted
          loop
          playsInline
          preload="metadata"
          disablePictureInPicture
        />
        {/* eslint-disable-next-line @next/next/no-img-element -- plain background frame, no optimisation needed */}
        <img
          className="sm:hidden motion-reduce:block absolute inset-0 w-full h-full object-cover"
          src={HERO_POSTER}
          alt=""
        />
        <div className="landing-hero-scrim absolute inset-0" />
      </div>

      <div className={`${container} grid lg:grid-cols-12 gap-10 lg:gap-8 items-end pt-10 sm:pt-16 lg:pt-24 pb-14 lg:pb-24 lg:min-h-[760px]`}>
        <div className="lg:col-span-5 rounded-[28px] p-6 sm:p-9"
          style={{
            background: 'linear-gradient(165deg, rgba(14,24,48,0.76) 0%, rgba(7,13,28,0.68) 100%)',
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
