# Growth Pages Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Public, login-free pages that earn search traffic (three calculators, four compare pages, a Mint-alternative page) and the two missing funnel numbers (trial starts, paying customers) in the admin panel.

**Architecture:** Pure math in `apps/web/src/lib/tools/`, competitor data in `apps/web/src/lib/marketing/`, one `MarketingShell` reusing the landing nav and footer, static Next routes under `/tools`, `/compare/[slug]` and `/mint-alternative`. Two raw queries added to `AnalyticsService.traffic()`.

**Tech Stack:** Next.js 16 (app router, static params), Tailwind v4 with theme variables, Vitest; NestJS + TypeORM for the funnel.

**Spec:** `docs/superpowers/specs/2026-10-26-growth-pages-design.md`

## Global Constraints

- Only theme variables for colour; check 375, 768, 1440.
- Every claim about Cofre is in the landing spec's allowed claims; every competitor price is dated and linked to its source.
- No new API calls from the public pages.

---

### Task 1: route guard and SEO lists
**Files:** `lib/route-access.ts` (+test), `lib/seo.ts` (+test).
- [ ] `PUBLIC_PATH_PREFIXES = ['/tools', '/compare']` honoured by `routeDecision` (exact `/tools` and `/tools/x`; `/toolsy` is not public). Add `/mint-alternative` to `PUBLIC_PATHS`.
- [ ] `INDEXABLE_PATHS` gains the eight new pages; sitemap test updated.

### Task 2: calculator math
**Files:** `lib/tools/millionaire.ts`, `payoff.ts`, `rule.ts` + tests; `vitest.config.ts` include.
- [ ] Tests first for each function per the spec, then implement.

### Task 3: competitor data
**Files:** `lib/marketing/competitors.ts` + test.
- [ ] Data for monarch-money, ynab, copilot-money, rocket-money; `COFRE_FACTS`; `pricesCheckedOn`; freshness test (≤ 120 days).

### Task 4: shell and pages
**Files:** `components/marketing/MarketingShell.tsx`, `DemoCta.tsx`, `ToolField.tsx`; `app/tools/page.tsx`, `app/tools/<three>/page.tsx`, `app/compare/[slug]/page.tsx`, `app/mint-alternative/page.tsx`; `LandingNav.tsx`, `LandingFooter.tsx`.
- [ ] Nav anchors become `/#…`, add "Free tools"; footer "Free tools" column.
- [ ] Pages per spec; `npm run build:web` passes; screenshots at three widths.

### Task 5: admin funnel
**Files:** `analytics.service.ts` (+test), `lib/admin/types.ts`, `TrafficPanel.tsx`.
- [ ] `funnel.trialStarts`, `funnel.paying`; tiles.

### Task 6: docs and commit
- [ ] CLAUDE.md web table row for the growth pages; BACKLOG follow-ups; commit locally (no push).
