import { describe, it, expect } from 'vitest';
import { proxyRequestHeaders, PROXY_CLIENT_IP_HEADER, PROXY_KEY_HEADER } from './proxy-headers';

const SECRET = 's3cret';

describe('proxyRequestHeaders', () => {
  it('forwards the address Cloud Run appended, not what the client claimed', () => {
    const incoming = new Headers({ 'x-forwarded-for': '10.0.0.1, 203.0.113.7' });
    const out = proxyRequestHeaders(incoming, SECRET);
    expect(out.get(PROXY_CLIENT_IP_HEADER)).toBe('203.0.113.7');
    expect(out.get(PROXY_KEY_HEADER)).toBe(SECRET);
  });

  it('drops client-supplied proxy headers', () => {
    const incoming = new Headers({
      'x-forwarded-for': '203.0.113.7',
      [PROXY_CLIENT_IP_HEADER]: '1.2.3.4',
      [PROXY_KEY_HEADER]: 'guess',
    });
    expect(proxyRequestHeaders(incoming, undefined).has(PROXY_CLIENT_IP_HEADER)).toBe(false);
    expect(proxyRequestHeaders(incoming, undefined).has(PROXY_KEY_HEADER)).toBe(false);
    expect(proxyRequestHeaders(incoming, SECRET).get(PROXY_CLIENT_IP_HEADER)).toBe('203.0.113.7');
  });

  it('adds nothing when there is no forwarded address', () => {
    const out = proxyRequestHeaders(new Headers(), SECRET);
    expect(out.has(PROXY_CLIENT_IP_HEADER)).toBe(false);
    expect(out.has(PROXY_KEY_HEADER)).toBe(false);
  });

  it('keeps the rest of the request headers', () => {
    const out = proxyRequestHeaders(new Headers({ cookie: 'access_token=abc', 'x-forwarded-for': '203.0.113.7' }), SECRET);
    expect(out.get('cookie')).toBe('access_token=abc');
  });
});
