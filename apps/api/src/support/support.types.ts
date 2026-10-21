import type { TicketStatus } from './support.parse';

/** What the reporter sees. Mirrored in apps/web/src/lib/support/report.ts. */
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

/** What the admin queue sees. Mirrored in apps/web/src/lib/admin/types.ts. */
export interface AdminTicket extends MyTicket {
  viewport: string;
  userAgent: string;
  screenshotBytes: number;
  adminNote: string | null;
  replySentAt: string | null;
  updatedAt: string;
  user: { id: string; name: string | null; email: string | null };
}

export interface AdminTicketPage {
  tickets: AdminTicket[];
  page: number;
  lastPage: number;
  total: number;
  counts: Record<TicketStatus, number>;
}
