import { describe, it, expect, beforeEach, vi } from 'vitest';
import { DataSource } from 'typeorm';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { User } from '../users/user.entity';
import { SupportTicket } from './support-ticket.entity';
import { SupportService } from './support.service';
import type { MailService } from '../mail/mail.service';

const NOW = new Date('2026-10-21T15:00:00Z');
const DAY = 24 * 60 * 60 * 1000;

let ds: DataSource;
let service: SupportService;
let mail: { sendTicketOpened: ReturnType<typeof vi.fn>; sendTicketResolved: ReturnType<typeof vi.fn> };
let alice: User;
let bob: User;

const png = (bytes = 64) => `data:image/png;base64,${Buffer.alloc(bytes, 7).toString('base64')}`;
const report = (over: Record<string, unknown> = {}) => ({ description: 'The budget bar shows 120% when I am under budget.', page: '/budgets?m=10', viewport: '1440x900', ...over });

beforeEach(async () => {
  ds = new DataSource({ type: 'better-sqlite3', database: ':memory:', dropSchema: true, entities: [User, SupportTicket], synchronize: true });
  await ds.initialize();
  // bytea has no sqlite equivalent; the service only touches this table through raw queries.
  await ds.query('CREATE TABLE support_screenshots ("ticketId" varchar PRIMARY KEY, data BLOB NOT NULL, "mimeType" varchar NOT NULL)');
  const users = ds.getRepository(User);
  alice = await users.save(users.create({ email: 'alice@example.com', name: 'Alice', password: 'x' }));
  bob = await users.save(users.create({ email: 'bob@example.com', name: 'Bob', password: 'x' }));
  mail = { sendTicketOpened: vi.fn(async () => {}), sendTicketResolved: vi.fn(async () => {}) };
  const config = { get: (k: string, d?: string) => ({ ADMIN_EMAILS: 'owner@cofre.dev, second@cofre.dev', FRONTEND_URL: 'https://budgetcofre.com' } as Record<string, string>)[k] ?? d };
  service = new SupportService(ds, mail as unknown as MailService, config as any);
});

describe('SupportService.create', () => {
  it('stores the ticket, the screenshot, and emails every admin once', async () => {
    const t = await service.create(alice.id, report({ screenshot: png(64) }), 'Mozilla/5.0', NOW);
    expect(t).toMatchObject({ status: 'open', page: '/budgets', hasScreenshot: true, reply: null });
    const row = await ds.getRepository(SupportTicket).findOneByOrFail({ id: t.id });
    expect(row).toMatchObject({ userId: alice.id, screenshotType: 'image/png', screenshotBytes: 64, viewport: '1440x900', userAgent: 'Mozilla/5.0' });
    const [img] = await ds.query('SELECT "ticketId", "mimeType", length(data) AS n FROM support_screenshots');
    expect(img).toMatchObject({ ticketId: t.id, mimeType: 'image/png', n: 64 });
    expect(mail.sendTicketOpened).toHaveBeenCalledTimes(2);
    expect(mail.sendTicketOpened.mock.calls.map((c) => c[0]).sort()).toEqual(['owner@cofre.dev', 'second@cofre.dev']);
    expect(mail.sendTicketOpened.mock.calls[0][1]).toMatchObject({ reporter: 'Alice', page: '/budgets', link: `https://budgetcofre.com/admin?ticket=${t.id}` });
  });

  it('rejects an invalid report with the parser message and stores nothing', async () => {
    await expect(service.create(alice.id, report({ description: 'nope' }), '', NOW)).rejects.toThrow(BadRequestException);
    expect(await ds.getRepository(SupportTicket).count()).toBe(0);
    expect(mail.sendTicketOpened).not.toHaveBeenCalled();
  });

  it('still creates the ticket when the admin email fails', async () => {
    mail.sendTicketOpened.mockRejectedValueOnce(new Error('resend down'));
    const t = await service.create(alice.id, report(), '', NOW);
    expect(t.id).toBeTruthy();
  });
});

describe('SupportService for the reporter', () => {
  it('lists only the caller\'s tickets, newest first, without image bytes', async () => {
    await service.create(alice.id, report({ description: 'First report, something about the chart.' }), '', NOW);
    await service.create(alice.id, report({ description: 'Second report, something about the table.', screenshot: png() }), '', new Date(NOW.getTime() + 1000));
    await service.create(bob.id, report(), '', NOW);
    const mine = await service.listForUser(alice.id);
    expect(mine.map((t) => t.description)).toEqual(['Second report, something about the table.', 'First report, something about the chart.']);
    expect(mine[0].hasScreenshot).toBe(true);
    expect(JSON.stringify(mine)).not.toContain('adminNote');
    expect(JSON.stringify(mine)).not.toContain('"data"');
  });

  it('serves the screenshot to its owner and to admins, and 404s everyone else', async () => {
    const t = await service.create(alice.id, report({ screenshot: png(10) }), '', NOW);
    const own = await service.screenshot(t.id, { id: alice.id, isAdmin: false });
    expect(own?.mimeType).toBe('image/png');
    expect(Buffer.isBuffer(own?.data) && own.data.length).toBe(10);
    expect(await service.screenshot(t.id, { id: 'nobody', isAdmin: true })).not.toBeNull();
    expect(await service.screenshot(t.id, { id: bob.id, isAdmin: false })).toBeNull();
    const plain = await service.create(alice.id, report(), '', NOW);
    expect(await service.screenshot(plain.id, { id: alice.id, isAdmin: false })).toBeNull();
  });
});

describe('SupportService for admins', () => {
  it('lists by status with counts and the reporter', async () => {
    const a = await service.create(alice.id, report(), '', NOW);
    await service.create(bob.id, report(), '', new Date(NOW.getTime() + 1000));
    await service.adminPatch(a.id, { status: 'in_progress' }, NOW);
    const open = await service.adminList({ status: 'open' });
    expect(open.tickets.map((t) => t.user.email)).toEqual(['bob@example.com']);
    expect(open.counts).toEqual({ open: 1, in_progress: 1, resolved: 0, closed: 0 });
    const all = await service.adminList({});
    expect(all.tickets).toHaveLength(2);
    expect(all.total).toBe(2);
  });

  it('sets and clears resolvedAt as the status moves', async () => {
    const t = await service.create(alice.id, report(), '', NOW);
    const done = await service.adminPatch(t.id, { status: 'closed' }, NOW);
    expect(done.resolvedAt).toBe(NOW.toISOString());
    const back = await service.adminPatch(t.id, { status: 'open' }, new Date(NOW.getTime() + DAY));
    expect(back.resolvedAt).toBeNull();
  });

  it('emails the reporter once when resolved with a reply', async () => {
    const t = await service.create(alice.id, report(), '', NOW);
    await service.adminPatch(t.id, { status: 'resolved' }, NOW);
    expect(mail.sendTicketResolved).not.toHaveBeenCalled();
    const r = await service.adminPatch(t.id, { reply: 'Fixed in today\'s release — thanks!' }, NOW);
    expect(mail.sendTicketResolved).toHaveBeenCalledTimes(1);
    expect(mail.sendTicketResolved.mock.calls[0][0]).toBe('alice@example.com');
    expect(r.replySentAt).toBe(NOW.toISOString());
    await service.adminPatch(t.id, { reply: 'Edited reply', status: 'resolved' }, NOW);
    expect(mail.sendTicketResolved).toHaveBeenCalledTimes(1);
    expect((await service.listForUser(alice.id))[0].reply).toBe('Edited reply');
  });

  it('rejects unknown statuses and ignores unknown fields', async () => {
    const t = await service.create(alice.id, report(), '', NOW);
    await expect(service.adminPatch(t.id, { status: 'done' }, NOW)).rejects.toThrow(BadRequestException);
    const r = await service.adminPatch(t.id, { adminNote: 'check the budgets math', userId: bob.id, id: 'x' } as any, NOW);
    expect(r.adminNote).toBe('check the budgets math');
    expect((await ds.getRepository(SupportTicket).findOneByOrFail({ id: t.id })).userId).toBe(alice.id);
    await expect(service.adminPatch('00000000-0000-0000-0000-000000000000', {}, NOW)).rejects.toThrow(NotFoundException);
  });
});

describe('SupportService.sweep', () => {
  it('drops screenshots of tickets resolved more than 90 days ago, keeps the rest', async () => {
    const old = await service.create(alice.id, report({ screenshot: png() }), '', NOW);
    const fresh = await service.create(alice.id, report({ screenshot: png() }), '', NOW);
    const open = await service.create(alice.id, report({ screenshot: png() }), '', NOW);
    await service.adminPatch(old.id, { status: 'resolved' }, new Date(NOW.getTime() - 91 * DAY));
    await service.adminPatch(fresh.id, { status: 'resolved' }, new Date(NOW.getTime() - 10 * DAY));
    const n = await service.sweep(NOW);
    expect(n).toBe(1);
    expect((await ds.query('SELECT "ticketId" FROM support_screenshots')).map((r: any) => r.ticketId).sort()).toEqual([fresh.id, open.id].sort());
    const mine = await service.listForUser(alice.id);
    expect(mine.find((t) => t.id === old.id)?.hasScreenshot).toBe(false);
    expect(mine.find((t) => t.id === fresh.id)?.hasScreenshot).toBe(true);
  });
});
