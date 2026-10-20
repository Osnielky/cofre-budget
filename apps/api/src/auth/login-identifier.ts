import { DEMO_LOGIN_DOMAIN } from '../demo/demo.service';

/**
 * The login form takes an email, but the demo account is announced as
 * "Rockefeller" / "demo". An identifier with no "@" is treated as a name
 * under the demo domain; real emails pass through untouched.
 */
export function normaliseLoginIdentifier(identifier: string): string {
  const trimmed = (identifier ?? '').trim();
  if (!trimmed || trimmed.includes('@')) return trimmed;
  return `${trimmed.toLowerCase()}@${DEMO_LOGIN_DOMAIN}`;
}
