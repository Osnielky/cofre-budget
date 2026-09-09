'use client';

import { levelProgress, NET_WORTH_TARGET } from '@/lib/goals/levels';

function money(n: number) {
  return `${n < 0 ? '−' : ''}$${Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

interface Props { netWorth: number; monthNet: number }

function Card({ label, color, icon, children }: {
  label: string; color: string; icon: React.ReactNode; children: React.ReactNode;
}) {
  return (
    <div className="flex-1 min-w-56 rounded-2xl p-4"
      style={{ background: 'var(--color-surface)', backdropFilter: 'var(--glass-blur)', WebkitBackdropFilter: 'var(--glass-blur)', border: '1px solid var(--color-border)' }}>
      <div className="flex items-center justify-between gap-2 mb-2">
        <span className="text-[10.5px] font-bold uppercase tracking-widest" style={{ color }}>{label}</span>
        <span style={{ color, opacity: 0.7 }}>{icon}</span>
      </div>
      {children}
    </div>
  );
}

const ICON = { fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };

export default function JourneyStats({ netWorth, monthNet }: Props) {
  const p = levelProgress(netWorth);

  return (
    <div className="flex gap-3 flex-wrap">
      <Card label="Net worth" color="var(--color-primary)"
        icon={<svg width="16" height="16" viewBox="0 0 24 24" {...ICON}><path d="M3 17l6-6 4 4 7-7" /><path d="M14 8h6v6" /></svg>}>
        <p className="font-extrabold tabular-nums leading-none" style={{ fontSize: 26 }}>{money(netWorth)}</p>
        <p className="text-xs mt-1.5 flex items-center gap-1"
          style={{ color: monthNet >= 0 ? 'var(--color-green)' : 'var(--color-rose)' }}>
          {monthNet >= 0 ? '▲' : '▼'} {money(monthNet)}
          <span style={{ color: 'var(--color-text-muted)' }}>this month</span>
        </p>
      </Card>

      <Card label="The million" color="var(--color-card-violet)"
        icon={<svg width="16" height="16" viewBox="0 0 24 24" {...ICON}><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="4" /></svg>}>
        <p className="font-extrabold tabular-nums leading-none" style={{ fontSize: 26 }}>
          {p.pctOfTarget.toFixed(2)}%
          <span className="text-xs font-medium ml-1.5" style={{ color: 'var(--color-text-muted)' }}>
            of ${NET_WORTH_TARGET.toLocaleString()}
          </span>
        </p>
        <div className="mt-2.5 h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--color-elevated)' }}>
          <div className="h-full rounded-full" style={{ width: `${Math.max(p.pctOfTarget, 0.5)}%`, background: 'var(--color-card-violet)' }} />
        </div>
        <div className="flex justify-between text-[10px] mt-1" style={{ color: 'var(--color-text-muted)' }}>
          <span>$0</span><span>${NET_WORTH_TARGET.toLocaleString()}</span>
        </div>
      </Card>

      <Card label="Current level" color="var(--color-green)"
        icon={<svg width="16" height="16" viewBox="0 0 24 24" {...ICON}><path d="M4 20V10M10 20V4M16 20v-6M22 20H2" /></svg>}>
        <div className="flex items-center gap-2.5">
          <span className="w-10 h-10 rounded-full flex items-center justify-center text-base font-extrabold shrink-0"
            style={{ background: 'color-mix(in srgb, var(--color-green) 18%, transparent)', border: '2px solid var(--color-green)', color: 'var(--color-green)' }}>
            {p.current}
          </span>
          <div className="min-w-0">
            <p className="text-base font-bold leading-tight truncate">
              {p.currentLevel ? `Level ${p.current} · ${p.currentLevel.name}` : 'Not started'}
            </p>
            <p className="text-xs mt-0.5" style={{ color: 'var(--color-green)' }}>
              {p.currentLevel ? `$${p.currentLevel.threshold.toLocaleString()} milestone reached` : 'Reach $5,000 to unlock Level 1'}
            </p>
          </div>
        </div>
      </Card>

      <Card label="Next milestone" color="var(--color-card-sky)"
        icon={<svg width="16" height="16" viewBox="0 0 24 24" {...ICON}><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="4" /><circle cx="12" cy="12" r="1" /></svg>}>
        <p className="font-extrabold tabular-nums leading-none" style={{ fontSize: 26 }}>
          {p.next ? `$${p.next.threshold.toLocaleString()}` : 'Complete'}
        </p>
        <p className="text-xs mt-1.5" style={{ color: 'var(--color-text-muted)' }}>
          {p.next ? <>{money(p.toGo)} to go</> : 'The whole ladder is behind you.'}
        </p>
      </Card>
    </div>
  );
}
