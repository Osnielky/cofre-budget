/* A generic card graphic in a theme accent. Deliberately no issuer logos or card art —
   those are other companies' trademarks. Like a physical card it is always dark (the
   accent is mixed with a fixed ink, not the theme base), so its white text stays legible
   under any theme. */
const INK = '#0a0f1f';
export default function CardArt({ bank, label, last4, accent, kind }: {
  bank: string;
  label: string;
  last4: string | null;
  accent: string;
  kind: 'credit' | 'debit';
}) {
  return (
    <div aria-hidden="true"
      className="relative w-28 sm:w-32 aspect-[1.586] shrink-0 rounded-xl p-2.5 flex flex-col justify-between overflow-hidden"
      style={{
        background: `linear-gradient(135deg, color-mix(in srgb, ${accent} 70%, ${INK}) 0%, color-mix(in srgb, ${accent} 25%, ${INK}) 100%)`,
        border: `1px solid color-mix(in srgb, ${accent} 50%, transparent)`,
        boxShadow: `0 6px 18px color-mix(in srgb, ${accent} 25%, transparent)`,
      }}>
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
