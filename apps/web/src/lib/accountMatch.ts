import { bankNamesMatch } from '@/lib/csvImport';
import type { CsvFingerprint, CsvType } from '@/lib/csvImport';

export interface MatchAccount {
  id: string;
  bankName: string;
  accountName: string;
  accountType: string;
  color: string;
  last4?: string | null;
}

export type MatchTier = 'exact' | 'strong' | 'weak' | 'none';

export interface RankedAccount {
  account: MatchAccount;
  tier: MatchTier;
  reason: string;
}

export interface RankResult {
  ranked: RankedAccount[];
  best: RankedAccount | null;
  suggestCreate: boolean;
}

/* Does the detected CSV type agree with an account's type? */
function typeMatches(csvType: CsvType, accountType: string): boolean {
  if (csvType === 'credit') return accountType === 'credit';
  if (csvType === 'bank') return ['checking', 'savings', 'debit', 'cash'].includes(accountType);
  if (csvType === 'investment') return accountType === 'investment';
  return false; // 'unknown' agrees with nothing
}

/* Title-case a normalized bank label ("bank of america" → "Bank of America"). */
function bankLabel(bank: string): string {
  return bank.replace(/\b\w/g, (c) => c.toUpperCase());
}

/* Rank accounts best-first against a parsed file.
   - last-4 equality  → exact
   - bank + type both agree, no last-4 conflict → strong
   - type agrees only (and no bank conflict) → weak
   Disqualifiers (tier 'none', dropped from suggestions, never pre-selected):
   - a last-4 present on BOTH sides that differs
   - a DETECTED bank that doesn't match the account's bank — a Bank of America
     file must not weak-match a Chase account just because both are checking. */
export function rankAccounts(
  accounts: MatchAccount[],
  fingerprint: CsvFingerprint,
  fileLast4: string | null,
): RankResult {
  const scored = accounts.map((account): RankedAccount => {
    const last4Conflict =
      !!fileLast4 && !!account.last4 && fileLast4 !== account.last4;
    const last4Hit = !!fileLast4 && account.last4 === fileLast4;
    const bankKnown = !!fingerprint.bank && !!account.bankName;
    const bankHit = bankKnown && bankNamesMatch(fingerprint.bank!, account.bankName);
    const bankConflict = bankKnown && !bankHit;
    const typeHit = typeMatches(fingerprint.type, account.accountType);

    if (last4Conflict) {
      return { account, tier: 'none', reason: `Different card (ends in ${account.last4})` };
    }
    if (last4Hit) {
      return { account, tier: 'exact', reason: `Matched account ending in ${fileLast4}` };
    }
    if (bankConflict) {
      return { account, tier: 'none', reason: `File is from ${bankLabel(fingerprint.bank!)}, not ${account.bankName}` };
    }
    if (bankHit && typeHit) {
      return { account, tier: 'strong', reason: `Looks like your ${account.bankName} ${account.accountType}` };
    }
    if (typeHit) {
      return { account, tier: 'weak', reason: `Best guess by account type` };
    }
    return { account, tier: 'none', reason: 'No matching signals' };
  });

  const order: Record<MatchTier, number> = { exact: 0, strong: 1, weak: 2, none: 3 };
  const ranked = [...scored].sort((a, b) => order[a.tier] - order[b.tier]);

  const best = ranked.find((r) => r.tier !== 'none') ?? null;
  return { ranked, best, suggestCreate: best === null };
}
