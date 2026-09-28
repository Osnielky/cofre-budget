// Must match apps/api/src/common/client-ip-throttler.guard.ts.
export const PROXY_CLIENT_IP_HEADER = 'x-cofre-client-ip';
export const PROXY_KEY_HEADER = 'x-cofre-proxy-key';

/**
 * Headers for a request the web service proxies to the API. The API sees every
 * proxied request coming from this service, so it rate-limits by the client IP
 * forwarded here, trusting it only alongside the shared secret.
 *
 * Cloud Run's front end appends the caller's address to X-Forwarded-For, so the
 * last entry is the real client; earlier entries are whatever the client sent.
 */
export function proxyRequestHeaders(incoming: Headers, secret: string | undefined): Headers {
  const headers = new Headers(incoming);
  headers.delete(PROXY_CLIENT_IP_HEADER);
  headers.delete(PROXY_KEY_HEADER);

  const clientIp = incoming.get('x-forwarded-for')?.split(',').map((s) => s.trim()).filter(Boolean).pop();
  if (secret && clientIp) {
    headers.set(PROXY_CLIENT_IP_HEADER, clientIp);
    headers.set(PROXY_KEY_HEADER, secret);
  }
  return headers;
}
