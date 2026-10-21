/**
 * Validation for problem reports. Pure, so every branch is unit-tested and the
 * controller never has to reason about untrusted bodies.
 */

export const TICKET_STATUSES = ['open', 'in_progress', 'resolved', 'closed'] as const;
export type TicketStatus = (typeof TICKET_STATUSES)[number];
export const isTicketStatus = (s: unknown): s is TicketStatus => typeof s === 'string' && (TICKET_STATUSES as readonly string[]).includes(s);

export const MAX_SCREENSHOT_BYTES = 1_048_576;
export const MIN_DESCRIPTION = 10;
export const MAX_DESCRIPTION = 2000;
const MAX_PAGE = 200;
const MAX_USER_AGENT = 300;
const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
const DATA_URL = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/]+={0,2})$/;

export interface ParsedReport {
  description: string;
  page: string;
  viewport: string;
  userAgent: string;
  screenshot: Buffer | null;
  screenshotType: (typeof IMAGE_TYPES)[number] | null;
}

export type ParseResult = { ok: true; value: ParsedReport } | { ok: false; message: string };

const fail = (message: string): ParseResult => ({ ok: false, message });

export function parseReport(body: unknown, userAgent?: string): ParseResult {
  if (!body || typeof body !== 'object') return fail('Tell us what went wrong.');
  const b = body as Record<string, unknown>;

  const description = typeof b.description === 'string' ? b.description.trim() : '';
  if (description.length < MIN_DESCRIPTION) return fail(`Describe the problem in at least ${MIN_DESCRIPTION} characters.`);
  if (description.length > MAX_DESCRIPTION) return fail(`Keep the description under ${MAX_DESCRIPTION} characters.`);

  const rawPage = typeof b.page === 'string' ? b.page : '';
  if (!rawPage.startsWith('/') || rawPage.startsWith('//')) return fail('Invalid page.');
  const page = rawPage.split('?')[0].split('#')[0].slice(0, MAX_PAGE);

  const viewport = typeof b.viewport === 'string' && /^\d{2,5}x\d{2,5}$/.test(b.viewport) ? b.viewport : 'unknown';

  let screenshot: Buffer | null = null;
  let screenshotType: ParsedReport['screenshotType'] = null;
  if (b.screenshot != null && b.screenshot !== '') {
    if (typeof b.screenshot !== 'string') return fail('The screenshot must be an image.');
    const m = DATA_URL.exec(b.screenshot);
    if (!m) return fail('The screenshot must be a JPEG, PNG or WebP image.');
    // Base64 inflates by 4/3; refuse before decoding anything huge.
    if (m[2].length > Math.ceil((MAX_SCREENSHOT_BYTES * 4) / 3) + 4) return fail('The screenshot must be under 1 MB.');
    const bytes = Buffer.from(m[2], 'base64');
    if (bytes.length === 0 || bytes.length > MAX_SCREENSHOT_BYTES) return fail('The screenshot must be under 1 MB.');
    screenshot = bytes;
    screenshotType = m[1] as ParsedReport['screenshotType'];
  }

  return {
    ok: true,
    value: { description, page, viewport, userAgent: (userAgent ?? '').slice(0, MAX_USER_AGENT), screenshot, screenshotType },
  };
}
