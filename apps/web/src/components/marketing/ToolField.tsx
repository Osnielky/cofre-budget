'use client';

import { useId } from 'react';

interface Props {
  label: string;
  value: string;
  onChange: (v: string) => void;
  /** "$" or "%" shown inside the field. */
  prefix?: string;
  suffix?: string;
  hint?: string;
  placeholder?: string;
}

const inputStyle: React.CSSProperties = {
  background: 'var(--color-elevated)',
  border: '1px solid var(--color-border)',
  color: 'var(--color-text-primary)',
};

/** One numeric field for the calculators. Text input with inputMode so phones show the number pad
    and a typed "-" or "." is never fought by the browser. */
export default function ToolField({ label, value, onChange, prefix, suffix, hint, placeholder }: Props) {
  const id = useId();
  return (
    <label htmlFor={id} className="flex flex-col gap-1.5">
      <span className="text-xs font-semibold" style={{ color: 'var(--color-text-secondary)' }}>{label}</span>
      <span className="relative flex items-center">
        {prefix && <span className="absolute left-3 text-sm" style={{ color: 'var(--color-text-muted)' }}>{prefix}</span>}
        <input
          id={id}
          type="text"
          inputMode="decimal"
          autoComplete="off"
          value={value}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
          className={`w-full py-2.5 text-sm rounded-xl outline-none ${prefix ? 'pl-7' : 'pl-3'} ${suffix ? 'pr-9' : 'pr-3'}`}
          style={inputStyle}
        />
        {suffix && <span className="absolute right-3 text-sm" style={{ color: 'var(--color-text-muted)' }}>{suffix}</span>}
      </span>
      {hint && <span className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>{hint}</span>}
    </label>
  );
}

/** "1,200" or "-3,500.5" → number; empty or junk → null. */
export function parseAmount(raw: string): number | null {
  const cleaned = raw.replace(/[,$\s%]/g, '');
  if (cleaned === '' || cleaned === '-' || cleaned === '.') return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

export const money0 = (n: number) => `${n < 0 ? '−' : ''}$${Math.abs(Math.round(n)).toLocaleString('en-US')}`;
export const money2 = (n: number) => `${n < 0 ? '−' : ''}$${Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
export const cents0 = (c: number) => money0(c / 100);
