# Mobile-First Responsive Design — Design

**Date:** 2026-06-17
**Status:** Approved — **PENDING implementation** (parked for a future session)
**Context:** Cofre must look excellent on both desktop and mobile. Today every
app page repeats a `flex h-dvh` + fixed `w-64` `Sidebar` wrapper with no mobile
navigation, so on a phone the sidebar dominates the screen. Breakpoint usage is
thin (dashboard ~9 utilities, most pages 1–4).

## Goal

Make every authenticated page excellent at phone widths while keeping the
current desktop layout intact. Add a native-app-feel mobile navigation.

## Decisions (settled during brainstorming)

- **Mobile nav: bottom tab bar + "More" sheet.** Desktop keeps the full sidebar.
- **Shared shell** via an `AppShell` component each page wraps its content in
  (rather than moving pages into a Next route group — less invasive).
- **Bottom tabs (4):** Dashboard · Transactions · Budgets · More.
  "More" sheet holds Projects, Debts, Settings + the account/logout block.
- **Single source of truth** for nav items: extract `nav-items.ts` used by both
  the desktop `Sidebar` and the mobile nav.
- Primary breakpoint **`lg` (1024px)**: bottom-nav below, sidebar above.

## Architecture

- **`AppShell.tsx`** (new) — responsive chrome:
  - `lg+`: existing `Sidebar` (left) + scrolling `<main>`, unchanged.
  - `<lg`: full-width `<main>` with bottom padding, a slim top bar (brand + page
    title), and a fixed bottom tab bar.
- **`MobileNav.tsx`** (new) — the bottom tab bar (4 items) + the "More" sheet
  (overlay listing Projects/Debts/Settings + account/logout). Hidden `lg+`.
- **`Sidebar.tsx`** — reused for desktop; rendered by `AppShell`, `hidden lg:flex`.
- **`nav-items.ts`** (new) — the shared `{ label, href, icon }[]` list.
- Each page: replace `<div className="flex h-dvh overflow-hidden"><Sidebar />
  <main className="flex-1 overflow-y-auto">…</main></div>` with `<AppShell>…</AppShell>`.

## Per-page responsive pass

Targeted fixes so each page is excellent on phones (keeping desktop):

- **Sticky page headers**: wrap/shrink instead of overflowing.
- **Multi-column grids** collapse to 1 column on phones (stat cards, the
  budgets+income-targets two columns, debts/projects cards).
- **Transactions page** (resizable two-panel: list + budget side panel): on
  mobile drop the drag-resizer (`hidden lg:block`) and **stack the panels
  vertically**, each full-width.
- **Modals**: `max-h` + internal scroll so they fit small screens; full-width
  with comfortable padding on phones.
- **Dashboard**: stat cards 1-col on mobile; charts already use a responsive
  container.
- **Settings**: theme grid + card-design picker reflow to 1–2 columns.

## Breakpoints & testing

Verify at ~**375px**, **414px**, **768px**, **1024px**, **1440px**. Watch for:
horizontal scroll, clipped content (`overflow-hidden` + `h-dvh` on short
screens), tap targets ≥44px, and the bottom bar not covering content (bottom
padding on `<main>`).

## Out of scope (future)

PWA/installable, offline, a center "+" quick-add FAB, gestures, and any
tablet-specific layout beyond what the breakpoints produce.

## Implementation order (when picked up)

1. `nav-items.ts` + `MobileNav` + `AppShell` (the shell).
2. Convert each page to `AppShell`, one per task (independently testable):
   dashboard → transactions (hardest) → budgets → debts → projects → settings.
3. Manual responsive verification at the breakpoints above on the live deploy.

## Testing note

No test runner — verify via `npm run build:web` + manual checks at each
breakpoint (browser devtools device sizes) on the live deploy.
