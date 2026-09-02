'use client';

const ROWS: { label: string; tier: 'always' | 'ask' | 'never' }[] = [
  { label: 'Read everything', tier: 'always' },
  { label: 'Categories & budgets', tier: 'ask' },
  { label: 'Categorize transactions', tier: 'ask' },
  { label: 'Move money or pay bills', tier: 'never' },
];

const TIER_LABEL: Record<string, string> = { always: 'always on', ask: 'asks first', never: 'never' };
const TIER_COLOR: Record<string, string> = { always: 'var(--color-green)', ask: 'var(--color-amber)', never: 'var(--color-text-muted)' };

export default function PermissionsPanel() {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--color-text-muted)' }}>
        What Cofre can touch
      </p>
      {ROWS.map((r) => (
        <div key={r.label} className="flex items-center justify-between gap-2 px-3 py-2 rounded-xl text-xs"
          style={{ background: 'var(--color-elevated)', border: '1px solid var(--color-border)' }}>
          <span>{r.label}</span>
          <span className="font-semibold uppercase text-[10px]" style={{ color: TIER_COLOR[r.tier] }}>{TIER_LABEL[r.tier]}</span>
        </div>
      ))}
    </div>
  );
}
