'use client';

/** "Which account does this money belong to?" — a small select used on linked rows and in bulk assign. */
export default function AccountPicker({ accounts, value, onChange, compact = false, disabled = false }: {
  accounts: { id: string; bankName: string; accountName: string }[]; value: string | null; onChange: (id: string | null) => void; compact?: boolean; disabled?: boolean;
}) {
  return (
    <select value={value ?? ''} onChange={(e) => onChange(e.target.value || null)} aria-label="Trading account" disabled={disabled}
      className={`${compact ? 'text-fine px-1.5 py-0.5' : 'text-xs px-2.5 py-1.5'} rounded-md font-semibold cursor-pointer outline-none disabled:opacity-50 disabled:cursor-wait`}
      style={{ background: value ? 'color-mix(in srgb, var(--color-card-sky) 14%, transparent)' : 'var(--color-elevated)', border: `1px solid ${value ? 'color-mix(in srgb, var(--color-card-sky) 35%, transparent)' : 'var(--color-border)'}`, color: value ? 'var(--color-card-sky)' : 'var(--color-text-muted)' }}>
      <option value="">No account</option>
      {accounts.map((a) => <option key={a.id} value={a.id}>{a.bankName} · {a.accountName}</option>)}
    </select>
  );
}
