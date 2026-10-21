/* Mirrors apps/api/src/support/support.parse.ts and support.types.ts — keep in sync. */

export type TicketStatus = 'open' | 'in_progress' | 'resolved' | 'closed';

export interface MyTicket {
  id: string;
  status: TicketStatus;
  description: string;
  page: string;
  createdAt: string;
  resolvedAt: string | null;
  reply: string | null;
  hasScreenshot: boolean;
}

export const MAX_SCREENSHOT_BYTES = 1_048_576;
export const MIN_DESCRIPTION = 10;
export const MAX_DESCRIPTION = 2000;

export const STATUS_LABELS: Record<TicketStatus, string> = {
  open: 'Open',
  in_progress: 'In progress',
  resolved: 'Resolved',
  closed: 'Closed',
};

export function statusTone(status: TicketStatus): string {
  switch (status) {
    case 'resolved': return 'var(--color-green)';
    case 'in_progress': return 'var(--color-amber)';
    case 'closed': return 'var(--color-text-muted)';
    default: return 'var(--color-primary)';
  }
}

/** Null when fine, otherwise the message to show under the textarea. */
export function validateDescription(text: string): string | null {
  const n = text.trim().length;
  if (n < MIN_DESCRIPTION) return `Describe the problem in at least ${MIN_DESCRIPTION} characters.`;
  if (n > MAX_DESCRIPTION) return `Keep it under ${MAX_DESCRIPTION} characters.`;
  return null;
}

/** Decoded size of a base64 data URL, 0 for anything else. */
export function dataUrlBytes(dataUrl: string): number {
  const i = dataUrl.indexOf(';base64,');
  if (!dataUrl.startsWith('data:') || i < 0) return 0;
  const b64 = dataUrl.slice(i + 8);
  const padding = b64.endsWith('==') ? 2 : b64.endsWith('=') ? 1 : 0;
  return Math.floor((b64.length * 3) / 4) - padding;
}

export function viewportOf(w: { innerWidth: number; innerHeight: number }): string {
  return `${Math.round(w.innerWidth)}x${Math.round(w.innerHeight)}`;
}
