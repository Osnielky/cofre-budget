import { describe, it, expect } from 'vitest';
import { buildDeck, deckSubtitle, selectionIndex, slideTween, wrapIndex, CARD_ACCENTS } from './deck';
import type { CardView, DebitView } from './types';

const credit = (over: Partial<CardView>): CardView => ({
  accountId: 'c1', bankName: 'Some Bank', accountName: 'Rewards', last4: '2048', balance: 684.25,
  provider: 'plaid', plaidItemId: 'i', plaidItemStatus: 'active', creditLimit: 5000, officialName: null,
  aprs: [], lastStatementBalance: null, lastStatementDate: null, minimumPayment: null, nextPaymentDueDate: null,
  lastPaymentAmount: null, lastPaymentDate: null, isOverdue: null, promoAprEndsOn: null, rewardsBalance: null,
  liabilitiesStatus: 'synced', manualFields: [], liabilitiesSyncedAt: null, hasBankData: true, ...over,
});
const debit = (over: Partial<DebitView>): DebitView => ({
  accountId: 'd1', bankName: 'Some Bank', accountName: 'Checking', last4: '4821', balance: 1200,
  spentThisMonth: 300, provider: 'manual', plaidItemStatus: null, ...over,
});

describe('buildDeck', () => {
  it('puts credit cards first, then debit, each tagged with its kind', () => {
    const deck = buildDeck([credit({ accountId: 'c1' })], [debit({ accountId: 'd1' })]);
    expect(deck.map((e) => [e.kind, e.id])).toEqual([['credit', 'c1'], ['debit', 'd1']]);
  });
  it('names a credit card by its official name when the bank sent one', () => {
    const [e] = buildDeck([credit({ officialName: 'Nova Everyday' })], []);
    expect(e.name).toBe('Nova Everyday');
    expect(e.last4).toBe('2048');
  });
  it('falls back to a theme accent by position when the card color is unknown', () => {
    const deck = buildDeck([credit({ accountId: 'c1' }), credit({ accountId: 'c2' })], [debit({})]);
    expect(deck[0].accent).toBe(CARD_ACCENTS[0]);
    expect(deck[1].accent).toBe(CARD_ACCENTS[1]);
    expect(deck[2].accent).toBe(CARD_ACCENTS[2]);
  });
  it('uses the real card color when the issuer is known', () => {
    const [e] = buildDeck([credit({ bankName: 'Chase', accountName: 'Sapphire Preferred' })], []);
    expect(e.accent).not.toBe(CARD_ACCENTS[0]);
    expect(e.accent.startsWith('#')).toBe(true);
  });
});

describe('deckSubtitle', () => {
  it('counts both kinds', () => {
    expect(deckSubtitle(buildDeck([credit({})], [debit({})]))).toBe('2 cards · 1 credit · 1 debit');
  });
  it('names a single kind alone', () => {
    expect(deckSubtitle(buildDeck([credit({}), credit({ accountId: 'c2' })], []))).toBe('2 credit cards');
    expect(deckSubtitle(buildDeck([], [debit({})]))).toBe('1 debit card');
  });
  it('says so when there is nothing', () => {
    expect(deckSubtitle([])).toBe('No cards yet');
  });
});

describe('wrapIndex', () => {
  it('wraps both ways', () => {
    expect(wrapIndex(3, 3)).toBe(0);
    expect(wrapIndex(-1, 3)).toBe(2);
    expect(wrapIndex(1, 3)).toBe(1);
  });
  it('is 0 for an empty deck', () => { expect(wrapIndex(2, 0)).toBe(0); });
});

describe('selectionIndex', () => {
  const deck = buildDeck([credit({ accountId: 'c1' }), credit({ accountId: 'c2' })], []);
  it('keeps the selected card when the list reloads', () => { expect(selectionIndex(deck, 'c2')).toBe(1); });
  it('falls back to the first card when the selection is gone', () => {
    expect(selectionIndex(deck, 'zzz')).toBe(0);
    expect(selectionIndex(deck, null)).toBe(0);
  });
});

describe('slideTween', () => {
  it('the centred slide is flat, full size and opaque', () => {
    expect(slideTween(0)).toEqual({ scale: 1, rotateY: 0, opacity: 1, origin: 'center' });
  });
  it('neighbours shrink, recede on their far edge and dim', () => {
    const right = slideTween(1);
    const left = slideTween(-1);
    expect(right.scale).toBeLessThan(1);
    expect(right.opacity).toBeLessThan(1);
    expect(right.rotateY).toBeGreaterThan(0);
    expect(left.rotateY).toBe(-right.rotateY);
    expect(left.scale).toBe(right.scale);
  });
  it('neighbours pivot on the edge nearest the centre, so they fan out and stay in view', () => {
    expect(slideTween(1).origin).toBe('left');
    expect(slideTween(-1).origin).toBe('right');
  });
  it('clamps beyond one slide away so far slides never vanish or flip', () => {
    expect(slideTween(4)).toEqual(slideTween(1));
    expect(slideTween(-4)).toEqual(slideTween(-1));
  });
  it('interpolates smoothly mid-drag', () => {
    const half = slideTween(0.5);
    expect(half.scale).toBeGreaterThan(slideTween(1).scale);
    expect(half.scale).toBeLessThan(1);
  });
});
