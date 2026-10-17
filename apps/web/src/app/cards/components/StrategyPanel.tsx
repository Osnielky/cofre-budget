'use client';

import type { CardView } from '@/lib/cards/types';
import { strategyTips, type StrategyTip } from '@/lib/cards/overview';
import { PANEL, MUTED } from './panel';

const TONE: Record<StrategyTip['tone'], string> = {
  good: 'var(--color-green)',
  warn: 'var(--color-amber)',
  info: 'var(--color-sky)',
};

const ASK = 'Look at my credit cards: which should I pay first, how much interest am I paying, and is my utilization healthy?';

/* Tips computed from the user's real card data — no AI call when the page loads. */
export default function StrategyPanel({ cards, today }: { cards: CardView[]; today: string }) {
  const tips = strategyTips(cards, today);
  return (
    <section className="rounded-2xl p-5 flex flex-col gap-4 min-w-0" style={PANEL}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold">Payment strategy</h2>
          <p className="text-xs" style={MUTED}>From your card balances, APRs and due dates</p>
        </div>
        <a href={`/ask-cofre?q=${encodeURIComponent(ASK)}`}
          className="shrink-0 text-xs font-semibold px-3 py-1.5 rounded-lg hover:bg-(--color-elevated)"
          style={{ border: '1px solid var(--color-border)', color: 'var(--color-primary)' }}>
          Ask Cofre →
        </a>
      </div>
      {tips.length === 0 ? (
        <p className="text-sm" style={MUTED}>Add your cards’ APRs and limits to get payment tips.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {tips.map((t) => (
            <li key={t.kind} className="flex gap-3">
              <span className="mt-1.5 w-2 h-2 rounded-full shrink-0" style={{ background: TONE[t.tone] }} aria-hidden="true" />
              <div className="min-w-0">
                <p className="text-sm font-semibold">{t.title}</p>
                <p className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>{t.detail}</p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
