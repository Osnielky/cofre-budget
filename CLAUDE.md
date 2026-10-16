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
| `cards/` | Credit card data. `credit_card_details` (one per credit account, created lazily) holds Plaid Liabilities data or hand-entered values; `manualFields` + `detail-merge.ts` decide which wins. `card_profiles` holds the user's card goals. `/api/cards` is open to every plan. |
| `ai-agent/` | Ask Cofre chat (Claude with tools). Read tools in `ai-read-tools.service.ts` — transactions (each tagged with its account, filterable by `accountId`), categories, budgets, accounts, debts, credit cards, savings trend, safe-to-spend; `propose_*` tools only create pending actions the user confirms. `get_credit_cards` returns `summarizeCreditCards()` (`ai-credit-cards.summary.ts`): per-card APRs, limit, utilization, estimated monthly interest, what's missing, plus the card profile — derived numbers are computed in tested code, never by the model. Tools and system prompt live in `ai-chat.service.ts`. |

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
| `components/ChatMarkdown.tsx` | Renders Ask Cofre replies as Markdown (react-markdown + remark-gfm: bold, lists, tables in a horizontal-scroll wrapper, links in a new tab), styled with theme variables. Raw HTML in replies is never rendered. |
| `components/Logo.tsx` | Inline SVG vault-door logo, accepts `size` prop. |

Path alias `@/*` → `src/*` is defined in `apps/web/tsconfig.json`.

### Styling & theming

Tailwind v4 via `@tailwindcss/postcss`. Shape/font tokens live in `apps/web/src/app/globals.css` inside `@theme {}` — no `tailwind.config` file.

**Theme system.** All colors/surfaces come from CSS variables defined in `globals.css` `:root` (default theme: **Cobalt** — navy gradient base, translucent cards with light blur, thin cyan-blue glowing borders, `.card-lift` hover, electric-blue accent). The theme registry is `src/lib/theme.ts` (`THEMES` array); `ThemeProvider` applies `data-theme` on `<html>` and persists to localStorage; the settings Appearance tab renders the registry. To add a theme: add a `THEMES` entry + an `html[data-theme="x"]` variable-override block in `globals.css`. Components must only consume the variables (`--color-surface`, `--glass-blur`, `--glass-border`, `--glass-shadow`, …) — never hardcode theme colors, so new themes never require component changes.

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
