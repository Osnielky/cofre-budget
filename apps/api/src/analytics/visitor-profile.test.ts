import { describe, it, expect } from 'vitest';
import { parseUserAgent, primaryLanguage, parseUtm, isPublicIp } from './visitor-profile';

describe('parseUserAgent', () => {
  it('recognises desktop Chrome on macOS', () => {
    expect(parseUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36'))
      .toEqual({ device: 'desktop', browser: 'Chrome', os: 'macOS' });
  });
  it('recognises iPhone Safari as mobile iOS', () => {
    expect(parseUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1'))
      .toEqual({ device: 'mobile', browser: 'Safari', os: 'iOS' });
  });
  it('recognises an Android tablet and Samsung browser', () => {
    expect(parseUserAgent('Mozilla/5.0 (Linux; Android 14; SM-X910) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/24.0 Chrome/117.0.0.0 Safari/537.36'))
      .toEqual({ device: 'tablet', browser: 'Samsung Internet', os: 'Android' });
  });
  it('recognises Edge on Windows and Firefox on Linux', () => {
    expect(parseUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Safari/537.36 Edg/144.0.0.0').browser).toBe('Edge');
    expect(parseUserAgent('Mozilla/5.0 (X11; Linux x86_64; rv:130.0) Gecko/20100101 Firefox/130.0')).toEqual({ device: 'desktop', browser: 'Firefox', os: 'Linux' });
  });
  it('treats iPad as a tablet and unknown agents as unknown', () => {
    expect(parseUserAgent('Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1').device).toBe('tablet');
    expect(parseUserAgent('')).toEqual({ device: 'unknown', browser: 'Other', os: 'Other' });
  });
});

describe('primaryLanguage', () => {
  it('takes the first tag, lower-cased, without quality values', () => {
    expect(primaryLanguage('es-US,es;q=0.9,en;q=0.8')).toBe('es-us');
    expect(primaryLanguage('EN')).toBe('en');
    expect(primaryLanguage(undefined)).toBeNull();
    expect(primaryLanguage('*')).toBeNull();
    expect(primaryLanguage('x'.repeat(40))).toHaveLength(10);
  });
});

describe('parseUtm', () => {
  it('reads utm_source, utm_medium and utm_campaign from a query string', () => {
    expect(parseUtm('?utm_source=reddit&utm_medium=post&utm_campaign=launch&x=1')).toEqual({ utmSource: 'reddit', utmMedium: 'post', utmCampaign: 'launch' });
  });
  it('lower-cases, trims, caps at 100 and returns nulls when absent', () => {
    expect(parseUtm('?utm_source=%20NewsLetter%20')).toEqual({ utmSource: 'newsletter', utmMedium: null, utmCampaign: null });
    expect(parseUtm('?utm_campaign=' + 'c'.repeat(200)).utmCampaign).toHaveLength(100);
    expect(parseUtm('')).toEqual({ utmSource: null, utmMedium: null, utmCampaign: null });
    expect(parseUtm(undefined)).toEqual({ utmSource: null, utmMedium: null, utmCampaign: null });
  });
});

describe('isPublicIp', () => {
  it('skips loopback, private and unspecified addresses', () => {
    expect(isPublicIp('127.0.0.1')).toBe(false);
    expect(isPublicIp('::1')).toBe(false);
    expect(isPublicIp('10.1.2.3')).toBe(false);
    expect(isPublicIp('192.168.0.9')).toBe(false);
    expect(isPublicIp('172.16.5.5')).toBe(false);
    expect(isPublicIp('')).toBe(false);
    expect(isPublicIp('203.0.113.9')).toBe(true);
    expect(isPublicIp('2606:4700::1111')).toBe(true);
  });
});
