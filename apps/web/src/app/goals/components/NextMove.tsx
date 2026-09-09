'use client';

import Link from 'next/link';
import { levelProgress } from '@/lib/goals/levels';

function money(n: number) {
  return `${n < 0 ? '−' : ''}$${Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export interface MoveItem {
  label: string;
  done: boolean;
  /** Optional call to action shown on the right. */
  action?: { label: string; href: string };
  /** Amber ring instead of grey — something that needs attention, not just a to-do. */
  warn?: boolean;
}

interface Props {
  netWorth: number;
  items: MoveItem[];
  onPlan?: () => void;
  planNote?: string;
  /** Rendered under the CTA — e.g. the target-date field, once opened. */
  plan?: React.ReactNode;
}

export default function NextMove({ netWorth, items, onPlan, planNote, plan }: Props) {
  const p = levelProgress(netWorth);

  return (
    <div className="rounded-2xl p-5 flex flex-col gap-4"
      style={{ background: 'var(--color-surface)', backdropFilter: 'var(--glass-blur)', WebkitBackdropFilter: 'var(--glass-blur)', border: '1px solid var(--color-border)' }}>
      <div className="flex items-start justify-between gap-2">
        <h2 className="text-lg font-bold">Your next move</h2>
        {p.next && (
          <span className="px-2.5 py-1 rounded-lg text-[11px] font-bold shrink-0"
            style={{ background: 'color-mix(in srgb, var(--color-primary) 14%, transparent)', border: '1px solid color-mix(in srgb, var(--color-primary) 35%, transparent)', color: 'var(--color-primary)' }}>
            LEVEL {p.next.n}
          </span>
        )}
      </div>

      {p.next ? (
        <div>
          <p className="font-extrabold tabular-nums leading-none" style={{ fontSize: 28 }}>
            {money(p.toGo)}
            <span className="text-sm font-medium ml-2" style={{ color: 'var(--color-text-muted)' }}>
              away from ${p.next.threshold.toLocaleString()}
            </span>
          </p>
          <p className="text-[11px] mt-2 text-right" style={{ color: 'var(--color-text-muted)' }}>
            {p.pctThroughLevel.toFixed(1)}% through this level
          </p>
          <div className="h-2 rounded-full overflow-hidden" style={{ background: 'var(--color-elevated)' }}>
            <div className="h-full rounded-full" style={{ width: `${p.pctThroughLevel}%`, background: 'var(--color-primary)' }} />
          </div>
          <div className="flex justify-between text-[10px] mt-1" style={{ color: 'var(--color-text-muted)' }}>
            <span>${p.bandFrom.toLocaleString()}</span><span>${p.bandTo.toLocaleString()}</span>
          </div>
        </div>
      ) : (
        <p className="text-sm" style={{ color: 'var(--color-green)' }}>You reached $1,000,000. Every level is complete.</p>
      )}

      <ul className="flex flex-col gap-2.5">
        {items.map((it) => (
          <li key={it.label} className="flex items-center gap-2.5">
            <span className="w-6 h-6 rounded-full flex items-center justify-center shrink-0"
              style={{
                border: `2px solid ${it.done ? 'var(--color-green)' : it.warn ? 'var(--color-amber)' : 'var(--color-border)'}`,
                background: it.done ? 'color-mix(in srgb, var(--color-green) 18%, transparent)' : 'transparent',
                color: 'var(--color-green)',
              }}>
              {it.done && (
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20 6 9 17l-5-5" />
                </svg>
              )}
            </span>
            <span className="flex-1 min-w-0 text-sm" style={{ color: it.done ? 'var(--color-text-muted)' : 'var(--color-text-primary)' }}>
              {it.label}
            </span>
            {it.action && (
              <Link href={it.action.href}
                className="text-xs font-semibold shrink-0 hover:brightness-125"
                style={{ color: 'var(--color-primary)' }}>
                {it.action.label} →
              </Link>
            )}
          </li>
        ))}
      </ul>

      {onPlan && (
        <div>
          <button type="button" onClick={onPlan}
            className="w-full py-2.5 rounded-xl text-sm font-bold text-white transition-all hover:brightness-110"
            style={{ background: 'var(--color-primary)' }}>
            Plan my next milestone
          </button>
          {plan && <div className="mt-2">{plan}</div>}
          {planNote && (
            <p className="text-[11px] text-center mt-1.5" style={{ color: 'var(--color-text-muted)' }}>{planNote}</p>
          )}
        </div>
      )}
    </div>
  );
}
