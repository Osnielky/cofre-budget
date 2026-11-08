'use client';

/* What a dashboard panel shows while its data is on the way: a ghost in the
   shape of the content that will replace it, so the page keeps its layout and
   the eye already knows what is coming. No text — "Loading…" strings were the
   thing that made the dashboard read as slow. Styles live in globals.css
   (.skel / .skel-ink, one breathing animation, off under reduced motion). */
export type SkeletonKind = 'chart' | 'line' | 'donut' | 'list' | 'tiles';

const BARS = [38, 62, 45, 80, 55, 70, 48, 66, 58, 74, 42, 60];
const ROWS = [68, 52, 74, 44, 60];

export default function PanelSkeleton({ kind = 'chart' }: { kind?: SkeletonKind }) {
  return (
    <div className="flex-1 min-h-32 flex flex-col justify-end gap-3" aria-hidden="true" data-skeleton={kind}>
      {kind === 'chart' && (
        <div className="flex items-end gap-1.5 h-36 px-1 border-b" style={{ borderColor: 'var(--color-border)' }}>
          {BARS.map((h, i) => (
            <span key={i} className="skel flex-1 rounded-t-sm" style={{ height: `${h}%`, animationDelay: `${i * 50}ms` }} />
          ))}
        </div>
      )}

      {kind === 'line' && (
        <svg viewBox="0 0 400 130" className="skel-ink h-36 w-full" preserveAspectRatio="none">
          <path d="M0 104 C 40 96, 60 64, 100 74 S 160 34, 200 48 S 260 84, 300 58 S 360 22, 400 32 V130 H0 Z" fill="currentColor" opacity="0.35" />
          <path d="M0 104 C 40 96, 60 64, 100 74 S 160 34, 200 48 S 260 84, 300 58 S 360 22, 400 32" fill="none" stroke="currentColor" strokeWidth="3" />
          <line x1="0" y1="129" x2="400" y2="129" stroke="currentColor" strokeWidth="1" />
        </svg>
      )}

      {kind === 'donut' && (
        <div className="flex items-center gap-6 sm:gap-8 h-36 px-1">
          <span className="skel-ink shrink-0 w-28 h-28 rounded-full" style={{ border: '14px solid currentColor' }} />
          <div className="flex-1 flex flex-col gap-2.5 min-w-0">
            {ROWS.slice(0, 4).map((w, i) => (
              <span key={i} className="flex items-center gap-2">
                <span className="skel w-2.5 h-2.5 rounded-full shrink-0" />
                <span className="skel h-3 rounded" style={{ width: `${w}%`, animationDelay: `${i * 80}ms` }} />
              </span>
            ))}
          </div>
        </div>
      )}

      {kind === 'list' && (
        <div className="flex flex-col gap-3 py-1">
          {ROWS.map((w, i) => (
            <span key={i} className="flex items-center gap-3">
              <span className="skel w-8 h-8 rounded-xl shrink-0" style={{ animationDelay: `${i * 80}ms` }} />
              <span className="flex-1 flex flex-col gap-1.5 min-w-0">
                <span className="skel h-3 rounded" style={{ width: `${w}%` }} />
                <span className="skel h-2.5 rounded" style={{ width: `${Math.max(24, w - 30)}%` }} />
              </span>
              <span className="skel h-3.5 w-14 rounded shrink-0" />
            </span>
          ))}
        </div>
      )}

      {kind === 'tiles' && (
        <div className="grid grid-cols-3 gap-3 py-1">
          {[0, 1, 2].map((i) => (
            <span key={i} className="flex flex-col gap-2 p-3 rounded-xl" style={{ background: 'var(--color-elevated)' }}>
              <span className="skel h-2.5 w-3/5 rounded" />
              <span className="skel h-5 w-4/5 rounded-md" style={{ animationDelay: `${i * 80}ms` }} />
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
