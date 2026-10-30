# Prospect analytics (admin) — design

Date: 2026-10-23
Status: built (same day)
Extends: `2026-10-21-traffic-analytics-design.md`

## Goal

Tell visitors who have no account ("prospects") apart from signed-in customers on the
Admin page, and learn as much as possible about prospects without identifying anyone.

## Decision

Stay cookie-less. No IP, user agent, cookie or user id is stored for a page view. What
we add is derived at ingest from headers that are then discarded, and is non-identifying
on its own: country / region / city (offline GeoLite2 lookup inside the API), device
type, browser and OS family, the first Accept-Language tag, viewport width, and the UTM
source / medium / campaign of the landing URL. The visitor hash still rotates daily, so a
person's pages can be followed within one day only. Returning-visitor tracking (a
persistent id) was offered and declined for now; it would need a consent notice.

## Data

`page_views` gains nullable columns `entry` (first page of a visit), `country`,
`region`, `city`, `device`, `browser`, `os`, `language`, `viewportWidth`, `utmSource`,
`utmMedium`, `utmCampaign` (migration `VisitorProfile`). `PageViewBeacon` now sends
`entry`, `search` (landing query string, first page only) and `viewportWidth`.

`visitor-profile.ts` (pure, tested): `parseUserAgent`, `primaryLanguage`, `parseUtm`,
`isPublicIp`. `geo.ts`: lazy `geoip-lite` lookup, nulls for private addresses or when the
data is missing. The API's Cloud Run memory goes to 1 GiB (the city data is ~100 MB).

## Admin API

`GET /admin/traffic` keeps its totals and adds `segments.prospects` / `segments.customers`
(visits, visitors, daily series, top pages, referrers — prospects = not signed in or in
the demo; customers = signed in and not demo) and `prospects`:

- `profile` (30 days, distinct visitor-days): countries, cities, devices, browsers, OS,
  languages, landing pages (entry views), campaigns (utm source / medium / campaign),
  and the count with unknown location.
- `recent`: the last 40 prospect visitor-days, newest first — first/last seen, minutes
  on site, number of views, the page path in order, country/city, device/browser/OS,
  language, referrer, campaign, demo flag.

## Admin page

The Traffic section gets a Prospects / Customers switch for tiles, chart, top pages and
referrers. Prospects also show "Where they are", "Devices & browsers", "Campaigns & landing
pages" and a "Recent prospect visits" table (stacked rows on phones). A footnote credits
GeoLite2 (MaxMind) and repeats that nothing stored identifies a person.

## Richer Traffic panel (2026-10-30)

The first panel left most of a wide screen empty and made the owner do the
arithmetic. Additions, all derived in `apps/web/src/lib/admin/traffic.ts`
(pure, tested) from three new per-segment fields on `GET /api/admin/traffic`:

- **API** (`TrafficSegment`): `entries { direct, referred }` (entry views with
  and without a referrer), `engagement { visitorDays, singlePage, avgPages }`
  (visitor-days, how many saw one page, page views per visitor-day) and
  `activity[168]` (page views by UTC weekday × hour). The per-visitor and
  per-hour folds run in JS — the rows are a small app's month and hour extraction
  differs between Postgres and sqlite.
- **Tiles**: the 7-day tile carries the change against the previous 7 days.
- **Per-day chart**: a dashed 7-day average line (amber) over the visitor and
  page-view bars; the subtitle reads this week's visitors, the week-over-week
  change and pages per visitor.
- **Top pages**: a share bar on visitors, a kind tag for prospects (Landing,
  Public, Demo, Sign in / up, App (demo)) and views per visitor when above 1.2.
- **Where they come from**: a *Direct* row first (entries without a referrer),
  then each referrer with a kind tag — Search, Social, AI assistant, Your own URL
  (the Cloud Run service address: the owner or a script, not a prospect),
  Crawler (passed the user-agent filter), Other site — hosts that normalise to
  one label merge (`www.reddit.com` + `reddit.com`), and a note explains the own
  / crawler rows when present.
- **From visitor to customer** (prospects): the funnel as bars — landing
  visitors → opened the demo → created an account → started a trial → paying
  today — each with its share of the landing page and of the previous step.
- **How deep they go**: pages per visitor, left after one page (amber at ≥ 80%
  with 20+ visitor-days), saw two or more pages, arrived from a link, and one
  plain-language sentence (`engagementHint`: sample size first, then bounce,
  then channel).
- **When they visit**: 24-hour and weekday strips in the viewer's time zone
  (`localActivity` rotates the UTC buckets by the browser offset) with the
  busiest weekday and two-hour block.

The Customers segment gets the same chart, pages, referrers, depth and timing
panels; the funnel is replaced by the viewer split.

## Privacy

Policy §6 adds: location (country/city) is derived from the IP address at the moment of
the visit and the address is not kept; device type, browser and OS family, language and
campaign tags from the link you arrived on are kept for 90 days with the page view.

## Tests

`visitor-profile.test.ts`, `page-view.parse.test.ts` (entry / search / viewport),
`analytics.service.test.ts` (segments, profile buckets, recent visits, geo injected),
`migrations.test.ts` adoption case drops the new columns.
