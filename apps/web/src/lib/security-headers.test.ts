import { describe, it, expect } from 'vitest';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { securityHeaders } = require('../../security-headers.js');

const get = (name: string, prod = true) =>
  (securityHeaders(prod) as Array<{ key: string; value: string }>).find((h) => h.key.toLowerCase() === name.toLowerCase())?.value;

describe('securityHeaders', () => {
  it('forbids other sites from framing the app (clickjacking)', () => {
    expect(get('Content-Security-Policy')).toContain("frame-ancestors 'none'");
    expect(get('X-Frame-Options')).toBe('DENY');
  });

  it('keeps reset-link tokens out of the Referer sent to other sites', () => {
    expect(get('Referrer-Policy')).toBe('strict-origin-when-cross-origin');
  });

  it('pins HTTPS in production only (localhost is plain http)', () => {
    expect(get('Strict-Transport-Security')).toMatch(/max-age=\d{8,}/);
    expect(get('Strict-Transport-Security', false)).toBeUndefined();
  });

  it('stops MIME sniffing and locks down plugins, base and form targets', () => {
    expect(get('X-Content-Type-Options')).toBe('nosniff');
    const csp = get('Content-Security-Policy')!;
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("base-uri 'self'");
    expect(csp).toContain("form-action 'self'");
  });

  // Plaid Link injects a script and an iframe from cdn.plaid.com; a script-src
  // or frame-src here would break bank linking.
  it('does not restrict scripts or frames the app loads', () => {
    const csp = get('Content-Security-Policy')!;
    expect(csp).not.toMatch(/script-src|frame-src|default-src/);
  });
});
