// @ts-check
/**
 * Security headers for every page the web app serves (next.config.js headers()).
 * No script-src / frame-src / default-src: Plaid Link injects a script and an
 * iframe from cdn.plaid.com and Next inlines bootstrap scripts, so a content
 * allow-list would need per-request nonces. What is here blocks clickjacking,
 * MIME sniffing, <base>/<object> injection and cross-site form targets, and
 * keeps URL tokens (reset links) out of the Referer sent to other sites.
 *
 * @param {boolean} isProd
 * @returns {{ key: string, value: string }[]}
 */
function securityHeaders(isProd) {
  return [
    { key: 'Content-Security-Policy', value: "frame-ancestors 'none'; base-uri 'self'; object-src 'none'; form-action 'self'" },
    { key: 'X-Frame-Options', value: 'DENY' },
    { key: 'X-Content-Type-Options', value: 'nosniff' },
    { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
    { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=()' },
    // Browsers ignore HSTS over plain http, but keep localhost clean anyway.
    ...(isProd ? [{ key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' }] : []),
  ];
}

module.exports = { securityHeaders };
