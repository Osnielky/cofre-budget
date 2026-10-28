# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Cofre is a personal budget tracker. NX monorepo with two apps:
- `apps/web` — Next.js 16 (Turbopack, React 19, Tailwind v4)
- `apps/api` — NestJS 11 built with webpack + SWC, served from `dist/`

Single PostgreSQL database: `cofre_budget` (local: `postgres:postgres@localhost:5432`).

## Commands

```bash
# Development
npm run dev:web          # Next.js dev server → http://localhost:3000
npm run dev:api          # NestJS via nx serve (watch mode)

# Build
npm run build:web        # Next.js production build
npm run build:api        # webpack + SWC → dist/apps/api/

# Run built API directly (faster for debugging)
node dist/apps/api/main.js

# NX targets (alternative)
npx nx dev web
npx nx serve api
npx nx build api
```

Tests run on Vitest: `npm run test:api` and `npm run test:dashboard`.

Most suites use an in-memory sqlite `DataSource`. Two need real Postgres and skip
themselves when no database is reachable: `recurring.concurrency.test.ts` covers a
lost update between concurrent connections (throwaway `recurring_concurrency_test`
schema), and `migrations/migrations.test.ts` checks that the migrations build
exactly the entity schema — it fails when an entity changes without a migration.

## Database migrations

`synchronize` is off; the API applies pending migrations on boot (`migrationsRun`).
After changing an entity:

```bash
npm run migration:generate -- <Name>   # diffs entities vs your local DB
# then add the class to apps/api/src/migrations/index.ts (explicit list, no globs)
npm run migration:check                # exits non-zero if a diff is still unmigrated
```

The baseline migration skips itself on databases `synchronize` already built
(production and existing dev DBs), so it only creates tables on a fresh database.

`apps/api/tsconfig.app.json` excludes `*.test.ts` — test files must stay out of the
webpack bundle.

## Deployment

Push to `dev` → Cloud Build (`deploy/cloudbuild.yaml`) → two Cloud Run services
(`cofre-web`, `cofre-api`) + Cloud SQL. Each image is tagged `src-<hash>` from
`deploy/src-hash.sh` (the app folder minus tests + root config), so a push only
rebuilds the image whose inputs changed, and `deploy/ci-deploy.sh` only redeploys
a service whose image or deploy config (`cfg` label) differs — API and web deploy
in parallel. If you add a file outside `apps/<app>` that the build reads, add it to
the hash script's `common` list or the change ships without a rebuild. Full
picture, commands and the machine-type trade-off: `docs/deployment.md`.

## Environment

`.env` lives at the repo root and is not committed. Required variables:

```
DB_HOST, DB_PORT, DB_USER, DB_PASS, DB_NAME
DATABASE_URL   # used by seed script
JWT_SECRET
JWT_EXPIRES_IN
FRONTEND_URL   # defaults to http://localhost:3000
GOOGLE_CLIENT_ID
GOOGLE_CLIENT_SECRET
GOOGLE_GMAIL_REDIRECT_URI  # e.g. http://localhost:3333/api/gmail/callback
ANTHROPIC_API_KEY
PLAID_CLIENT_ID
PLAID_SECRET
PLAID_ENV                 # sandbox | development | production
PLAID_LIABILITIES_ENABLED  # 'true' adds Liabilities (card APRs, statements) as an optional product
                            # on new links. Keep 'false' until Plaid approves Liabilities for the
                            # client (dashboard → Products) — Plaid rejects link tokens naming an
                            # unapproved product, which breaks bank linking. Set in
                            # deploy/ci-deploy.sh (true since Plaid approved Liabilities 2026-10-16)
PLAID_COUNTRY_CODES        # comma-separated Plaid country codes Link offers institutions for; default
                            # 'US'. Add a country ONLY after Plaid enables it for the client (dashboard →
                            # Team Settings → Compliance; UK/EU need Plaid's European agreement) — an
                            # unapproved country makes link-token creation fail for everyone. Parsed by
                            # plaid/plaid-countries.ts (unknown codes dropped, falls back to US).
PLAID_WEBHOOK_URL          # e.g. https://<host>/api/plaid/webhook — enables automatic sync
PLAID_OAUTH_REDIRECT_URI   # e.g. https://<host>/settings/plaid-oauth-redirect — must also be
                            # registered in the Plaid dashboard's Allowed redirect URIs
PROXY_SHARED_SECRET        # optional locally; set on BOTH Cloud Run services. The web
                            # middleware forwards the client IP to the API with it so rate
                            # limits are per client, not per web-service address
ADMIN_EMAILS               # comma-separated login emails allowed into /admin (Secret Manager
                            # in Cloud Run); unset = nobody is an admin
GOOGLE_CLOUD_PROJECT       # set by ci-deploy.sh; links API log entries to Cloud Trace
SLOW_REQUEST_MS / SLOW_QUERY_MS / SLOW_EXTERNAL_MS   # optional log thresholds (1000/500/2000)
```

`NEXT_PUBLIC_API_URL` in the web app defaults to `http://localhost:3333/api`.

## Architecture

### API (`apps/api/src/`)

NestJS modules wired in `app/app.module.ts`:

| Module | Responsibility |
|---|---|
| `config/database.config.ts` | TypeORM options via `@nestjs/config`. Entity list lives in `config/entities.ts`; `config/data-source.ts` is the same connection for the TypeORM CLI. **Entities and migrations must be imported explicitly** — glob paths don't work in the webpack bundle. |
| `users/` | `User` entity + `UsersService`. Password column has `select: false`; use `createQueryBuilder().addSelect('user.password')` to load it. |
| `auth/` | Passport local + JWT strategies. JWT stored as `httpOnly` cookie `access_token`. Login: `POST /api/auth/login`. |
| `transactions/transfer-kind.ts` | What a linked transfer *means* and which category each side gets: `savings` (sending side → Investments, receiving → Internal Transfer), `capital_return` (receiving → Investments: a withdrawal of savings, not income), `investment_income` (receiving → Investment income), `card_payment`, `internal`. Options depend on the two account types (`transferKindOptions(fromType, toType)`, default first). `PATCH /transactions/:id/transfer-account` takes `kind`; the service validates it against the pair, creates any missing category from `TRANSFER_CATEGORY_DEFAULTS`, sets **both** sides and returns `counterpart` — it never copies the category of the side the user started from. Web mirror: `lib/transactions/transferKind.ts` (`explainTransfer` builds the plain-language outcome the link dialog shows). The link dialog (`components/LinkTransferModal.tsx`) has three tabs — Suggested match, Find a transaction, To/From My Cash; the cash tab links to the cash *account* (no counterpart row), pre-selects the only cash account, and an ATM-looking withdrawal with no match opens on it directly (decided once, never pulls the user back). Tracking-account rows (investment, mortgage…) are never "uncategorized": they show "Investment Account · not in budgets" and Ask Cofre skips them. |
| `categories/` | Category CRUD plus `POST /api/categories/:id/merge` (`{ targetId, name? }`): folds one category into another in one DB transaction — transactions, categorization rules and recurring rules retarget, same-month budgets add up onto the target (its settings win), colliding rules drop, the target is optionally renamed, the old category is deleted. Keeps the target's icon and colour. UI: Settings → Categories, the merge icon on each row (`components/MergeCategoryModal.tsx`). Tests: `categories.merge.test.ts` (sqlite). |
| `analytics/` | First-party, cookie-less page-view counting for the admin Traffic panel. `POST /api/analytics/view` (public, 60/min per IP) stores one `page_views` row per view: UTC day, route-shaped path, referrer host, flags (signed in / demo) and a **daily-salted sha256 of IP + user agent** (`page-view.parse.ts`) — no IP, UA or user id is stored and hashes cannot be joined across days. Bots are dropped by user agent. Rows live 90 days (swept at boot). `GET /api/admin/traffic` aggregates visits, daily unique visitors, top pages, referrers, viewer split and the landing → demo → signup → trial funnel (`funnel.trialStarts` = subscriptions created in 30 days, any status; `funnel.paying` = subscriptions `active` or `past_due` today, not windowed). Web: `components/PageViewBeacon.tsx` (root layout, one beacon per route change), `app/admin/components/TrafficPanel.tsx`. Privacy policy §6 describes it. **Prospect profile (2026-10-23):** each view also stores derived, non-identifying attributes — country/region/city from an offline `geoip-lite` lookup (`geo.ts`, lazy, ~100 MB resident, API memory is 1 GiB), device/browser/OS family, first Accept-Language tag, viewport width, and on `entry` views the `utm_*` tags of the landing URL (`visitor-profile.ts`, pure). `traffic()` returns `segments.prospects` (not signed in or demo) / `segments.customers` (signed in) and `prospects.profile` + `prospects.recent` (last 40 visitor-days with their page path, within one day only — hashes still rotate daily). The Admin Traffic section has a Prospects / Customers switch. Spec: `docs/superpowers/specs/2026-10-23-prospect-analytics-design.md`. |
| `support/` | Problem reports (support tickets). `POST /api/support/tickets` (JWT, `@BlockedInDemo`, 5 per 15 min) takes `{ description, page, viewport, screenshot? }` through `parseReport()` (`support.parse.ts`, pure: 10–2000 chars, site path only, JPEG/PNG/WebP data URL ≤ 1 MB); the row goes in `support_tickets` and the bytes in `support_screenshots` (`bytea`, written/read by raw query only — sqlite has no bytea, so tests create that table by hand). Every `ADMIN_EMAILS` address gets `MailService.sendTicketOpened` with a link to `/admin?ticket=<id>`. `GET /support/tickets` is the caller's list; `GET /support/tickets/:id/screenshot` serves the image to the owner or an admin (404 otherwise). Admin: `GET /admin/tickets?status=&page=`, `GET/PATCH /admin/tickets/:id` (`{ status, reply, adminNote }`; `resolved` + a reply emails the reporter once via `replySentAt`). `sweep()` at boot drops screenshots 90 days after resolution. Never log descriptions, replies or images. Spec: `docs/superpowers/specs/2026-10-21-problem-reports-design.md`. |
| `demo/` | Demo data. `DemoService` seeds the permanent **Rockefeller** account (`rockefeller@demo.cofre`, login `Rockefeller` / `demo`, Pro, created at boot if missing, never reset on its own) and throwaway **visitor sandboxes** (`POST /api/demo/start`, public, 10/15 min per IP: a `users.isDemo` Pro user with a 4-hour cookie, deleted on logout and swept after 24 h). Both get the same deterministic year of data from `demo-seed.ts` (≈900 transactions, 12 months of budgets, recurring + categorization rules, debts, projects, card details, net-worth history). `@BlockedInDemo()` + the global `DemoInterceptor` return 403 `DEMO_READ_ONLY` for demo-restricted users (visitors **and** Rockefeller, whose password is public — `common/demo/demo-restricted.ts`) on Plaid, billing, Gmail, account-change and outbound-email routes (debt statements; `emailReceipt` is forced off); Ask Cofre is capped at 5 messages (`ai-usage.ts` plan `'demo'`). Login identifiers without `@` map to `<name>@demo.cofre` (`auth/login-identifier.ts`). Admin: `POST /api/admin/demo/reset-owner` re-seeds Rockefeller and restores its name and password. Web: `/demo` page, `components/DemoBanner.tsx`, landing links. Spec: `docs/superpowers/specs/2026-10-20-demo-account-design.md`. |
| `bank-accounts/` | Accounts CRUD. `findAllByUser` seeds a default **"My Cash"** account (type `cash`, $0, manual) the first time a user has no accounts at all — the same lazy pattern as default categories; a deleted cash account stays deleted while any other account exists. Settings shows "Set how much cash you have" on an untouched cash account. Test: `bank-accounts.default-cash.test.ts`. |
| `cards/` | Credit card data. `credit_card_details` (one per credit account, created lazily) holds Plaid Liabilities data or hand-entered values; `manualFields` + `detail-merge.ts` decide which wins. `card_profiles` holds the user's card goals. `/api/cards` is open to every plan. |
| `ai-agent/` | Ask Cofre chat (Claude with tools). Read tools in `ai-read-tools.service.ts` — transactions (each tagged with its account, filterable by `accountId`), categories, budgets, accounts, debts, credit cards, savings trend, safe-to-spend; `propose_*` tools only create pending actions the user confirms. **Projects and debts (2026-10-27):** `get_projects` lists each project with the categories it accepts and a `closed` flag; `get_transactions` rows carry `projectId` / `projectCategory` / `debtId`, and `uncategorizedOnly` excludes rows linked to a project or a debt (they are categorized by that link — app convention, `categoryId = null`). `propose_link_to_project` (active projects only; validates the project category; confirm also clears the budget category, undo restores it) and `propose_link_to_debt` (open debts only; checks the money moves the right way for lent vs owed; confirm goes through `TransactionsService.updateDebt`, which records the payment; not undoable from chat). The system prompt tells the model to check projects and debts before proposing a budget category. **Conversations:** `DELETE /ai/conversations/:id` and `DELETE /ai/conversations` (all) are **soft deletes** (`ai_conversations.deletedAt`, migration `AiConversationDeletedAt`): the row leaves the list and cannot be opened, but its user messages still count in `countUserMessagesSince` — a hard delete would let anyone reset the cap by clearing history. `purgeDeleted()` at boot hard-deletes rows soft-deleted before the previous UTC month began (messages and pending proposals follow by FK cascade). **Message caps (2026-10-28):** `ai-usage.ts` — Pro 25 per UTC day, Elite **400 per UTC month** (one pool, resets on the 1st), demo 5 per day; `usageWindowStart()` gives the window the controllers count from and `MessageUsage.period` (`'day' | 'month'`) tells the footer to say "today" or "this month". Elite's bank cap is **10 institutions** (`INSTITUTION_CAPS` in `plaid.service.ts`, Pro 4); the 403's message names the plan and the web shows it as-is (`InstitutionLimitError`). Both caps bound the worst-case Plaid + Claude spend of a $7.99 plan to the $2/user margin in the pricing model. The History panel has a trash icon per conversation and a "Clear history" button with an inline confirm; deleting the open conversation resets the chat, and the next message starts a new one. `get_credit_cards` returns `summarizeCreditCards()` (`ai-credit-cards.summary.ts`): per-card APRs, limit, utilization, estimated monthly interest, what's missing, plus the card profile — derived numbers are computed in tested code, never by the model. Tools and system prompt live in `ai-chat.service.ts`. |

**Logging.** Everything logs as Cloud Logging JSON through `common/logging/`: `CloudLogger`
backs every `new Logger(Name)`, `requestLoggingMiddleware` writes one line per request and
holds the request context (request ID, user ID, trace) that every entry picks up, and
`timed(service, operation, fn)` wraps calls to outside services. Never log bodies, tokens,
emails or amounts. Queries and alert commands: `docs/observability.md`.

**Key quirks:**
- `cookie-parser` must be imported as `import cookieParser = require('cookie-parser')` (CommonJS interop).
- `apps/api/.swcrc` sets `target: "es2017"`, `keepClassNames: true`, and `decoratorMetadata: true` — required for `PassportStrategy` mixin and TypeORM decorators to work under SWC.
- Adding a new entity: add it to `ENTITIES` in `config/entities.ts`, then generate a migration.
- Never spread or `Object.assign` a request body onto an entity. DTOs are plain types (no validation
  layer strips unknown keys), so copy fields with `pickFields(dto, ALLOWED_FIELDS)` from
  `common/http/pick-fields.ts` or assign them one by one — a client-sent `id` makes `save()`
  overwrite another user's row.

### Web (`apps/web/src/`)

| Path | Role |
|---|---|
| `middleware.ts` | Route guard — redirects unauthenticated users to `/login`, authenticated users away from `/login`. Reads `access_token` cookie. |
| `app/(auth)/login/` | Public login page. POSTs to API with `credentials: 'include'`. |
| `app/dashboard/` | Protected dashboard (stat cards placeholder). |
| `app/cards/` | Cards page. Top: total utilization (rating Excellent/Good/High/Very high) + stat tiles (available credit, highest APR, next payment due). Credit / Debit / All tabs — debit cards are checking accounts (`GET /api/cards/debit`: balance + spending this month, same cash-flow rule as net worth). Credit tiles: generic card graphic in the real card's approximate color (`lib/cards/card-colors.ts`: known products, else the issuer's color, else a theme accent — colors only, never issuer logos/art, which are trademarks), utilization, APRs, due date, one primary action (Enable card details / Add details) + edit drawer. Bottom: payment-strategy tips from real data (`lib/cards/overview.ts`, no AI call) with an Ask Cofre link (`/ask-cofre?q=` pre-fills the input), and "Coming soon" panels for utilization trend (needs balance history) and rewards (needs the card catalog) — never fake numbers. Opening it runs a first Liabilities sync for Plaid items that never synced; "Enable card details" runs Plaid update mode (`plaidLinkMode = 'liabilities'`, also handled by `settings/plaid-oauth-redirect`). Pure helpers + tests in `lib/cards/`. Design: `docs/superpowers/specs/2026-10-15-credit-card-expert-design.md`. |
| `app/goals/` | Road to $1M. `GoalsHero` (net worth, month change, level ring) → two height-balanced columns from xl: left = chart (`NetWorthHistoryChart`) over `NetWorthMixCard` (donut of which accounts add to net worth beside a red list of what subtracts; `lib/goals/mix.ts`, tested; lists go two-up at 2xl), right (380px) = `NextStepCard` (pace projections from `lib/goals/pace.ts`) over `MilestonesCard` (month each level was reached, or lands at the current pace) → `WealthJourney` ladder. Below xl the column wrappers are `display: contents` and `order-*` puts the cards in reading order (chart, next step, mix, milestones). No width cap. Spec: `docs/superpowers/specs/2026-10-02-goals-page-redesign-design.md`. |
| `app/page.tsx` + `components/landing/` | Public landing page (signed-in visitors are redirected to `/dashboard`). Monarch-inspired structure on the Cobalt palette: Fraunces serif headlines (`--font-display`, loaded only here), full-bleed night-sky hero (`.landing-art`) with a glass headline card and floating coded mockups, four pillars, one feature section per capability, trust, pricing band + cards, FAQ, closing CTA, footer. Mockups in `components/landing/mockups/` are fake data and theme-variable only. Every claim must be in the spec's "Allowed claims": `docs/superpowers/specs/2026-09-30-landing-page-design.md`. |
| `app/reports/` + `components/reports/` + `lib/reports/` | **Reports (2026-10-27).** Any period (This month · Last month · 3M · 6M · YTD · 12M · Custom; `lib/reports/range.ts` resolves it plus the *previous* period every delta compares to) → KPI strip → tabs: Overview (money-flow **Sankey** income sources → Cash → categories → Saved, with a "Savings & credit" source on a deficit; rule-based plain-language **insights**; cumulative **pace** line vs the previous period), Spending / Income (ranked buckets with share bars and change chips; tap a row for its months, merchants and transactions inline; stacked top-6 + Other by month; weekday profile; largest expenses), Merchants (search, count, average, change, sparkline, New badge), Cash flow (income vs spending bars + net line, month table), Net worth (Goals history cut to the period). **Export CSV** menu (categories, income, merchants, months, transactions). Every number comes from `lib/reports/compute.ts` (pure, tested, uses the dashboard's `inCashFlow` + `makeBucketer`); data from `hooks/useReportsData.ts` (one transactions request from `prevFrom` to `to`). Sidebar "Reports"; the dashboard's "View reports" buttons point here. Spec: `docs/superpowers/specs/2026-10-27-reports-page-design.md`. |
| `app/tools/`, `app/compare/[slug]/`, `app/mint-alternative/` | **Growth pages (2026-10-26)**: public, login-free pages that earn search traffic. Three calculators (`/tools/millionaire-calculator`, `/tools/credit-card-payoff-calculator`, `/tools/50-30-20-budget-calculator`) with pure, tested math in `lib/tools/` (the millionaire ladder reuses `lib/goals/levels.ts`; utilization reuses `lib/cards/`). Compare pages are one static route driven by `lib/marketing/competitors.ts` (`COMPETITORS`, `COFRE_FACTS`, `pricesCheckedOn`): every competitor price shows the date it was checked and links to the source, and `competitors.test.ts` **fails once `pricesCheckedOn` is 120 days old** — re-check prices monthly and bump it. `/mint-alternative` is the all-in-one table. Shell: `components/marketing/MarketingShell.tsx` (landing nav + footer), `DemoCta` (Start free / Try the demo with `utm_source=tools&utm_campaign=<page>` so the admin Traffic panel attributes the entry). Routing: `PUBLIC_PATH_PREFIXES` (`/tools`, `/compare`) in `lib/route-access.ts`; sitemap paths in `lib/seo.ts` (`TOOL_PATHS`, `COMPARE_PATHS`). Claims rule from the landing spec applies. Plan: `docs/marketing/2026-10-26-go-to-market-plan.md`; spec: `docs/superpowers/specs/2026-10-26-growth-pages-design.md`. |
| `app/ask-cofre/motion.tsx` | Chat motion on Framer Motion (`motion/react`, the only animation library in the app — reuse it for new motion): `MessageIn` (rows slide in from their side, `AnimatePresence` on the list), `ThinkingBubble` (bouncing dots + rotating status until the first streamed token), `ReplyIn` (inside `AnimatePresence mode="wait"`: the bubble fades out and the first words rise in), `AiAvatar busy` (pulsing glow while streaming), `WidgetIn` (proposal / safe-to-spend / savings cards pop in), `Stagger`/`StaggerItem` (suggested prompts), `SendButton` (spinner while sending). `.chat-streaming` in globals.css draws the typing caret. Everything respects `prefers-reduced-motion` via `useReducedMotion` — with macOS "Reduce motion" on, every transition is instant by design. Keep `chatSpring` soft (260/22): rows travel ~30px and settle in ~0.5s; a stiffer spring was reported as "no animation". **Phones (below sm):** compact header (icon-only History / New chat, no tagline), no avatars so replies run the full width and the user's bubble hugs the right edge, suggested prompts as one swipeable row, shorter placeholder and usage text (`useNarrowScreen`), the month picker moved from the input row to the footer line (rendered twice, `hidden sm:block` / `sm:hidden`, same state), the two "coming soon" icons hidden, and `SavingsTrendWidget` stacks chart over stats — the conversation keeps most of the height. |
| `components/support/` | "Report a problem" (sidebar, above Settings, and Settings → Help). `ReportProblemModal` captures the page as it opens (`capture.ts`: `html-to-image` `toJpeg`, elements with `data-no-capture` skipped, images re-encoded until under 1 MB), with Retake / Upload image / Remove, a description box, and the demo / rate-limit messages. `MyTicketsList` is the Help tab (status pill, screenshot thumbnail, the admin's reply). Admin queue: `app/admin/components/TicketsPanel.tsx` (status tabs with counts, table, portalled drawer with screenshot, internal note, reply, "Resolve & send reply"; `/admin?ticket=<id>` opens it). Helpers + tests: `lib/support/report.ts`. |
| `components/ChatMarkdown.tsx` | Renders Ask Cofre replies as Markdown (react-markdown + remark-gfm: bold, lists, tables in a horizontal-scroll wrapper, links in a new tab), styled with theme variables. Raw HTML in replies is never rendered. |
| `components/Logo.tsx` | Inline SVG vault-door logo, accepts `size` prop. |

Path alias `@/*` → `src/*` is defined in `apps/web/tsconfig.json`.

**Budgets page** (`app/budgets/`, `components/budgets/`, `hooks/useBudgetScenario.ts`). All budget math lives in `lib/budgets/` (integer cents; `calculations.ts` is the one model every card/chart/row reads, `draft.ts` is the unsaved-scenario reducer). Edits are in-memory drafts until "Save changes", which calls the atomic `PUT /api/budgets/batch` (`apps/api/src/budgets/budget-batch.ts` validates; same carry-forward semantics as `PATCH`). Actual spending is computed client-side from transactions with the dashboard's `inCashFlow` rule, not from the API's per-budget `spent`. Tests: `npm run test:dashboard` (web libs) and `npm run test:api`.

### Styling & theming

Tailwind v4 via `@tailwindcss/postcss`. Shape/font tokens live in `apps/web/src/app/globals.css` inside `@theme {}` — no `tailwind.config` file.

**Theme system.** All colors/surfaces come from CSS variables defined in `globals.css` `:root` (default theme: **Cobalt** — navy gradient base, translucent cards with light blur, thin cyan-blue glowing borders, `.card-lift` hover, electric-blue accent). Three more ship in the registry: **Noir Gold** (charcoal + warm gold accent, matches the auth page's gilded quote), **Aurora** (deep teal + mint accent) and **Daylight** (the one light theme: off-white base, white cards, blue accent, `color-scheme: light`, `dark: false`). The theme registry is `src/lib/theme.ts` (`THEMES` array); `ThemeProvider` applies `data-theme` on `<html>` and persists to localStorage; the settings Appearance tab renders the registry. To add a theme: add a `THEMES` entry + an `html[data-theme="x"]` variable-override block in `globals.css` that sets the surfaces, text, `--color-primary`, nav vars, glass vars, `--bg-gradient` (the body's gradient stack) and `--btn-primary-top/-bottom/-glow/-text` (the `.btn-gold` CTA). Chart series colors are *not* per theme — they stay the validated CVD-safe set — with one documented exception: **Daylight** overrides them with darker shades of the same hues (the shared set is 1.7–2.0:1 on white and doubles as text), validated the same way (worst adjacent pair ΔE 42.8 normal / 19.6 protan / 12.2 deutan; every identity ≥ 3.3:1 on white; the cash-flow partners are *deeper* there, not tints). The numbers and method are in the Daylight block of `globals.css`; re-run them if you touch that palette. Two more theme hooks exist for light themes: `--lift-shadow` (card hover) and `--btn-premium-text`. Components must only consume the variables (`--color-surface`, `--glass-blur`, `--glass-border`, `--glass-shadow`, …) — never hardcode theme colors, so new themes never require component changes. Text contrast floor: `--color-text-muted` must stay ≥ 4.5:1 on `--color-surface` (it carries the 10–11px labels).

**Responsive shell.** Every page is `<div class="flex h-dvh"><Sidebar/><main class="… pt-14 md:pt-0">`. The sidebar is a slide-in drawer below `md`, a 76px icon rail (labels hidden, `title` tooltips) from `md`, and the full 256px column from `lg`. Because `<main>` is the scroll container and already pads 56px for the phone top bar, in-page sticky headers use `top-0`, never `top-14` (a scroll container's padding is excluded from the sticky box, so `top-14` double-offsets and hides the first rows). Two-column layouts collapse: Projects is master/detail below `lg` (list, then detail with a back button); the Transactions insights column only renders at `xl` and a bottom sheet takes over below that. **Transactions header on phones (below `sm`):** title + New / icon-only Import and Sync on row one (bell, avatar and subtitle hidden), the month selector spans row two with an icon-only custom-range toggle, `StatStrip` is a 2×2 grid of compact tiles (no chip or sparkline), then search + a **Filters** button (badge = non-default sort/account/category) that opens a bottom sheet with the three selects (`filterSelects(true)`, short labels), the group-by control, Clear and Collapse all; the tab row gains an amber **Uncategorized** tab in place of the desktop pill, and the "N total" pill is hidden since the All tab shows the count. **Transaction rows on phones:** a two-line ledger row — chip · name · amount, then the category pill (and any one-tap suggestion) with a single ⋮ at the right edge; the ⋮ menu lists Split / Unsplit / Edit / Delete there (from `sm` those are the hover icon cluster and the menu keeps only the rule actions). The source badge (PLAID / MANUAL) and the transfer-direction badge are desktop-only so an ordinary row never grows a third line. **Settings → Bank Accounts on phones:** accounts are grouped under one card per bank (`AccountVisual` logo, name, "N accounts · Synced / Manual / Needs reconnect", a bank-level Sync or Reconnect button that walks each distinct Plaid item), and each account is a slim row (type bar, name, type + last-4, balance) that expands on tap (`expandedId`) into Edit / Import CSV / Sync now or Reconnect / Remove chips. The full per-account cards are `hidden sm:flex`. **Settings → Bank Accounts from `sm` (2026-10-28):** the same bank groups (`bankGroups` memo) render as one card per bank in a grid that fills the width (`xl:grid-cols-2 2xl:grid-cols-3`, `items-start`): header with logo, name, "N accounts · Synced / Manual / Needs reconnect", the bank's net when it holds more than one USD account, and a bank-level Sync or Reconnect; then a ledger row per account (type bar, name, type + last-4, balance, an icon cluster for Edit / Import CSV / Sync or Reconnect / Remove that brightens on hover). Above the grid a summary strip (Assets, Owed, Net, Connections; USD only) and a one-line Plaid note. The Settings tab bar is an underline strip that scrolls sideways with edge fades (`tabFade`) and short labels below `2xl` (`TABS[].short`); the Delete tab is icon-only below `sm`. **Dashboard phone pattern (below `sm`):** stat cards are one hero + 2×2 tiles (`StatCardsRow`); chart panels (`IncomeExpensesPanel`, `CashFlowTrendPanel`) put the Net tile first as a full-width hero with its chip, pair the rest two-up without chips (`order-*` classes, DOM order from `sm`), swap the wrapping legend for a three-item one beside the axis label, and render each insight as a single line (dot · short label · value right-aligned) instead of chip columns with left rules. `CategoryTrendPanel` (Income / Expense Trend) drops the Target/Avg pills right of the plot on phones (`useNarrowScreen`, `hooks/useNarrowScreen.ts`) so the bars get the full width; the legend names both lines with short money instead. Check every change at ~375px, 768px and 1440px — the headless `browse` skill with `viewport` + `screenshot` is the quickest way.

**Color rules:** `--color-primary` (electric blue `#1E90FF`) and `--color-indigo` are UI accents only — never chart series (blue/indigo/violet are CVD-indistinguishable, protan ΔE 3.2). Chart identity colors are green/sky/orange/amber/violet, resolved at runtime via `useThemeColors()` for recharts. The `.btn-gold` class name is legacy — it is the themed primary CTA button.

**Documented exception — the cash-flow chart.** `IncomeExpensesPanel` deliberately
uses two shades of one hue per bar instead of the categorical palette: green
(`--color-green` → `--color-green-soft`) for the income stack, red
(`--color-rose` → `--color-rose-soft`) for the expense stack. Green-in/red-out is
the finance convention the user asked for. It is a knowing accessibility
trade-off: green↔red measures **ΔE 0.2 under deuteranopia** (green↔orange, which
it replaced, was 6.2), so the two bars are one colour to a red-green colourblind
reader. It is legitimate only because identity never rests on colour there —
income is always the left bar, expenses always the right, in a fixed order, plus
a legend and labelled totals. Preserve that ordering. The within-stack pairs are
validated: ΔE 21.2 (green) and 20.9 (rose), both ≥ 3:1 contrast. Second shades
are *tints*, not deeper steps — a darker red loses contrast on the navy surface.

Accent colors: `--color-card-violet #9B6DFF`, `--color-card-green #4FBF7F`, `--color-card-orange #F07A3E`, `--color-card-amber #F5C842`, `--color-card-sky #4BA8D8`.

`global.css` (no "s") is an NX-generated leftover — it is not imported anywhere and can be ignored.
