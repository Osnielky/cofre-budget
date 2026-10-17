export interface PeriodOption { value: string; label: string }

/** Compact period dropdown for a dashboard panel's header. */
export default function PeriodSelect({ value, options, onChange, ariaLabel }: {
  value: string; options: PeriodOption[]; onChange: (value: string) => void; ariaLabel: string;
}) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)}
      aria-label={ariaLabel}
      className="px-2 py-1 rounded-md text-[10.5px] font-semibold outline-none cursor-pointer"
      style={{ background: 'var(--color-elevated)', border: '1px solid var(--color-border)', color: 'var(--color-text-secondary)' }}>
      {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}
