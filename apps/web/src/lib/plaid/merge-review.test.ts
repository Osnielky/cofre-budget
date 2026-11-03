import { describe, it, expect } from 'vitest';
import {
  groupCandidates, cutoverSentence, formatCutoverDate, summarizeDecisions, untrackedHint, accountTypeFromSubtype, matchWording,
  type MergeCandidate, type ReviewDecision,
} from './merge-review';

const acct = (over: Partial<MergeCandidate>): MergeCandidate => ({
  id: 'a', bankName: 'Bank of America', accountName: 'Checking', accountType: 'checking',
  balance: 100, last4: null, ...over,
});

describe('groupCandidates', () => {
  it('puts the same bank first (case-insensitive), the suggested match on top, then other banks', () => {
    const boa1 = acct({ id: '1', accountName: 'GREY BOA', last4: '1564' });
    const boa2 = acct({ id: '2', accountName: 'RED BOA', last4: '1372' });
    const chase = acct({ id: '3', bankName: 'Chase', accountName: 'Chase Checking', last4: '7682' });
    const out = groupCandidates([chase, boa1, boa2], 'bank of america', '1372');
    expect(out.sameBank.map((a) => a.id)).toEqual(['2', '1']);
    expect(out.otherBanks.map((a) => a.id)).toEqual(['3']);
    expect(out.sameBank[0].sameLast4).toBe(true);
    expect(out.sameBank[1].sameLast4).toBe(false);
  });

  it('never tags a match when Plaid has no mask', () => {
    const out = groupCandidates([acct({ last4: '1372' })], 'Bank of America', null);
    expect(out.sameBank[0].sameLast4).toBe(false);
  });

  it('puts the API\'s bank-and-type suggestion on top and marks it suggested', () => {
    const chk = acct({ id: 'chk', accountName: 'Bank of America Checking', last4: null });
    const card = acct({ id: 'card', accountName: 'GREY BOA', accountType: 'credit', last4: '1564' });
    const out = groupCandidates([card, chk], 'Bank of America', '9452', { id: 'chk', reason: 'bank_type' });
    expect(out.sameBank.map((a) => a.id)).toEqual(['chk', 'card']);
    expect(out.sameBank[0]).toMatchObject({ suggested: true, sameLast4: false });
    expect(out.sameBank[1].suggested).toBe(false);
  });
});

describe('matchWording', () => {
  it('explains why an account was suggested', () => {
    expect(matchWording('last4', 'Checking')).toEqual({ caption: 'Recommended · same last 4', tag: 'same last 4' });
    expect(matchWording('bank_type', 'Checking')).toEqual({ caption: 'Recommended · the only Checking here without a last 4', tag: 'likely match' });
  });
});

describe('formatCutoverDate', () => {
  it('renders an ISO date without a timezone shift', () => {
    expect(formatCutoverDate('2026-09-01')).toBe('Sep 1, 2026');
  });
});

describe('cutoverSentence', () => {
  it('explains the cutover in plain words', () => {
    expect(cutoverSentence('RED BOA 1372', '2026-09-01')).toBe(
      'Keeps RED BOA 1372\'s history. Imports from Plaid starting Sep 1, 2026, your last entry. Earlier activity stays as you entered it, and matching entries after that are not duplicated.',
    );
  });

  it('says what happens with no date: everything Plaid has', () => {
    expect(cutoverSentence('RED BOA 1372', '')).toBe(
      'Keeps RED BOA 1372\'s history and imports everything Plaid has, up to two years. Set a date to skip what you already entered.',
    );
  });
});

describe('summarizeDecisions', () => {
  const d = (action: ReviewDecision['action']): ReviewDecision => ({ action, mergeIntoAccountId: action === 'merge' ? 'x' : '', cutoverDate: '' });

  it('counts linked and new accounts and words the button', () => {
    expect(summarizeDecisions([d('merge'), d('merge'), d('new')])).toEqual({ linked: 2, created: 1, incomplete: 0, summary: '2 linked · 1 new', button: 'Connect 3 accounts' });
    expect(summarizeDecisions([d('new')])).toEqual({ linked: 0, created: 1, incomplete: 0, summary: '1 new', button: 'Connect 1 account' });
    expect(summarizeDecisions([d('merge')])).toEqual({ linked: 1, created: 0, incomplete: 0, summary: '1 linked', button: 'Connect 1 account' });
  });

  it('treats a merge without a chosen account as incomplete', () => {
    const out = summarizeDecisions([{ action: 'merge', mergeIntoAccountId: '', cutoverDate: '' }]);
    expect(out.linked).toBe(0);
    expect(out.incomplete).toBe(1);
  });
});

describe('accountTypeFromSubtype', () => {
  it('mirrors the API mapping and falls back to checking', () => {
    expect(accountTypeFromSubtype('credit card')).toBe('credit');
    expect(accountTypeFromSubtype('Brokerage')).toBe('investment');
    expect(accountTypeFromSubtype('money market')).toBe('savings');
    expect(accountTypeFromSubtype('')).toBe('checking');
  });
});

describe('untrackedHint', () => {
  it('nudges toward Link when the same bank still has a manual account with no last 4', () => {
    const out = groupCandidates([acct({ id: '1', accountName: 'Bank of America Checking', last4: null })], 'Bank of America', '9452');
    expect(untrackedHint(out.sameBank, 'checking')).toBe('Already tracking this account as "Bank of America Checking"? Pick it under Link to avoid a duplicate.');
  });

  it('stays quiet when every same-bank account has a different last 4 or type', () => {
    const out = groupCandidates([acct({ id: '1', accountName: 'GREY BOA', accountType: 'credit', last4: '1564' })], 'Bank of America', '9452');
    expect(untrackedHint(out.sameBank, 'checking')).toBeNull();
  });
});
