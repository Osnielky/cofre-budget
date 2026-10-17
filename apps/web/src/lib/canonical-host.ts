/**
 * www.<domain> → <domain>. Cookies are per host, and the OAuth callbacks and
 * email links all use the bare domain, so a session started on www would
 * silently not exist there. Returns the redirect target, or null to stay.
 */
export function canonicalRedirect(host: string | null, pathname: string, search: string): string | null {
  if (!host || !host.startsWith('www.')) return null;
  return `https://${host.slice(4)}${pathname}${search}`;
}
