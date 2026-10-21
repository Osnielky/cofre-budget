import { Injectable, Logger, BadRequestException, NotFoundException, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource, Repository } from 'typeorm';
import { SupportTicket } from './support-ticket.entity';
import { parseReport, isTicketStatus, TICKET_STATUSES, type TicketStatus } from './support.parse';
import type { MyTicket, AdminTicket, AdminTicketPage } from './support.types';
import { MailService } from '../mail/mail.service';
import { pickFields } from '../common/http/pick-fields';

const PAGE_SIZE = 20;
const SCREENSHOT_RETENTION_DAYS = 90;
const MAX_REPLY = 4000;
const EXCERPT = 300;
const iso = (d: Date | string | null | undefined) => (d == null ? null : new Date(d).toISOString());

interface Requester { id: string; isAdmin: boolean }
interface AdminPatch { status?: unknown; reply?: unknown; adminNote?: unknown }

/**
 * Problem reports: creation (with the image written to `support_screenshots`
 * by raw query, never through the entity), the reporter's view, the admin
 * queue, and the 90-day screenshot sweep. Nothing here logs descriptions,
 * replies, emails or images — only ticket ids and statuses.
 */
@Injectable()
export class SupportService {
  private readonly logger = new Logger(SupportService.name);
  private readonly tickets: Repository<SupportTicket>;
  private readonly adminEmails: string[];
  private readonly appUrl: string;

  constructor(private readonly ds: DataSource, private readonly mail: MailService, @Optional() config?: ConfigService) {
    this.tickets = ds.getRepository(SupportTicket);
    this.adminEmails = (config?.get<string>('ADMIN_EMAILS') ?? '').split(',').map((e) => e.trim().toLowerCase()).filter(Boolean);
    this.appUrl = config?.get<string>('FRONTEND_URL') ?? 'http://localhost:3000';
  }

  async onApplicationBootstrap(): Promise<void> {
    await this.sweep(new Date()).catch((err) => this.logger.error('Screenshot sweep failed', err as Error));
  }

  async create(userId: string, body: unknown, userAgent: string | undefined, now = new Date()): Promise<MyTicket> {
    const parsed = parseReport(body, userAgent);
    if (!parsed.ok) throw new BadRequestException(parsed.message);
    const v = parsed.value;

    const ticket = await this.ds.transaction(async (em) => {
      const t = await em.getRepository(SupportTicket).save(em.getRepository(SupportTicket).create({
        userId, status: 'open', description: v.description, page: v.page, viewport: v.viewport, userAgent: v.userAgent,
        screenshotType: v.screenshotType, screenshotBytes: v.screenshot?.length ?? 0, createdAt: now, updatedAt: now,
      }));
      if (v.screenshot && v.screenshotType) {
        await em.createQueryBuilder().insert().into('support_screenshots').values({ ticketId: t.id, data: v.screenshot, mimeType: v.screenshotType }).execute();
      }
      return t;
    });
    this.logger.log(`Ticket ${ticket.id} opened`);

    const reporter = await this.ds.createQueryBuilder().select('u.name', 'name').from('users', 'u').where('u.id = :id', { id: userId }).getRawOne<{ name: string | null }>();
    const excerpt = v.description.slice(0, EXCERPT);
    await Promise.all(this.adminEmails.map((to) =>
      this.mail.sendTicketOpened(to, { reporter: reporter?.name ?? 'A user', page: v.page, excerpt, link: `${this.appUrl}/admin?ticket=${ticket.id}` })
        .catch((err) => this.logger.error(`Admin email for ticket ${ticket.id} failed`, err as Error)),
    ));
    return this.mine(ticket);
  }

  async listForUser(userId: string): Promise<MyTicket[]> {
    const rows = await this.tickets.find({ where: { userId }, order: { createdAt: 'DESC', id: 'DESC' } });
    return rows.map((t) => this.mine(t));
  }

  /** Image bytes for the owner or an admin; null when there is no image or no access (callers answer 404 either way). */
  async screenshot(id: string, who: Requester): Promise<{ data: Buffer; mimeType: string } | null> {
    const t = await this.tickets.findOne({ where: { id }, select: { id: true, userId: true, screenshotType: true } });
    if (!t || (!who.isAdmin && t.userId !== who.id) || !t.screenshotType) return null;
    const row = await this.ds.createQueryBuilder().select('s.data', 'data').addSelect('s."mimeType"', 'mimeType')
      .from('support_screenshots', 's').where('s."ticketId" = :id', { id }).getRawOne<{ data: Buffer; mimeType: string }>();
    return row?.data ? { data: Buffer.from(row.data), mimeType: row.mimeType } : null;
  }

  async adminList(q: { status?: unknown; page?: unknown }): Promise<AdminTicketPage> {
    const status = isTicketStatus(q.status) ? q.status : null;
    const base = () => {
      const qb = this.tickets.createQueryBuilder('t');
      if (status) qb.where('t.status = :status', { status });
      return qb;
    };
    const total = await base().getCount();
    const lastPage = Math.max(1, Math.ceil(total / PAGE_SIZE));
    const asked = Math.floor(Number(q.page));
    const page = Number.isFinite(asked) && asked >= 1 ? Math.min(asked, lastPage) : 1;
    const rows = await base().orderBy('t.createdAt', 'DESC').addOrderBy('t.id', 'DESC').offset((page - 1) * PAGE_SIZE).limit(PAGE_SIZE).getMany();

    const countRows = await this.tickets.createQueryBuilder('t').select('t.status', 'status').addSelect('COUNT(*)', 'n').groupBy('t.status').getRawMany<{ status: TicketStatus; n: string | number }>();
    const counts = Object.fromEntries(TICKET_STATUSES.map((s) => [s, 0])) as Record<TicketStatus, number>;
    for (const r of countRows) if (isTicketStatus(r.status)) counts[r.status] = Number(r.n);

    const tickets = await Promise.all(rows.map((t) => this.admin(t)));
    return { tickets, page, lastPage, total, counts };
  }

  async adminGet(id: string): Promise<AdminTicket> {
    const t = await this.tickets.findOneBy({ id });
    if (!t) throw new NotFoundException();
    return this.admin(t);
  }

  async adminPatch(id: string, body: AdminPatch, now = new Date()): Promise<AdminTicket> {
    const t = await this.tickets.findOneBy({ id });
    if (!t) throw new NotFoundException();
    const patch = pickFields(body ?? {}, ['status', 'reply', 'adminNote'] as const);

    if (patch.status !== undefined) {
      if (!isTicketStatus(patch.status)) throw new BadRequestException('Unknown status.');
      const wasDone = t.status === 'resolved' || t.status === 'closed';
      const isDone = patch.status === 'resolved' || patch.status === 'closed';
      t.status = patch.status;
      if (isDone && !wasDone) t.resolvedAt = now;
      if (!isDone) t.resolvedAt = null;
    }
    if (patch.reply !== undefined) {
      if (patch.reply !== null && typeof patch.reply !== 'string') throw new BadRequestException('Invalid reply.');
      t.reply = patch.reply ? String(patch.reply).trim().slice(0, MAX_REPLY) || null : null;
    }
    if (patch.adminNote !== undefined) {
      if (patch.adminNote !== null && typeof patch.adminNote !== 'string') throw new BadRequestException('Invalid note.');
      t.adminNote = patch.adminNote ? String(patch.adminNote).trim().slice(0, MAX_REPLY) || null : null;
    }
    t.updatedAt = now;
    await this.tickets.save(t);
    this.logger.log(`Ticket ${t.id} → ${t.status}`);

    if (t.status === 'resolved' && t.reply && !t.replySentAt) {
      const user = await this.ds.createQueryBuilder().select(['u.email AS email', 'u.name AS name']).from('users', 'u').where('u.id = :id', { id: t.userId }).getRawOne<{ email: string; name: string | null }>();
      if (user?.email) {
        try {
          await this.mail.sendTicketResolved(user.email, user.name ?? '', { excerpt: t.description.slice(0, EXCERPT), reply: t.reply });
          t.replySentAt = now;
          await this.tickets.save(t);
        } catch (err) {
          this.logger.error(`Resolved email for ticket ${t.id} failed`, err as Error);
        }
      }
    }
    return this.admin(t);
  }

  /** Deletes screenshots of tickets resolved/closed more than 90 days ago. Returns how many. */
  async sweep(now: Date): Promise<number> {
    const cutoff = new Date(now.getTime() - SCREENSHOT_RETENTION_DAYS * 24 * 60 * 60 * 1000);
    const stale = await this.tickets.createQueryBuilder('t').select('t.id', 'id')
      .where('t.resolvedAt IS NOT NULL').andWhere('t.resolvedAt < :cutoff', { cutoff }).andWhere('t.screenshotType IS NOT NULL').getRawMany<{ id: string }>();
    const ids = stale.map((r) => r.id);
    if (!ids.length) return 0;
    await this.ds.transaction(async (em) => {
      await em.createQueryBuilder().delete().from('support_screenshots').where('"ticketId" IN (:...ids)', { ids }).execute();
      await em.getRepository(SupportTicket).createQueryBuilder().update().set({ screenshotType: null, screenshotBytes: 0 }).where('id IN (:...ids)', { ids }).execute();
    });
    this.logger.log(`Swept ${ids.length} old screenshot(s)`);
    return ids.length;
  }

  private mine(t: SupportTicket): MyTicket {
    return {
      id: t.id, status: t.status, description: t.description, page: t.page,
      createdAt: iso(t.createdAt)!, resolvedAt: iso(t.resolvedAt), reply: t.reply ?? null, hasScreenshot: !!t.screenshotType,
    };
  }

  private async admin(t: SupportTicket): Promise<AdminTicket> {
    const user = await this.ds.createQueryBuilder().select(['u.id AS id', 'u.name AS name', 'u.email AS email']).from('users', 'u').where('u.id = :id', { id: t.userId }).getRawOne<{ id: string; name: string | null; email: string | null }>();
    return {
      ...this.mine(t),
      viewport: t.viewport, userAgent: t.userAgent, screenshotBytes: t.screenshotBytes,
      adminNote: t.adminNote ?? null, replySentAt: iso(t.replySentAt), updatedAt: iso(t.updatedAt)!,
      user: user ?? { id: t.userId, name: null, email: null },
    };
  }
}
