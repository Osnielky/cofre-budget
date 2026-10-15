import type { CardView } from './types';
import { aprOf } from './utilization';

export type CardNotice = { kind: 'reconnect' | 'enable' | 'pending' | 'add_details'; message: string };

/* The one thing a card tile should ask of the user, most urgent first. */
export function cardNotice(card: CardView): CardNotice | null {
  if (card.provider === 'plaid' && card.plaidItemStatus === 'error') {
    return { kind: 'reconnect', message: 'This bank needs to be reconnected in Settings.' };
  }
  if (card.liabilitiesStatus === 'not_consented') {
    return { kind: 'enable', message: "Allow Cofre to read this card's APR, statement and due date." };
  }
  if (card.liabilitiesStatus === 'pending') {
    return { kind: 'pending', message: 'Your bank is still sending card details.' };
  }
  const missing = aprOf(card, 'purchase') === null || card.creditLimit === null;
  if ((card.liabilitiesStatus === 'unsupported' || card.liabilitiesStatus === 'manual') && missing) {
    return {
      kind: 'add_details',
      message: card.liabilitiesStatus === 'unsupported'
        ? "Your bank doesn't share card details — add the APR and limit yourself."
        : 'Add the APR and limit so Cofre can advise on this card.',
    };
  }
  return null;
}
