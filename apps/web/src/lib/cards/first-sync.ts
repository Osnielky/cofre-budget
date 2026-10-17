import type { CardView } from './types';

/* Plaid Items linked before card details existed never ran a Liabilities sync, so their
   cards sit on 'pending'. These are the items the /cards page should sync once. */
export function itemsNeedingFirstSync(cards: CardView[]): string[] {
  const ids = new Set<string>();
  for (const c of cards) {
    if (c.provider === 'plaid' && c.plaidItemId && c.liabilitiesStatus === 'pending' && !c.hasBankData
      && c.liabilitiesSyncedAt === null && c.plaidItemStatus !== 'error') ids.add(c.plaidItemId);
  }
  return [...ids];
}
