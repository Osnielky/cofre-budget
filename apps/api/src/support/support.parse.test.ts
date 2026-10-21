import { describe, it, expect } from 'vitest';
import { parseReport, MAX_SCREENSHOT_BYTES, isTicketStatus } from './support.parse';

const jpegDataUrl = (bytes: number) => `data:image/jpeg;base64,${Buffer.alloc(bytes, 1).toString('base64')}`;
const good = () => ({ description: 'The chart shows the wrong month after I change the range.', page: '/goals?x=1', viewport: '1440x900' });

describe('parseReport', () => {
  it('accepts a report without a screenshot and keeps only the path', () => {
    const r = parseReport(good(), 'Mozilla/5.0 Safari');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value).toMatchObject({ page: '/goals', viewport: '1440x900', userAgent: 'Mozilla/5.0 Safari', screenshot: null, screenshotType: null });
    expect(r.value.description).toBe(good().description);
  });

  it('decodes a jpeg data URL into bytes', () => {
    const r = parseReport({ ...good(), screenshot: jpegDataUrl(2048) });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.screenshot?.length).toBe(2048);
    expect(r.value.screenshotType).toBe('image/jpeg');
  });

  it('rejects descriptions that are missing, too short or too long', () => {
    expect(parseReport({ ...good(), description: 'short' }).ok).toBe(false);
    expect(parseReport({ ...good(), description: 'x'.repeat(2001) }).ok).toBe(false);
    expect(parseReport({ ...good(), description: 42 }).ok).toBe(false);
    expect(parseReport(null).ok).toBe(false);
  });

  it('rejects a page that is not a site path and caps its length', () => {
    expect(parseReport({ ...good(), page: 'https://evil.example/x' }).ok).toBe(false);
    expect(parseReport({ ...good(), page: 'goals' }).ok).toBe(false);
    const r = parseReport({ ...good(), page: '/' + 'a'.repeat(400) });
    expect(r.ok && r.value.page.length).toBe(200);
  });

  it('falls back to an unknown viewport when the value is malformed', () => {
    const r = parseReport({ ...good(), viewport: 'wide' });
    expect(r.ok && r.value.viewport).toBe('unknown');
  });

  it('rejects screenshots that are too big, not an image, or not valid base64', () => {
    expect(parseReport({ ...good(), screenshot: jpegDataUrl(MAX_SCREENSHOT_BYTES + 1) }).ok).toBe(false);
    expect(parseReport({ ...good(), screenshot: jpegDataUrl(MAX_SCREENSHOT_BYTES) }).ok).toBe(true);
    expect(parseReport({ ...good(), screenshot: 'data:text/html;base64,PGI+' }).ok).toBe(false);
    expect(parseReport({ ...good(), screenshot: 'data:image/png;base64,***not-base64***' }).ok).toBe(false);
    expect(parseReport({ ...good(), screenshot: 'https://x/y.png' }).ok).toBe(false);
  });

  it('truncates the user agent to 300 characters', () => {
    const r = parseReport(good(), 'u'.repeat(500));
    expect(r.ok && r.value.userAgent.length).toBe(300);
  });

  it('knows the four ticket statuses', () => {
    expect(isTicketStatus('in_progress')).toBe(true);
    expect(isTicketStatus('done')).toBe(false);
  });
});
