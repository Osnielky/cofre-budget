import { CountryCode } from 'plaid';

/* Which countries Plaid Link offers institutions for. US only by default; each
   extra country must first be enabled for the client in the Plaid dashboard
   (UK and EU need Plaid's European agreement), because Plaid rejects a link
   token naming a country the client is not approved for, which breaks linking
   for everyone. Set PLAID_COUNTRY_CODES="US,CA" in deploy/ci-deploy.sh once
   approved; unknown or malformed entries are dropped, never passed through. */

export const DEFAULT_PLAID_COUNTRIES: CountryCode[] = [CountryCode.Us];

const KNOWN = new Set<string>(Object.values(CountryCode));

export function parsePlaidCountries(raw: string | undefined): CountryCode[] {
  if (!raw) return DEFAULT_PLAID_COUNTRIES;
  const codes = raw
    .split(',')
    .map((s) => s.trim().toUpperCase())
    .filter((s) => KNOWN.has(s)) as CountryCode[];
  const unique = [...new Set(codes)];
  return unique.length > 0 ? unique : DEFAULT_PLAID_COUNTRIES;
}
