/* The card deck on /cards: every credit card and checking account the user has, in one
   pickable list, plus the pure math behind the carousel's 3D tween. */
import type { CardView, DebitView } from './types';
import { cardColor } from './card-colors';

/* Accent per deck position when the issuer's colour is unknown (theme card accents). */
export const CARD_ACCENTS = [
  'var(--color-card-sky)',
  'var(--color-card-violet)',
  'var(--color-card-green)',
  'var(--color-card-orange)',
  'var(--color-card-amber)',
];

export type DeckEntry =
  | { kind: 'credit'; id: string; name: string; bank: string; last4: string | null; accent: string; card: CardView }
  | { kind: 'debit'; id: string; name: string; bank: string; last4: string | null; accent: string; account: DebitView };

export function buildDeck(cards: CardView[], debit: DebitView[]): DeckEntry[] {
  const deck: DeckEntry[] = [];
  for (const card of cards) {
    const name = card.officialName ?? card.accountName;
    deck.push({ kind: 'credit', id: card.accountId, name, bank: card.bankName, last4: card.last4,
      accent: cardColor(card.bankName, name) ?? CARD_ACCENTS[deck.length % CARD_ACCENTS.length], card });
  }
  for (const account of debit) {
    deck.push({ kind: 'debit', id: account.accountId, name: account.accountName, bank: account.bankName, last4: account.last4,
      accent: cardColor(account.bankName, account.accountName) ?? CARD_ACCENTS[deck.length % CARD_ACCENTS.length], account });
  }
  return deck;
}

/** "3 cards · 2 credit · 1 debit", "2 credit cards", "1 debit card", "No cards yet". */
export function deckSubtitle(deck: DeckEntry[]): string {
  const credit = deck.filter((e) => e.kind === 'credit').length;
  const debit = deck.length - credit;
  if (deck.length === 0) return 'No cards yet';
  const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;
  if (debit === 0) return plural(credit, 'credit card');
  if (credit === 0) return plural(debit, 'debit card');
  return `${plural(deck.length, 'card')} · ${credit} credit · ${debit} debit`;
}

export function wrapIndex(i: number, n: number): number {
  if (n <= 0) return 0;
  return ((i % n) + n) % n;
}

/** Where the selected card sits after a reload; the first card when it is gone. */
export function selectionIndex(deck: DeckEntry[], selectedId: string | null): number {
  if (!selectedId) return 0;
  const i = deck.findIndex((e) => e.id === selectedId);
  return i < 0 ? 0 : i;
}

/* 3D tween for a slide `diff` snap-widths from the centre (negative = to the left).
   Clamped to one slide so far slides sit at the same pose as the nearest neighbour.
   Neighbours scale and turn around their inner edge — the edge nearest the centre stays
   closest to the reader and the far edge recedes — so they fan out behind the centre
   card and the part that peeks past the viewport edge stays visible. */
const NEIGHBOUR = { scale: 0.9, rotateY: 30, opacity: 0.6 };
export function slideTween(diff: number): { scale: number; rotateY: number; opacity: number; origin: 'left' | 'center' | 'right' } {
  const t = Math.min(Math.abs(diff), 1);
  const dir = diff === 0 ? 0 : Math.sign(diff);
  return {
    scale: 1 - (1 - NEIGHBOUR.scale) * t,
    rotateY: dir * NEIGHBOUR.rotateY * t + 0,
    opacity: 1 - (1 - NEIGHBOUR.opacity) * t,
    origin: Math.abs(diff) < 0.02 ? 'center' : dir > 0 ? 'left' : 'right',
  };
}
