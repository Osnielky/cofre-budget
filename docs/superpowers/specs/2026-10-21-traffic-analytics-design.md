# Traffic analytics (admin) — design

Date: 2026-10-21
Status: built (same day)

## Goal

Answer "how many people visit the app?" from the Admin page. The page already counts
signed-in users (active 1/7/30 days, signups); anonymous visitors to the landing page,
pricing and the demo were invisible.

## Decision

A first-party, cookie-less page-view counter rather than Google Analytics or Plausible:
no third party, no cost, no consent banner, nothing personal stored.

## How it works

- `PageViewBeacon` (root layout) POSTs `{ path, referrer?, signedIn, isDemo }` to
  `POST /api/analytics/view` once per route change. The referrer is sent only for the
  first page of a visit.
- The API drops bots (user-agent list), normalises the path (ids → `:id`, query dropped),
  keeps the referrer host (never the site itself), and stores a row with the UTC day and
  `visitorHash = sha256(salt | day | ip | user agent)`. The day is part of the hash, so a
  person hashes differently tomorrow: nothing in the table identifies anyone or links days.
  The salt is `ANALYTICS_SALT` or, by default, `JWT_SECRET`.
- Rows are kept 90 days (`AnalyticsService.sweep` at boot).
- `GET /api/admin/traffic` returns visits and distinct daily visitors (today / 7 / 30
  days), a 30-day daily series, top pages, top referrers, the anonymous / signed-in / demo
  split, and the funnel: distinct landing visitors → distinct `/demo` openers → real
  signups (non-demo users created in the window).
- Admin page: a "Traffic" section with five tiles, the daily chart, top pages, referrers
  and the viewer split. The privacy policy's cookies section gained one paragraph.

## Limits

- "Visitors over 7/30 days" is the sum of daily uniques (hashes rotate daily), so a
  returning visitor counts once per day. That is the privacy trade-off, by design.
- Counting starts at deploy; there is no history before it.
- Ad blockers that block analytics endpoints may block the beacon; the endpoint lives on
  the app's own domain under `/api/analytics/view`, which most lists do not match.

## Tests

`page-view.parse.test.ts` (normalisation, referrer host, daily hash, bot list),
`analytics.service.test.ts` (sqlite: record, bots, windows, daily series, top pages,
referrers, split, funnel, sweep), `migrations.test.ts` (schema).
