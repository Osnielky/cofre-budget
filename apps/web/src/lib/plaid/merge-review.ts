/* Pure helpers behind the "Review <bank> accounts" dialog shown after a Plaid link
   when the user already has manual accounts. Everything the dialog says or counts
   is derived here so the wording is tested. */

export interface MergeCandidate {
  id: string;
  bankName: string;
  accountName: string;
  accountType: string;
  balance: number;
  last4?: string | null;
}

export interface RankedCandidate extends MergeCandidate {
  /** The manual account's last 4 equals the Plaid mask. */
  sameLast4: boolean;
  /** The account the API suggested (by last 4, or as the only same-bank account of the type with no last 4). */
  suggested: boolean;
}

export type MatchReason = 'last4' | 'bank_type';

/** What the Link tile's caption and the picker's tag say about a suggested match. */
export function matchWording(reason: MatchReason, typeLabel: string): { caption: string; tag: string } {
  return reason === 'last4'
    ? { caption: 'Recommended · same last 4', tag: 'same last 4' }
    : { caption: `Recommended · the only ${typeLabel} here without a last 4`, tag: 'likely match' };
}

export interface ReviewDecision {
  action: 'new' | 'merge';
  mergeIntoAccountId: string;
  cutoverDate: string;
}

const norm = (s: string) => s.trim().toLowerCase();

/** Same-bank accounts first (the suggested match on top), then every other bank. */
export function groupCandidates(
  manual: MergeCandidate[], institutionName: string, mask: string | null, suggested?: { id: string } | null,
) {
  const bank = norm(institutionName);
  const rank = (a: MergeCandidate): RankedCandidate => ({
    ...a,
    sameLast4: !!mask && !!a.last4 && a.last4 === mask,
    suggested: !!suggested && a.id === suggested.id,
  });
  const sameBank = manual.filter((a) => norm(a.bankName) === bank).map(rank)
    .sort((a, b) => Number(b.suggested || b.sameLast4) - Number(a.suggested || a.sameLast4));
  const otherBanks = manual.filter((a) => norm(a.bankName) !== bank).map(rank);
  return { sameBank, otherBanks };
}

/** 2026-09-01 → "Sep 1, 2026", read as a calendar date (no timezone shift). */
export function formatCutoverDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

/** The one sentence under a chosen account that says what the cutover date does. */
export function cutoverSentence(accountName: string, cutoverDate: string): string {
  if (!cutoverDate) {
    return `Keeps ${accountName}'s history and imports everything Plaid has, up to two years. Set a date to skip what you already entered.`;
  }
  return `Keeps ${accountName}'s history. Imports from Plaid starting ${formatCutoverDate(cutoverDate)}, your last entry. Earlier activity stays as you entered it, and matching entries after that are not duplicated.`;
}

export interface DecisionSummary {
  linked: number;
  created: number;
  /** Merges with no account picked yet — Confirm stays disabled while any exist. */
  incomplete: number;
  summary: string;
  button: string;
}

export function summarizeDecisions(decisions: ReviewDecision[]): DecisionSummary {
  const linked = decisions.filter((d) => d.action === 'merge' && d.mergeIntoAccountId).length;
  const incomplete = decisions.filter((d) => d.action === 'merge' && !d.mergeIntoAccountId).length;
  const created = decisions.filter((d) => d.action === 'new').length;
  const parts: string[] = [];
  if (linked) parts.push(`${linked} linked`);
  if (created) parts.push(`${created} new`);
  if (incomplete) parts.push(`${incomplete} to choose`);
  const n = decisions.length;
  return { linked, created, incomplete, summary: parts.join(' · '), button: `Connect ${n} account${n === 1 ? '' : 's'}` };
}

/** Plaid subtype → Cofre account type. Mirrors mapPlaidSubtype in the API's plaid.service.ts. */
export function accountTypeFromSubtype(subtype: string): string {
  const map: Record<string, string> = {
    checking: 'checking', savings: 'savings', cd: 'savings', 'money market': 'savings',
    credit: 'credit', 'credit card': 'credit', brokerage: 'investment', '401k': 'investment', ira: 'investment',
  };
  return map[subtype.toLowerCase()] ?? 'checking';
}

/** Under "Add as new": the same bank still has a manual account of this type with no
    last 4, so it could well be this very account and a new one would duplicate it. */
export function untrackedHint(sameBank: RankedCandidate[], plaidType: string): string | null {
  const candidate = sameBank.find((a) => !a.last4 && a.accountType === plaidType);
  return candidate
    ? `Already tracking this account as "${candidate.accountName}"? Pick it under Link to avoid a duplicate.`
    : null;
}
