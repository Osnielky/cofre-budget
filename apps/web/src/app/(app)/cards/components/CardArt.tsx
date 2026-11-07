/* A generic card graphic in the given accent (the real card's color when known, see
   lib/cards/card-colors.ts). Deliberately no issuer logos or card art —
   those are other companies' trademarks. Like a physical card it is always dark (the
   accent is mixed with a fixed ink, not the theme base), so its white text stays legible
   under any theme. `size="lg"` is the deck card on /cards: chip, contactless mark, the
   masked number and the bank, laid out like the plastic. */
const INK = '#0a0f1f';

function Contactless() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
      <path d="M6 8.5a6 6 0 0 1 0 7" /><path d="M9.5 6.5a9.5 9.5 0 0 1 0 11" /><path d="M13 4.5a13 13 0 0 1 0 15" />
    </svg>
  );
}

export default function CardArt({ bank, label, last4, accent, kind, size = 'sm' }: {
  bank: string;
  label: string;
  last4: string | null;
  accent: string;
  kind: 'credit' | 'debit';
  size?: 'sm' | 'lg';
}) {
  const face = {
    background: `linear-gradient(135deg, color-mix(in srgb, ${accent} 70%, ${INK}) 0%, color-mix(in srgb, ${accent} 25%, ${INK}) 100%)`,
    border: `1px solid color-mix(in srgb, ${accent} 50%, transparent)`,
  };

  if (size === 'lg') {
    return (
      <div aria-hidden="true"
        className="relative w-full aspect-[1.586] rounded-2xl p-5 sm:p-6 flex flex-col justify-between overflow-hidden select-none"
        style={{ ...face, boxShadow: `0 24px 48px -16px color-mix(in srgb, ${accent} 45%, transparent), 0 8px 20px rgba(0,0,0,0.35)` }}>
        {/* Sheen and an arc, the way card plastic catches light. */}
        <div className="absolute inset-0 pointer-events-none"
          style={{ background: 'linear-gradient(115deg, rgba(255,255,255,0.14) 0%, rgba(255,255,255,0.03) 38%, rgba(255,255,255,0) 60%)' }} />
        <div className="absolute -right-16 -top-24 w-72 h-72 rounded-full pointer-events-none"
          style={{ border: '1px solid rgba(255,255,255,0.12)' }} />
        <div className="absolute -right-10 top-6 w-56 h-56 rounded-full pointer-events-none"
          style={{ border: '1px solid rgba(255,255,255,0.08)' }} />

        <div className="relative flex items-start justify-between gap-3">
          <span className="text-[13px] sm:text-base font-bold uppercase tracking-[0.16em] sm:tracking-[0.22em] truncate text-white/95">{label}</span>
          <span className="text-[11px] font-semibold uppercase tracking-[0.18em] shrink-0 text-white/70">{kind}</span>
        </div>

        <div className="relative flex items-center gap-3 text-white/85">
          <span className="w-11 h-8 rounded-md grid grid-cols-2 gap-px p-1"
            style={{ background: 'linear-gradient(135deg, #f5d77a, #b8912f)' }}>
            <span className="rounded-sm" style={{ border: '1px solid rgba(60,40,0,0.35)' }} />
            <span className="rounded-sm" style={{ border: '1px solid rgba(60,40,0,0.35)' }} />
            <span className="rounded-sm" style={{ border: '1px solid rgba(60,40,0,0.35)' }} />
            <span className="rounded-sm" style={{ border: '1px solid rgba(60,40,0,0.35)' }} />
          </span>
          <Contactless />
        </div>

        <div className="relative">
          <p className="text-base sm:text-lg font-semibold tabular-nums tracking-[0.3em] text-white/95">
            {last4 ? `•••• ${last4}` : '•••• ••••'}
          </p>
          <p className="mt-1 text-[11px] uppercase tracking-[0.2em] truncate text-white/65">{bank}</p>
        </div>
      </div>
    );
  }

  return (
    <div aria-hidden="true"
      className="relative w-28 sm:w-32 aspect-[1.586] shrink-0 rounded-xl p-2.5 flex flex-col justify-between overflow-hidden"
      style={{ ...face, boxShadow: `0 6px 18px color-mix(in srgb, ${accent} 25%, transparent)` }}>
      <div className="flex items-start justify-between gap-1">
        <span className="text-[8px] font-bold uppercase tracking-wider truncate text-white/90">{bank}</span>
        <span className="w-5 h-3.5 rounded-sm shrink-0" style={{ background: 'linear-gradient(135deg, #f5d77a, #b8912f)' }} />
      </div>
      <div>
        <p className="text-[7px] uppercase tracking-wider truncate text-white/70">{label}</p>
        <div className="flex items-end justify-between">
          <span className="text-[10px] font-semibold tabular-nums text-white/90">{last4 ? `•••• ${last4}` : '••••'}</span>
          <span className="text-[8px] font-bold uppercase text-white/80">{kind}</span>
        </div>
      </div>
    </div>
  );
}
