# Problem reports (support tickets) — design

Date: 2026-10-21
Status: built (same day). One change from the proposal: the image bytes live in a
side table `support_screenshots` (`ticketId` PK, `data` bytea, `mimeType`) instead of a
`select: false` column, because the sqlite test driver has no `bytea`; the ticket row
keeps `screenshotType` / `screenshotBytes` so lists never touch the image table.

## Goal

Any signed-in user can report a problem from the screen where it happened, with a
screenshot and a description, in under a minute. Every report becomes a ticket the
admin works through in `/admin`. The user can follow their reports and gets an email
when one is resolved.

## Decisions

- **Screenshot is captured automatically** when the dialog opens (the current page,
  rendered in the browser with `html-to-image`; no browser permission prompt), shown as a
  preview the user can retake, remove, or replace with an uploaded image.
- **Images live in Postgres** (`bytea`, JPEG/PNG/WebP, ≤ 1 MB after client-side
  compression). Volume is low (a handful a week), Cloud SQL encrypts at rest, and it
  needs no new infrastructure. If reports ever outgrow this, the column moves to Cloud
  Storage behind the same endpoint.
- **Admins are emailed** on every new ticket (Resend, one mail per `ADMIN_EMAILS`
  address, linking straight to the ticket).
- **The user sees their tickets** in Settings → Help with a status, the admin's reply,
  and their screenshot; marking a ticket Resolved with a reply emails them once.
- **Demo users cannot report.** Rockefeller's password is public and visitor sandboxes
  are anonymous, so `POST /support/tickets` is `@BlockedInDemo()`; the dialog explains
  reporting is off in the demo and points at support@budgetcofre.com.

## Data

Table `support_tickets` (entity `SupportTicket`, migration via `npm run
migration:generate -- SupportTickets`; the adoption case in `migrations.test.ts` drops it):

| column | type | notes |
|---|---|---|
| `id` | uuid | |
| `userId` | uuid, indexed | reporter |
| `status` | varchar(16) | `open` → `in_progress` → `resolved` → `closed` (any order allowed by the admin) |
| `description` | text | 10–2000 characters, trimmed |
| `page` | varchar(200) | pathname at the time (query dropped) |
| `viewport` | varchar(20) | e.g. `1440x900` |
| `userAgent` | varchar(300) | from the request, truncated |
| `screenshot` | bytea, nullable, `select: false` | never loaded by list queries |
| `screenshotType` | varchar(20), nullable | `image/jpeg` / `image/png` / `image/webp` |
| `screenshotBytes` | int, default 0 | shown in the admin UI, lets lists say "has screenshot" |
| `reply` | text, nullable | the admin's answer, shown to the user |
| `replySentAt` | timestamptz, nullable | the resolved email goes out once |
| `adminNote` | text, nullable | internal, never returned to the user |
| `resolvedAt` | timestamptz, nullable | set when status becomes `resolved` or `closed` |
| `createdAt` / `updatedAt` | timestamptz | |

Retention: `SupportService.sweep()` (at boot, like analytics) nulls the screenshot of
tickets resolved or closed more than 90 days ago. Descriptions stay.

## API — `apps/api/src/support/`

User routes (JWT):

- `POST /support/tickets` — `@BlockedInDemo()`, throttled 5 per 15 min per IP.
  Body `{ description, page, viewport, screenshot?: string }` where `screenshot` is a data
  URL. `parseReport()` (pure, tested) validates: description length, `page` must start
  with `/` and is cut at `?`, viewport matches `^\d{2,5}x\d{2,5}$`, data URL mime is one
  of the three types and the decoded size is ≤ 1 048 576 bytes. Anything else → 400 with
  a plain message. Saves the row, then emails the admins (`MailService.sendTicketOpened`:
  reporter name, page, the first 300 characters of the description, link
  `${FRONTEND_URL}/admin?ticket=<id>`) — failures are logged, never surfaced. Returns the
  ticket without the image.
- `GET /support/tickets` — the caller's tickets, newest first:
  `{ id, status, description, page, createdAt, resolvedAt, reply, hasScreenshot }`.
- `GET /support/tickets/:id/screenshot` — the image bytes with its content type and
  `Cache-Control: private, max-age=3600`. Owner or admin; otherwise 404.

Admin routes (`AdminController`, same guards as the rest of `/admin`):

- `GET /admin/tickets?status=open|in_progress|resolved|closed&page=1` — 20 per page,
  newest first, each with `{ ...ticket, user: { id, name, email } }`, plus
  `counts: { open, in_progress, resolved, closed }`.
- `GET /admin/tickets/:id` — one ticket with `adminNote` and `replySentAt`.
- `PATCH /admin/tickets/:id` — `{ status?, reply?, adminNote? }` copied with
  `pickFields`. Status must be one of the four. When the resulting status is `resolved`,
  `reply` is non-empty and `replySentAt` is null → `MailService.sendTicketResolved` to the
  reporter (name, their description excerpt, the reply) and `replySentAt` is set.
  `resolvedAt` is set the first time status becomes `resolved`/`closed`, cleared when it
  goes back to `open`/`in_progress`.

Logging: ticket ids and statuses only. Descriptions, replies and images are never logged.

## Web

**Entry point.** "Report a problem" (life-buoy icon) in the sidebar's account block,
above Settings, on every signed-in page. Also a button at the top of Settings → Help.

**`ReportProblemModal`** (`components/support/ReportProblemModal.tsx`):

1. On open it captures `document.body` with `html-to-image` `toJpeg` (quality 0.8,
   `pixelRatio` 1, `filter` skips the modal itself and anything with
   `data-no-capture`). Capture runs before the modal paints, so the preview shows the
   page as the user saw it. If capture throws (cross-origin images, odd CSS) the preview
   area says "Couldn't capture this screen — attach an image instead."
2. Preview with **Retake**, **Remove**, **Upload image** (file input, images only; files
   over 1 MB are re-encoded to JPEG at 0.8 on a canvas; still over → "Choose a smaller
   image").
3. Textarea "What went wrong?" with the hint "What you were doing, what you expected,
   and what happened instead." Counter at 2000.
4. A quiet line: "We'll include: this page (`/goals`), your screen size and browser."
5. **Send report** → success state inside the modal: "Thanks. We'll look into it. You
   can follow it in Settings → Help." with a link. Errors show inline; a 403
   `DEMO_READ_ONLY` shows the demo message.

`lib/support/report.ts` (pure, tested): `validateDescription`, `dataUrlBytes`,
`STATUS_LABELS` (`open` "Open", `in_progress` "In progress", `resolved` "Resolved",
`closed` "Closed") and `statusTone`.

**Settings → Help** (new tab `help`, "Help & feedback"): "Report a problem" button, then
the user's tickets as cards: status pill, date, page, description, the reply in a quoted
block when present, screenshot thumbnail (opens the full image in a new tab via the
screenshot endpoint). Empty state: "No reports yet. If something looks wrong, use
Report a problem in the sidebar." Footer: support@budgetcofre.com.

**Admin → Tickets** (`app/admin/components/TicketsPanel.tsx`, placed after Traffic):
status tabs with counts, a table (date, user, page, first line of the description,
screenshot dot), and a detail drawer: full screenshot, description, context line
(page · viewport · browser), reporter, status select, internal note, reply textarea,
buttons **Save** and **Resolve & send reply** (disabled until the reply has text; the
button says "Reply sent" once `replySentAt` is set). `/admin?ticket=<id>` opens the
drawer directly — that is the link in the admin email. `useAdminTickets` /
`useAdminTicket` in `hooks/useAdmin.ts`, types mirrored in `lib/admin/types.ts`.

Responsive: the modal is full-screen below `sm`; the admin table collapses to stacked
rows below `md`; the drawer is a bottom sheet below `md`.

## Emails (MailService)

- `sendTicketOpened(to, { reporter, page, excerpt, link })` — subject "New problem
  report: <page>".
- `sendTicketResolved(to, name, { excerpt, reply })` — subject "We fixed what you
  reported", body quotes their description and the reply, link to Settings → Help.
  Both go through the existing `send()` wrapper (Resend; logged-not-sent locally).

## Privacy

Privacy policy gains a paragraph under data we store: problem reports include the
description, the page, screen size, browser, and the screenshot the user chose to send
(which may show their own balances); only the user and Cofre's admins can open it;
screenshots are deleted 90 days after the report is resolved.

## Tests

API (sqlite): `support.parse.test.ts` (every validation branch), `support.service.test.ts`
(create + admin email called once, list excludes image, screenshot owner/admin/404,
patch transitions, resolved email sent exactly once, sweep), `admin.tickets.test.ts`
(counts + paging), `migrations.test.ts` adoption drop. Web: `report.test.ts` (validation,
data-URL size, labels). Screenshots at 390 / 768 / 1440 of the modal, the Help tab and the
admin drawer.

## Out of scope

Comment threads, more than one image, in-app notifications, Slack/Discord hooks,
reports from signed-out visitors (they have the support email on the landing page).
