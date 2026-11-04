'use client';

/* The card picker: a 3D carousel of every card (centre flat, neighbours turned toward it
   and dimmed), arrows and stretching dots under it. Swipe, drag, wheel, tap a neighbour,
   arrows or ←/→ on the keyboard all move the selection; the page owns `index`. */

import { useCallback } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import Carousel from '@/components/motion/Carousel';
import { slideTween, wrapIndex, type DeckEntry } from '@/lib/cards/deck';
import { springs, DOT_WIDTH } from '@/lib/motion/tokens';
import CardArt from './CardArt';

interface Props { deck: DeckEntry[]; index: number; onSelect: (index: number) => void }

function Arrow({ dir, onClick, label }: { dir: -1 | 1; onClick: () => void; label: string }) {
  return (
    <motion.button type="button" onClick={onClick} aria-label={label}
      whileTap={{ scale: 0.9 }} whileHover={{ scale: 1.06 }} transition={springs.snappy}
      className="w-11 h-11 rounded-xl flex items-center justify-center"
      style={{ background: 'var(--color-elevated)', border: '1px solid var(--color-border)', color: 'var(--color-text-primary)' }}>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        {dir < 0 ? <><path d="M19 12H5" /><path d="m12 19-7-7 7-7" /></> : <><path d="M5 12h14" /><path d="m12 5 7 7-7 7" /></>}
      </svg>
    </motion.button>
  );
}

export default function CardDeck({ deck, index, onSelect }: Props) {
  const reduce = useReducedMotion();
  const n = deck.length;
  const step = useCallback((d: -1 | 1) => onSelect(wrapIndex(index + d, n)), [index, n, onSelect]);
  const keyOf = useCallback((e: DeckEntry) => e.id, []);

  return (
    <section aria-label="Your cards" className="flex flex-col gap-4"
      onKeyDown={(e) => {
        if (e.key === 'ArrowLeft') { e.preventDefault(); step(-1); }
        if (e.key === 'ArrowRight') { e.preventDefault(); step(1); }
      }}>
      <Carousel items={deck} keyOf={keyOf} index={index} onIndexChange={onSelect} ariaLabel="Pick a card"
        slideClassName="basis-[72%] sm:basis-[360px] px-2 sm:px-3 py-3" tween={slideTween} loop={n > 2}
        className="-mx-4 sm:-mx-6"
        renderItem={(entry, i, active) => (
          <button type="button" onClick={() => onSelect(i)} aria-current={active ? 'true' : undefined} tabIndex={active ? 0 : -1}
            aria-label={`${entry.name}${entry.last4 ? ` ending ${entry.last4}` : ''}, ${entry.kind} card`}
            className="block w-full rounded-2xl outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]">
            <CardArt size="lg" bank={entry.bank} label={entry.name} last4={entry.last4} accent={entry.accent} kind={entry.kind} />
          </button>
        )} />

      {n > 1 && (
        <div className="flex items-center justify-center gap-5">
          <Arrow dir={-1} onClick={() => step(-1)} label="Previous card" />
          <div className="flex items-center gap-1.5" role="tablist" aria-label="Cards">
            {deck.map((e, i) => (
              <motion.button key={e.id} type="button" role="tab" aria-selected={i === index} aria-label={e.name}
                onClick={() => onSelect(i)}
                animate={{ width: i === index ? DOT_WIDTH.active : DOT_WIDTH.idle, opacity: i === index ? 1 : 0.5 }}
                transition={reduce ? { duration: 0 } : springs.snappy}
                className="h-1.5 rounded-full"
                style={{ background: i === index ? 'var(--color-primary)' : 'var(--color-text-muted)' }} />
            ))}
          </div>
          <Arrow dir={1} onClick={() => step(1)} label="Next card" />
        </div>
      )}
    </section>
  );
}
