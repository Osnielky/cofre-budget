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

## Privacy

Policy §6 adds: location (country/city) is derived from the IP address at the moment of
the visit and the address is not kept; device type, browser and OS family, language and
campaign tags from the link you arrived on are kept for 90 days with the page view.

## Tests

`visitor-profile.test.ts`, `page-view.parse.test.ts` (entry / search / viewport),
`analytics.service.test.ts` (segments, profile buckets, recent visits, geo injected),
`migrations.test.ts` adoption case drops the new columns.
