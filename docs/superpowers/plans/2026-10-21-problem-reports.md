# Problem Reports Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Signed-in users report a problem with an auto-captured screenshot; each report is a ticket the admin works in `/admin`, and the user follows it in Settings → Help.

**Architecture:** New `support/` NestJS module (entity, pure parser, service, controller) plus three admin routes; web gets a capture modal, a sidebar entry, a Settings Help tab and an admin Tickets panel. Images are `bytea` with `select: false`, served by one endpoint.

**Tech Stack:** NestJS 11 + TypeORM (Postgres, sqlite in tests), Resend mail, Next.js 16, `html-to-image` for capture, Vitest.

**Spec:** `docs/superpowers/specs/2026-10-21-problem-reports-design.md`

## Global Constraints

- Never log descriptions, replies or images (CLAUDE.md logging rule).
- Copy request fields with `pickFields` / one by one — never spread bodies onto entities.
- Entities and migrations are listed explicitly (`config/entities.ts`, `migrations/index.ts`); `migrations.test.ts` adoption case must drop `support_tickets`.
- `@BlockedInDemo()` on ticket creation. Screenshot ≤ 1 048 576 bytes, mime jpeg/png/webp. Description 10–2000 chars.
- Every screen checked at ~390, 768, 1440.

## Review Focus

1. A data URL with a valid prefix but invalid base64 → 400, not a crash. (`parseReport` test)
2. A user requesting another user's screenshot → 404, no bytes. (`service.screenshot` test)
3. PATCH to `resolved` twice with a reply → one email. (`replySentAt` test)
4. Listing tickets must not load `screenshot` bytes. (`list` test asserts the column is absent)
5. Capture failure in the browser (cross-origin image) → the dialog still submits without an image. (manual; the modal catches and shows the fallback)

---

### Task 1: `parseReport` (pure validation)
**Files:** Create `apps/api/src/support/support.parse.ts`, `support.parse.test.ts`.
**Produces:** `parseReport(body: unknown, userAgent?: string): { ok: true; value: ParsedReport } | { ok: false; message: string }` where `ParsedReport = { description, page, viewport, userAgent, screenshot: Buffer | null, screenshotType: string | null }`; `MAX_SCREENSHOT_BYTES`, `TICKET_STATUSES`, `isTicketStatus`.
- [ ] Tests: description too short/long/non-string; page must start with `/`, query dropped, cut at 200; viewport regex; screenshot mime allowed set; decoded size > 1 MB rejected; bad base64 rejected; missing screenshot → null; userAgent truncated to 300.
- [ ] Implement, run, commit `feat(support): parse problem reports`.

### Task 2: entity + migration
**Files:** Create `apps/api/src/support/support-ticket.entity.ts`; modify `config/entities.ts`, `migrations/index.ts`, `migrations/migrations.test.ts` (adoption drop).
- [ ] Entity per spec table (`screenshot` `bytea` with `select: false`; sqlite maps `bytea` → use `type: 'bytea'` only on postgres? TypeORM sqlite rejects `bytea` → use `{ type: 'blob' }`? No: keep Postgres `bytea` and give tests a `blob` via the same trick other entities use — check `credit-card-detail.entity.ts` for a driver-conditional pattern; if none, store as `type: 'bytea'` and in sqlite tests create the table by hand like `admin.test-db.ts` does for jsonb tables).
- [ ] `npm run migration:generate -- SupportTickets`, append to index, add `DROP TABLE "support_tickets"` to the adoption case, `npm run migration:check`.
- [ ] Commit `feat(support): support_tickets table`.

### Task 3: `SupportService` + mail
**Files:** Create `support.service.ts`, `support.service.test.ts`, `support.types.ts`; modify `mail/mail.service.ts` (+ test).
**Produces:** `create(userId, body, userAgent)`, `listForUser(userId)`, `screenshot(id, userId, isAdmin)`, `adminList({status,page})`, `adminGet(id)`, `adminPatch(id, body)`, `sweep(now)`; mail `sendTicketOpened`, `sendTicketResolved`.
- [ ] Tests (sqlite): create stores row + calls `sendTicketOpened` once per admin email; list excludes bytes & includes `hasScreenshot`; screenshot owner ok / other user 404 / admin ok; patch status transitions set/clear `resolvedAt`; resolved + reply emails once; sweep nulls old screenshots only.
- [ ] Implement; commit `feat(support): ticket service and emails`.

### Task 4: controllers + module
**Files:** Create `support.controller.ts`, `support.module.ts`; modify `admin/admin.controller.ts`, `admin/admin.module.ts`, `app/app.module.ts`.
- [ ] `POST /support/tickets` (`JwtAuthGuard`, `@BlockedInDemo`, `@Throttle 5/15min`), `GET /support/tickets`, `GET /support/tickets/:id/screenshot` (sets content-type, cache-control private). Admin: `GET /admin/tickets`, `GET /admin/tickets/:id`, `PATCH /admin/tickets/:id`.
- [ ] Controller test for the screenshot route headers; commit `feat(support): routes`.

### Task 5: web helpers + modal + sidebar
**Files:** Create `apps/web/src/lib/support/report.ts` (+ test), `components/support/ReportProblemModal.tsx`, `components/support/capture.ts`; modify `components/Sidebar.tsx`; `npm i html-to-image`.
- [ ] Tests: `validateDescription`, `dataUrlBytes`, `STATUS_LABELS`.
- [ ] Modal per spec (capture before paint, preview, retake/remove/upload, re-encode >1 MB, submit, success, demo 403 message). Sidebar item above Settings; `data-no-capture` on the modal root.
- [ ] Commit `feat(support): report a problem dialog`.

### Task 6: Settings → Help tab
**Files:** modify `app/settings/page.tsx`; create `components/support/MyTicketsList.tsx`.
- [ ] Tab `help` ("Help & feedback"), allowed in the `?tab=` list; cards per spec; empty state; support email.
- [ ] Commit `feat(support): help tab with my reports`.

### Task 7: Admin Tickets panel
**Files:** modify `hooks/useAdmin.ts`, `lib/admin/types.ts`, `app/admin/page.tsx`; create `app/admin/components/TicketsPanel.tsx`.
- [ ] `useAdminTickets(status,page,refreshKey)`, `useAdminTicket(id)`, `patchTicket`. Panel with tabs + counts, table, drawer, `?ticket=` deep link.
- [ ] Commit `feat(admin): tickets queue`.

### Task 8: privacy + docs + verification
- [ ] Privacy §1/§7 paragraph; CLAUDE.md rows (API `support/`, web modal/help/admin); BACKLOG follow-ups (threads, Slack hook, GCS).
- [ ] `npm run test:api`, `npm run test:dashboard`, tsc, `migration:check`; screenshots of modal, Help tab, admin drawer at 390/768/1440.
- [ ] Commit `docs(support): document problem reports`.
