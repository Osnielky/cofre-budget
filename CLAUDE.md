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

No test runner is configured yet.

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
```

`NEXT_PUBLIC_API_URL` in the web app defaults to `http://localhost:3333/api`.

## Architecture

### API (`apps/api/src/`)

NestJS modules wired in `app/app.module.ts`:

| Module | Responsibility |
|---|---|
| `config/database.config.ts` | TypeORM options via `@nestjs/config`. **Entities must be imported explicitly** — glob paths don't work in the webpack bundle. |
| `users/` | `User` entity + `UsersService`. Password column has `select: false`; use `createQueryBuilder().addSelect('user.password')` to load it. |
| `auth/` | Passport local + JWT strategies. JWT stored as `httpOnly` cookie `access_token`. Login: `POST /api/auth/login`. |

**Key quirks:**
- `cookie-parser` must be imported as `import cookieParser = require('cookie-parser')` (CommonJS interop).
- `apps/api/.swcrc` sets `target: "es2017"`, `keepClassNames: true`, and `decoratorMetadata: true` — required for `PassportStrategy` mixin and TypeORM decorators to work under SWC.
- Adding a new entity: import it in `database.config.ts` and add to the `entities` array.

### Web (`apps/web/src/`)

| Path | Role |
|---|---|
| `middleware.ts` | Route guard — redirects unauthenticated users to `/login`, authenticated users away from `/login`. Reads `access_token` cookie. |
| `app/(auth)/login/` | Public login page. POSTs to API with `credentials: 'include'`. |
| `app/dashboard/` | Protected dashboard (stat cards placeholder). |
| `components/Logo.tsx` | Inline SVG vault-door logo, accepts `size` prop. |

Path alias `@/*` → `src/*` is defined in `apps/web/tsconfig.json`.

### Styling & theming

Tailwind v4 via `@tailwindcss/postcss`. Shape/font tokens live in `apps/web/src/app/globals.css` inside `@theme {}` — no `tailwind.config` file.

**Theme system.** All colors/surfaces come from CSS variables defined in `globals.css` `:root` (default theme: **Cobalt** — flat deep-navy base, SOLID cards, electric-blue accent). The theme registry is `src/lib/theme.ts` (`THEMES` array); `ThemeProvider` applies `data-theme` on `<html>` and persists to localStorage; the settings Appearance tab renders the registry. To add a theme: add a `THEMES` entry + an `html[data-theme="x"]` variable-override block in `globals.css`. Components must only consume the variables (`--color-surface`, `--glass-blur`, `--glass-border`, `--glass-shadow`, …) — never hardcode theme colors, so new themes never require component changes.

**Color rules:** `--color-primary` (blue `#3B82F6`) is a UI accent only — never a chart series (CVD-indistinguishable from violet). Chart identity colors are green/sky/orange/amber/violet, resolved at runtime via `useThemeColors()` for recharts. The `.btn-gold` class name is legacy — it is the themed primary CTA button.

Accent colors: `--color-card-violet #9B6DFF`, `--color-card-green #4FBF7F`, `--color-card-orange #F07A3E`, `--color-card-amber #F5C842`, `--color-card-sky #4BA8D8`.

`global.css` (no "s") is an NX-generated leftover — it is not imported anywhere and can be ignored.
